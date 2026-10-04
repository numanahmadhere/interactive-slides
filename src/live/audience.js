// The page an audience member sees on their phone (?join=CODE). It knows only
// what the presenter sends: the question text, the options and the totals.
// Everything from the network goes through textContent, never innerHTML.

import { h } from '../core/dom.js';
import { uid } from '../core/util.js';
import { audienceChannel, cleanAudienceState, isStale } from './protocol.js';
import { createTransport } from './transport.js';
import { logoPair } from '../shell/chrome.js';
import { BUILD } from '../build-info.js';

const HEARTBEAT_MS = 20_000;

function loadProfile() {
  try {
    const p = JSON.parse(sessionStorage.getItem('is-profile') ?? 'null');
    return { name: typeof p?.name === 'string' ? p.name.slice(0, 24) : '', team: typeof p?.team === 'string' ? p.team.slice(0, 24) : '' };
  } catch {
    return { name: '', team: '' };
  }
}
const saveProfile = (p) => { try { sessionStorage.setItem('is-profile', JSON.stringify(p)); } catch { /* kept for this page only */ } };

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
  let state = { title: '', prompts: [], counts: {}, data: {}, ended: false };
  const orders = new Map(); // ranking prompt id -> the phone's current order
  const typed = new Map(); // prompt id -> text this phone has sent (cloud, open, Q&A)
  const ups = new Map(); // Q&A prompt id -> Set of question ids this phone upvoted
  const drafts = new Map(); // prompt id -> text typed but not yet sent
  let status = 'connecting';
  let heard = false; // has the presenter said anything yet?
  let lastHeardAt = null;
  let session = null; // which presenter page is talking; a new one has lost the totals
  const answeredIn = new Map(); // prompt id -> the presenter session that has our answer
  let slow = false;
  let profile = loadProfile(); // nickname and team for the leaderboard, asked once
  const scores = new Map(); // quiz id -> how this phone did, as told by the presenter
  const deadlines = new Map(); // quiz id -> when its clock runs out, by this phone's clock
  const notes = new Map(); // prompt id -> what the presenter did with the last thing we sent
  let fullTimer = 0;
  let full = false; // turned away: the room is at its limit

  const head = h('header', { class: 'lv-head' }, h('div', { class: 'lv-brand' }, ...logoPair(22), h('span', { text: 'Densight Slides' })), h('div', { class: 'lv-title' }));
  const body = h('main', { class: 'lv-body' });
  const foot = h('footer', { class: 'lv-foot' });
  const footStatus = h('div', { role: 'status', 'aria-live': 'polite' });
  const buildLine = h('div', { class: 'lv-build', text: `Session ${code}  ·  build ${BUILD}  ·  ${config.kind === 'local' ? 'this browser only' : new URL(config.url).hostname}` });
  foot.append(footStatus, buildLine);
  root.replaceChildren(h('div', { class: 'lv lv--audience' }, head, body, foot));

  const transport = createTransport(config);
  const channel = transport.open(audienceChannel(code), {
    onStatus: (s) => {
      status = s === 'connected' ? 'live' : s === 'error' ? 'error' : 'connecting';
      if (s === 'connected') hello();
      paint();
    },
    onMessage: (raw) => {
      if (raw?.t === 'score' && raw.cid === cid && typeof raw.id === 'string') { // right or wrong, points, and where we stand
        scores.set(raw.id, raw.late ? { late: true } : { correct: raw.correct === true, points: Number.isFinite(raw.points) ? raw.points : 0, total: Number.isFinite(raw.total) ? raw.total : null, rank: Number.isInteger(raw.rank) ? raw.rank : null, of: Number.isInteger(raw.of) ? raw.of : null });
        paint();
        return;
      }
      if (raw?.t === 'note' && raw.cid === cid && typeof raw.id === 'string') { // what became of something we sent
        if (raw.what === 'filtered' && typed.get(raw.id)?.length) typed.set(raw.id, typed.get(raw.id).slice(0, -1)); // it never reached the board, so it does not count against the limit
        notes.set(raw.id, raw.what === 'filtered' ? 'That was not shown: it breaks the room\'s rules.' : 'Sent. The presenter checks answers before they appear.');
        paint();
        return;
      }
      if (raw?.t === 'full' && raw.cid === cid) { // the presenter's plan has no room for another phone
        full = Number.isInteger(raw.limit) ? raw.limit : true;
        clearTimeout(fullTimer);
        fullTimer = setTimeout(() => { full = false; paint(); }, 25_000); // look again; the next hello says if there is room now
        paint();
        return;
      }
      const next = cleanAudienceState(raw);
      if (!next) return;
      if (next.session) session = next.session;
      state = next;
      for (const [id, secs] of Object.entries(next.remaining)) if (!deadlines.has(id) || Math.abs(deadlines.get(id) - (Date.now() + secs * 1000)) > 2500) deadlines.set(id, Date.now() + secs * 1000);
      heard = true;
      lastHeardAt = Date.now();
      // A presenter page that restarted (a reload) has lost the totals. Whenever a
      // question we answered shows up and that page has not got our answer, send it again.
      if (!next.ended) {
        for (const p of next.prompts) {
          if (answeredIn.get(p.id) === session) continue;
          if (sent.has(p.id) && picks.get(p.id)?.length) {
            channel.send({ t: 'vote', cid, id: p.id, picks: picks.get(p.id) });
            answeredIn.set(p.id, session);
          } else if (typed.get(p.id)?.length) {
            for (const text of typed.get(p.id)) channel.send({ t: p.kind === 'qna' ? 'ask' : 'text', cid, id: p.id, text });
            answeredIn.set(p.id, session);
          }
        }
      }
      paint();
    },
  });
  const hello = () => channel.send({ t: 'hello', cid, name: profile.name, team: profile.team });
  setInterval(hello, HEARTBEAT_MS);
  setTimeout(() => { slow = true; paint(); }, 6000);
  let wasStale = false;
  setInterval(() => {
    const stale = isStale(lastHeardAt, Date.now()) && !state.ended;
    if (stale !== wasStale) { wasStale = stale; paint(); }
  }, 5000);

  const submit = (prompt) => {
    channel.send({ t: 'vote', cid, id: prompt.id, picks: picks.get(prompt.id) });
    sent.add(prompt.id);
    answeredIn.set(prompt.id, session);
    paint();
  };

  const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10 < 4 ? n % 10 : 0]}`;

  function scoreLine(prompt) {
    const sc = scores.get(prompt.id);
    if (!sc) return null;
    if (sc.late) return h('p', { class: 'lv-score is-late', role: 'status', text: 'Time was up before your answer arrived.' });
    const standing = sc.rank ? ` You are ${ordinal(sc.rank)} of ${sc.of}, with ${sc.total} points.` : '';
    return h('p', { class: `lv-score ${sc.correct ? 'is-right' : 'is-wrong'}`, role: 'status', text: sc.correct ? `Correct. +${sc.points} points.${standing}` : `Not this time.${standing}` });
  }

  function timerBadge(prompt) {
    if (!deadlines.has(prompt.id)) return null;
    const left = Math.max(0, Math.ceil((deadlines.get(prompt.id) - Date.now()) / 1000));
    return h('p', { class: 'lv-timer', 'data-deadline': prompt.id, 'aria-live': 'off', text: left > 0 ? `${left} seconds left` : 'Time is up' });
  }

  // Asked once when the presenter is running a leaderboard.
  function profileForm() {
    const form = h('form', { class: 'lv-card lv-form' }, h('h2', { class: 'lv-q', text: 'Who is playing?' }));
    const name = h('input', { class: 'lv-input', 'aria-label': 'Your nickname', maxlength: '24', autocomplete: 'off', placeholder: 'Your nickname' });
    name.value = profile.name;
    form.append(name);
    let team = profile.team || '';
    if (state.teams.length) {
      const group = h('div', { class: 'lv-options', role: 'group', 'aria-label': 'Your team' });
      for (const t of state.teams) {
        const b = h('button', { type: 'button', class: `lv-opt${team === t ? ' is-on' : ''}`, 'aria-pressed': String(team === t) }, h('span', { class: 'lv-opt__text', text: t }));
        b.addEventListener('click', () => { team = t; for (const o of group.children) { const on = o === b; o.classList.toggle('is-on', on); o.setAttribute('aria-pressed', String(on)); } });
        group.append(b);
      }
      form.append(group);
    }
    form.append(h('button', { type: 'submit', class: 'lv-send', text: 'Join the game' }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!name.value.trim() || (state.teams.length && !team)) { name.focus(); return; }
      profile = { name: name.value.trim().slice(0, 24), team };
      saveProfile(profile);
      hello();
      paint();
    });
    return form;
  }

  function choiceCard(prompt) {
    const chosen = picks.get(prompt.id) ?? [];
    const answered = sent.has(prompt.id);
    const counts = state.counts[prompt.id];
    const total = counts ? counts.reduce((a, b) => a + b, 0) : 0;
    const list = h('div', { class: 'lv-options', role: 'group', 'aria-label': prompt.question });
    prompt.options.forEach((text, i) => {
      const on = chosen.includes(i);
      const btn = h('button', { type: 'button', class: `lv-opt${on ? ' is-on' : ''}`, 'aria-pressed': String(on) },
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
    const out = h('section', { class: 'lv-card' }, h('h2', { class: 'lv-q', text: prompt.question }), timerBadge(prompt), list);
    const upTo = scoreLine(prompt);
    if (upTo) out.append(upTo);
    if (prompt.multi) {
      const send = h('button', { type: 'button', class: 'lv-send', text: answered ? 'Update answer' : 'Send answer' });
      send.disabled = chosen.length === 0;
      send.addEventListener('click', () => submit(prompt));
      out.append(send);
    }
    if (answered) out.append(h('p', { class: 'lv-sent', text: prompt.multi ? 'Answer sent. You can change it.' : 'Answer sent. Tap another option to change it.' }));
    return out;
  }

  // ---- the other kinds of question --------------------------------------------------

  const sendText = (prompt, text) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return false;
    const mine = typed.get(prompt.id) ?? [];
    if (prompt.kind !== 'qna' && mine.length >= (prompt.limit ?? 1)) return false;
    channel.send({ t: prompt.kind === 'qna' ? 'ask' : 'text', cid, id: prompt.id, text: clean });
    typed.set(prompt.id, [...mine, clean]);
    answeredIn.set(prompt.id, session);
    drafts.set(prompt.id, '');
    return true;
  };

  // A box to type in, a send button and a note of what has been sent.
  function entryForm(prompt, { multiline, label, button, doneNote }) {
    const mine = typed.get(prompt.id) ?? [];
    const left = prompt.kind === 'qna' ? Infinity : (prompt.limit ?? 1) - mine.length;
    const form = h('form', { class: 'lv-form' });
    if (left > 0) {
      const input = h(multiline ? 'textarea' : 'input', { class: 'lv-input', 'aria-label': label, maxlength: multiline ? '280' : '40', rows: multiline ? '3' : undefined, type: multiline ? undefined : 'text', autocomplete: 'off' });
      input.value = drafts.get(prompt.id) ?? '';
      input.addEventListener('input', () => drafts.set(prompt.id, input.value));
      const send = h('button', { type: 'submit', class: 'lv-send', text: button });
      form.append(input, send);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (sendText(prompt, input.value)) paint();
      });
    }
    if (notes.has(prompt.id)) form.append(h('p', { class: 'lv-warn', role: 'status', text: notes.get(prompt.id) }));
    if (mine.length && prompt.kind !== 'qna') {
      form.append(h('ul', { class: 'lv-mine' }, ...mine.map((t) => h('li', { text: t }))));
    }
    if (prompt.kind !== 'qna') form.append(h('p', { class: 'lv-sent', text: left > 0 ? (mine.length ? `Sent. You can add ${left} more.` : `You can send up to ${prompt.limit}.`) : doneNote }));
    return form;
  }

  function ratingCard(prompt) {
    const chosen = picks.get(prompt.id)?.[0];
    const answered = sent.has(prompt.id);
    const counts = state.counts[prompt.id] ?? [];
    const n = counts.reduce((a, b) => a + b, 0);
    const row = h('div', { class: 'lv-scale', role: 'group', 'aria-label': prompt.question, style: `--n:${prompt.options.length}` });
    prompt.options.forEach((label, i) => {
      const on = chosen === i;
      const b = h('button', { type: 'button', class: `lv-num${on ? ' is-on' : ''}`, 'aria-pressed': String(on), text: label });
      b.addEventListener('click', () => { picks.set(prompt.id, [i]); submit(prompt); });
      row.append(b);
    });
    const out = h('section', { class: 'lv-card' }, h('h2', { class: 'lv-q', text: prompt.question }), row);
    if (prompt.low || prompt.high) out.append(h('div', { class: 'lv-ends' }, h('span', { text: prompt.low }), h('span', { text: prompt.high })));
    if (answered) {
      const avg = n ? Math.round((counts.reduce((a, c, i) => a + c * (i + 1), 0) / n) * 10) / 10 : null;
      out.append(h('p', { class: 'lv-sent', text: `Answer sent. Tap another number to change it.${avg ? ` Average so far: ${avg}.` : ''}` }));
    }
    return out;
  }

  function rankingCard(prompt) {
    const n = prompt.options.length;
    let order = orders.get(prompt.id);
    if (!order || order.length !== n) { order = prompt.options.map((_, i) => i); orders.set(prompt.id, order); }
    const answered = sent.has(prompt.id);
    const list = h('ol', { class: 'lv-rank' });
    order.forEach((optionIndex, place) => {
      const move = (by) => {
        const to = place + by;
        if (to < 0 || to >= n) return;
        const next = order.slice();
        [next[place], next[to]] = [next[to], next[place]];
        orders.set(prompt.id, next);
        sent.delete(prompt.id); // a changed order has not been sent yet
        paint();
        const rows = body.querySelectorAll(`[data-rank="${prompt.id}"] .lv-rank__row`);
        rows[to]?.querySelector(by < 0 ? '.lv-up' : '.lv-down')?.focus();
      };
      const up = h('button', { type: 'button', class: 'lv-up', 'aria-label': `Move ${prompt.options[optionIndex]} up`, text: '\u2191' });
      const down = h('button', { type: 'button', class: 'lv-down', 'aria-label': `Move ${prompt.options[optionIndex]} down`, text: '\u2193' });
      up.disabled = place === 0;
      down.disabled = place === n - 1;
      up.addEventListener('click', () => move(-1));
      down.addEventListener('click', () => move(1));
      list.append(h('li', { class: 'lv-rank__row' }, h('span', { class: 'lv-rank__place', text: String(place + 1) }), h('span', { class: 'lv-rank__text', text: prompt.options[optionIndex] }), up, down));
    });
    const send = h('button', { type: 'button', class: 'lv-send', text: answered ? 'Ranking sent' : 'Send ranking' });
    send.disabled = answered;
    send.addEventListener('click', () => { picks.set(prompt.id, orders.get(prompt.id).slice()); submit(prompt); });
    const out = h('section', { class: 'lv-card', 'data-rank': prompt.id }, h('h2', { class: 'lv-q', text: prompt.question }), h('p', { class: 'lv-hint', text: 'Put the best first. Use the arrows to move items.' }), list, send);
    if (answered) out.append(h('p', { class: 'lv-sent', text: 'Ranking sent. Move something to change it.' }));
    return out;
  }

  function qnaCard(prompt) {
    const questions = state.data[prompt.id] ?? [];
    const mine = ups.get(prompt.id) ?? new Set();
    const list = h('ul', { class: 'lv-qs' });
    for (const q of questions) {
      const own = (typed.get(prompt.id) ?? []).includes(q.text); // you cannot upvote or withdraw your own question
      const on = own || mine.has(q.id);
      const b = h('button', { type: 'button', class: `lv-up-btn${on ? ' is-on' : ''}`, 'aria-pressed': String(on), disabled: own ? 'true' : undefined, 'aria-label': `${own ? 'Your question' : 'Upvote'}: ${q.text}. ${q.votes} ${q.votes === 1 ? 'vote' : 'votes'}` }, h('span', { 'aria-hidden': 'true', text: '\u25B2' }), h('span', { text: String(q.votes) }));
      b.addEventListener('click', () => {
        const set = new Set(mine);
        if (on) set.delete(q.id); else set.add(q.id);
        ups.set(prompt.id, set);
        channel.send({ t: 'up', cid, id: prompt.id, q: q.id });
        paint();
      });
      list.append(h('li', { class: `lv-q-item${q.answered ? ' is-answered' : ''}` }, b, h('span', { class: 'lv-q-text', text: q.text }), q.answered ? h('span', { class: 'lv-q-flag', text: 'Answered' }) : null));
    }
    const out = h('section', { class: 'lv-card' }, h('h2', { class: 'lv-q', text: prompt.question }), entryForm(prompt, { multiline: true, label: 'Your question', button: 'Ask', doneNote: '' }));
    out.append(questions.length ? list : h('p', { class: 'lv-hint', text: 'No questions yet. Be the first.' }));
    return out;
  }

  function card(prompt) {
    if (prompt.kind === 'rating') return ratingCard(prompt);
    if (prompt.kind === 'ranking') return rankingCard(prompt);
    if (prompt.kind === 'qna') return qnaCard(prompt);
    if (prompt.kind === 'cloud' || prompt.kind === 'open') {
      const cloud = prompt.kind === 'cloud';
      return h('section', { class: 'lv-card' }, h('h2', { class: 'lv-q', text: prompt.question }),
        entryForm(prompt, { multiline: !cloud, label: cloud ? 'Your word' : 'Your answer', button: 'Send', doneNote: 'Thanks. Your answer is on the screen.' }));
    }
    return choiceCard(prompt);
  }

  function paint() {
    head.querySelector('.lv-title').textContent = state.title;
    // Keep the focused option focused across a repaint, and keep half-typed text.
    const focusIndex = [...body.querySelectorAll('.lv-opt')].indexOf(document.activeElement);
    const typing = document.activeElement?.classList?.contains('lv-input') ? { at: [...body.querySelectorAll('.lv-input')].indexOf(document.activeElement), pos: document.activeElement.selectionStart } : null;
    body.replaceChildren();
    if (isStale(lastHeardAt, Date.now()) && !state.ended) {
      body.append(h('p', { class: 'lv-warn', role: 'alert', text: 'Lost contact with the presenter. Answers may not be counted until they are back. This page will update by itself.' }));
    }
    if (full) {
      body.append(h('p', { class: 'lv-warn', role: 'alert', text: 'This session is full. The presenter\'s plan has no room for more phones. Ask them to upgrade, or watch the screen.' }));
    } else if (state.ended) {
      body.append(h('p', { class: 'lv-note', text: 'This session has ended. Thanks for taking part.' }));
    } else if (!state.prompts.length) {
      if (!heard) {
        body.append(h('p', { class: 'lv-note', text: status === 'live' ? 'Waiting for the presenter...' : 'Connecting...' }));
        if (slow && status === 'live') body.append(h('p', { class: 'lv-note', text: 'Nothing yet. Check the code, and that the presenter has started the session in the same browser (try-it-here mode) or on the same server.' }));
      } else {
        body.append(h('p', { class: 'lv-note', text: 'Connected. The next question will appear here.' }));
      }
    } else if (state.names && !profile.name) {
      body.append(profileForm());
    } else {
      for (const p of state.prompts) body.append(card(p));
    }
    if (focusIndex >= 0) body.querySelectorAll('.lv-opt')[focusIndex]?.focus();
    if (typing && typing.at >= 0) {
      const input = body.querySelectorAll('.lv-input')[typing.at];
      input?.focus();
      input?.setSelectionRange?.(typing.pos, typing.pos);
    }
    footStatus.textContent = status === 'error' ? 'Connection problem. Retrying...' : '';
  }
  // Count the clock down on the question cards without redrawing them.
  const tick = setInterval(() => {
    for (const el of body.querySelectorAll('[data-deadline]')) {
      const left = Math.max(0, Math.ceil((deadlines.get(el.dataset.deadline) - Date.now()) / 1000));
      el.textContent = left > 0 ? `${left} seconds left` : 'Time is up';
      el.classList.toggle('is-out', left === 0);
    }
  }, 500);
  paint();
  return { close: () => { clearInterval(tick); channel.close(); transport.close(); } };
}
