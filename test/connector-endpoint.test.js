import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler, { config } from '../netlify/functions/mcp.mjs';
import { sha256Hex } from '../src/connector/supabase-store.js';
import { newConnectorToken } from '../src/shell/connector.js';

const OWNER = '11111111-1111-1111-1111-111111111111';
const token = newConnectorToken();
const post = (path, body) => new Request(`https://site.test${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const ping = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

let realFetch;
let log;
beforeEach(() => {
  realFetch = globalThis.fetch;
  log = [];
  process.env.SUPABASE_URL = 'https://p.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.URL = 'https://site.test';
  globalThis.fetch = async (url, init) => {
    log.push({ url: String(url), init });
    const u = String(url);
    const body = u.includes('/connector_keys?select') ? (u.includes(`token_hash=eq.${await sha256Hex(token)}`) ? [{ user_id: OWNER }] : []) : init?.method === 'PATCH' ? [] : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
});
afterEach(() => { globalThis.fetch = realFetch; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.URL; });

test('the endpoint lives at /api/mcp/<link> and only answers POST', async () => {
  assert.equal(config.path, '/api/mcp/*');
  assert.equal((await handler(new Request(`https://site.test/api/mcp/${token}`, { method: 'GET' }))).status, 405);
});

test('a valid link gets the tool list; a wrong, malformed or missing link gets 401 and never reaches the database', async () => {
  const good = await handler(post(`/api/mcp/${token}`, ping));
  assert.equal(good.status, 200);
  assert.equal((await good.json()).result.tools.length, 6);
  assert.equal(good.headers.get('cache-control'), 'no-store');
  const wrong = await handler(post(`/api/mcp/${newConnectorToken()}`, ping));
  assert.equal(wrong.status, 401);
  assert.equal((await handler(post('/api/mcp/short', ping))).status, 401);
  assert.equal((await handler(post('/api/mcp', ping))).status, 401);
  assert.equal(log.filter((l) => l.url.includes('/decks')).length, 0);
  assert.ok(!log.some((l) => l.url.includes(token)), 'the secret never goes to the database');
});

test('without the server key the connector says it is off, and oversized or broken bodies are refused', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await handler(post(`/api/mcp/${token}`, ping))).status, 503);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  assert.equal((await handler(post(`/api/mcp/${token}`, 'x'.repeat(1_000_001)))).status, 413);
  assert.equal((await handler(post(`/api/mcp/${token}`, '{bad'))).status, 400);
  assert.equal((await handler(post(`/api/mcp/${token}`, { jsonrpc: '2.0', method: 'notifications/initialized' }))).status, 202);
});

test('creating a deck over the endpoint writes one row owned by the link\'s person', async () => {
  const res = await handler(post(`/api/mcp/${token}`, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'create_deck', arguments: { title: 'Via Claude', slides: [{ kind: 'title', title: 'Hi' }] } } }));
  assert.equal(res.status, 200);
  const write = log.find((l) => l.init?.method === 'POST' && l.url.endsWith('/decks'));
  assert.ok(write);
  const row = JSON.parse(write.init.body);
  assert.equal(row.owner, OWNER);
  assert.equal(row.title, 'Via Claude');
  assert.equal(write.init.headers.apikey, 'service-key');
});
