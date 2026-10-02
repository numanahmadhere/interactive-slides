import { h } from '../dom.js';
import { str, oneOf } from '../util.js';
import { registerBlock } from './registry.js';
import { stateOf } from './shared.js';

// The preview runs in an iframe with sandbox="allow-scripts" and no
// allow-same-origin, so the code cannot touch the deck, its storage or the
// page around it. The CSP inside also blocks every network request.
export function buildSrcdoc({ html = '', css = '', js = '' }) {
  const guard = (s, tag) => String(s).replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
  const csp = "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">`
    + `<style>html,body{margin:0}body{padding:20px;font:16px/1.5 system-ui,sans-serif;color:#111;background:#fff}${guard(css, 'style')}</style></head><body>${html}`
    + `<script>window.onerror=function(m){var p=document.createElement('pre');p.style.cssText='color:#b00020;white-space:pre-wrap';p.textContent=String(m);document.body.appendChild(p)}<\/script>`
    + `<script>${guard(js, 'script')}<\/script></body></html>`;
}

const TABS = [['html', 'HTML'], ['css', 'CSS'], ['js', 'JavaScript']];

export default registerBlock({
  type: 'code-sandbox',
  label: 'Live code',
  group: 'Data and tools',
  defaults: () => ({
    title: 'Try it yourself',
    html: '<button id="go">Click me</button>\n<p id="out">Waiting...</p>',
    css: 'button { padding: 10px 18px; font-size: 18px; }\n#out { color: #2020e8; font-weight: 600; }',
    js: "document.getElementById('go').onclick = function () {\n  document.getElementById('out').textContent = 'It works!';\n};",
    layout: 'split',
  }),
  normalize: (p) => ({
    title: str(p.title, '', 200),
    html: str(p.html, '', 20000), css: str(p.css, '', 20000), js: str(p.js, '', 20000),
    layout: oneOf(p.layout, ['split', 'stack'], 'split'),
  }),
  fields: [
    { key: 'layout', label: 'Layout', type: 'segmented', options: [{ value: 'split', label: 'Side by side' }, { value: 'stack', label: 'Stacked' }] },
    { key: 'html', label: 'HTML', type: 'textarea', rows: 6, mono: true },
    { key: 'css', label: 'CSS', type: 'textarea', rows: 6, mono: true },
    { key: 'js', label: 'JavaScript', type: 'textarea', rows: 6, mono: true },
    { type: 'hint', text: 'Runs in an isolated frame with no network access. The audience can edit the code live while presenting.' },
  ],
  edit: [{ prop: 'title', selector: '.sp-lab__title', kind: 'plain', placeholder: 'Title' }],
  render: (block, ctx) => {
    const { title, html, css, js, layout } = block.props;
    const present = ctx.mode === 'present';
    const state = present ? stateOf(ctx, block, () => ({ tab: 'html', html, css, js })) : null;
    const sources = present ? state : { html, css, js };

    const tabs = h('div', { class: 'sp-lab__tabs', role: 'tablist' }, ...TABS.map(([id, label]) =>
      h('button', { type: 'button', role: 'tab', class: 'sp-lab__tab', 'data-tab': id, 'aria-selected': String(id === (state?.tab ?? 'html')), text: label })));
    const area = h('textarea', {
      class: 'sp-lab__area', spellcheck: 'false', 'aria-label': 'Code', readonly: !present, autocapitalize: 'off', autocomplete: 'off',
    });
    area.value = sources[state?.tab ?? 'html'];
    const editor = h('div', { class: 'sp-lab__editor' }, tabs, area,
      present ? h('div', { class: 'sp-lab__bar' },
        h('button', { type: 'button', class: 'sp-btn sp-btn--primary sp-btn--md sp-lab__run', text: 'Run' }),
        h('button', { type: 'button', class: 'sp-btn sp-btn--outline sp-btn--md sp-lab__reset', text: 'Reset' })) : null);

    const preview = ctx.mode !== 'present' && ctx.mode !== 'edit'
      ? h('div', { class: 'sp-lab__thumb', text: 'Live code' })
      : h('iframe', {
        class: 'sp-lab__preview', title: title || 'Code preview', sandbox: 'allow-scripts', referrerpolicy: 'no-referrer',
        srcdoc: buildSrcdoc(sources),
      });
    return h('div', { class: `sp-lab sp-lab--${layout}` }, h('p', { class: 'sp-lab__title', text: title }), h('div', { class: 'sp-lab__body' }, editor, preview));
  },
  mount: (el, block, ctx) => {
    const original = { html: block.props.html, css: block.props.css, js: block.props.js };
    const state = stateOf(ctx, block, () => ({ tab: 'html', ...original }));
    const area = el.querySelector('.sp-lab__area');
    const tabs = [...el.querySelectorAll('.sp-lab__tab')];
    const frame = el.querySelector('.sp-lab__preview');
    let timer = 0;

    const run = () => { frame.srcdoc = buildSrcdoc(state); };
    const showTab = (id) => {
      state.tab = id;
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
      area.value = state[id];
    };
    tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
    area.addEventListener('input', () => {
      state[state.tab] = area.value;
      clearTimeout(timer);
      timer = setTimeout(run, 400);
    });
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); area.blur(); return; }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const { selectionStart: a, selectionEnd: b } = area;
        area.setRangeText('  ', a, b, 'end');
        area.dispatchEvent(new Event('input'));
      }
    });
    el.querySelector('.sp-lab__run').addEventListener('click', run);
    el.querySelector('.sp-lab__reset').addEventListener('click', () => {
      Object.assign(state, original);
      showTab(state.tab);
      run();
    });
    return () => clearTimeout(timer);
  },
});
