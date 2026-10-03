// The phone remote (?remote=KEY). Big buttons to move the slides, plus the
// speaker's notes and what comes next.

import { h } from '../core/dom.js';
import { remoteChannel, cleanRemoteState } from './protocol.js';
import { createTransport } from './transport.js';
import { logoPair } from '../shell/chrome.js';
import { BUILD } from '../build-info.js';

export function mountRemote(root, { key, config }) {
  let state = null;
  let status = 'connecting';

  const title = h('div', { class: 'lv-title' });
  const meta = h('div', { class: 'lv-meta' });
  const notes = h('pre', { class: 'lv-notes' });
  const next = h('div', { class: 'lv-next' });
  const send = (op) => channel.send({ t: 'cmd', op });
  const pad = (label, op, cls) => {
    const b = h('button', { type: 'button', class: `lv-pad ${cls}`, text: label });
    b.addEventListener('click', () => { navigator.vibrate?.(15); send(op); });
    return b;
  };
  const foot = h('footer', { class: 'lv-foot' });
  const footStatus = h('div', { role: 'status', 'aria-live': 'polite' });
  const buildLine = h('div', { class: 'lv-build', text: `build ${BUILD}  ·  ${config.kind === 'local' ? 'this browser only' : new URL(config.url).hostname}` });
  foot.append(footStatus, buildLine);
  root.replaceChildren(h('div', { class: 'lv lv--remote' },
    h('header', { class: 'lv-head' }, h('div', { class: 'lv-brand' }, ...logoPair(22), h('span', { text: 'Remote' })), title, meta),
    h('main', { class: 'lv-body' }, next, notes),
    h('div', { class: 'lv-pads' }, pad('Previous', 'prev', 'lv-pad--sec'), pad('Next', 'next', 'lv-pad--pri')),
    foot));

  const transport = createTransport(config);
  const channel = transport.open(remoteChannel(key), {
    onStatus: (s) => {
      status = s === 'connected' ? 'live' : s === 'error' ? 'error' : 'connecting';
      if (s === 'connected') channel.send({ t: 'hello' });
      paint();
    },
    onMessage: (raw) => {
      const s = cleanRemoteState(raw);
      if (!s) return;
      state = s;
      paint();
    },
  });

  function paint() {
    if (state) {
      title.textContent = state.title;
      meta.textContent = `Slide ${state.slide + 1} of ${state.total}${state.steps ? `  ·  step ${state.step} of ${state.steps}` : ''}`;
      notes.textContent = state.notes || 'No notes for this slide.';
      next.textContent = state.next ? `Next: ${state.next}` : 'Last slide';
    } else {
      title.textContent = '';
      meta.textContent = '';
      notes.textContent = status === 'live' ? 'Connected. Start presenting on the computer and this page follows it.' : 'Connecting...';
      next.textContent = '';
    }
    footStatus.textContent = status === 'error' ? 'Connection problem. Retrying...' : '';
  }
  paint();
  return { close: () => { channel.close(); transport.close(); } };
}
