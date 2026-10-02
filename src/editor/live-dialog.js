// "Go live": connection settings, then the room's join code, links and QR codes.

import { h } from '../core/dom.js';
import { qrElement } from '../live/qr.js';
import { baseAddress, isLocalAddress, joinLink, loadSettings, remoteLink, saveSettings } from '../live/config.js';
import { cleanConfig } from '../live/protocol.js';
import { loadProject } from '../cloud/config.js';
import { BUILD } from '../build-info.js';
import { BUILT_IN_CONFIG } from '../cloud/defaults.js';
import { button, field, openDialog, select, textInput, toast } from './ui.js';

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
      editor.startLive({ config, base });
      render();
    } });

    return h('div', null,
      h('p', { class: 'ed-hint', text: 'Start a session, then show the code or QR code. The audience answers polls and quizzes on their phones and you move the slides from yours. Nothing is saved on the server.' }),
      field('Run', kindSelect), remoteBox, problem,
      h('div', { class: 'ed-live__actions' }, start));
  }

  function runningView() {
    const { host, room, config, base } = editor.live;
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
      h('div', { class: 'ed-hint', text: `Build ${BUILD}  ·  ${config.kind === 'local' ? 'this browser only' : new URL(config.url).hostname}` }),
      h('div', { class: 'ed-live__actions' },
        button({ label: 'Clear all votes', onClick: () => { host.resetVotes(); toast('Votes cleared.'); } }),
        button({ label: 'Present', variant: 'primary', onClick: () => { dialog.close(); editor.present(); } }),
        button({ label: 'End session', variant: 'danger', onClick: () => { editor.stopLive(); render(); } })));
  }

  const origClose = dialog.close;
  dialog.close = () => { clearInterval(timer); offStatus?.(); origClose(); };
  render();
  return dialog;
}
