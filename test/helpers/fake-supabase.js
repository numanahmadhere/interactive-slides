// A stand-in for the parts of a Supabase project the cloud client uses: password
// accounts with expiring tokens, an owner-scoped decks table and the share
// function. It mimics the rules in supabase/schema.sql so the client's token
// handling can be tested; it is not a test of the SQL itself.

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { serveRealtime } from '../../tools/relay.mjs';

export async function startFakeSupabase(options = {}) {
  const { anonKey = 'anon-key', confirmEmails = false } = options;
  const users = new Map(); // email -> { id, email, password, confirmed }
  const tokens = new Map(); // access token -> { userId, expiresAt }
  const refresh = new Map(); // refresh token -> userId
  const decks = []; // { id, owner, title, data, share_token, created_at, updated_at }
  const state = { clock: () => Date.now() / 1000, requests: [], ttl: 3600, googleEnabled: false, otpRequests: [] };

  const iso = () => new Date(state.clock() * 1000).toISOString(); // Postgres timestamps come back as ISO strings

  const issue = (user) => {
    const access = `at_${randomUUID()}`;
    const ref = `rt_${randomUUID()}`;
    const expiresAt = Math.floor(state.clock()) + state.ttl;
    tokens.set(access, { userId: user.id, expiresAt });
    refresh.set(ref, user.id);
    return { access_token: access, refresh_token: ref, expires_in: state.ttl, expires_at: expiresAt, user: { id: user.id, email: user.email } };
  };

  // The browser pane talks to this from another port, so allow it like a real project does.
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    const url = new URL(req.url, 'http://x');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    state.requests.push({ method: req.method, path: url.pathname + url.search, auth: req.headers.authorization, apikey: req.headers.apikey, body });

    if (req.headers.apikey !== anonKey) return send(res, 401, { message: 'Invalid API key' });
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const session = tokens.get(bearer);
    const authed = session && session.expiresAt > state.clock() ? session : null;

    if (url.pathname === '/auth/v1/signup') {
      if (users.has(body.email)) return send(res, 422, { msg: 'User already registered' });
      if (!body.password || body.password.length < 6) return send(res, 422, { msg: 'Password should be at least 6 characters.' });
      const user = { id: randomUUID(), email: body.email, password: body.password, confirmed: !confirmEmails };
      users.set(body.email, user);
      return send(res, 200, confirmEmails ? { id: user.id, email: user.email } : issue(user));
    }
    if (url.pathname === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const user = users.get(body.email);
        if (!user || user.password !== body.password) return send(res, 400, { error_description: 'Invalid login credentials' });
        if (!user.confirmed) return send(res, 400, { error_description: 'Email not confirmed' });
        return send(res, 200, issue(user));
      }
      if (grant === 'refresh_token') {
        const userId = refresh.get(body.refresh_token);
        const user = [...users.values()].find((u) => u.id === userId);
        if (!user) return send(res, 400, { error_description: 'Invalid Refresh Token' });
        refresh.delete(body.refresh_token);
        return send(res, 200, issue(user));
      }
    }
    if (url.pathname === '/auth/v1/settings') return send(res, 200, { external: { email: true, google: state.googleEnabled === true } });
    if (url.pathname === '/auth/v1/otp') {
      if (!body?.email) return send(res, 422, { msg: 'To signup, please provide your email' });
      state.otpRequests.push({ email: body.email, redirectTo: url.searchParams.get('redirect_to'), createUser: body.create_user });
      return send(res, 200, {});
    }
    if (url.pathname === '/auth/v1/user') {
      if (!authed) return send(res, 401, { msg: 'invalid JWT' });
      const user = [...users.values()].find((u) => u.id === authed.userId);
      return send(res, 200, { id: user.id, email: user.email });
    }
    if (url.pathname === '/auth/v1/logout') {
      tokens.delete(bearer);
      return send(res, 204);
    }

    if (url.pathname === '/rest/v1/rpc/delete_my_account') {
      if (!authed) return send(res, 401, { message: 'JWT expired' });
      for (let i = decks.length - 1; i >= 0; i--) if (decks[i].owner === authed.userId) decks.splice(i, 1);
      for (const [email, u] of users) if (u.id === authed.userId) users.delete(email);
      tokens.delete(bearer);
      return send(res, 204);
    }
    if (url.pathname === '/rest/v1/rpc/get_shared_deck') {
      const t = body?.t;
      const deck = typeof t === 'string' && t.length >= 22 ? decks.find((d) => d.share_token === t) : null;
      return send(res, 200, deck ? deck.data : null);
    }

    if (url.pathname === '/rest/v1/decks') {
      if (!authed) return send(res, 401, { message: 'JWT expired', code: 'PGRST301' }); // anon has no table access
      const mine = decks.filter((d) => d.owner === authed.userId); // row level security
      const idFilter = url.searchParams.get('id')?.replace(/^eq\./, '');
      const guardTs = url.searchParams.get('updated_at')?.replace(/^eq\./, '');
      const target = (idFilter ? mine.filter((d) => d.id === idFilter) : mine).filter((d) => !guardTs || d.updated_at === guardTs);
      const pick = (d) => ({ ...d });
      if (req.method === 'GET') {
        return send(res, 200, [...target].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).map(pick));
      }
      if (req.method === 'POST') {
        const row = { id: randomUUID(), owner: authed.userId, title: body.title ?? 'Untitled deck', data: body.data, thumb: body.thumb ?? null, share_token: null, created_at: iso(), updated_at: iso() };
        decks.push(row);
        return send(res, 201, [pick(row)]);
      }
      if (req.method === 'PATCH') {
        for (const d of target) {
          Object.assign(d, body, { owner: d.owner, updated_at: iso() }); // the trigger keeps the owner
          if (d.share_token !== null && String(d.share_token).length < 22) d.share_token = null;
        }
        return send(res, 200, target.map(pick));
      }
      if (req.method === 'DELETE') {
        for (const d of target) decks.splice(decks.indexOf(d), 1);
        return send(res, 204);
      }
    }
    return send(res, 404, { message: 'not found' });
  });

  // Realtime on the same port, like a real project: wss://<project>/realtime/v1/websocket
  const wss = serveRealtime(new WebSocketServer({ server, path: '/realtime/v1/websocket' }));
  await new Promise((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    anonKey,
    state,
    users,
    decks,
    tokens,
    // What the browser address looks like after someone opens the emailed link.
    emailLinkHash: (email) => {
      let user = users.get(email);
      if (!user) users.set(email, (user = { id: randomUUID(), email, password: '', confirmed: true }));
      const t = issue(user);
      return `#access_token=${t.access_token}&expires_at=${t.expires_at}&expires_in=${t.expires_in}&refresh_token=${t.refresh_token}&token_type=bearer&type=magiclink`;
    },
    expireAllTokens: () => { for (const t of tokens.values()) t.expiresAt = 0; },
    close: () => new Promise((resolve) => { for (const c of wss.clients) c.terminate(); wss.close(); server.closeAllConnections?.(); server.close(resolve); }),
  };
}
