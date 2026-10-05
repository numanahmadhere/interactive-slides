// The front door of the app. Nobody builds a deck without a free account, so anyone who is not signed in sees this
// instead of the deck list or the editor. Audience pages (join, remote), share links and the demo player are not behind it.

import { h } from '../core/dom.js';
import { signInPanel } from '../cloud/sign-in-panel.js';
import { logoPair } from './chrome.js';
import { SUPPORT_EMAIL, supportHref } from './contact.js';

export function mountGate(root, cloud, { template = null } = {}) {
  document.body.className = 'sh';
  const status = h('div', { class: 'ed-dialog-status', role: 'status', 'aria-live': 'polite' });
  const say = (text, kind = '') => { status.textContent = text; status.dataset.kind = kind; };
  let busy = false;
  const run = (label, fn) => async () => {
    if (busy) return;
    busy = true;
    say(label);
    try { await fn(); } catch (err) { console.error(err); say(err.message || 'That did not work.', 'error'); } finally { busy = false; }
  };

  root.replaceChildren(h('main', { class: 'gate', id: 'main' },
    h('a', { class: 'gate__brand', href: '/', 'aria-label': 'Densight Slides home' }, ...logoPair(36), h('span', { text: 'Densight Slides' })),
    h('div', { class: 'gate__card' },
      h('h1', { class: 'gate__title', text: template ? 'Sign in to open your slide' : 'Sign in to continue' }),
      h('p', { class: 'gate__lead', text: 'Free, no card. Google or an emailed link. Your audience never needs an account.' }),
      signInPanel({ cloud, run, say, onSignedIn: () => location.reload() }),
      status,
      h('p', { class: 'gate__fine' }, 'By continuing you agree to the ', h('a', { href: '/terms/', text: 'terms' }), ' and ', h('a', { href: '/privacy/', text: 'privacy policy' }), '.')),
    h('p', { class: 'gate__help' }, 'Joining a session? Enter the code on the ', h('a', { href: '/', text: 'home page' }), '. Help: ', h('a', { href: supportHref('Sign in help'), text: SUPPORT_EMAIL }), '.')));
}
