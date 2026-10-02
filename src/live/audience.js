// The page an audience member sees on their phone (?join=CODE). It knows only
// what the presenter sends: the question text, the options and the totals.
// Everything from the network goes through textContent, never innerHTML.

import { h } from '../core/dom.js';
import { uid } from '../core/util.js';
import { audienceChannel, cleanAudienceState } from './protocol.js';
import { createTransport } from './transport.js';

const HEARTBEAT_MS = 20_000;

function clientId() {
  try {
    let id = sessionStorage.getItem('is-cid');
    if (!id) sessionStorage.setItem('is-cid', (id = uid('u_')));
    return id;
  } catch {
    return uid('u_');
  }
}

export function mountAudience(root, { code, config }) {
  const cid = clientId();
  const picks = new Map(); // prompt id -> chosen indexes
  const sent = new Set(); // prompt ids this phone has answered
  let state = { title: '', prompts: [], counts: {}, ended: false };
  let status = 'connecting';
  let heard = false; // has the presenter said anything yet?
  let slow = false;

  const head = h('header', { class: 'lv-head' }, h('div', { class: 'lv-brand', text: 'Interactive Slides' }), h('div', { class: 'lv-title' }));
  const body = h('main', { class: 'lv-body' });
  const foot = h('footer', { class: 'lv-foot', role: 'status', 'aria-live': 'polite' });
  root.replaceChildren(h('div', { class: 'lv lv--audience' }, head, body, foot));

  const transport = createTransport(config);
  const channel = transport.open(audienceChannel(code), {
    onStatus: (s) => {
      status = s === 'connected' ? 'live' : s === 'error' ? 'error' : 'connecting';
      if (s === 'connected') hello();
      paint();
    },
    onMessage: (raw) => {
      const next = cleanAudienceState(raw);
      if (!next) return;
      state = next;
      heard = true;
      paint();
    },
  });
  const hello = () => channel.send({ t: 'hello', cid });
  setInterval(hello, HEARTBEAT_MS);
  setTimeout(() => { slow = true; paint(); }, 6000);

  const submit = (prompt) => {
    channel.send({ t: 'vote', cid, id: prompt.id, picks: picks.get(prompt.id) });
    sent.add(prompt.id);
    paint();
  };

  function card(prompt) {
    const chosen = picks.get(prompt.id) ?? [];
    const answered = sent.has(prompt.id);
    const counts = state.counts[prompt.id];
    const total = counts ? counts.reduce((a, b) => a + b, 0) : 0;
    const list = h('div', { class: 'lv-options', role: prompt.multi ? 'group' : 'radiogroup', 'aria-label': prompt.question });
    prompt.options.forEach((text, i) => {
      const on = chosen.includes(i);
      const btn = h('button', { type: 'button', class: `lv-opt${on ? ' is-on' : ''}`, role: prompt.multi ? 'checkbox' : 'radio', 'aria-checked': String(on) },
        h('span', { class: 'lv-opt__bar', style: answered && total ? `width:${(counts[i] / total) * 100}%` : 'width:0' }),
        h('span', { class: 'lv-opt__key', text: String.fromCharCode(65 + i) }),
        h('span', { class: 'lv-opt__text', text }),
        h('span', { class: 'lv-opt__pct', text: answered && total ? `${Math.round((counts[i] / total) * 100)}%` : '' }));
      btn.addEventListener('click', () => {
        const cur = picks.get(prompt.id) ?? [];
        picks.set(prompt.id, prompt.multi ? (cur.includes(i) ? cur.filter((n) => n !== i) : [...cur, i].sort((a, b) => a - b)) : [i]);
        if (!prompt.multi) submit(prompt);
        else paint();
      });
      list.append(btn);
    });
    const out = h('section', { class: 'lv-card' }, h('h2', { class: 'lv-q', text: prompt.question }), list);
    if (prompt.multi) {
      const send = h('button', { type: 'button', class: 'lv-send', text: answered ? 'Update answer' : 'Send answer' });
      send.disabled = chosen.length === 0;
      send.addEventListener('click', () => submit(prompt));
      out.append(send);
    }
    if (answered) out.append(h('p', { class: 'lv-sent', text: prompt.multi ? 'Answer sent. You can change it.' : 'Answer sent. Tap another option to change it.' }));
    return out;
  }

  function paint() {
    head.querySelector('.lv-title').textContent = state.title;
    // Keep the focused option focused across a repaint.
    const focusIndex = [...body.querySelectorAll('.lv-opt')].indexOf(document.activeElement);
    body.replaceChildren();
    if (state.ended) {
      body.append(h('p', { class: 'lv-note', text: 'This session has ended. Thanks for taking part.' }));
    } else if (!state.prompts.length) {
      if (!heard) {
        body.append(h('p', { class: 'lv-note', text: status === 'live' ? 'Waiting for the presenter...' : 'Connecting...' }));
        if (slow && status === 'live') body.append(h('p', { class: 'lv-note', text: 'Nothing yet. Check the code, and that the presenter has started the session in the same browser (try-it-here mode) or on the same server.' }));
      } else {
        body.append(h('p', { class: 'lv-note', text: 'Connected. The next question will appear here.' }));
      }
    } else {
      for (const p of state.prompts) body.append(card(p));
    }
    if (focusIndex >= 0) body.querySelectorAll('.lv-opt')[focusIndex]?.focus();
    foot.textContent = status === 'error' ? 'Connection problem. Retrying...' : '';
  }
  paint();
  return { close: () => { channel.close(); transport.close(); } };
}
