// Online saving: sign in (Google or an emailed link, with a password as a fallback),
// see and open saved decks, share links, delete. Saving itself is automatic once you
// are signed in (src/cloud/sync.js); the buttons here are for the cases you want to
// control yourself.

import { h } from '../core/dom.js';
import { BUILT_IN_PROJECT } from '../cloud/defaults.js';
import { getLink, loadProject, saveProject, setLink } from '../cloud/config.js';
import { getCloud, resetCloud } from '../cloud/instance.js';
import { baseAddress, loadSettings } from '../live/config.js';
import { cleanConfig, encodeConfig } from '../live/protocol.js';
import { button, field, openDialog, textInput, toast } from './ui.js';

export function shareLink(project, token) {
  const url = new URL(baseAddress(loadSettings()));
  url.searchParams.set('view', token);
  if (!BUILT_IN_PROJECT) url.searchParams.set('rt', encodeConfig({ kind: 'realtime', url: project.url, key: project.key }));
  return url.toString();
}

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

// Where the sign-in link and Google send the browser back to.
const returnAddress = () => `${location.origin}${location.pathname}`;

export function openCloudDialog(editor) {
  const content = h('div', { class: 'ed-cloud' });
  const dialog = openDialog({ title: 'Online saving', content, wide: true });
  let project = loadProject();
  let cloud = getCloud();
  let decks = null; // null until loaded
  let busy = false;
  let confirmDelete = null;
  let providers = null;
  const status = h('div', { class: 'ed-dialog-status', role: 'status', 'aria-live': 'polite' });
  const say = (text, kind = '') => { status.textContent = text; status.dataset.kind = kind; };

  // Runs an async step with a message shown, and any failure shown inline.
  const run = (label, fn) => async () => {
    if (busy) return;
    busy = true;
    say(label);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      say(err.message || 'That did not work.', 'error');
      if (err.code === 'signed_out') { editor.sync.refresh(); render(); }
    } finally {
      busy = false;
    }
  };

  function render() {
    content.replaceChildren(!project ? projectView() : !cloud.user ? signInView() : decksView(), status);
  }

  // ---- 1. which project (only when this build has none built in) -----------------

  function projectView() {
    let url = '';
    let key = '';
    return h('div', null,
      h('p', { class: 'ed-hint', text: 'Save decks to your own Supabase project and share them with a link. Run supabase/schema.sql in the project once (SQL Editor).' }),
      field('Project address', textInput({ placeholder: 'https://your-project.supabase.co', spellcheck: false, onInput: (v) => { url = v; } })),
      field('Public key', textInput({ placeholder: 'The anon (public) key', spellcheck: false, onInput: (v) => { key = v; } }),
        'Only the public "anon" key. Never paste a service-role key. It is stored in this browser.'),
      h('div', { class: 'ed-live__actions' }, button({ label: 'Connect', variant: 'primary', onClick: () => {
        const clean = cleanConfig({ kind: 'realtime', url, key });
        if (!clean) return say('Enter the project address (https://...) and the public key.', 'error');
        saveProject({ url: clean.url, key: clean.key });
        resetCloud();
        project = loadProject();
        cloud = getCloud();
        editor.sync.refresh();
        say('');
        render();
      } })));
  }

  // ---- 2. sign in -----------------------------------------------------------------

  function signInView() {
    if (providers === null) {
      providers = { google: false, email: true };
      cloud.providers().then((p) => { providers = p; if (!cloud.user && content.isConnected) render(); });
    }
    let email = '';
    let password = '';
    const emailInput = textInput({ placeholder: 'you@example.com', spellcheck: false, onInput: (v) => { email = v.trim(); } });
    emailInput.type = 'email';
    emailInput.autocomplete = 'email';
    const passInput = textInput({ placeholder: 'Password (6 or more characters)', spellcheck: false, onInput: (v) => { password = v; } });
    passInput.type = 'password';
    passInput.autocomplete = 'current-password';
    const needEmail = () => (email ? true : (say('Enter your email address.', 'error'), false));

    const google = providers.google
      ? button({ label: 'Continue with Google', variant: 'primary', onClick: () => { location.href = cloud.oauthUrl('google', returnAddress()); } })
      : null;

    const passwordBox = h('details', { class: 'ed-cloud__pw' },
      h('summary', { text: 'Use a password instead' }),
      field('Password', passInput),
      h('div', { class: 'ed-live__actions' },
        button({ label: 'Create account', onClick: run('Creating your account...', async () => {
          if (!needEmail() || !password) return say('Enter your email and password.', 'error');
          const r = await cloud.signUp(email, password);
          editor.sync.refresh();
          if (r.signedIn) { say(''); await loadDecks(); } else say('Account created. Check your email for a confirmation link, then sign in.');
        }) }),
        button({ label: 'Sign in', onClick: run('Signing in...', async () => {
          if (!needEmail() || !password) return say('Enter your email and password.', 'error');
          await cloud.signIn(email, password);
          editor.sync.refresh();
          say('');
          await loadDecks();
        }) })));

    return h('div', null,
      h('p', { class: 'ed-hint', text: 'Sign in once and your decks save online by themselves, on any device. You stay signed in on this browser.' }),
      google,
      field('Email', emailInput, google ? 'Or get a sign-in link by email.' : 'We email you a link; opening it signs you in. No password needed.'),
      h('div', { class: 'ed-live__actions' },
        button({ label: 'Email me a sign-in link', variant: google ? '' : 'primary', onClick: run('Sending the link...', async () => {
          if (!needEmail()) return;
          await cloud.sendEmailLink(email, returnAddress());
          say(`Check ${email} for a sign-in link and open it on this device.`);
        }) })),
      passwordBox);
  }

  // ---- 3. decks -------------------------------------------------------------------

  async function loadDecks() {
    decks = await cloud.list();
    render();
  }

  function decksView() {
    if (decks === null) {
      run('Loading your decks...', loadDecks)();
      return h('p', { class: 'ed-hint', text: 'Loading...' });
    }
    const linked = getLink(editor.deck);
    const here = linked && decks.some((d) => d.id === linked);
    const stateText = { saving: 'Saving...', saved: 'This deck is saved online.', error: `Not saved yet: ${editor.sync.error}`, idle: 'Edits save online automatically.' }[editor.sync.state] ?? '';
    return h('div', null,
      h('div', { class: 'ed-cloud__who' },
        h('span', { text: `Signed in as ${cloud.user.email}` }),
        button({ label: 'Sign out', onClick: run('Signing out...', async () => { await cloud.signOut(); editor.sync.refresh(); decks = null; say(''); render(); }) })),
      h('p', { class: 'ed-hint', text: `${stateText} Images are stored inside the deck, up to 25 MB in all.` }),
      h('div', { class: 'ed-live__actions' },
        here ? button({ label: 'Save as a new copy', onClick: run('Saving a copy...', async () => { await editor.sync.flush({ asCopy: true, manual: true }); decks = await cloud.list(); say('Saved a copy.'); render(); }) }) : null,
        button({ label: here ? 'Save now' : 'Save this deck online', variant: 'primary', onClick: run('Saving...', async () => {
          editor.canvas.finishEdit();
          const row = await editor.sync.flush({ manual: true });
          decks = await cloud.list();
          say(row ? `Saved "${editor.deck.meta.title}".` : 'Already saved.');
          render();
        }) })),
      decks.length ? h('ul', { class: 'ed-cloud__list' }, ...decks.map((d) => deckRow(d, linked))) : h('p', { class: 'ed-hint', text: 'No saved decks yet.' }));
  }

  function deckRow(d, linked) {
    const shared = !!d.share_token;
    const actions = [
      button({ label: 'Open', onClick: run('Opening...', async () => {
        const row = await cloud.get(d.id);
        await editor.importDeck(row.data, { cloudId: d.id });
        toast(`Opened "${d.title}". Undo brings back the previous deck.`);
        dialog.close();
      }) }),
      button({ label: shared ? 'Stop sharing' : 'Share', onClick: run(shared ? 'Turning sharing off...' : 'Creating a link...', async () => {
        await cloud.setShared(d.id, !shared, d.share_token);
        decks = await cloud.list();
        say(shared ? 'Sharing is off. The old link no longer works.' : 'Sharing is on. Copy the link below.');
        render();
      }) }),
      confirmDelete === d.id
        ? button({ label: 'Delete for good', variant: 'danger', onClick: run('Deleting...', async () => {
          await cloud.remove(d.id);
          if (getLink(editor.deck) === d.id) setLink(null);
          confirmDelete = null;
          decks = await cloud.list();
          say('Deleted.');
          render();
        }) })
        : button({ label: 'Delete', onClick: () => { confirmDelete = d.id; render(); } }),
    ];
    const link = shared ? shareLink(project, d.share_token) : null;
    return h('li', { class: 'ed-cloud__row' },
      h('div', { class: 'ed-cloud__main' },
        h('div', { class: 'ed-xrow__title', text: `${d.title}${d.id === linked ? '  (open now)' : ''}` }),
        h('div', { class: 'ed-xrow__desc', text: `Saved ${when(d.updated_at)}${shared ? '  ·  shared' : ''}` })),
      h('div', { class: 'ed-xrow__actions' }, ...actions),
      link ? h('div', { class: 'ed-cloud__share' },
        h('div', { class: 'ed-live__url', text: link }),
        button({ label: 'Copy link', onClick: async () => {
          try { await navigator.clipboard.writeText(link); toast('Link copied.'); } catch { toast('Could not copy. Select the link and copy it by hand.', { kind: 'error' }); }
        } }),
        h('p', { class: 'ed-hint', text: 'Anyone with this link can view the deck, without an account. Stop sharing to end it.' })) : null);
  }

  render();
  return dialog;
}
