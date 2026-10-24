// Online saving for the open deck: sign in (Google or an emailed link, with a password
// as a fallback), see its online state, share link, and resolve a conflict. The list of
// all decks lives on the dashboard. Saving itself is automatic once you
// are signed in (src/cloud/sync.js); the buttons here are for the cases you want to
// control yourself.

import { h } from '../core/dom.js';
import * as ops from './ops.js';
import { completionsCsv } from '../cloud/course.js';
import { BUILT_IN_PROJECT } from '../cloud/defaults.js';
import { loadProject, saveProject } from '../cloud/config.js';
import { signInPanel } from '../cloud/sign-in-panel.js';
import { getCloud, resetCloud } from '../cloud/instance.js';
import { baseAddress, loadSettings } from '../live/config.js';
import { DASHBOARD_PATH } from '../shell/paths.js';
import { cleanConfig, encodeConfig } from '../live/protocol.js';
import { button, field, openDialog, select, textInput, toast } from './ui.js';
import { normalizeDeck } from '../core/schema.js';

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



export function openCloudDialog(editor) {
  const content = h('div', { class: 'ed-cloud' });
  const dialog = openDialog({ title: 'Online saving', content, wide: true });
  let project = loadProject();
  let cloud = getCloud();
  let busy = false;
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
    return h('div', null,
      h('p', { class: 'ed-hint', text: 'Sign in once and your decks save online by themselves, on any device. You stay signed in on this browser.' }),
      signInPanel({ cloud, run, say, onSignedIn: () => { editor.sync.refresh(); shareToken = undefined; render(); } }));
  }

  // ---- 3. signed in: this deck's online state, sharing, conflicts ------------------

  let completions = null;
  let teams = [];
  let deckTeamId = null;
  let deckOwner = null;
  let shareToken = undefined; // undefined = not looked up yet, null = not shared

  // The team's brand kit is a logo, its position and size, and the theme with its colour overrides. It came from
  // the database, so it goes through the same gate as any imported deck before it touches this one.
  function useTeamBrand(team) {
    const kit = team.brand ?? {};
    if (!kit.brand && !kit.theme) { say('This team has no brand kit yet. The team owner can save one from their deck.'); return; }
    const { deck } = normalizeDeck({ ...editor.deck, brand: kit.brand ?? editor.deck.brand, theme: kit.theme ?? editor.deck.theme });
    let next = ops.setBrand(editor.deck, deck.brand);
    const theme = deck.theme;
    next = ops.setTheme(next, theme.id);
    next = ops.setThemeOverrides(next, theme.overrides);
    editor.commit(next, { source: 'ui' });
    say(`Applied the ${team.name} brand to this deck.`);
  }

  async function saveTeamBrand(team) {
    const inlined = await editor.assets.inline({ brand: editor.deck.brand });
    const kit = { brand: inlined.brand, theme: editor.deck.theme };
    if (JSON.stringify(kit).length > 300000) throw new Error('The logo is too large for a shared brand kit. Use a smaller image.');
    team.brand = (await cloud.setTeamBrand(team.id, kit)).brand;
    say(`Saved this deck's logo, colours and font as the ${team.name} brand kit.`);
    render();
  }

  async function loadShare() {
    shareToken = editor.cloudId ? (await cloud.get(editor.cloudId)).share_token ?? null : null;
    if (editor.cloudId) {
      teams = await cloud.teams();
      const info = await cloud.deckTeam(editor.cloudId);
      deckTeamId = info?.team_id ?? null;
      deckOwner = info?.owner ?? null;
    }
    render();
  }

  function decksView() {
    if (shareToken === undefined) {
      run('Checking this deck...', loadShare)();
      return h('p', { class: 'ed-hint', text: 'Loading...' });
    }
    const state = editor.sync.state;
    const linked = !!editor.cloudId;
    const stateText = {
      saving: 'Saving...', saved: 'This deck is saved online.', error: `Not saved yet: ${editor.sync.error}`,
      idle: linked ? 'Edits save online automatically.' : 'This deck is not online yet. It saves after your next edit, or save it now.',
    }[state] ?? '';

    const out = [
      h('div', { class: 'ed-cloud__who' },
        h('span', { text: `Signed in as ${cloud.user.email}` }),
        button({ label: 'Sign out', onClick: run('Signing out...', async () => { await cloud.signOut(); editor.sync.refresh(); shareToken = undefined; say(''); render(); }) })),
    ];

    if (state === 'conflict') {
      out.push(h('div', { class: 'ed-hint ed-hint--warn' },
        h('strong', { text: 'This deck was changed somewhere else.' }),
        h('p', { text: 'The online copy is newer than the one this page last saw (another device or tab saved it). Nothing was overwritten. Choose what to do:' }),
        h('div', { class: 'ed-live__actions' },
          button({ label: 'Use the online version', onClick: run('Opening the online version...', async () => {
            const row = await cloud.get(editor.cloudId);
            await editor.unlinkCloud();
            await editor.importDeck(row.data, { cloudId: row.id, cloudUpdatedAt: row.updated_at, flash: 'Opened the online version. Your other version is still in My decks.' });
          }) }),
          button({ label: 'Keep both', onClick: run('Saving a copy...', async () => { await editor.sync.flush({ asCopy: true, manual: true }); say('Saved this version as a new online copy.'); render(); }) }),
          button({ label: 'Replace the online copy', variant: 'danger', onClick: run('Saving...', async () => { await editor.sync.flush({ force: true, manual: true }); say('The online copy now matches this version.'); render(); }) }))));
    } else {
      out.push(h('p', { class: 'ed-hint', text: `${stateText} Images are stored inside the deck, up to 25 MB in all.` }));
      out.push(h('div', { class: 'ed-live__actions' },
        button({ label: linked ? 'Save now' : 'Save this deck online', variant: 'primary', onClick: run('Saving...', async () => {
          editor.canvas.finishEdit();
          const row = await editor.sync.flush({ manual: true });
          if (row) shareToken = undefined; // look the deck up again
          say(row ? `Saved "${editor.deck.meta.title}".` : 'Already saved.');
          render();
        }) })));
    }

    if (linked) {
      const shared = !!shareToken;
      const link = shared ? shareLink(project, shareToken) : null;
      out.push(h('div', { class: 'ed-cloud__row' },
        h('div', { class: 'ed-cloud__main' },
          h('div', { class: 'ed-xrow__title', text: 'Share link' }),
          h('div', { class: 'ed-xrow__desc', text: shared ? 'Anyone with the link can view this deck, no account needed.' : 'Off. Only you can open this deck.' })),
        h('div', { class: 'ed-xrow__actions' }, button({ label: shared ? 'Stop sharing' : 'Share', onClick: run(shared ? 'Turning sharing off...' : 'Creating a link...', async () => {
          shareToken = await cloud.setShared(editor.cloudId, !shared, shareToken);
          say(shared ? 'Sharing is off. The old link no longer works.' : 'Sharing is on. Copy the link below.');
          render();
        }) })),
        link ? h('div', { class: 'ed-cloud__share' },
          h('div', { class: 'ed-live__url', text: link }),
          button({ label: 'Copy link', onClick: async () => {
            try { await navigator.clipboard.writeText(link); toast('Link copied.'); } catch { toast('Could not copy. Select the link and copy it by hand.', { kind: 'error' }); }
          } })) : null));
    }

    if (linked) {
      const team = teams.find((t) => t.id === deckTeamId);
      const owns = deckOwner === cloud.user?.id;
      const options = [{ value: '', label: 'Only me' }, ...teams.map((t) => ({ value: t.id, label: t.name }))];
      const pick = select({ options, value: deckTeamId ?? '', onChange: (v) => run('Updating...', async () => {
        await cloud.setDeckTeam(editor.cloudId, v || null);
        deckTeamId = v || null;
        say(v ? 'This deck is now shared with the team.' : 'This deck is private to you again.');
        render();
      })() });
      pick.setAttribute('aria-label', 'Share this deck with a team');
      pick.disabled = !owns || !teams.length;
      out.push(h('div', { class: 'ed-cloud__row' },
        h('div', { class: 'ed-cloud__main' },
          h('div', { class: 'ed-xrow__title', text: 'Team' }),
          h('div', { class: 'ed-xrow__desc', text: !teams.length ? 'You are not in a team. Make one or join one on your Account page.' : !owns ? 'You are working on a teammate\'s deck.' : team ? `Shared with ${team.name}. Everyone in it can edit and comment.` : 'Only you can open this deck.' })),
        h('div', { class: 'ed-xrow__actions' }, pick),
        team ? h('div', { class: 'ed-cloud__share' },
          button({ label: 'Use the team brand', onClick: () => useTeamBrand(team) }),
          team.owner === cloud.user?.id ? button({ label: 'Save this deck\'s brand to the team', onClick: run('Saving...', () => saveTeamBrand(team)) }) : null) : null));
    }

    if (linked && shareToken) {
      const course = editor.deck.course ?? { on: false, certificate: true };
      const rows = completions;
      out.push(h('div', { class: 'ed-cloud__row' },
        h('div', { class: 'ed-cloud__main' },
          h('div', { class: 'ed-xrow__title', text: 'Self-paced course' }),
          h('div', { class: 'ed-xrow__desc', text: course.on ? 'The share link tracks which slides each visitor has seen, then lets them leave their name and print a certificate.' : 'Off. Visitors simply view the deck.' })),
        h('div', { class: 'ed-xrow__actions' },
          button({ label: course.on ? 'Turn off' : 'Turn on', onClick: () => {
            editor.commit(ops.setCourse(editor.deck, { on: !course.on }), { source: 'ui' });
            say(course.on ? 'Self-paced mode is off. Save the deck to update the link.' : 'Self-paced mode is on. Save the deck to update the link.');
            render();
          } })),
        course.on ? h('div', { class: 'ed-cloud__share' },
          button({ label: course.certificate ? 'Certificate: on' : 'Certificate: off', onClick: () => { editor.commit(ops.setCourse(editor.deck, { certificate: !course.certificate }), { source: 'ui' }); render(); } }),
          button({ label: rows ? 'Refresh the list' : 'Who has finished', onClick: run('Loading...', async () => { completions = await cloud.listCompletions(editor.cloudId); render(); }) }),
          rows?.length ? button({ label: 'Download list', onClick: () => {
            const url = URL.createObjectURL(new Blob([completionsCsv(rows)], { type: 'text/csv' }));
            const a = h('a', { href: url, download: 'completions.csv' });
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          } }) : null) : null,
        course.on && rows ? h('p', { class: 'ed-hint', text: rows.length ? `${rows.length} ${rows.length === 1 ? 'person has' : 'people have'} finished. Latest: ${rows.slice(0, 5).map((r) => r.name).join(', ')}.` : 'Nobody has finished yet.' }) : null));
    }

    out.push(h('div', { class: 'ed-live__actions' }, button({ label: 'All my decks', onClick: () => location.assign(DASHBOARD_PATH) })));
    return h('div', null, ...out);
  }

  render();
  return dialog;
}
