// Full-window presentation from inside the editor. The real presenter view
// (notes, timer, overview) arrives in phase 4; this plays the deck with the
// same Player the exported file will use.

import { h } from '../core/dom.js';
import { Player } from '../player/player.js';
import { openPresenterView } from '../player/presenter-view.js';
import { button, toast } from './ui.js';
import { collectPrompts } from '../live/prompts.js';
import { qrElement } from '../live/qr.js';

const UI_IDLE_MS = 2500;

export function openPresenter({ deck, startIndex, resolveAsset, onClose, presenterView = false, onPopupBlocked, live, join }) {
  const overlay = h('div', { class: 'ed-present', role: 'dialog', 'aria-label': 'Presentation', 'aria-modal': 'true' });
  const closeBtn = button({ icon: 'close', label: 'Exit presentation', iconOnly: true, onClick: () => close() });
  closeBtn.classList.add('ed-present__close');
  document.body.append(overlay);

  const player = new Player(overlay, deck, {
    mode: 'present',
    syncHash: false,
    startAt: { slide: startIndex, step: 0 },
    resolveAsset,
    fullscreenTarget: overlay,
    onPresenterView: (p) => showPresenterView(p),
    live,
  });
  const detachLive = live?.attach(player);
  overlay.append(closeBtn);
  if (join) overlay.append(joinBanner(join));
  // The plan note is for the presenter, not the room: say it once per slide in a toast instead of on the slide.
  const warned = new Set();
  const checkLocked = () => {
    const slide = player.deck.slides[player.state.slide];
    if (!slide || warned.has(slide.id) || !collectPrompts(slide).some((p) => live.isLocked?.(p.id))) return;
    warned.add(slide.id);
    toast('Phones cannot answer this question on your current plan. It needs Starter or above.', { kind: 'info', timeout: 7000 });
  };
  const offLockWatch = live ? player.subscribe(checkLocked) : null;
  if (live) setTimeout(checkLocked, 600); // the first slide, once the session has told the host which questions are locked

  let view = null;
  function showPresenterView(p) {
    if (view && !view.closed) {
      view.win.focus();
      return;
    }
    view = openPresenterView(p);
    if (!view) onPopupBlocked?.();
  }

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
  // Leaving browser fullscreen with Esc leaves the presentation too; toggling it
  // with the F key does not.
  const onFullscreen = () => {
    if (!document.fullscreenElement && Date.now() - player.fullscreenToggledAt > 600) close();
  };

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(uiTimer);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFullscreen);
    overlay.removeEventListener('pointermove', showUi);
    const index = player.state.slide;
    detachLive?.();
    offLockWatch?.();
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
  if (presenterView) showPresenterView(player);
  return { close, player };
}

// While a live session runs, the audience has to be able to see how to join from the screen itself.
function joinBanner({ code, url }) {
  const where = url.replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/$/, '');
  const card = h('div', { class: 'ed-join__card', hidden: true }, qrElement(url, { size: 190, label: 'QR code to join' }), h('span', { text: 'Scan to join' }));
  const toggle = h('button', { class: 'ed-join__qr', type: 'button', 'aria-expanded': 'false', text: 'QR code' });
  toggle.addEventListener('click', () => {
    card.hidden = !card.hidden;
    toggle.setAttribute('aria-expanded', String(!card.hidden));
  });
  return h('div', { class: 'ed-join', role: 'group', 'aria-label': 'How to join' },
    h('span', { class: 'ed-join__bar' },
      h('span', { text: 'Join at' }), h('b', { text: where }), h('span', { text: 'with code' }),
      h('b', { class: 'ed-join__code', 'aria-label': code.split('').join(' '), text: code }), toggle),
    card);
}
