// The front door of the app. Nobody builds a deck without a free account, so anyone who is not signed in sees this
// instead of the deck list or the editor. Audience pages (join, remote), share links and the demo player are not behind it.

import { h } from '../core/dom.js';
import { signInPanel } from '../cloud/sign-in-panel.js';
import { logoPair } from './chrome.js';
import { COMPANY_NAME, COMPANY_URL, SUPPORT_EMAIL, supportHref } from './contact.js';

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
      h('p', { class: 'gate__label', text: template ? 'Your slide is ready' : 'Free account' }),
      h('h1', { class: 'gate__title', text: template ? 'Sign in to open it in the editor' : 'Sign in to start building' }),
      h('p', { class: 'gate__lead', text: 'Create a free account in a few seconds, with Google or an emailed link. It keeps your decks safe, lets you open them on any device, and your audience never needs one.' }),
      signInPanel({ cloud, run, say, onSignedIn: () => location.reload() }),
      status,
      h('ul', { class: 'gate__perks' },
        h('li', { text: 'No card, and nothing to install' }),
        h('li', { text: 'Your decks save as you work' }),
        h('li', { text: 'Share a link or present from any device' })),
      h('p', { class: 'gate__fine' }, 'By continuing you agree to the ', h('a', { href: '/terms/', text: 'terms' }), ' and ', h('a', { href: '/privacy/', text: 'privacy policy' }), '.')),
    h('p', { class: 'gate__help' }, 'Joining a live session instead? Use the code on the presenter\'s screen at ', h('a', { href: '/', text: 'the home page' }), '. Questions: ', h('a', { href: supportHref('Sign in help'), text: SUPPORT_EMAIL }), '. A product of ', h('a', { href: COMPANY_URL, text: COMPANY_NAME }), '.')));
}
