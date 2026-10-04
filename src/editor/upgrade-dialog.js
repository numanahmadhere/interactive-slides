// "This needs a paid plan": says what, and offers the plans. Opened whenever someone reaches
// something their plan does not include, from any part of the editor.

import { h } from '../core/dom.js';
import { getCloud } from '../cloud/instance.js';
import { getBilling } from '../billing/instance.js';
import { planPicker } from '../billing/picker.js';
import { openCloudDialog } from './cloud-dialog.js';
import { openDialog, toast } from './ui.js';

// reason: one sentence about what was reached. highlight: the plan that unlocks it.
export function openUpgrade(editor, { reason = '', highlight = null } = {}) {
  const billing = getBilling();
  const content = h('div', { class: 'ed-upgrade' });
  const dialog = openDialog({ title: 'Choose a plan', content, wide: true });
  if (reason) content.append(h('p', { class: 'ed-hint', text: reason }));
  content.append(planPicker({
    billing, cloud: getCloud(), highlight,
    onSignIn: () => { dialog.close(); toast('Sign in first, then choose your plan.'); openCloudDialog(editor); },
    onActivated: (plan) => { editor.planChanged?.(plan); setTimeout(() => dialog.close(), 1800); },
  }));
  return dialog;
}
