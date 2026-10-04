// Opening Paddle's checkout. Paddle.js is loaded only when someone presses a button, never on page
// load, so people who never upgrade never contact Paddle.

import { PADDLE_TOKEN, PADDLE_ENV, PADDLE_SCRIPT } from './config.js';
import { CATALOG } from './catalog.js';
import { priceId } from './plans.js';

let loading = null;
let handlers = {}; // whoever opened checkout last

function loadPaddle() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PADDLE_SCRIPT;
    script.async = true;
    script.onload = () => {
      try {
        if (PADDLE_ENV === 'sandbox') window.Paddle.Environment.set('sandbox');
        window.Paddle.Initialize({
          token: PADDLE_TOKEN,
          eventCallback: (event) => {
            if (event.name === 'checkout.completed') handlers.onCompleted?.();
            else if (event.name === 'checkout.closed') handlers.onClosed?.();
          },
        });
        resolve(window.Paddle);
      } catch (err) { loading = null; reject(err); }
    };
    script.onerror = () => { loading = null; reject(new Error('Could not load the payment form. Check your connection and try again.')); };
    document.head.append(script);
  });
  return loading;
}

// Is checkout set up in this build? -> { ok, reason }
export function checkoutReady(plan, interval) {
  if (!PADDLE_TOKEN) return { ok: false, reason: 'Payments are not switched on for this site yet.' };
  if (!priceId(CATALOG[PADDLE_ENV], plan, interval)) return { ok: false, reason: 'This plan is not available to buy yet.' };
  return { ok: true };
}

// user: the signed-in Supabase user. The id travels in custom_data so the webhook knows whose plan to change.
export async function openCheckout({ plan, interval, user, onCompleted, onClosed }) {
  const ready = checkoutReady(plan, interval);
  if (!ready.ok) throw new Error(ready.reason);
  handlers = { onCompleted, onClosed };
  const Paddle = await loadPaddle();
  Paddle.Checkout.open({
    items: [{ priceId: priceId(CATALOG[PADDLE_ENV], plan, interval), quantity: 1 }],
    customData: { user_id: user.id },
    customer: user.email ? { email: user.email } : undefined,
    settings: { displayMode: 'overlay', variant: 'one-page' },
  });
}
