// Account and cloud decks: connect a project, sign in, save the open deck, open
// or delete saved decks, and turn a share link on or off.

import { h } from '../core/dom.js';
import { Cloud, browserStore } from '../cloud/client.js';
import { getLink, loadProject, saveProject, setLink } from '../cloud/config.js';
import { baseAddress, loadSettings } from '../live/config.js';
import { BUILT_IN_PROJECT } from '../cloud/defaults.js';
import { cleanConfig, encodeConfig } from '../live/protocol.js';
import { button, field, openDialog, textInput, toast } from './ui.js';

export function shareLink(project, token) {
  const url = new URL(baseAddress(loadSettings()));
  url.searchParams.set('view', token);
  url.searchParams.set('rt', encodeConfig({ kind: 'realtime', url: project.url, key: project.key }));
  return url.toString();
}

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export function openCloudDialog(editor) {
  const content = h('div', { class: 'ed-cloud' });
  const dialog = openDialog({ title: 'Cloud', content, wide: true });
  let project = loadProject();
  let cloud = project ? new Cloud({ ...project, store: browserStore() }) : null;
  let decks = null; // null until loaded
  let busy = false;
  let confirmDelete = null;
  const status = h('div', { class: 'ed-dialog-status', role: 'status', 'aria-live': 'polite' });
  const say = (text, kind = '') => { status.textContent = text; status.dataset.kind = kind; };

  // Runs an async step with the buttons locked and any failure shown inline.
  const run = (label, fn) => async () => {
    if (busy) return;
    busy = true;
    say(label);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      say(err.message || 'That did not work.', 'error');
      if (err.code === 'signed_out') render();
    } finally {
      busy = false;
    }
  };

  function render() {
    content.replaceChildren(!project ? projectView() : !cloud.user ? signInView() : decksView(), status);
  }

  // ---- 1. which project -----------------------------------------------------------

  function projectView() {
    let url = '';
    let key = '';
    return h('div', null,
      h('p', { class: 'ed-hint', text: 'Save decks to your own Supabase project and share them with a link. Run supabase/schema.sql in the project once (SQL Editor), and turn on email sign-in.' }),
      field('Project address', textInput({ placeholder: 'https://your-project.supabase.co', spellcheck: false, onInput: (v) => { url = v; } })),
      field('Public key', textInput({ placeholder: 'The anon (public) key', spellcheck: false, onInput: (v) => { key = v; } }),
        'Only the public "anon" key. Never paste a service-role key. It is stored in this browser.'),
      h('div', { class: 'ed-live__actions' }, button({ label: 'Connect', variant: 'primary', onClick: () => {
        const clean = cleanConfig({ kind: 'realtime', url, key });
        if (!clean) return say('Enter the project address (https://...) and the public key.', 'error');
        project = { url: clean.url, key: clean.key };
        saveProject(project);
        cloud = new Cloud({ ...project, store: browserStore() });
        say('');
        render();
      } })));
  }

  // ---- 2. sign in -----------------------------------------------------------------

  function signInView() {
    let email = '';
    let password = '';
    const emailInput = textInput({ placeholder: 'you@example.com', spellcheck: false, onInput: (v) => { email = v.trim(); } });
    emailInput.type = 'email';
    emailInput.autocomplete = 'username';
    const passInput = textInput({ placeholder: 'Password (6 or more characters)', spellcheck: false, onInput: (v) => { password = v; } });
    passInput.type = 'password';
    passInput.autocomplete = 'current-password';
    const check = () => (email && password ? true : (say('Enter your email and password.', 'error'), false));
    return h('div', null,
      BUILT_IN_PROJECT ? null : h('p', { class: 'ed-hint', text: `Project: ${project.url}` }),
      field('Email', emailInput), field('Password', passInput),
      h('div', { class: 'ed-live__actions' },
        BUILT_IN_PROJECT ? null : button({ label: 'Change project', onClick: () => { project = null; cloud = null; saveProject(null); localStorage.removeItem('interactive-slides:cloud:session'); say(''); render(); } }),
        button({ label: 'Create account', onClick: run('Creating your account...', async () => {
          if (!check()) return;
          const r = await cloud.signUp(email, password);
          if (r.signedIn) { say(''); await loadDecks(); } else say('Account created. Check your email for a confirmation link, then sign in.');
        }) }),
        button({ label: 'Sign in', variant: 'primary', onClick: run('Signing in...', async () => {
          if (!check()) return;
          await cloud.signIn(email, password);
          say('');
          await loadDecks();
        }) })));
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
    const saveHere = button({ label: linked && decks.some((d) => d.id === linked) ? 'Save changes' : 'Save this deck', variant: 'primary', onClick: run('Saving...', () => save(false)) });
    const rows = decks.map((d) => deckRow(d, linked));
    return h('div', null,
      h('div', { class: 'ed-cloud__who' },
        h('span', { text: `Signed in as ${cloud.user.email}` }),
        button({ label: 'Sign out', onClick: run('Signing out...', async () => { await cloud.signOut(); decks = null; say(''); render(); }) })),
      h('div', { class: 'ed-live__actions' },
        linked && decks.some((d) => d.id === linked) ? button({ label: 'Save as a new copy', onClick: run('Saving...', () => save(true)) }) : null,
        saveHere),
      h('p', { class: 'ed-hint', text: 'Images are stored inside the deck, up to 25 MB in all.' }),
      rows.length ? h('ul', { class: 'ed-cloud__list' }, ...rows) : h('p', { class: 'ed-hint', text: 'No saved decks yet.' }));
  }

  async function save(asCopy) {
    editor.canvas.finishEdit();
    const data = await editor.assets.inline(editor.deck);
    data.meta = { ...data.meta, updatedAt: new Date().toISOString() };
    const title = editor.deck.meta.title;
    const linked = getLink(editor.deck);
    let row;
    if (linked && !asCopy && decks.some((d) => d.id === linked)) row = await cloud.update(linked, { title, data });
    else row = await cloud.create({ title, data });
    setLink(row.id, editor.deck);
    decks = await cloud.list();
    say(`Saved "${title}".`);
    render();
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
