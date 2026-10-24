// The Claude connector endpoint: POST https://YOUR-SITE/api/mcp/<secret>. The secret in the address is the
// login: it belongs to one person (see the Account page) and lets Claude build decks in their account only.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Netlify environment (server only, never the page).

import { handleBody } from '../../src/connector/mcp.js';
import { supabaseStore, validToken } from '../../src/connector/supabase-store.js';

export const config = { path: '/api/mcp/*' };

const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const MAX_BODY = 1_000_000;

export default async function handler(request) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const token = new URL(request.url).pathname.split('/').filter(Boolean).at(2) ?? '';
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(503, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'The connector is not switched on for this site yet.' } });
  if (!validToken(token)) return json(401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'This connector link is not valid.' } });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Too large.' } });

  const store = supabaseStore({ url, key });
  let owner;
  try { owner = await store.ownerOf(token); } catch { return json(502, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Could not reach the database.' } }); }
  if (!owner) return json(401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'This connector link is not valid any more. Make a new one in the app (Account page).' } });

  const appUrl = (process.env.URL ?? '').replace(/\/$/, '');
  const { status, body } = await handleBody(raw, { owner, store, appUrl });
  return json(status, body);
}
