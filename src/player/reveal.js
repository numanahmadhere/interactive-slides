import { slideStepValues } from '../core/schema.js';

// Show the blocks of a rendered slide that are revealed by `step` (0 = none).
export function applyReveals(el, slide, step) {
  const values = slideStepValues(slide);
  const limit = step === 0 ? 0 : values[step - 1] ?? Infinity;
  for (const node of el.querySelectorAll('[data-step]')) {
    node.classList.toggle('is-revealed', Number(node.dataset.step) <= limit);
  }
}
