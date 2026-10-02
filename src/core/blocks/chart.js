import { h, svgEl } from '../dom.js';
import { str, oneOf } from '../util.js';
import { parseTable, niceScale } from '../csv.js';
import { registerBlock } from './registry.js';

const W = 1600;
const H = 620;
const M = { top: 40, right: 24, bottom: 84, left: 120 };
const SERIES = 6;
const trim = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fmt = (v) => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : String(Math.round(v * 100) / 100));

function axes(max) {
  const { max: top, step } = niceScale(max);
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const g = svgEl('g', { class: 'sp-chart__axes' });
  for (let v = 0; v <= top + step / 2; v += step) {
    const y = M.top + plotH - (v / top) * plotH;
    g.append(
      svgEl('line', { class: 'sp-chart__grid', x1: M.left, x2: W - M.right, y1: y, y2: y }),
      svgEl('text', { class: 'sp-chart__tick', x: M.left - 16, y: y + 8, 'text-anchor': 'end' }, fmt(v)));
  }
  return { g, top, plotW, plotH };
}

function barChart(data, unit, showValues) {
  const max = Math.max(...data.rows.flatMap((r) => r.values), 0);
  const { g, top, plotW, plotH } = axes(max);
  const n = data.rows.length;
  const k = data.headers.length;
  const groupW = plotW / n;
  const barW = Math.min((groupW * 0.72) / k, 120);
  const root = svgEl('svg', { class: 'sp-chart__svg', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' }, g);
  data.rows.forEach((row, ri) => {
    const x0 = M.left + groupW * ri + (groupW - barW * k) / 2;
    row.values.forEach((v, si) => {
      const hgt = Math.max((v / top) * plotH, 0);
      const x = x0 + barW * si;
      const y = M.top + plotH - hgt;
      root.append(svgEl('rect', { class: `sp-chart__bar sp-chart__s${si % SERIES}`, x, y, width: barW - 6, height: hgt, rx: 6, style: `--i:${ri * k + si}` }));
      if (showValues) root.append(svgEl('text', { class: 'sp-chart__value', x: x + (barW - 6) / 2, y: y - 12, 'text-anchor': 'middle' }, `${fmt(v)}${unit}`));
    });
    root.append(svgEl('text', { class: 'sp-chart__label', x: M.left + groupW * ri + groupW / 2, y: H - M.bottom + 44, 'text-anchor': 'middle' }, trim(row.label, n > 8 ? 9 : 16)));
  });
  return root;
}

function lineChart(data, unit, showValues) {
  const max = Math.max(...data.rows.flatMap((r) => r.values), 0);
  const { g, top, plotW, plotH } = axes(max);
  const n = data.rows.length;
  const xAt = (i) => M.left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yAt = (v) => M.top + plotH - (v / top) * plotH;
  const root = svgEl('svg', { class: 'sp-chart__svg', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' }, g);
  data.rows.forEach((row, i) => root.append(svgEl('text', { class: 'sp-chart__label', x: xAt(i), y: H - M.bottom + 44, 'text-anchor': 'middle' }, trim(row.label, n > 8 ? 9 : 16))));
  data.headers.forEach((_, si) => {
    const pts = data.rows.map((r, i) => [xAt(i), yAt(r.values[si])]);
    root.append(svgEl('path', { class: `sp-chart__line sp-chart__stroke${si % SERIES}`, d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' '), pathLength: 1, fill: 'none' }));
    pts.forEach(([x, y], i) => {
      root.append(svgEl('circle', { class: `sp-chart__dot sp-chart__s${si % SERIES}`, cx: x, cy: y, r: 9, style: `--i:${i}` }));
      if (showValues) root.append(svgEl('text', { class: 'sp-chart__value', x, y: y - 22, 'text-anchor': 'middle' }, `${fmt(data.rows[i].values[si])}${unit}`));
    });
  });
  return root;
}

function pieChart(data, donut) {
  const rows = data.rows.filter((r) => r.values[0] > 0);
  const total = rows.reduce((s, r) => s + r.values[0], 0);
  const R = 300;
  const C = 350;
  const root = svgEl('svg', { class: 'sp-chart__svg sp-chart__svg--pie', viewBox: '0 0 700 700', 'aria-hidden': 'true' });
  if (!total) return { svg: root, rows: [], total: 0 };
  let angle = -Math.PI / 2;
  rows.forEach((row, i) => {
    const frac = row.values[0] / total;
    const a2 = angle + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const p = (a, r) => [C + Math.cos(a) * r, C + Math.sin(a) * r];
    const [x1, y1] = p(angle, R);
    const [x2, y2] = p(a2, R);
    let d;
    if (frac >= 0.9999) d = `M${C - R} ${C}A${R} ${R} 0 1 1 ${C + R} ${C}A${R} ${R} 0 1 1 ${C - R} ${C}`;
    else d = `M${C} ${C}L${x1} ${y1}A${R} ${R} 0 ${large} 1 ${x2} ${y2}Z`;
    root.append(svgEl('path', { class: `sp-chart__slice sp-chart__s${i % SERIES}`, d, style: `--i:${i}` }));
    angle = a2;
  });
  if (donut) root.append(svgEl('circle', { class: 'sp-chart__hole', cx: C, cy: C, r: R * 0.58 }));
  return { svg: root, rows, total };
}

export default registerBlock({
  type: 'chart',
  label: 'Chart',
  group: 'Data and tools',
  defaults: () => ({
    type: 'bar',
    title: 'Sales by quarter',
    data: 'Quarter,2025,2026\nQ1,120,150\nQ2,180,210\nQ3,160,240\nQ4,220,300',
    unit: '',
    showValues: true,
  }),
  normalize: (p) => ({
    type: oneOf(p.type, ['bar', 'line', 'pie', 'donut'], 'bar'),
    title: str(p.title, '', 200),
    data: str(p.data, '', 8000),
    unit: str(p.unit, '', 8),
    showValues: p.showValues !== false,
  }),
  fields: [
    { key: 'type', label: 'Type', type: 'segmented', options: [{ value: 'bar', label: 'Bar' }, { value: 'line', label: 'Line' }, { value: 'pie', label: 'Pie' }, { value: 'donut', label: 'Donut' }] },
    { key: 'data', label: 'Data (paste from a spreadsheet)', type: 'textarea', rows: 8, mono: true, placeholder: 'Label,Value\nApples,10\nPears,14' },
    { type: 'hint', text: 'First column is the label. Extra columns become more series. A header row is optional. Pie and donut use the first series.' },
    { key: 'unit', label: 'Unit after values', type: 'text', placeholder: '%' },
    { key: 'showValues', label: 'Show values', type: 'toggle' },
  ],
  check: (props) => (parseTable(props.data).rows.length ? null : 'No numbers found. Use one row per line: label, then a number.'),
  edit: [{ prop: 'title', selector: '.sp-chart__title', kind: 'plain', placeholder: 'Chart title' }],
  render: (block, ctx) => {
    const { type, title, data: raw, unit, showValues } = block.props;
    const data = parseTable(raw);
    const animated = ctx.mode === 'present';
    const root = h('figure', { class: `sp-chart sp-chart--${type}${animated ? ' is-animated' : ''}` }, h('figcaption', { class: 'sp-chart__title', text: title }));

    if (!data.rows.length) {
      root.append(h('div', { class: 'sp-image__empty', text: 'Paste data in the panel to draw a chart' }));
      return root;
    }
    let legend;
    if (type === 'pie' || type === 'donut') {
      const { svg, rows, total } = pieChart(data, type === 'donut');
      legend = h('ul', { class: 'sp-chart__legend sp-chart__legend--list' }, ...rows.map((r, i) =>
        h('li', null, h('span', { class: `sp-chart__swatch sp-chart__s${i % SERIES}` }),
          h('span', { class: 'sp-chart__legend-label', text: r.label }),
          h('span', { class: 'sp-chart__legend-value', text: showValues ? (unit === '%' ? `${fmt(r.values[0])}%` : `${fmt(r.values[0])}${unit} (${Math.round((r.values[0] / total) * 100)}%)`) : '' }))));
      root.append(h('div', { class: 'sp-chart__pie' }, svg, legend));
    } else {
      root.append(type === 'line' ? lineChart(data, unit, showValues) : barChart(data, unit, showValues));
      if (data.headers.length > 1) {
        root.append(h('ul', { class: 'sp-chart__legend' }, ...data.headers.map((name, i) =>
          h('li', null, h('span', { class: `sp-chart__swatch sp-chart__s${i % SERIES}` }), h('span', { class: 'sp-chart__legend-label', text: name })))));
      }
    }
    // The picture is decorative to assistive tech; the same numbers follow as a table.
    root.append(h('table', { class: 'sp-sr-only' },
      h('caption', { text: title || 'Chart data' }),
      h('thead', null, h('tr', null, h('th', { text: 'Label' }), ...data.headers.map((n) => h('th', { text: n })))),
      h('tbody', null, ...data.rows.map((r) => h('tr', null, h('th', { text: r.label }), ...r.values.map((v) => h('td', { text: `${v}${unit}` })))))));
    return root;
  },
});
