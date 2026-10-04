import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paddleFromEnv } from '../tools/paddle-env.mjs';

const LIVE = `live_${'a1'.repeat(15)}`;
const TEST = `test_${'b2'.repeat(15)}`;

test('with no token, checkout is simply off', () => {
  assert.deepEqual(paddleFromEnv({}), { token: '', environment: '' });
  assert.deepEqual(paddleFromEnv({ PADDLE_CLIENT_TOKEN: '   ' }), { token: '', environment: '' });
});

test('a token needs PADDLE_ENV, and the environment is never guessed from the token alone', () => {
  assert.throws(() => paddleFromEnv({ PADDLE_CLIENT_TOKEN: LIVE }), /PADDLE_ENV is not set/);
  assert.throws(() => paddleFromEnv({ PADDLE_CLIENT_TOKEN: TEST }), /PADDLE_ENV is not set/);
  assert.throws(() => paddleFromEnv({ PADDLE_ENV: 'live' }), /PADDLE_CLIENT_TOKEN is empty/);
});

test('the environment must match the token, so a build cannot run against the wrong account', () => {
  assert.deepEqual(paddleFromEnv({ PADDLE_CLIENT_TOKEN: LIVE, PADDLE_ENV: 'live' }), { token: LIVE, environment: 'live' });
  assert.deepEqual(paddleFromEnv({ PADDLE_CLIENT_TOKEN: TEST, PADDLE_ENV: ' Sandbox ' }), { token: TEST, environment: 'sandbox' });
  assert.throws(() => paddleFromEnv({ PADDLE_CLIENT_TOKEN: LIVE, PADDLE_ENV: 'sandbox' }), /must match/);
  assert.throws(() => paddleFromEnv({ PADDLE_CLIENT_TOKEN: TEST, PADDLE_ENV: 'live' }), /must match/);
  assert.throws(() => paddleFromEnv({ PADDLE_CLIENT_TOKEN: LIVE, PADDLE_ENV: 'production' }), /"sandbox" or "live"/);
});

test('a server API key or a malformed token is refused before it can reach a page', () => {
  assert.throws(() => paddleFromEnv({ PADDLE_CLIENT_TOKEN: `pdl_live_apikey_${'x'.repeat(40)}`, PADDLE_ENV: 'live' }), /server API key/);
  assert.throws(() => paddleFromEnv({ PADDLE_CLIENT_TOKEN: `pdl_sdbx_apikey_${'x'.repeat(40)}`, PADDLE_ENV: 'sandbox' }), /server API key/);
  assert.throws(() => paddleFromEnv({ PADDLE_CLIENT_TOKEN: 'live_short', PADDLE_ENV: 'live' }), /should start with/);
  assert.throws(() => paddleFromEnv({ PADDLE_CLIENT_TOKEN: 'whatever', PADDLE_ENV: 'live' }), /should start with/);
});
