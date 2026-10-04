// The plan chooser, shared by the account page and the upgrade dialog. It only draws and calls
// back; opening Paddle's checkout and refreshing the plan live in checkout.js and state.js.

import { h } from '../core/dom.js';
import { PLANS, PLAN_ORDER, PRICES, TRIAL_DAYS } from './plans.js';
import { highlights } from './features.js';
import { checkoutReady, openCheckout, previewPrices } from './checkout.js';
import { CATALOG } from './catalog.js';
import { PADDLE_ENV } from './config.js';
import { SUPPORT_EMAIL, supportHref } from '../shell/contact.js';

const money = (n) => `$${n.toLocaleString('en-US')}`;

// opts: { billing, cloud, interval, highlight, onSignIn(), onMessage(text, kind), onActivated(plan) }
export function planPicker(opts) {
  const { billing, cloud } = opts;
  let interval = opts.interval === 'year' ? 'year' : 'month';
  const root = h('div', { class: 'bp' });
  let local = new Map(); // Paddle's own formatted prices for this visitor, once they arrive
  const note = h('p', { class: 'bp__note', role: 'status', 'aria-live': 'polite' });
  let busy = false;

  const say = (text, kind = '') => { note.textContent = text; note.dataset.kind = kind; opts.onMessage?.(text, kind); };

  async function buy(plan) {
    if (busy) return;
    busy = true;
    try {
      await openCheckout({
        plan, interval, user: cloud.user,
        onCompleted: async () => {
          say('Thank you. Switching your plan on...');
          const now = await billing.waitForChange();
          if (now !== 'free') { say(`You are on ${PLANS[now].name}. Enjoy.`); opts.onActivated?.(now); } else say('Your payment went through. Your plan can take a minute to appear; reload this page if it does not.');
          paint();
        },
        onClosed: () => { busy = false; },
      });
    } catch (err) {
      say(err.message || 'Could not open the payment form.', 'error');
      busy = false;
    }
  }

  function action(id) {
    const current = billing.plan;
    const btn = h('button', { type: 'button', class: 'bp__btn' });
    if (id === current) { btn.textContent = 'Your plan'; btn.disabled = true; return btn; }
    if (current !== 'free') { // changing plans needs Paddle's subscription update, which a person does through support for now
      btn.textContent = PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(current) ? 'Ask us to upgrade' : 'Ask us to change';
      btn.addEventListener('click', () => { location.href = supportHref(`Change my plan to ${PLANS[id].name}`); });
      return btn;
    }
    if (!cloud?.user) { btn.textContent = 'Sign in to start'; btn.addEventListener('click', () => opts.onSignIn?.()); return btn; }
    const ready = checkoutReady(id, interval);
    btn.textContent = ready.ok ? `Start ${TRIAL_DAYS}-day free trial` : 'Not available yet';
    btn.disabled = !ready.ok;
    if (!ready.ok) btn.title = ready.reason;
    btn.addEventListener('click', () => buy(id));
    return btn;
  }

  function card(id) {
    const plan = PLANS[id];
    const price = PRICES[id];
    const paddlePrice = local.get(CATALOG[PADDLE_ENV]?.[id]?.[interval]);
    const el = h('section', { class: `bp__card${opts.highlight === id ? ' is-highlight' : ''}${billing.plan === id ? ' is-current' : ''}`, 'aria-labelledby': `bp-${id}` },
      h('h3', { class: 'bp__name', id: `bp-${id}`, text: plan.name }),
      h('p', { class: 'bp__blurb', text: plan.blurb }),
      price
        ? h('p', { class: 'bp__price' }, h('b', { text: paddlePrice ?? money(interval === 'year' ? price.year : price.month) }), h('span', { text: interval === 'year' ? ' a year' : ' a month' }))
        : h('p', { class: 'bp__price' }, h('b', { text: '$0' }), h('span', { text: ' forever' })),
      price && interval === 'year' ? h('p', { class: 'bp__save', text: paddlePrice ? 'Two months free' : `Two months free (${money(price.month)} a month)` }) : h('p', { class: 'bp__save' }),
      h('ul', { class: 'bp__list' }, ...highlights(id).map((t) => h('li', { text: t }))));
    if (price) el.append(action(id));
    else el.append(h('p', { class: 'bp__free', text: billing.plan === 'free' ? 'Your plan' : 'Included with every account' }));
    return el;
  }

  function paint() {
    const toggle = h('div', { class: 'bp__toggle', role: 'group', 'aria-label': 'Billing period' });
    for (const [value, label] of [['month', 'Monthly'], ['year', 'Yearly: 2 months free']]) {
      const b = h('button', { type: 'button', class: 'bp__tab', 'aria-pressed': String(interval === value), text: label });
      b.addEventListener('click', () => { interval = value; paint(); });
      toggle.append(b);
    }
    root.replaceChildren(toggle, h('div', { class: 'bp__grid' }, ...PLAN_ORDER.map(card)), note,
      h('p', { class: 'bp__fine' }, `Each paid plan starts with a ${TRIAL_DAYS}-day free trial. A card is needed to start it, and you can cancel before it ends to pay nothing. Prices are shown in your currency with any tax included when we can work it out, and the checkout shows the exact amount before you pay. Questions: `, h('a', { href: supportHref('Plans and pricing'), text: SUPPORT_EMAIL }), '.'));
  }

  paint();
  billing.subscribe(paint);
  previewPrices().then((map) => { if (map.size) { local = map; paint(); } });
  return root;
}
