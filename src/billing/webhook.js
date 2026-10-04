// Receiving Paddle's webhooks: check the signature, turn a subscription event into the
// row we keep, and hand it to the database. Pure and dependency-injected so every path
// is testable without a network.
//
// Paddle signs the exact bytes it sends: the header "Paddle-Signature: ts=...;h1=..."
// carries a timestamp and an HMAC-SHA256 of "<ts>:<raw body>" made with the secret of the
// notification destination. So the body must be read as text, untouched, before parsing.

import { planByPrice } from './catalog.js';

const enc = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TOLERANCE_S = 300; // refuse deliveries whose timestamp is more than five minutes off

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Compare without stopping at the first difference, so timing reveals nothing.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseSignature(header) {
  const parts = String(header ?? '').split(';').map((p) => p.trim().split('='));
  const ts = parts.find(([k]) => k === 'ts')?.[1];
  const h1 = parts.filter(([k]) => k === 'h1').map(([, v]) => v); // Paddle may send two while a secret rotates
  return /^\d{1,12}$/.test(ts ?? '') && h1.length ? { ts: Number(ts), h1 } : null;
}

export async function sign(secret, ts, body) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}:${body}`)));
}

// -> true only for a recent delivery signed with this secret
export async function verify(secret, header, body, nowS = Date.now() / 1000) {
  const sig = parseSignature(header);
  if (!secret || !sig || Math.abs(nowS - sig.ts) > TOLERANCE_S) return false;
  const expected = await sign(secret, sig.ts, body);
  return sig.h1.some((h) => safeEqual(h, expected));
}

// Which environment's secret matches. -> 'live' | 'sandbox' | null
export async function whichEnvironment(secrets, header, body, nowS) {
  for (const env of ['live', 'sandbox']) if (await verify(secrets[env], header, body, nowS)) return env;
  return null;
}

const SUBSCRIPTION_EVENTS = new Set([
  'subscription.created', 'subscription.activated', 'subscription.updated', 'subscription.trialing',
  'subscription.past_due', 'subscription.paused', 'subscription.resumed', 'subscription.canceled',
]);

const CUSTOMER_EVENTS = new Set(['customer.created', 'customer.updated']);

// A Paddle event -> what to store and which handler stores it, or { skip: reason }.
export function recordFrom(event) {
  if (!event || typeof event !== 'object' || typeof event.event_id !== 'string' || typeof event.event_type !== 'string') return { skip: 'malformed' };
  const d = event.data ?? {};
  if (CUSTOMER_EVENTS.has(event.event_type)) {
    if (typeof d.id !== 'string' || !d.id) return { skip: 'malformed' };
    return { kind: 'customer', eventId: event.event_id, eventType: event.event_type, occurredAt: event.occurred_at, record: { customer_id: d.id, email: typeof d.email === 'string' ? d.email : '' } };
  }
  if (event.event_type === 'transaction.completed') {
    if (!d.subscription_id) return { skip: 'one_off_payment' }; // not part of a subscription, nothing to mirror
    return { kind: 'transaction', eventId: event.event_id, eventType: event.event_type, occurredAt: event.occurred_at, record: { paddle_subscription_id: String(d.subscription_id), paddle_customer_id: String(d.customer_id ?? '') } };
  }
  if (!SUBSCRIPTION_EVENTS.has(event.event_type)) return { skip: 'not_a_handled_event' };
  const userId = d.custom_data?.user_id;
  if (typeof userId !== 'string' || !UUID.test(userId)) return { skip: 'no_user' };
  const item = (d.items ?? []).find((i) => i?.price?.id) ?? null;
  const bought = planByPrice(item?.price?.id);
  if (!bought) return { skip: 'unknown_price' };
  const change = d.scheduled_change;
  let endsAt = null;
  if (d.status === 'canceled') endsAt = d.canceled_at ?? event.occurred_at ?? null;
  else if (change?.action === 'cancel' || change?.action === 'pause') endsAt = change.effective_at ?? null;
  return {
    kind: 'subscription',
    eventId: event.event_id,
    eventType: event.event_type,
    occurredAt: event.occurred_at,
    record: {
      user_id: userId.toLowerCase(),
      plan: bought.plan,
      status: String(d.status ?? ''),
      billing_interval: bought.interval,
      paddle_customer_id: d.customer_id ?? '',
      paddle_subscription_id: d.id ?? '',
      trial_ends_at: item?.trial_dates?.ends_at ?? '',
      ends_at: endsAt ?? '',
      update_payment_url: d.management_urls?.update_payment_method ?? '',
      cancel_url: d.management_urls?.cancel ?? '',
    },
  };
}

// Paddle's published addresses, as /32 or wider blocks. Used only to turn away strangers early;
// the signature is what proves a delivery is real.
export function ipInCidrs(ip, cidrs) {
  const toInt = (s) => s.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip ?? '')) return false;
  const n = toInt(ip);
  return (cidrs ?? []).some((c) => {
    const [base, bits = '32'] = String(c).split('/');
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(base)) return false;
    const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (toInt(base) & mask) === (n & mask);
  });
}

// deps: { secrets: {live, sandbox}, apply(kind, eventId, type, occurredAt, record) -> status,
//         allowIp?(ip, env) -> bool|undefined, now?(), log?(msg) }
// Returns a plain { status, body }. Anything we cannot process cleanly is a non-2xx so Paddle retries.
export async function handleWebhook({ body, signature, ip }, deps) {
  const log = deps.log ?? (() => {});
  const env = await whichEnvironment(deps.secrets, signature, body, deps.now?.());
  if (!env) return { status: 401, body: 'bad signature' };
  if (deps.allowIp && (await deps.allowIp(ip, env)) === false) {
    log(`rejected ${ip} (${env}): not a Paddle address`);
    return { status: 403, body: 'forbidden' };
  }
  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return { status: 400, body: 'not json' };
  }
  const r = recordFrom(event);
  if (r.skip) {
    log(`skipped ${event?.event_type ?? '?'}: ${r.skip}`);
    return { status: 200, body: r.skip };
  }
  try {
    const result = await deps.apply(r.kind, r.eventId, r.eventType, r.occurredAt, { ...r.record, paddle_env: env });
    log(`${env} ${r.eventType} ${r.eventId}: ${result}`);
    return { status: 200, body: result };
  } catch (err) {
    log(`failed ${r.eventType} ${r.eventId}: ${err.message}`);
    return { status: 500, body: 'try again' };
  }
}
