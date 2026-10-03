// The bar across the top of the dashboard and account pages, and full-page messages.

import { h } from '../core/dom.js';
import { icon } from '../editor/icons.js';
import { getCloud } from '../cloud/instance.js';
import { isDarkNow, setThemePref, themePref } from '../styles/theme.js';
import { ACCOUNT_PATH, DASHBOARD_PATH } from './paths.js';

const NEXT = { system: 'light', light: 'dark', dark: 'system' };
const LABEL = { system: 'Appearance: follows your device. Click for light.', light: 'Appearance: light. Click for dark.', dark: 'Appearance: dark. Click to follow your device.' };

// A button that cycles system, light, dark.
export function themeToggle() {
  const btn = h('button', { type: 'button', class: 'sh-iconbtn' });
  const paint = () => {
    const pref = themePref();
    btn.replaceChildren(icon(pref === 'system' ? 'monitor' : pref === 'dark' ? 'moon' : 'sun', 18));
    btn.setAttribute('aria-label', LABEL[pref]);
    btn.title = LABEL[pref];
  };
  btn.addEventListener('click', () => { setThemePref(NEXT[themePref()]); paint(); });
  paint();
  return btn;
}

export function appHeader({ active, actions = [] }) {
  const cloud = getCloud();
  const link = (href, label, id) => h('a', { href, class: `sh-nav__link${active === id ? ' is-active' : ''}`, 'aria-current': active === id ? 'page' : undefined, text: label });
  return h('header', { class: 'sh-header' },
    h('div', { class: 'sh-header__in' },
      h('a', { class: 'sh-brand', href: '/', 'aria-label': 'Densight Slides home' },
        h('span', { class: 'sh-brand__mark', 'aria-hidden': 'true' }, 'D'), h('span', { class: 'sh-brand__name', text: 'Densight Slides' })),
      h('nav', { class: 'sh-nav', 'aria-label': 'Main' },
        link(DASHBOARD_PATH, 'My decks', 'decks'),
        link('/learn/', 'Learn', 'learn')),
      h('div', { class: 'sh-spacer' }),
      ...actions,
      themeToggle(),
      h('a', { class: `sh-account${cloud?.user ? ' is-in' : ''}`, href: ACCOUNT_PATH, 'aria-current': active === 'account' ? 'page' : undefined },
        cloud?.user ? h('span', { class: 'sh-avatar', 'aria-hidden': 'true', text: (cloud.user.email[0] ?? '?').toUpperCase() }) : null,
        h('span', { text: cloud?.user ? 'Account' : 'Sign in' }))));
}

// A full-page message in the app's own look (bad links, missing decks, errors).
export function showMessage(root, title, text, link = { href: '/', label: 'Go to the home page' }) {
  document.body.className = 'sh';
  root.replaceChildren(h('main', { class: 'sh-main sh-narrow sh-message', id: 'main' },
    h('div', { class: 'sh-message__mark', 'aria-hidden': 'true' }, 'D'),
    h('h1', { class: 'sh-title', text: title }),
    text ? h('p', { class: 'sh-lead', text }) : null,
    link ? h('p', {}, h('a', { href: link.href, class: 'sh-btn sh-btn--primary', text: link.label })) : null));
}
