import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify, parseSignature, whichEnvironment, recordFrom, handleWebhook, ipInCidrs, safeEqual, TOLERANCE_S } from '../src/billing/webhook.js';
import { PLANS, planOf, canUseKind, canExport, canUseTheme, canBrand, planFor, PAID_KINDS, PLAN_ORDER, PRICES } from '../src/billing/plans.js';
import { CATALOG, planByPrice } from '../src/billing/catalog.js';

const SECRET = 'pdl_ntfset_testsecret';
const USER = '11111111-1111-1111-1111-111111111111';
const NOW = 1_800_000_000;

const event = (over = {}, data = {}) => ({
  event_id: 'evt_1', event_type: 'subscription.created', occurred_at: '2026-10-04T10:00:00Z',
  data: {
    id: 'sub_1', status: 'trialing', customer_id: 'ctm_1', custom_data: { user_id: USER },
    items: [{ price: { id: CATALOG.live.pro.month }, trial_dates: { starts_at: '2026-10-04T10:00:00Z', ends_at: '2026-10-11T10:00:00Z' } }],
    management_urls: { update_payment_method: 'https://pay.example/u', cancel: 'https://pay.example/c' },
    scheduled_change: null, ...data,
  },
  ...over,
});

async function signed(body, secret = SECRET, ts = NOW) {
  return `ts=${ts};h1=${await sign(secret, ts, body)}`;
}

test('a delivery signed with the right secret and a fresh timestamp is accepted', async () => {
  const body = JSON.stringify(event());
  assert.ok(await verify(SECRET, await signed(body), body, NOW));
  assert.ok(await verify(SECRET, await signed(body), body, NOW + TOLERANCE_S - 1));
});

test('wrong secret, changed body, old timestamp, missing or mangled headers are all refused', async () => {
  const body = JSON.stringify(event());
  const good = await signed(body);
  assert.ok(!(await verify('other-secret', good, body, NOW)));
  assert.ok(!(await verify(SECRET, good, body + ' ', NOW)), 'one extra byte');
  assert.ok(!(await verify(SECRET, good, body, NOW + TOLERANCE_S + 5)), 'too old: could be a replay');
  assert.ok(!(await verify(SECRET, good, body, NOW - TOLERANCE_S - 5)), 'from the future');
  assert.ok(!(await verify(SECRET, null, body, NOW)));
  assert.ok(!(await verify(SECRET, 'garbage', body, NOW)));
  assert.ok(!(await verify(SECRET, 'ts=abc;h1=00', body, NOW)));
  assert.ok(!(await verify('', good, body, NOW)), 'no secret configured');
  assert.ok(!(await verify(SECRET, `ts=${NOW};h1=`, body, NOW)));
});

test('while a secret is being rotated Paddle sends two signatures and either may match', async () => {
  const body = '{"a":1}';
  const h1 = await sign(SECRET, NOW, body);
  const header = `ts=${NOW};h1=${'0'.repeat(64)};h1=${h1}`;
  assert.deepEqual(parseSignature(header).h1.length, 2);
  assert.ok(await verify(SECRET, header, body, NOW));
});

test('the environment is told apart by which secret signed it', async () => {
  const body = '{}';
  const secrets = { live: 'live-secret', sandbox: 'sandbox-secret' };
  assert.equal(await whichEnvironment(secrets, await signed(body, 'sandbox-secret'), body, NOW), 'sandbox');
  assert.equal(await whichEnvironment(secrets, await signed(body, 'live-secret'), body, NOW), 'live');
  assert.equal(await whichEnvironment(secrets, await signed(body, 'nope'), body, NOW), null);
  assert.equal(await whichEnvironment({ live: undefined, sandbox: 'x' }, await signed(body, 'x'), body, NOW), 'sandbox');
  assert.ok(safeEqual('abc', 'abc') && !safeEqual('abc', 'abd') && !safeEqual('abc', 'ab'));
});

test('a subscription event becomes the record we keep', () => {
  const r = recordFrom(event());
  assert.equal(r.eventId, 'evt_1');
  assert.deepEqual(r.record, {
    user_id: USER, plan: 'pro', status: 'trialing', billing_interval: 'month', paddle_customer_id: 'ctm_1', paddle_subscription_id: 'sub_1',
    trial_ends_at: '2026-10-11T10:00:00Z', ends_at: '', update_payment_url: 'https://pay.example/u', cancel_url: 'https://pay.example/c',
  });
  const yearly = recordFrom(event({}, { items: [{ price: { id: CATALOG.live.advanced.year } }] })).record;
  assert.deepEqual([yearly.plan, yearly.billing_interval], ['advanced', 'year']);
});

