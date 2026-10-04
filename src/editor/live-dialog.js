// "Go live": connection settings, then the room's join code, links and QR codes.

import { h } from '../core/dom.js';
import { slugify } from '../core/util.js';
import { qrElement } from '../live/qr.js';
import { baseAddress, isLocalAddress, joinLink, loadSettings, remoteLink, saveSettings } from '../live/config.js';
import { cleanConfig } from '../live/protocol.js';
import { loadProject } from '../cloud/config.js';
import { BUILD } from '../build-info.js';
import { BUILT_IN_CONFIG } from '../cloud/defaults.js';
import { button, field, openDialog, select, textInput, toast, toggle } from './ui.js';
import { PLANS, canLeaderboard } from '../billing/plans.js';

const STATUS_TEXT = {
  connecting: 'Connecting...',
  live: 'Live. Phones can join now.',
  error: 'Could not connect. Check the server address and key.',
  stopped: 'Ended.',
};

export function openLiveDialog(editor) {
  const content = h('div', { class: 'ed-live' });
  const dialog = openDialog({ title: 'Go live', content, wide: true });
  let timer = 0;
  let offStatus = null;
  const render = () => {
    clearInterval(timer);
    offStatus?.();
    content.replaceChildren(editor.live ? runningView() : setupView());
  };

  function setupView() {
    const settings = loadSettings();
    // If a Supabase project is already connected (File > Cloud), use it by default:
    // "try it here" cannot reach phones, and picking it by accident is an easy mistake.
    const project = loadProject();
    const useProject = settings.config.kind === 'local' && !!project;
    let kind = useProject ? 'realtime' : settings.config.kind;
    let url = useProject ? project.url : settings.config.url ?? '';
    let key = useProject ? project.key : settings.config.key ?? '';
    let base = settings.base;
    let names = false;
    let privacy = false;
    let teamText = '';
    const remoteBox = h('div', { class: 'ed-live__server', hidden: kind === 'local' || !!BUILT_IN_CONFIG });
    const problem = h('p', { class: 'ed-hint ed-hint--warn', hidden: true });

    const kindSelect = select({
      options: [
        { value: 'local', label: 'Try it here (other tabs of this browser)' },
        { value: 'realtime', label: 'Realtime server (phones and other computers)' },
      ],
      value: kind,
      onChange: (v) => { kind = v; remoteBox.hidden = v === 'local' || !!BUILT_IN_CONFIG; },
    });
    kindSelect.setAttribute('aria-label', 'Where the session runs');

    remoteBox.append(
      field('Server address', textInput({ value: url, placeholder: 'https://your-project.supabase.co', spellcheck: false, onInput: (v) => { url = v; } }),
        'A Supabase project address, or your own relay (node tools/relay.mjs).'),
      field('Public key', textInput({ value: key, placeholder: 'The project\'s anon (public) key', spellcheck: false, onInput: (v) => { key = v; } }),
        'The public "anon" key only, never a secret or service key. It is stored in this browser and put in the links phones open.'),
      field('Address phones open', textInput({ value: base, placeholder: baseAddress({ base: '' }), spellcheck: false, onInput: (v) => { base = v; } }),
        'Leave empty to use this page\'s address. On a local test, use this computer\'s address on your network, such as http://192.168.1.5:5177.'));

    const start = button({ label: 'Start session', variant: 'primary', onClick: () => {
      const config = kind === 'local' ? { kind: 'local' } : cleanConfig({ kind: 'realtime', url, key });
      if (!config) {
        problem.textContent = 'Enter a server address that starts with https:// (or http:// for your own relay) and the public key.';
        problem.hidden = false;
        return;
      }
      saveSettings({ config, base });
      const teams = teamText.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8);
      if (!privacy && (names || teams.length) && !editor.requirePlan((p) => p.leaderboard, 'Names, teams and the leaderboard are not part of your plan.')) return;
      editor.startLive({ config, base, names: !privacy && (names || teams.length > 0), teams: privacy ? [] : teams, privacy });
      render();
    } });

    return h('div', null,
      h('p', { class: 'ed-hint', text: 'Start a session, then show the code or QR code. The audience answers polls and quizzes on their phones and you move the slides from yours. Nothing is saved on the server.' }),
      field('Run', kindSelect), remoteBox,
      toggle({ label: canLeaderboard(editor.plan) ? 'Ask for names and keep a leaderboard' : 'Ask for names and keep a leaderboard (Starter)', value: false, onChange: (v) => { names = v; } }),
      field('Teams (optional)', textInput({ placeholder: 'Red, Blue', spellcheck: false, onInput: (v) => { teamText = v; } }), 'Names of up to eight teams, separated by commas. Phones choose one; teams are ranked by their average score.'),
      toggle({ label: 'Private session: keep nothing', value: false, onChange: (v) => { privacy = v; } }),
      h('p', { class: 'ed-hint', text: 'No names or teams, no report, no spreadsheet. Phones do not remember anything, and answers disappear from this page when you end the session.' }),
      problem,
      h('div', { class: 'ed-live__actions' }, start));
  }

  // Reports stay on this device. Saving one needs a plan that includes them.
  async function saveReport() {
    if (!editor.requirePlan((p) => p.reports, 'Saving session reports is not part of your plan.')) return false;
    try {
      await editor.persist.saveReport(editor.live.host.report());
      toast('Report saved on this device.');
      editor.live.reportSaved = true;
      return true;
    } catch (err) {
      toast(err.message || 'Could not save the report.', { kind: 'error' });
      return false;
    }
  }

  // Ending a session that has answers offers to keep them first, because nothing else holds them once it ends.
  function endSession() {
    const live = editor.live;
    if (!live.host.hasAnswers || live.reportSaved) { editor.stopLive(); render(); return; }
    const ask = openDialog({ title: 'End this session?', content: h('div', null,
      h('p', { text: 'The answers from this session are held only on this page. Once it ends they are gone, unless you save a report on this device.' }),
      h('div', { class: 'ed-live__actions' },
        button({ label: 'Cancel', onClick: () => ask.close() }),
        button({ label: 'End without saving', variant: 'danger', onClick: () => { ask.close(); editor.stopLive(); render(); } }),
        button({ label: 'Save report and end', variant: 'primary', onClick: async () => { if (await saveReport()) { ask.close(); editor.stopLive(); render(); } } }))) });
  }

  function runningView() {
    const { host, room, config, base, privacy } = editor.live;
    const addr = baseAddress({ base });
    const joinUrl = joinLink(addr, room.code, config);
    const remoteUrl = remoteLink(addr, room.key, config);

    const status = h('div', { class: 'ed-dialog-status', role: 'status', 'aria-live': 'polite' });
    const count = h('div', { class: 'ed-live__count' });
    const paint = () => {
      status.textContent = STATUS_TEXT[host.status] ?? '';
      status.dataset.kind = host.status === 'error' ? 'error' : '';
      const n = host.audienceSize;
      count.textContent = `${n} ${n === 1 ? 'phone' : 'phones'} connected`;
    };
    offStatus = host.onStatus(paint);
    timer = setInterval(paint, 1000);
    paint();

    const copy = (text, what) => async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast(`${what} copied.`);
      } catch {
        toast('Could not copy. Select the link and copy it by hand.', { kind: 'error' });
      }
    };
    const linkRow = (label, url) => h('div', { class: 'ed-live__link' },
      h('div', { class: 'ed-xrow__title', text: label }),
      h('div', { class: 'ed-live__url', text: url }),
      button({ label: 'Copy link', onClick: copy(url, 'Link') }));

    const warnings = [];
    if (config.kind === 'local') warnings.push('Try-it-here mode: only other tabs of this browser can join. Choose a realtime server to use phones.');
    else if (isLocalAddress(addr)) warnings.push('These links point at "localhost", which phones cannot reach. End the session and enter this computer\'s network address under "Address phones open".');

    return h('div', null,
      ...warnings.map((w) => h('p', { class: 'ed-hint ed-hint--warn', text: w })),
      h('div', { class: 'ed-live__grid' },
        h('section', { class: 'ed-live__card' },
          h('h3', { text: 'Audience' }),
          h('div', { class: 'ed-live__code', 'aria-label': `Join code ${room.code.split('').join(' ')}`, text: room.code }),
          qrElement(joinUrl, { size: 168, label: 'QR code to join as audience' }),
          linkRow('Join link', joinUrl)),
        h('section', { class: 'ed-live__card' },
          h('h3', { text: 'Your phone remote' }),
          h('p', { class: 'ed-hint', text: 'Keep this private: anyone with it can change your slides.' }),
          qrElement(remoteUrl, { size: 168, label: 'QR code for the presenter remote' }),
          linkRow('Remote link', remoteUrl))),
      h('div', { class: 'ed-live__bar' }, count, status),
      h('p', { class: 'ed-hint', text: `${PLANS[editor.plan].name} plan: rooms up to ${host.maxPhones} phones.${editor.plan === 'free' ? ' Word clouds, open answers, ranking and Q&A need Starter.' : ''}` }),
      privacy ? h('p', { class: 'ed-hint', text: 'Private session: nothing from it can be downloaded or saved. It all disappears when you end the session.' }) : null,
      h('div', { class: 'ed-hint', text: `Build ${BUILD}  ·  ${config.kind === 'local' ? 'this browser only' : new URL(config.url).hostname}` }),
      h('div', { class: 'ed-live__actions' },
        privacy ? null : button({ label: editor.plan === 'free' ? 'Download results (CSV, Starter)' : 'Download results (CSV)', onClick: () => {
          if (!editor.requirePlan((p) => p.csv, 'Downloading results is not part of your plan.')) return;
          const blob = new Blob([host.exportResults()], { type: 'text/csv;charset=utf-8' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `${slugify(editor.deck.meta.title) || 'results'}-results.csv` });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        } }),
        button({ label: 'Clear all votes', onClick: () => { host.resetVotes(); toast('Votes cleared.'); } }),
        button({ label: 'Present', variant: 'primary', onClick: () => { dialog.close(); editor.present(); } }),
        privacy ? null : button({ label: 'Save report', onClick: () => saveReport() }),
        button({ label: 'End session', variant: 'danger', onClick: endSession })));
  }

  const origClose = dialog.close;
  dialog.close = () => { clearInterval(timer); offStatus?.(); origClose(); };
  render();
  return dialog;
}
