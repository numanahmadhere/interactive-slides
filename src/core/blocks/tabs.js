import { h } from '../dom.js';
import { clamp } from '../util.js';
import { registerBlock, normalizeSections, createBlock } from './registry.js';
import { stateOf, uniqueId } from './shared.js';

const container = { key: 'tabs', min: 2, max: 6, titled: true, item: () => ({ title: 'Tab', blocks: [] }) };

const starter = (title) => ({ title, blocks: [createBlock('text', { props: { text: 'Content for this tab.' } })] });

export default registerBlock({
  type: 'tabs',
  label: 'Tabs',
  group: 'Interactive',
  container,
  mountInEdit: true,
  defaults: () => ({ tabs: [starter('Overview'), starter('Details')] }),
  normalize: (p, ctx) => ({ tabs: normalizeSections(p.tabs, container, ctx) }),
  fields: [{ type: 'sections', noun: 'Tab', titleLabel: 'Tab name' }],
  render: (block, ctx) => {
    const { tabs } = block.props;
    const state = stateOf(ctx, block, () => ({ active: 0 }));
    const active = clamp(state.active ?? 0, 0, tabs.length - 1);
    const id = uniqueId('tabs');
    const list = h('div', { class: 'sp-tabs__list', role: 'tablist' });
    const panels = h('div', { class: 'sp-tabs__panels' });
    tabs.forEach((tab, i) => {
      list.append(h('button', {
        type: 'button', role: 'tab', class: 'sp-tab', id: `${id}-t${i}`, 'aria-controls': `${id}-p${i}`,
        'aria-selected': String(i === active), tabindex: i === active ? '0' : '-1', text: tab.title || `Tab ${i + 1}`,
      }));
      const panel = h('div', {
        class: 'sp-tabs__panel', role: 'tabpanel', id: `${id}-p${i}`, 'aria-labelledby': `${id}-t${i}`,
        'data-section': i, hidden: i !== active,
      });
      ctx.renderBlocks(tab.blocks, panel, { reveal: false });
      panels.append(panel);
    });
    return h('div', { class: 'sp-tabs' }, list, panels);
  },
  mount: (el, block, ctx) => {
    const state = stateOf(ctx, block, () => ({ active: 0 }));
    const [list, panelsEl] = el.firstElementChild.children;
    const tabs = [...list.children];
    const panels = [...panelsEl.children];

    const select = (i, focus = false) => {
      state.active = i;
      tabs.forEach((tab, n) => {
        tab.setAttribute('aria-selected', String(n === i));
        tab.tabIndex = n === i ? 0 : -1;
        panels[n].hidden = n !== i;
      });
      if (focus) tabs[i].focus();
    };
    tabs.forEach((tab, i) => tab.addEventListener('click', () => select(i)));
    list.addEventListener('keydown', (e) => {
      const at = tabs.indexOf(e.target.closest('.sp-tab'));
      if (at < 0) return;
      let next = null;
      if (e.key === 'ArrowRight') next = (at + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (at - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault(); // arrow keys move between tabs here, not between slides
      select(next, true);
    });
  },
});
