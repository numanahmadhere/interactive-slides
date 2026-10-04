// Netlify Function: POST /api/paddle-webhook. Set Paddle's notification destination to
//   https://<your site>/api/paddle-webhook
// Environment variables (Netlify > Site configuration > Environment variables; never in code):
//   PADDLE_WEBHOOK_SECRET_LIVE      the live destination's secret key
//   PADDLE_WEBHOOK_SECRET_SANDBOX   the sandbox destination's secret key
//   SUPABASE_URL                    your project address
//   SUPABASE_SERVICE_ROLE_KEY       the SERVICE ROLE key. Server only: it must never reach the browser.

import { handleWebhook, ipInCidrs } from '../../src/billing/webhook.js';

export const config = { path: '/api/paddle-webhook' };

const IPS_URL = { live: 'https://api.paddle.com/ips', sandbox: 'https://sandbox-api.paddle.com/ips' };
const cache = { live: null, sandbox: null };

// Paddle's current addresses, fetched from Paddle (never hard-coded) and kept for an hour.
// If Paddle's list cannot be fetched we do not block: the signature is the real check.
async function paddleIps(env) {
  const hit = cache[env];
  if (hit && Date.now() - hit.at < 3_600_000) return hit.cidrs;
  try {
    const res = await fetch(IPS_URL[env], { signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    const cidrs = json?.data?.ipv4_cidrs;
    if (Array.isArray(cidrs) && cidrs.length) {
      cache[env] = { at: Date.now(), cidrs };
      return cidrs;
    }
  } catch { /* fall through */ }
  return null;
}

export default async (request, context) => {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const { PADDLE_WEBHOOK_SECRET_LIVE, PADDLE_WEBHOOK_SECRET_SANDBOX, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || (!PADDLE_WEBHOOK_SECRET_LIVE && !PADDLE_WEBHOOK_SECRET_SANDBOX)) {
    console.error('paddle-webhook: environment variables are missing');
    return new Response('not configured', { status: 500 });
  }
  const body = await request.text(); // the exact bytes, before anything parses them
  const result = await handleWebhook(
    { body, signature: request.headers.get('paddle-signature'), ip: context?.ip },
    {
      secrets: { live: PADDLE_WEBHOOK_SECRET_LIVE, sandbox: PADDLE_WEBHOOK_SECRET_SANDBOX },
      allowIp: async (ip, env) => {
        const cidrs = await paddleIps(env);
        return cidrs && ip ? ipInCidrs(ip, cidrs) : undefined;
      },
      apply: async (eventId, eventType, occurredAt, record) => {
        const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/paddle_apply`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ p_event_id: eventId, p_event_type: eventType, p_occurred: occurredAt, rec: record }),
        });
        if (!res.ok) throw new Error(`database said ${res.status}`);
        return res.json();
      },
      log: (m) => console.log(`paddle-webhook: ${m}`),
    },
  );
  return new Response(result.body, { status: result.status });
};
