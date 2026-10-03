// Account page: who you are, sign in or out, what is stored where, and deleting it all.

import { h } from '../core/dom.js';
import { Persistence } from '../editor/persist.js';
import { button, openDialog, textInput, toast } from '../editor/ui.js';
import { getCloud } from '../cloud/instance.js';
import { signInPanel } from '../cloud/sign-in-panel.js';
import { appHeader } from './chrome.js';
import { takeFlash } from './flash.js';

export async function mountAccount(root) {
  const persist = new Persistence();
  await persist.init();
  const cloud = getCloud();
  const status = h('div', { class: 'ed-dialog-status', role: 'status', 'aria-live': 'polite' });
  const say = (text, kind = '') => { status.textContent = text; status.dataset.kind = kind; };
  let busy = false;
  const run = (label, fn) => async () => {
    if (busy) return;
    busy = true;
    say(label);
    try { await fn(); } catch (err) { console.error(err); say(err.message || 'That did not work.', 'error'); } finally { busy = false; }
  };

  const section = (title, ...children) => h('section', { class: 'sh-section' }, h('h2', { text: title }), ...children);
  const danger = (title, ...children) => h('section', { class: 'sh-section sh-section--danger' }, h('h2', { text: title }), ...children);

  async function render() {
    const local = await persist.listDecks();
    const body = [h('h1', { class: 'sh-title', text: 'Account' })];

    if (!cloud) {
      body.push(section('Online saving', h('p', { text: 'Online accounts are not set up for this site. Your decks are saved on this device.' })));
    } else if (!cloud.user) {
      body.push(section('Sign in',
        h('p', { class: 'sh-lead', text: 'Sign in to save decks online, open them on any device, and share them with a link. You do not need an account to build and present decks.' }),
        signInPanel({ cloud, run, say, onSignedIn: () => location.reload() }), status));
    } else {
      body.push(section('Signed in',
        h('div', { class: 'sh-profile' }, h('span', { class: 'sh-avatar sh-avatar--lg', 'aria-hidden': 'true', text: (cloud.user.email[0] ?? '?').toUpperCase() }), h('div', {}, h('div', { class: 'sh-profile__email', text: cloud.user.email }), h('div', { class: 'sh-profile__note', text: 'Your decks save online automatically.' }))),
        h('div', { class: 'ed-live__actions' }, button({ label: 'Sign out', onClick: run('Signing out...', async () => { await cloud.signOut(); location.reload(); }) })),
        status));
    }

    body.push(section('On this device',
      h('p', { text: `${local.length} deck${local.length === 1 ? '' : 's'} stored in this browser. They stay here until you delete them.` }),
      local.length ? h('div', { class: 'ed-live__actions' }, button({ label: 'Remove all decks from this device', variant: 'danger', onClick: () => confirmWipe(local.length) })) : null));

    if (cloud?.user) {
      body.push(danger('Delete my account',
        h('p', { text: 'Permanently deletes your account and every deck saved online, including shared links. Decks stored only on this device are not touched. This cannot be undone.' }),
        h('div', { class: 'ed-live__actions' }, button({ label: 'Delete my account...', variant: 'danger', onClick: confirmDelete }))));
    }

    body.push(section('Your data', h('p', {}, 'We keep your decks and your email address, nothing else, and we do not use tracking cookies. Read the ', h('a', { href: '/privacy/', text: 'privacy policy' }), '.')));
    root.replaceChildren(appHeader({ active: 'account' }), h('main', { class: 'sh-main sh-narrow', id: 'main' }, ...body));
  }

  function confirmWipe(n) {
    const dlg = openDialog({ title: 'Remove all decks from this device?', content: h('div', null,
      h('p', { text: `${n} deck${n === 1 ? '' : 's'} will be removed from this browser. Decks saved online stay online.` }),
      h('div', { class: 'ed-live__actions' },
        button({ label: 'Cancel', onClick: () => dlg.close() }),
        button({ label: 'Remove', variant: 'danger', onClick: async () => {
          dlg.close();
          for (const m of await persist.listDecks()) await persist.deleteDeck(m.id);
          toast('Removed.');
          render();
        } }))) });
  }

  function confirmDelete() {
    let typed = '';
    const input = textInput({ placeholder: 'Type DELETE', spellcheck: false, onInput: (v) => { typed = v.trim(); } });
    input.setAttribute('aria-label', 'Type DELETE to confirm');
    const dlg = openDialog({ title: 'Delete your account?', content: h('div', null,
      h('p', { text: `This deletes ${cloud.user.email} and every deck saved online. Type DELETE to confirm.` }), input,
      h('div', { class: 'ed-live__actions' },
        button({ label: 'Cancel', onClick: () => dlg.close() }),
        button({ label: 'Delete everything', variant: 'danger', onClick: async () => {
          if (typed !== 'DELETE') return toast('Type DELETE first.', { kind: 'error' });
          try {
            await cloud.deleteAccount();
            // The decks on this device are unlinked from the deleted online copies.
            for (const m of await persist.listDecks()) if (m.cloudId) await persist.patchMeta(m.id, { cloudId: null, cloudUpdatedAt: null });
            dlg.close();
            location.assign('/?account-deleted=1');
          } catch (err) {
            toast(err.message || 'Could not delete the account.', { kind: 'error' });
          }
        } }))) });
  }

  await render();
  const flash = takeFlash();
  if (flash) toast(flash.text, { kind: flash.kind });
}
