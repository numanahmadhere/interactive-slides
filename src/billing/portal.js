// Minting a Paddle customer portal session for the signed-in person. The portal is hosted by Paddle:
// customers update their card, cancel and see invoices there.
//
// Everything that decides whose portal this is happens here on the server: the person is identified by
// their Supabase session, and their Paddle customer id is read from OUR database. Nothing about who the
// customer is is ever taken from the request.

const BASE = { live: 'https://api.paddle.com', sandbox: 'https://sandbox-api.paddle.com' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reply = (status, body) => ({ status, body });

// request: { method, authorization }. deps: { getUser(token), findSubscription(userId), apiKeys: {live, sandbox}, fetch }
export async function createPortalSession(request, deps) {
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const token = /^Bearer\s+(\S{10,})$/i.exec(request.authorization ?? '')?.[1];
  if (!token) return reply(401, { error: 'sign_in_required' });

  const user = await deps.getUser(token).catch(() => null);
  if (!user?.id || !UUID.test(user.id)) return reply(401, { error: 'sign_in_required' });

  const row = await deps.findSubscription(user.id);
  if (!row?.paddle_customer_id) return reply(404, { error: 'no_subscription' });
  const env = row.paddle_env;
  if (env !== 'live' && env !== 'sandbox') return reply(409, { error: 'unknown_environment' }); // never guess which account
  const key = deps.apiKeys?.[env];
  if (!key) return reply(500, { error: 'not_configured' });

  const body = row.paddle_subscription_id ? { subscription_ids: [row.paddle_subscription_id] } : {};
  let res;
  try {
    res = await deps.fetch(`${BASE[env]}/customers/${encodeURIComponent(row.paddle_customer_id)}/portal-sessions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return reply(502, { error: 'paddle_unreachable' });
  }
  if (!res.ok) return reply(502, { error: 'paddle_refused' });
  const json = await res.json().catch(() => null);
  const url = json?.data?.urls?.general?.overview;
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return reply(502, { error: 'paddle_refused' });
  return reply(200, { url });
}
