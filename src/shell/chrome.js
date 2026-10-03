// The bar across the top of the dashboard and account pages.

import { h } from '../core/dom.js';
import { getCloud } from '../cloud/instance.js';
import { ACCOUNT_PATH, DASHBOARD_PATH } from './paths.js';

export function appHeader({ active }) {
  const cloud = getCloud();
  const link = (href, label, id) => h('a', { href, class: `sh-nav__link${active === id ? ' is-active' : ''}`, 'aria-current': active === id ? 'page' : undefined, text: label });
  return h('header', { class: 'sh-header' },
    h('a', { class: 'sh-brand', href: '/', 'aria-label': 'Densight Slides home' },
      h('span', { class: 'sh-brand__mark', 'aria-hidden': 'true' }, 'D'), h('span', { text: 'Densight Slides' })),
    h('nav', { class: 'sh-nav', 'aria-label': 'Main' },
      link(DASHBOARD_PATH, 'My decks', 'decks'),
      link('/learn/', 'Learn', 'learn')),
    h('div', { class: 'sh-spacer' }),
    h('a', { class: 'sh-account', href: ACCOUNT_PATH, 'aria-current': active === 'account' ? 'page' : undefined },
      cloud?.user ? h('span', { class: 'sh-avatar', 'aria-hidden': 'true', text: (cloud.user.email[0] ?? '?').toUpperCase() }) : null,
      h('span', { text: cloud?.user ? 'Account' : 'Sign in' })));
}

// A full-page message in the app's own look (bad links, missing decks, errors).
export function showMessage(root, title, text, link = { href: '/', label: 'Go to the home page' }) {
  document.body.className = 'sh';
  root.replaceChildren(h('main', { class: 'sh-main sh-narrow', id: 'main' },
    h('h1', { class: 'sh-title', text: title }),
    text ? h('p', { class: 'sh-lead', text }) : null,
    link ? h('p', {}, h('a', { href: link.href, class: 'sh-link', text: link.label })) : null));
}
