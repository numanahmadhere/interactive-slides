import { h, svgEl } from '../dom.js';
import { str, oneOf } from '../util.js';
import { registerBlock } from './registry.js';
import { cleanList, pad, itemStep, itemSteps, REVEAL_FIELD } from './shared.js';

const MAX_NODES = 8;
const ARROW = 'M4 12h14M13 6l6 6-6 6';

// Boxes joined by arrows, in a row, a column or a cycle.
export default registerBlock({
  type: 'diagram',
  label: 'Diagram',
  group: 'Design',
  defaults: () => ({
    layout: 'row', style: 'filled', revealItems: false,
    nodes: [{ label: 'Plan', note: 'Agree the goal' }, { label: 'Build', note: 'Make it work' }, { label: 'Ship', note: 'Put it in use' }],
  }),
  normalize: (p) => ({
    layout: oneOf(p.layout, ['row', 'column', 'cycle'], 'row'),
    style: oneOf(p.style, ['filled', 'outline'], 'filled'),
    revealItems: p.revealItems === true,
    nodes: pad(cleanList(p.nodes, MAX_NODES, (n) => ({ label: str(n.label, '', 80), note: str(n.note, '', 160) })), 2, () => ({ label: '', note: '' })),
  }),
  fields: [
    { key: 'layout', label: 'Layout', type: 'segmented', options: [{ value: 'row', label: 'Row' }, { value: 'column', label: 'Column' }, { value: 'cycle', label: 'Cycle' }] },
    { key: 'style', label: 'Style', type: 'segmented', options: [{ value: 'filled', label: 'Filled' }, { value: 'outline', label: 'Outline' }] },
    REVEAL_FIELD,
    {
      key: 'nodes', label: 'Steps', type: 'list', itemLabel: 'Step', add: 'Add step', min: 2, max: MAX_NODES,
      item: () => ({ label: 'Step', note: '' }),
      fields: [{ key: 'label', label: 'Title', type: 'text' }, { key: 'note', label: 'Detail', type: 'text' }],
    },
  ],
  steps: (block) => itemSteps(block, block.props.nodes.length),
  render: (block) => {
    const { layout, style, nodes } = block.props;
    const node = (n, i, extra = {}) => h('div', { class: 'sp-node', 'data-step': itemStep(block, i), ...extra },
      h('div', { class: 'sp-node__label', text: n.label }), n.note ? h('div', { class: 'sp-node__note', text: n.note }) : null);
    const root = h('div', { class: `sp-diagram sp-diagram--${layout} sp-diagram--${style}`, 'data-count': nodes.length });

    if (layout !== 'cycle') {
      nodes.forEach((n, i) => {
        if (i > 0) {
          const arrow = svgEl('svg', { class: 'sp-diagram__arrow', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, svgEl('path', { d: ARROW }));
          // An arrow arrives with the box it points to. It sits in its own wrapper so its rotation is not disturbed.
          root.append(block.props.revealItems ? h('div', { class: 'sp-diagram__link', 'data-step': itemStep(block, i) }, arrow) : arrow);
        }
        root.append(node(n, i));
      });
      return root;
    }

    // Cycle: boxes on an ellipse, curved arrows between neighbours.
    const W = 1600;
    const H = 700;
    const [cx, cy, rx, ry] = [W / 2, H / 2, 560, 250];
    const at = (a, k = 1) => [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
    const n = nodes.length;
    const step = (Math.PI * 2) / n;
    const start = -Math.PI / 2;
    const gap = Math.min(0.42, step * 0.3);
    const svg = svgEl('svg', { class: 'sp-diagram__ring', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' });
    nodes.forEach((_, i) => {
      const a1 = start + step * i + gap;
      const a2 = start + step * (i + 1) - gap;
      const [x1, y1] = at(a1);
      const [x2, y2] = at(a2);
      // the arc into node i + 1 arrives with it; the one that closes the loop arrives with the last node
      const g = svgEl('g', { 'data-step': itemStep(block, Math.min(i + 1, n - 1)) });
      svg.append(g);
      g.append(svgEl('path', { class: 'sp-diagram__arc', d: `M${x1} ${y1}A${rx} ${ry} 0 0 1 ${x2} ${y2}` }));
      // arrowhead at the end of the arc, pointing along the tangent
      const tx = -Math.sin(a2) * rx;
      const ty = Math.cos(a2) * ry;
      const len = Math.hypot(tx, ty);
      const [ux, uy] = [tx / len, ty / len];
      const [nx, ny] = [-uy, ux];
      const s = 26;
      g.append(svgEl('polygon', { class: 'sp-diagram__head', points: `${x2 + ux * 6},${y2 + uy * 6} ${x2 - ux * s + nx * s * 0.62},${y2 - uy * s + ny * s * 0.62} ${x2 - ux * s - nx * s * 0.62},${y2 - uy * s - ny * s * 0.62}` }));
    });
    root.append(svg);
    nodes.forEach((nd, i) => {
      const [x, y] = at(start + step * i);
      root.append(node(nd, i, { style: `left:${(x / W) * 100}%;top:${(y / H) * 100}%` }));
    });
    return root;
  },
});
