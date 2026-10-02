// A small client for a Supabase project: email and password accounts, a table of
// decks, and share links. It talks to the project's REST endpoints with fetch, so
// there is no extra library. The schema and the access rules (row level security)
// are in supabase/schema.sql; this file never decides who may see what, the
// database does.

import { newToken } from '../live/protocol.js';

const MAX_DECK_BYTES = 25 * 1024 * 1024;
const REFRESH_MARGIN_S = 60;

export class CloudError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.name = 'CloudError';
    this.status = status;
    this.code = code;
  }
}

// Where the signed-in session is kept. localStorage in the app, a Map in tests.
export function browserStore(prefix = 'interactive-slides:cloud:') {
  return {
    get: (k) => { try { return localStorage.getItem(prefix + k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(prefix + k, v); } catch { /* kept for this page only */ } },
    remove: (k) => { try { localStorage.removeItem(prefix + k); } catch { /* nothing to remove */ } },
  };
}

export function memoryStore() {
  const m = new Map();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) };
}

const messageOf = (body, fallback) => body?.error_description ?? body?.msg ?? body?.message ?? body?.error ?? fallback;

export class Cloud {
  #session = null;

  constructor({ url, key, fetch: fetchFn = globalThis.fetch.bind(globalThis), store = memoryStore(), now = () => Date.now() }) {
    this.url = url.replace(/\/+$/, '');
    this.key = key;
    this.fetch = fetchFn;
    this.store = store;
    this.now = now;
    try {
      this.#session = JSON.parse(store.get('session') ?? 'null');
      if (!this.#session?.refresh_token || !this.#session?.user) this.#session = null;
    } catch {
      this.#session = null;
    }
  }

  get user() {
    return this.#session?.user ?? null;
  }

  // ---- accounts ------------------------------------------------------------------

  // Returns { signedIn: true } or { signedIn: false, needsConfirmation: true } when
  // the project asks new accounts to confirm their email first.
  async signUp(email, password) {
    const body = await this.#call('/auth/v1/signup', { method: 'POST', body: { email, password }, auth: 'anon' });
    if (body?.access_token) {
      this.#keep(body);
      return { signedIn: true };
    }
    return { signedIn: false, needsConfirmation: true };
  }

  // Which one-click providers the project has switched on (public settings endpoint).
  async providers() {
    try {
      const s = await this.#call('/auth/v1/settings', { auth: 'anon' });
      return { google: !!s?.external?.google, email: s?.external?.email !== false };
    } catch {
      return { google: false, email: true };
    }
  }

  // Emails a one-time sign-in link (creating the account on first use). Opening the
  // link on this device returns here with the session in the address; see consumeRedirect.
  async sendEmailLink(email, redirectTo) {
    await this.#call(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, { method: 'POST', body: { email, create_user: true }, auth: 'anon' });
  }

  // Where to send the browser to sign in with a provider such as Google.
  oauthUrl(provider, redirectTo) {
    return `${this.url}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(redirectTo)}`;
  }

  // Call with location.hash on page load. Returns false when the address is not a
  // sign-in return, true when it signed this browser in, and throws when the
  // provider reported a problem. The tokens are only trusted after the project
  // itself confirms them by naming the user.
  async consumeRedirect(hash) {
    const params = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
    if (params.get('error') || params.get('error_description')) {
      throw new CloudError(params.get('error_description')?.replace(/\+/g, ' ') ?? 'Sign-in did not complete.', { code: params.get('error_code') ?? 'oauth' });
    }
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    if (!access || !refresh) return false;
    const user = await this.#call('/auth/v1/user', { auth: access });
    this.#keep({ access_token: access, refresh_token: refresh, expires_in: Number(params.get('expires_in')) || 3600, expires_at: Number(params.get('expires_at')) || undefined, user });
    return true;
  }

  async signIn(email, password) {
    this.#keep(await this.#call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: 'anon' }));
  }

  async signOut() {
    const token = this.#session?.access_token;
    this.#session = null;
    this.store.remove('session');
    if (token) {
      try { await this.#call('/auth/v1/logout', { method: 'POST', auth: token }); } catch { /* the local sign-out is what matters */ }
    }
  }

  #keep(body) {
    if (!body?.access_token || !body?.refresh_token || !body?.user?.id) throw new CloudError('The server sent back an unexpected sign-in response.');
    this.#session = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: body.expires_at ?? Math.floor(this.now() / 1000) + (body.expires_in ?? 3600),
      user: { id: body.user.id, email: body.user.email ?? '' },
    };
    this.store.set('session', JSON.stringify(this.#session));
  }

  async #token() {
    const s = this.#session;
    if (!s) throw new CloudError('Sign in first.', { code: 'signed_out' });
    if (s.expires_at - REFRESH_MARGIN_S > this.now() / 1000) return s.access_token;
    try {
      this.#keep(await this.#call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, auth: 'anon' }));
    } catch (err) {
      if (err.status >= 400 && err.status < 500) {
        this.#session = null;
        this.store.remove('session');
        throw new CloudError('Your session ended. Sign in again.', { code: 'signed_out' });
      }
      throw err;
    }
    return this.#session.access_token;
  }

  // ---- decks -----------------------------------------------------------------------

  async list() {
    return this.#rest('/rest/v1/decks?select=id,title,updated_at,share_token&order=updated_at.desc&limit=100');
  }

  async get(id) {
    const rows = await this.#rest(`/rest/v1/decks?select=id,title,data,share_token&id=eq.${encodeURIComponent(id)}`);
    if (!rows[0]) throw new CloudError('That deck was not found.', { code: 'not_found' });
    return rows[0];
  }

  // title and data (the deck JSON with its images inlined). Returns { id, ... }.
  async create({ title, data }) {
    return (await this.#rest('/rest/v1/decks', { method: 'POST', body: this.#payload(title, data), prefer: 'return=representation' }))[0];
  }

  async update(id, { title, data }) {
    const rows = await this.#rest(`/rest/v1/decks?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: this.#payload(title, data), prefer: 'return=representation' });
    if (!rows[0]) throw new CloudError('That deck is not in your account any more.', { code: 'not_found' });
    return rows[0];
  }

  async remove(id) {
    await this.#rest(`/rest/v1/decks?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  #payload(title, data) {
    const size = JSON.stringify(data).length;
    if (size > MAX_DECK_BYTES) throw new CloudError(`This deck is ${(size / 1048576).toFixed(0)} MB with its images. The limit is 25 MB; use smaller images.`, { code: 'too_big' });
    return { title: String(title ?? '').slice(0, 200) || 'Untitled deck', data };
  }

  // ---- sharing ---------------------------------------------------------------------

  // Turns sharing on (returns the token) or off (returns null).
  async setShared(id, on, existingToken = null) {
    const token = on ? existingToken ?? newToken() : null;
    const rows = await this.#rest(`/rest/v1/decks?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { share_token: token }, prefer: 'return=representation' });
    if (!rows[0]) throw new CloudError('That deck is not in your account any more.', { code: 'not_found' });
    return token;
  }

  // Works signed out: the database function hands back the deck for an exact token.
  async getShared(token) {
    const data = await this.#call('/rest/v1/rpc/get_shared_deck', { method: 'POST', body: { t: token }, auth: 'anon' });
    if (!data) throw new CloudError('This presentation is not shared any more.', { status: 404, code: 'not_found' });
    return data;
  }

  // ---- plumbing --------------------------------------------------------------------

  async #rest(path, { method = 'GET', body, prefer } = {}) {
    const result = await this.#call(path, { method, body, auth: await this.#token(), prefer });
    return Array.isArray(result) ? result : [];
  }

  async #call(path, { method = 'GET', body, auth = 'anon', prefer } = {}) {
    // The legacy anon key is a JWT and may be sent as the bearer. Newer "publishable" keys
    // are not JWTs and go in apikey only; the project's gateway fills in the rest.
    const bearer = auth === 'anon' ? (/^eyJ[\w-]+\.[\w-]+\.[\w-]*$/.test(this.key) ? this.key : null) : auth;
    const headers = { apikey: this.key };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    let res;
    try {
      res = await this.fetch(this.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new CloudError('Could not reach the server. Check the address and your connection.', { code: 'network' });
    }
    const text = await res.text();
    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = null; }
    }
    if (!res.ok) {
      throw new CloudError(messageOf(parsed, `The server answered ${res.status}.`), { status: res.status, code: parsed?.error_code ?? parsed?.code ?? '' });
    }
    return parsed;
  }
}
