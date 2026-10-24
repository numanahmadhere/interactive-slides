// The connector's database access, through Supabase's REST interface with the service role key.
// The key lives only in the server's environment. Every query names the owner explicitly, because this key
// bypasses the row rules that protect people in the browser.

const MAX_DECK_BYTES = 5 * 1024 * 1024; // no images come through the connector, so this is generous

export async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const validToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);

export function supabaseStore({ url, key, fetchImpl = fetch }) {
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const call = async (path, { method = 'GET', body, prefer } = {}) => {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* leave null */ }
    if (!res.ok) {
      const err = new Error(json?.message ?? `Database error ${res.status}`);
      if (/deck_limit/.test(`${json?.message ?? ''}`)) err.code = 'deck_limit';
      throw err;
    }
    return json;
  };
  const q = encodeURIComponent;

  return {
    // The person a connector link belongs to, or null. Also notes that it was just used.
    async ownerOf(token) {
      if (!validToken(token)) return null;
      const hash = await sha256Hex(token);
      const rows = await call(`/connector_keys?select=user_id&token_hash=eq.${q(hash)}&limit=1`);
      const owner = rows?.[0]?.user_id ?? null;
      if (owner) call(`/connector_keys?user_id=eq.${q(owner)}`, { method: 'PATCH', body: { last_used_at: new Date().toISOString() } }).catch(() => {});
      return owner;
    },
    async list(owner) {
      return call(`/decks?select=id,title,updated_at&owner=eq.${q(owner)}&order=updated_at.desc&limit=50`);
    },
    async get(owner, id) {
      const rows = await call(`/decks?select=id,title,data&id=eq.${q(id)}&owner=eq.${q(owner)}&limit=1`);
      return rows?.[0] ?? null;
    },
    async create(owner, { title, data }) {
      if (JSON.stringify(data).length > MAX_DECK_BYTES) throw new Error('That deck is too big.');
      const rows = await call('/decks', { method: 'POST', body: { owner, title: String(title).slice(0, 200) || 'Untitled deck', data }, prefer: 'return=representation' });
      return rows[0];
    },
    async update(owner, id, { title, data }) {
      if (JSON.stringify(data).length > MAX_DECK_BYTES) throw new Error('That deck is too big.');
      const rows = await call(`/decks?id=eq.${q(id)}&owner=eq.${q(owner)}`, { method: 'PATCH', body: { title: String(title).slice(0, 200) || 'Untitled deck', data, thumb: null }, prefer: 'return=representation' });
      return rows.length > 0;
    },
  };
}
