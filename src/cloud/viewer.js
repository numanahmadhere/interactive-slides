// A shared deck, opened from a share link (?view=TOKEN). Read-only: the visitor
// gets the player, nothing from the editor, and needs no account.

import { Cloud } from './client.js';
import { normalizeDeck } from '../core/schema.js';
import { Player } from '../player/player.js';
import { showMessage } from '../shell/chrome.js';
import { h } from '../core/dom.js';
import { button } from '../editor/ui.js';
import { loadProgress, saveProgress, isComplete, certificateHtml } from './course.js';

export async function mountViewer(root, { token, config }) {
  showMessage(root, 'Loading the presentation...', '', null);
  try {
    const cloud = new Cloud({ url: config.url, key: config.key });
    const { deck } = normalizeDeck(await cloud.getShared(token)); // untrusted: the same gate as an import
    document.title = deck.meta.title;
    document.body.className = '';
    root.replaceChildren();
    const player = new Player(root, deck, { mode: 'present', syncHash: true });
    if (deck.course.on) trackCourse(root, player, { token, cloud, deck });
    return player;
  } catch (err) {
    if (err.code === 'not_found') showMessage(root, 'This presentation is not shared any more', 'The owner may have stopped sharing it.');
    else showMessage(root, 'Could not load this presentation', 'Check your connection and try again.', { href: location.href, label: 'Reload' });
    return null;
  }
}

// Self-paced: remember the slides this visitor has seen and, at the end, offer to record the finish.
function trackCourse(root, player, { token, cloud, deck }) {
  const total = deck.slides.length;
  const progress = loadProgress(token);
  const bar = h('div', { class: 'cv-bar', role: 'status', 'aria-live': 'polite' });
  const paint = () => {
    const n = new Set(progress.seen.filter((i) => i >= 0 && i < total)).size;
    bar.textContent = progress.done ? 'Course complete' : `${n} of ${total} slides seen`;
  };
  let panel = null;
  const close = () => { panel?.remove(); panel = null; };
  const finish = () => {
    if (panel || progress.done && !deck.course.certificate) return;
    const name = h('input', { type: 'text', class: 'cv-input', maxlength: '80', placeholder: 'Your name', 'aria-label': 'Your name', value: progress.name });
    const note = h('p', { class: 'cv-note', role: 'status' });
    const actions = h('div', { class: 'cv-actions' });
    panel = h('div', { class: 'cv-panel', role: 'dialog', 'aria-label': 'Course complete' },
      h('h2', { text: 'You have seen every slide' }),
      h('p', { text: deck.course.certificate ? 'Add your name to record that you finished and to get your certificate.' : 'Add your name to record that you finished.' }),
      name, note, actions);
    const submit = button({ label: progress.done ? 'Get certificate' : 'Record and continue', variant: 'primary', onClick: async () => {
      const who = name.value.trim();
      if (!who) { name.focus(); note.textContent = 'Please type your name.'; return; }
      progress.name = who;
      if (!progress.done) {
        try { progress.done = await cloud.recordCompletion(token, who); } catch { progress.done = false; }
        if (!progress.done) note.textContent = 'Could not record this just now. You can still get your certificate.';
      }
      saveProgress(token, progress);
      paint();
      if (deck.course.certificate) {
        const w = window.open('', '_blank');
        if (w) { w.document.write(certificateHtml({ name: who, course: deck.meta.title })); w.document.close(); w.focus(); setTimeout(() => w.print(), 300); }
        else note.textContent = 'Allow pop-ups to open your certificate.';
      }
      if (progress.done && !note.textContent) close();
    } });
    actions.append(submit, button({ label: 'Keep browsing', onClick: close }));
    root.append(panel);
    name.focus();
  };
  player.subscribe(({ slide }) => {
    if (!progress.seen.includes(slide)) progress.seen.push(slide);
    saveProgress(token, progress);
    paint();
    if (!progress.done && isComplete(progress.seen, total)) finish();
  });
  const first = player.state.slide;
  if (!progress.seen.includes(first)) progress.seen.push(first);
  saveProgress(token, progress);
  paint();
  root.append(bar);
  if (progress.done && deck.course.certificate) bar.append(' ', button({ label: 'Certificate', onClick: finish }));
}
