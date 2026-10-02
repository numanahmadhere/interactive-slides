import { h } from '../dom.js';
import { str, clamp, oneOf } from '../util.js';
import { compile, evaluate } from '../expr.js';
import { registerBlock } from './registry.js';
import { cleanList, pad, stateOf } from './shared.js';

const MAX_INPUTS = 6;
const MAX_OUTPUTS = 4;
const KEY_RE = /[^a-z0-9_]/g;

const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : fallback);

export function formatValue(value, { format = 'number', decimals = 0, prefix = '', suffix = '' } = {}) {
  if (!Number.isFinite(value)) return '–';
  const shown = format === 'percent' ? value * 100 : value;
  const text = shown.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${prefix}${text}${format === 'percent' ? '%' : ''}${suffix}`;
}

export default registerBlock({
  type: 'calculator',
  label: 'Calculator',
  group: 'Data and tools',
  defaults: () => ({
    title: 'Estimate the savings',
    inputs: [
      { key: 'people', label: 'People', value: 20, min: 1, max: 200, step: 1, prefix: '', suffix: '' },
      { key: 'hours', label: 'Hours saved each week', value: 3, min: 0, max: 20, step: 0.5, prefix: '', suffix: ' h' },
    ],
    outputs: [{ label: 'Hours saved per year', formula: 'people * hours * 48', format: 'number', decimals: 0, prefix: '', suffix: ' h' }],
  }),
  normalize: (p) => {
    const seen = new Set();
    const inputs = pad(cleanList(p.inputs, MAX_INPUTS, (c, n) => {
      let key = str(c.key, '', 24).toLowerCase().replace(KEY_RE, '') || str(c.label, '', 24).toLowerCase().replace(KEY_RE, '') || `value${n + 1}`;
      if (!/^[a-z_]/.test(key)) key = `v${key}`;
      while (seen.has(key)) key += '_';
      seen.add(key);
      const min = num(c.min, 0);
      const max = Math.max(num(c.max, 100), min + 1);
      return {
        key, label: str(c.label, '', 80),
        value: clamp(num(c.value, min), min, max), min, max,
        step: Math.max(num(c.step, 1), 0.001),
        prefix: str(c.prefix, '', 8), suffix: str(c.suffix, '', 12),
      };
    }), 1, () => ({ key: 'value1', label: 'Value', value: 10, min: 0, max: 100, step: 1, prefix: '', suffix: '' }));
    const outputs = pad(cleanList(p.outputs, MAX_OUTPUTS, (c) => ({
      label: str(c.label, '', 80), formula: str(c.formula, '', 200),
      format: oneOf(c.format, ['number', 'percent'], 'number'),
      decimals: clamp(Math.round(num(c.decimals, 0)), 0, 4),
      prefix: str(c.prefix, '', 8), suffix: str(c.suffix, '', 12),
    })), 1, () => ({ label: 'Result', formula: '0', format: 'number', decimals: 0, prefix: '', suffix: '' }));
    return { title: str(p.title, '', 200), inputs, outputs };
  },
  fields: [
    {
      key: 'inputs', label: 'Inputs (sliders)', type: 'list', itemLabel: 'Input', add: 'Add input', min: 1, max: MAX_INPUTS,
      item: () => ({ key: '', label: 'Value', value: 10, min: 0, max: 100, step: 1, prefix: '', suffix: '' }),
      fields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'key', label: 'Name used in formulas', type: 'text' },
        { key: 'value', label: 'Starting value', type: 'number', min: -1000000, max: 1000000 },
        { key: 'min', label: 'Smallest', type: 'number', min: -1000000, max: 1000000 },
        { key: 'max', label: 'Largest', type: 'number', min: -1000000, max: 1000000 },
        { key: 'prefix', label: 'Before the number', type: 'text' },
        { key: 'suffix', label: 'After the number', type: 'text' },
      ],
    },
    {
      key: 'outputs', label: 'Results', type: 'list', itemLabel: 'Result', add: 'Add result', min: 1, max: MAX_OUTPUTS,
      item: () => ({ label: 'Result', formula: '0', format: 'number', decimals: 0, prefix: '', suffix: '' }),
      fields: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'formula', label: 'Formula', type: 'text' },
        { key: 'format', label: 'Show as', type: 'select', options: [{ value: 'number', label: 'Number' }, { value: 'percent', label: 'Percent (0.25 shows 25%)' }] },
        { key: 'decimals', label: 'Decimal places', type: 'number', min: 0, max: 4 },
        { key: 'prefix', label: 'Before the number', type: 'text' },
        { key: 'suffix', label: 'After the number', type: 'text' },
      ],
    },
    { type: 'hint', text: 'Formulas can use input names, + - * / ^, brackets, min, max, round, floor, ceil, abs, sqrt, pow and if(a > b, x, y).' },
  ],
  check: (props) => {
    const known = new Set(props.inputs.map((i) => i.key));
    for (const out of props.outputs) {
      try {
        const { vars } = compile(out.formula);
        const unknown = [...vars].find((v) => !known.has(v));
        if (unknown) return `"${out.label || 'A result'}" uses "${unknown}", which is not an input name.`;
      } catch (e) {
        return `"${out.label || 'A result'}": ${e.message}.`;
      }
    }
    return null;
  },
  edit: [{ prop: 'title', selector: '.sp-calc__title', kind: 'plain', placeholder: 'Title' }],
  render: (block, ctx) => {
    const { title, inputs, outputs } = block.props;
    const state = ctx.mode === 'present' ? stateOf(ctx, block, () => ({ values: {} })) : { values: {} };
    const valueOf = (i) => state.values[i.key] ?? i.value;
    const values = Object.fromEntries(inputs.map((i) => [i.key, valueOf(i)]));

    const inputsEl = h('div', { class: 'sp-calc__inputs' }, ...inputs.map((i) => {
      const range = h('input', {
        class: 'sp-calc__range', type: 'range', min: i.min, max: i.max, step: i.step, 'data-key': i.key, 'aria-label': i.label || i.key,
        style: `--fill:${((valueOf(i) - i.min) / (i.max - i.min)) * 100}%`, disabled: ctx.mode !== 'present',
      });
      range.value = String(valueOf(i));
      return h('div', { class: 'sp-calc__input' },
        h('div', { class: 'sp-calc__row' },
          h('label', { class: 'sp-calc__label', text: i.label }),
          h('output', { class: 'sp-calc__readout', 'data-key': i.key, text: `${i.prefix}${valueOf(i).toLocaleString('en-US')}${i.suffix}` })),
        range);
    }));
    const outputsEl = h('div', { class: 'sp-calc__outputs', 'aria-live': 'polite' }, ...outputs.map((o, n) =>
      h('div', { class: 'sp-calc__out' },
        h('span', { class: 'sp-calc__out-label', text: o.label }),
        h('strong', { class: 'sp-calc__out-value', 'data-out': n, text: formatValue(evaluate(o.formula, values), o) }))));
    return h('div', { class: 'sp-calc' }, h('p', { class: 'sp-calc__title', text: title }), h('div', { class: 'sp-calc__grid' }, inputsEl, outputsEl));
  },
  mount: (el, block, ctx) => {
    const { inputs, outputs } = block.props;
    const state = stateOf(ctx, block, () => ({ values: {} }));
    const compiled = outputs.map((o) => { try { return compile(o.formula); } catch { return null; } });
    const update = () => {
      const values = Object.fromEntries(inputs.map((i) => [i.key, state.values[i.key] ?? i.value]));
      outputs.forEach((o, n) => {
        let v = NaN;
        try { v = compiled[n]?.evaluate(values) ?? NaN; } catch { /* leaves the dash */ }
        el.querySelector(`[data-out="${n}"]`).textContent = formatValue(v, o);
      });
    };
    el.querySelectorAll('.sp-calc__range').forEach((range) => {
      const i = inputs.find((x) => x.key === range.dataset.key);
      range.addEventListener('input', () => {
        const v = Number(range.value);
        state.values[i.key] = v;
        range.style.setProperty('--fill', `${((v - i.min) / (i.max - i.min)) * 100}%`);
        el.querySelector(`.sp-calc__readout[data-key="${i.key}"]`).textContent = `${i.prefix}${v.toLocaleString('en-US')}${i.suffix}`;
        update();
      });
    });
  },
});
