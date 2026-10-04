import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPortalSession } from '../src/billing/portal.js';

const USER = '11111111-1111-1111-1111-111111111111';
const OVERVIEW = 'https://customer-portal.paddle.com/cpl_01?token=abc';

function setup(over = {}) {
  const calls = { paddle: [], lookups: [] };
  const deps = {
    getUser: async (token) => (token === 'good-session-token' ? { id: USER } : null),
    findSubscription: async (id) => { calls.lookups.push(id); return { paddle_customer_id: 'ctm_real', paddle_subscription_id: 'sub_real', paddle_env: 'live' }; },
    apiKeys: { live: 'pdl_live_key', sandbox: 'pdl_sdbx_key' },
    fetch: async (url, init) => { calls.paddle.push({ url, init }); return { ok: true, json: async () => ({ data: { urls: { general: { overview: OVERVIEW } } } }) }; },
    ...over,
  };
  return { deps, calls };
}
const req = (over = {}) => ({ method: 'POST', authorization: 'Bearer good-session-token', ...over });

test('a signed-in customer gets a portal link made for their own Paddle customer', async () => {
  const { deps, calls } = setup();
  const res = await createPortalSession(req(), deps);
  assert.deepEqual(res, { status: 200, body: { url: OVERVIEW } });
  assert.deepEqual(calls.lookups, [USER], 'looked up by the verified person, not by anything in the request');
  assert.equal(calls.paddle[0].url, 'https://api.paddle.com/customers/ctm_real/portal-sessions');
  assert.equal(calls.paddle[0].init.headers.authorization, 'Bearer pdl_live_key');
  assert.deepEqual(JSON.parse(calls.paddle[0].init.body), { subscription_ids: ['sub_real'] });
});

test('nobody is served without a valid session', async () => {
  for (const authorization of [undefined, '', 'Bearer', 'Bearer short', 'Basic abcdefghijkl', 'Bearer not-a-real-session']) {
    const { deps, calls } = setup();
    const res = await createPortalSession(req({ authorization }), deps);
    assert.equal(res.status, 401, String(authorization));
    assert.equal(calls.paddle.length + calls.lookups.length, 0, 'nothing is looked up or sent to Paddle for a stranger');
  }
  const { deps } = setup({ getUser: async () => { throw new Error('auth service down'); } });
  assert.equal((await createPortalSession(req(), deps)).status, 401);
  const odd = setup({ getUser: async () => ({ id: "1' or '1'='1" }) });
  assert.equal((await createPortalSession(req(), odd.deps)).status, 401, 'an id that is not a UUID is never used in a query');
  assert.equal((await createPortalSession(req({ method: 'GET' }), setup().deps)).status, 405);
});

test('a customer id supplied by the client is never used', async () => {
  const { deps, calls } = setup();
  const res = await createPortalSession({ ...req(), customerId: 'ctm_someone_else', body: '{"customer_id":"ctm_someone_else"}' }, deps);
  assert.equal(res.status, 200);
  assert.ok(calls.paddle[0].url.includes('ctm_real') && !calls.paddle[0].url.includes('someone_else'));
});

test('no subscription, unknown account or missing key each give a clear refusal and never guess', async () => {
  assert.equal((await createPortalSession(req(), setup({ findSubscription: async () => null }).deps)).status, 404);
  assert.equal((await createPortalSession(req(), setup({ findSubscription: async () => ({ paddle_customer_id: '', paddle_env: 'live' }) }).deps)).status, 404);
  const unknown = setup({ findSubscription: async () => ({ paddle_customer_id: 'ctm_1', paddle_subscription_id: 'sub_1', paddle_env: null }) });
  assert.equal((await createPortalSession(req(), unknown.deps)).status, 409, 'a row without its account is not guessed');
  assert.equal(unknown.calls.paddle.length, 0);
  const nokey = setup({ apiKeys: { live: '', sandbox: 'k' } });
  assert.equal((await createPortalSession(req(), nokey.deps)).status, 500);
  assert.equal(nokey.calls.paddle.length, 0);
});

test('a sandbox customer is sent to the sandbox account with the sandbox key, never to live', async () => {
  const { deps, calls } = setup({ findSubscription: async () => ({ paddle_customer_id: 'ctm_sb', paddle_subscription_id: null, paddle_env: 'sandbox' }) });
  assert.equal((await createPortalSession(req(), deps)).status, 200);
  assert.equal(calls.paddle[0].url, 'https://sandbox-api.paddle.com/customers/ctm_sb/portal-sessions');
  assert.equal(calls.paddle[0].init.headers.authorization, 'Bearer pdl_sdbx_key');
  assert.deepEqual(JSON.parse(calls.paddle[0].init.body), {}, 'no subscription id is invented');
});

test('if Paddle fails or answers oddly the customer gets a plain error, not a broken link', async () => {
  const refuse = setup({ fetch: async () => ({ ok: false, json: async () => ({}) }) });
  assert.deepEqual(await createPortalSession(req(), refuse.deps), { status: 502, body: { error: 'paddle_refused' } });
  const down = setup({ fetch: async () => { throw new Error('network'); } });
  assert.equal((await createPortalSession(req(), down.deps)).body.error, 'paddle_unreachable');
  for (const url of [undefined, 'javascript:alert(1)', 'http://insecure.example', 42]) {
    const odd = setup({ fetch: async () => ({ ok: true, json: async () => ({ data: { urls: { general: { overview: url } } } }) }) });
    assert.equal((await createPortalSession(req(), odd.deps)).status, 502, String(url));
  }
});