test('a cancellation at the end of the period keeps access until then; an immediate one ends now', () => {
  const sched = recordFrom(event({ event_type: 'subscription.updated' }, { status: 'active', scheduled_change: { action: 'cancel', effective_at: '2026-11-04T10:00:00Z' } })).record;
  assert.equal(sched.ends_at, '2026-11-04T10:00:00Z');
  assert.equal(sched.status, 'active');
  const gone = recordFrom(event({ event_type: 'subscription.canceled' }, { status: 'canceled', canceled_at: '2026-10-20T00:00:00Z' })).record;
  assert.equal(gone.ends_at, '2026-10-20T00:00:00Z');
  const resumed = recordFrom(event({ event_type: 'subscription.updated' }, { status: 'active', scheduled_change: null })).record;
  assert.equal(resumed.ends_at, '', 'taking back a cancellation clears the end date');
});

test('events we cannot or should not act on are skipped, not failed', () => {
  assert.equal(recordFrom(event({ event_type: 'transaction.completed' })).skip, 'not_a_subscription_event');
  assert.equal(recordFrom(event({}, { custom_data: null })).skip, 'no_user');
  assert.equal(recordFrom(event({}, { custom_data: { user_id: 'not-a-uuid' } })).skip, 'no_user');
  assert.equal(recordFrom(event({}, { custom_data: { user_id: "'; drop table decks;--" } })).skip, 'no_user');
  assert.equal(recordFrom(event({}, { items: [{ price: { id: 'pri_unknown' } }] })).skip, 'unknown_price');
  assert.equal(recordFrom(event({}, { items: [] })).skip, 'unknown_price');
  assert.equal(recordFrom(null).skip, 'malformed');
  assert.equal(recordFrom({ event_type: 'subscription.created' }).skip, 'malformed');
});

test('the whole handler: bad signature 401, good delivery applied, database failure 500 so Paddle retries', async () => {
  const body = JSON.stringify(event());
  const applied = [];
  const deps = (over = {}) => ({ secrets: { live: SECRET }, now: () => NOW, apply: async (...a) => { applied.push(a); return 'applied'; }, ...over });
  assert.equal((await handleWebhook({ body, signature: 'ts=1;h1=00' }, deps())).status, 401);
  assert.equal(applied.length, 0, 'nothing is written for an unsigned delivery');
  const ok = await handleWebhook({ body, signature: await signed(body) }, deps());
  assert.deepEqual([ok.status, ok.body], [200, 'applied']);
  assert.equal(applied[0][0], 'evt_1');
  assert.equal(applied[0][3].plan, 'pro');
  const failing = await handleWebhook({ body, signature: await signed(body) }, deps({ apply: async () => { throw new Error('db down'); } }));
  assert.equal(failing.status, 500);
  const notJson = '{oops';
  assert.equal((await handleWebhook({ body: notJson, signature: await signed(notJson) }, deps())).status, 400);
  const other = JSON.stringify(event({ event_type: 'customer.updated' }));
  const skipped = await handleWebhook({ body: other, signature: await signed(other) }, deps());
  assert.deepEqual([skipped.status, skipped.body], [200, 'not_a_subscription_event']);
});

test('addresses outside Paddle\'s list are turned away, but only after the signature checks out', async () => {
  const body = JSON.stringify(event());
  const sig = await signed(body);
  let asked = 0;
  const deps = { secrets: { live: SECRET }, now: () => NOW, apply: async () => 'applied', allowIp: async (ip) => { asked++; return ipInCidrs(ip, ['34.232.58.13/32', '10.0.0.0/8']); } };
  assert.equal((await handleWebhook({ body, signature: sig, ip: '34.232.58.13' }, deps)).status, 200);
  assert.equal((await handleWebhook({ body, signature: sig, ip: '203.0.113.9' }, deps)).status, 403);
  assert.equal((await handleWebhook({ body, signature: 'ts=1;h1=00', ip: '203.0.113.9' }, deps)).status, 401);
  assert.equal(asked, 2);
  const unknown = await handleWebhook({ body, signature: sig, ip: undefined }, { ...deps, allowIp: async () => undefined });
  assert.equal(unknown.status, 200, 'if the list could not be fetched the signature alone decides');
  assert.ok(ipInCidrs('10.1.2.3', ['10.0.0.0/8']) && !ipInCidrs('11.1.2.3', ['10.0.0.0/8']));
  assert.ok(!ipInCidrs('not an ip', ['10.0.0.0/8']) && !ipInCidrs('10.1.2.3', ['bad']));
});

// ---- the plan table ------------------------------------------------------------------

