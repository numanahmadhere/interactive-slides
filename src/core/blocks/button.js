import { h } from '../dom.js';
import { str, oneOf } from '../util.js';
import { safeLinkUrl } from '../sanitize.js';
import { registerBlock } from './registry.js';
import { ALIGN_OPTIONS } from './fields.js';

const ACTIONS = ['next', 'prev', 'first', 'back', 'slide', 'link'];

export default registerBlock({
  type: 'button',
  label: 'Button',
  group: 'Interactive',
  defaults: () => ({ label: 'Continue', action: 'next', slide: '', url: '', style: 'primary', size: 'md', align: 'start' }),
  normalize: (p) => ({
    label: str(p.label, '', 120),
    action: oneOf(p.action, ACTIONS, 'next'),
    slide: str(p.slide, '', 64),
    url: str(p.url, '', 2000),
    style: oneOf(p.style, ['primary', 'outline'], 'primary'),
    size: oneOf(p.size, ['md', 'lg'], 'md'),
    align: oneOf(p.align, ['start', 'center', 'end'], 'start'),
  }),
  fields: [
    { key: 'action', label: 'When clicked', type: 'select', options: [
      { value: 'next', label: 'Go to the next slide' },
      { value: 'prev', label: 'Go to the previous slide' },
      { value: 'first', label: 'Go to the first slide' },
      { value: 'back', label: 'Go back to where they came from' },
      { value: 'slide', label: 'Jump to a specific slide' },
      { value: 'link', label: 'Open a web link' },
    ] },
    { key: 'slide', label: 'Slide', type: 'slide', when: { key: 'action', in: ['slide'] } },
    { key: 'url', label: 'Link', type: 'text', placeholder: 'https://', when: { key: 'action', in: ['link'] } },
    { key: 'style', label: 'Style', type: 'segmented', options: [{ value: 'primary', label: 'Solid' }, { value: 'outline', label: 'Outline' }] },
    { key: 'size', label: 'Size', type: 'segmented', options: [{ value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }] },
    { key: 'align', label: 'Align', type: 'segmented', options: ALIGN_OPTIONS },
  ],
  check: (props, deck) => {
    if (props.action === 'slide' && !deck.slides.some((s) => s.id === props.slide)) {
      return props.slide ? 'The slide this button points to was deleted. Pick another.' : 'Pick the slide this button should open.';
    }
    if (props.action === 'link' && !safeLinkUrl(props.url)) return 'Enter a link that starts with https://';
    return null;
  },
  edit: [{ prop: 'label', selector: '.sp-btn__label', kind: 'plain', placeholder: 'Label' }],
  render: (block, ctx) => {
    const { label, action, slide, url, style, size, align } = block.props;
    const present = ctx.mode === 'present';
    const cls = `sp-btn sp-btn--${style} sp-btn--${size}`;
    const text = h('span', { class: 'sp-btn__label', text: label });
    let el;
    if (!present) {
      el = h('div', { class: cls }, text); // inert and editable in the editor and thumbnails
    } else if (action === 'link') {
      const href = safeLinkUrl(url);
      el = href
        ? h('a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer' }, text)
        : h('span', { class: `${cls} is-disabled`, 'aria-disabled': 'true' }, text);
    } else {
      el = h('button', { class: cls, type: 'button' }, text);
      if (action === 'slide' && !ctx.deck.slides.some((s) => s.id === slide)) el.disabled = true;
    }
    return h('div', { class: 'sp-btn-row', 'data-align': align }, el);
  },
  mount: (el, block, ctx) => {
    const button = el.querySelector('button.sp-btn');
    const actions = ctx.actions;
    if (!button || !actions) return;
    const { action, slide } = block.props;
    button.addEventListener('click', () => {
      if (action === 'next') actions.next();
      else if (action === 'prev') actions.prev();
      else if (action === 'first') actions.first();
      else if (action === 'back') actions.back();
      else if (action === 'slide') actions.goToSlide(slide);
    });
  },
});
