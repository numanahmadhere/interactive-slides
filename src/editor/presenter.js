// Full-window presentation from inside the editor. The real presenter view
// (notes, timer, overview) arrives in phase 4; this plays the deck with the
// same Player the exported file will use.

import { h } from '../core/dom.js';
import { Player } from '../player/player.js';
import { button } from './ui.js';

const UI_IDLE_MS = 2500;

export function openPresenter({ deck, startIndex, resolveAsset, onClose }) {
  const overlay = h('div', { class: 'ed-present', role: 'dialog', 'aria-label': 'Presentation', 'aria-modal': 'true' });
  const closeBtn = button({ icon: 'close', label: 'Exit presentation', iconOnly: true, onClick: () => close() });
  closeBtn.classList.add('ed-present__close');
  document.body.append(overlay);

  const player = new Player(overlay, deck, {
    mode: 'present',
    syncHash: false,
    startAt: { slide: startIndex, step: 0 },
    resolveAsset,
  });
  overlay.append(closeBtn);

  let closed = false;
  let uiTimer = 0;
  const showUi = () => {
    overlay.classList.add('show-ui');
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => overlay.classList.remove('show-ui'), UI_IDLE_MS);
  };
  // Bubble phase on purpose: a block that handles Escape itself (closing a
  // hotspot note) calls preventDefault first, and then the presentation stays.
  const onKey = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    close();
  };
  // Leaving browser fullscreen (Esc) should leave the presentation too.
  const onFullscreen = () => {
    if (!document.fullscreenElement) close();
  };

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(uiTimer);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFullscreen);
    overlay.removeEventListener('pointermove', showUi);
    const index = player.state.slide;
    player.destroy();
    overlay.remove();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onClose?.(index);
  }

  document.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', onFullscreen);
  overlay.addEventListener('pointermove', showUi);
  overlay.requestFullscreen?.().catch(() => {}); // best effort; the overlay works without it
  player.root.focus({ preventScroll: true });
  showUi();
  return { close, player };
}