test('plans only get more generous as they go up', () => {
  const nums = ['cloudDecks', 'livePhones'];
  for (let i = 1; i < PLAN_ORDER.length; i++) {
    const lo = PLANS[PLAN_ORDER[i - 1]];
    const hi = PLANS[PLAN_ORDER[i]];
    for (const k of nums) assert.ok(hi[k] >= lo[k], `${hi.id} ${k}`);
    for (const k of ['kinds', 'exports', 'themes']) assert.ok(lo[k].every((x) => hi[k].includes(x)), `${hi.id} keeps ${k}`);
    assert.ok(!lo.brand || hi.brand);
  }
  assert.ok(PLANS.advanced.livePhones <= 1000, 'the room cannot exceed what the live host accepts');
});

test('free cannot collect the paid question types; every paid plan can', () => {
  for (const k of PAID_KINDS) {
    assert.ok(!canUseKind('free', k), k);
    assert.ok(canUseKind('starter', k), k);
  }
  assert.ok(canUseKind('free', 'poll') && canUseKind('free', 'quiz') && canUseKind('free', 'rating'));
  assert.ok(!canExport('free', 'pdf') && canExport('starter', 'pdf') && !canExport('starter', 'pptx') && canExport('pro', 'pptx'));
  assert.ok(canExport('free', 'json'), 'you can always take your own deck out');
  assert.ok(!canBrand('free') && canBrand('starter'));
  assert.ok(canUseTheme('free', 'densight-dark') && !canUseTheme('free', 'paper') && canUseTheme('starter', 'paper'));
  assert.equal(planFor((p) => p.exports.includes('pptx')), 'pro');
  assert.equal(planFor((p) => p.brand), 'starter');
});

test('who counts as paying: active, trialing and past due do; cancelled, paused and expired do not', () => {
  const now = Date.parse('2026-10-10T00:00:00Z');
  const row = (over) => ({ plan: 'pro', status: 'active', ends_at: null, ...over });
  assert.equal(planOf(row(), now), 'pro');
  assert.equal(planOf(row({ status: 'trialing' }), now), 'pro');
  assert.equal(planOf(row({ status: 'past_due' }), now), 'pro');
  assert.equal(planOf(row({ status: 'canceled' }), now), 'free');
  assert.equal(planOf(row({ status: 'paused' }), now), 'free');
  assert.equal(planOf(row({ ends_at: '2026-10-01T00:00:00Z' }), now), 'free', 'period over');
  assert.equal(planOf(row({ ends_at: '2026-11-01T00:00:00Z' }), now), 'pro', 'cancelled but paid until the end');
  assert.equal(planOf(null, now), 'free');
  assert.equal(planOf({ plan: 'platinum', status: 'active' }, now), 'free', 'an unknown plan is never trusted');
  assert.equal(planOf({ plan: 'free', status: 'active' }, now), 'free');
});

test('the catalog matches the plans and prices, and every live price is recognised', () => {
  for (const id of Object.keys(PRICES)) {
    for (const interval of ['month', 'year']) {
      const pid = CATALOG.live[id][interval];
      assert.match(pid, /^pri_[0-9a-z]{26}$/, `${id} ${interval}`);
      assert.deepEqual(planByPrice(pid), { plan: id, interval });
    }
    assert.equal(PRICES[id].year, PRICES[id].month * 10, 'annual is ten months');
  }
  assert.equal(planByPrice('pri_nope'), null);
  assert.equal(planByPrice(''), null, 'empty sandbox slots never match');
  const all = Object.values(CATALOG.live).flatMap((p) => Object.values(p));
  assert.equal(new Set(all).size, 6);
});

import { readFileSync } from 'node:fs';

test('the page never computes or reformats a price Paddle gives it, and never touches a server key', () => {
  const picker = readFileSync(new URL('../src/billing/picker.js', import.meta.url), 'utf8');
  const checkout = readFileSync(new URL('../src/billing/checkout.js', import.meta.url), 'utf8');
  // any line that handles a price Paddle returned must not format, round or add it
  for (const [name, src] of [['picker', picker], ['checkout', checkout]]) {
    const lines = src.split('\n').filter((l) => /paddlePrice|formattedTotals|PricePreview|local\.get/.test(l));
    assert.ok(lines.length, `${name} handles Paddle prices`);
    assert.ok(!lines.some((l) => /Intl\.NumberFormat|toFixed|toLocaleString|Math\.|parseFloat|parseInt|Number\(/.test(l)), `${name}: no arithmetic or reformatting of Paddle's strings`);
  }
  assert.match(checkout, /formattedTotals\?\.total/);
  assert.ok(!/countryCode|address:/.test(checkout), 'no country is passed; Paddle works it out from the visitor');
  assert.match(checkout, /displayMode: 'overlay', variant: 'one-page'/);
  assert.match(checkout, /successUrl: `\$\{location\.origin\}\/welcome`/);
  assert.ok(!/pdl_|SERVICE_ROLE/.test(picker + checkout + readFileSync(new URL('../src/billing/config.js', import.meta.url), 'utf8')), 'no server key anywhere in the page code');
});
