import { h } from '../core/dom.js';

const GROUPS = [
  ['Move', [['Right, Down, Space, Page Down', 'Next'], ['Left, Up, Page Up', 'Previous'], ['Home, End', 'First, last slide']]],
  ['Views', [['O or G', 'All slides'], ['F', 'Fullscreen'], ['P', 'Presenter view'], ['B or .', 'Black screen'], ['W', 'Whiteboard']]],
  ['Tools', [['L', 'Laser pointer'], ['D', 'Draw (1 to 5 pick a colour, U undo, C clear)'], ['S', 'Spotlight (scroll to resize)'], ['Esc', 'Turn tools off']]],
  ['Other', [['A', 'Pause or resume auto-play'], ['?', 'This help']]],
];

export class Help {
  constructor(player) {
    this.player = player;
    this.el = null;
  }

  get isOpen() {
    return this.el !== null;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    if (this.isOpen) return;
    const body = h('div', { class: 'sp-help__body' });
    for (const [title, rows] of GROUPS) {
      body.append(h('h3', { class: 'sp-help__group', text: title }),
        ...rows.map(([keys, what]) => h('div', { class: 'sp-help__row' }, h('kbd', { text: keys }), h('span', { text: what }))));
    }
    const close = h('button', { type: 'button', class: 'sp-help__close', text: 'Close' });
    close.addEventListener('click', () => this.close());
    this.el = h('div', { class: 'sp-help', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts' },
      h('div', { class: 'sp-help__card' }, h('h2', { class: 'sp-help__title', text: 'Keyboard shortcuts' }), body, close));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === '?' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    });
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.player.root.append(this.el);
    close.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.el.remove();
    this.el = null;
    this.player.root.focus({ preventScroll: true });
  }
}
