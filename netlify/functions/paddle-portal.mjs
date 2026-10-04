// Netlify Function: POST /api/paddle-portal. Called by the account page with the person's Supabase session
// as a bearer token. Returns { url }: a Paddle-hosted portal page for that person only.
// Environment variables (Netlify only; never in code or the page):
//   PADDLE_API_KEY_LIVE / PADDLE_API_KEY_SANDBOX   server API keys (pdl_...). Need "customer portal session" write access.
//   SUPABASE_URL, SUPABASE_ANON_KEY                to check the person's session
//   SUPABASE_SERVICE_ROLE_KEY                      to read their subscription row. Server only.

import { createPortalSession } from '../../src/billing/portal.js';

export const config = { path: '/api/paddle-portal' };

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async (request) => {
  const { PADDLE_API_KEY_LIVE, PADDLE_API_KEY_SANDBOX, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('paddle-portal: Supabase environment variables are missing');
    return json(500, { error: 'not_configured' });
  }
  const base = SUPABASE_URL.replace(/\/+$/, '');
  const result = await createPortalSession(
    { method: request.method, authorization: request.headers.get('authorization') },
    {
      apiKeys: { live: PADDLE_API_KEY_LIVE, sandbox: PADDLE_API_KEY_SANDBOX },
      fetch,
      // Who is this? Ask Supabase to check the session; it answers with the person it belongs to.
      getUser: async (token) => {
        const res = await fetch(`${base}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
        return res.ok ? res.json() : null;
      },
      findSubscription: async (userId) => {
        const res = await fetch(`${base}/rest/v1/subscriptions?select=paddle_customer_id,paddle_subscription_id,paddle_env&user_id=eq.${encodeURIComponent(userId)}&limit=1`, {
          headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        });
        if (!res.ok) throw new Error(`database said ${res.status}`);
        return (await res.json())[0] ?? null;
      },
    },
  );
  if (result.status >= 500) console.error(`paddle-portal: ${result.body.error}`);
  return json(result.status, result.body);
};
