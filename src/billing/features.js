// The plan table turned into the short lines shown on the pricing page and in the upgrade
// dialog. Built from the same numbers the app enforces, so what we advertise cannot drift
// from what the plan does.

import { PLANS, PLAN_ORDER } from './plans.js';

const n = (v) => v.toLocaleString('en-US');
const EXPORT_NAMES = { json: 'deck file', png: 'PNG', html: 'web page', pdf: 'PDF', pptx: 'PowerPoint' };
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

// -> short lines for one plan. Paid plans start with what they add to the one below.
export function highlights(id) {
  const plan = PLANS[id];
  const below = PLANS[PLAN_ORDER[PLAN_ORDER.indexOf(id) - 1]];
  const lines = [];
  if (!below) {
    lines.push(`${plan.cloudDecks} decks online, any number on this device`);
    lines.push(`Live rooms up to ${plan.livePhones} phones`);
    lines.push('Polls, quizzes and ratings');
    lines.push(`Export as ${list(plan.exports.map((e) => EXPORT_NAMES[e]))}`);
    lines.push(`${plan.themes.length} themes`);
    return lines;
  }
  lines.push(`Everything in ${below.name}`);
  lines.push(`${n(plan.cloudDecks)} decks online`);
  lines.push(`Live rooms up to ${n(plan.livePhones)} phones`);
  const newKinds = plan.kinds.filter((k) => !below.kinds.includes(k));
  if (newKinds.length) lines.push('Word cloud, open answers, ranking and audience Q&A');
  if (plan.brand && !below.brand) lines.push('Your own logo, colours and font');
  if (plan.csv && !below.csv) lines.push('Download results as a spreadsheet');
  if (plan.reports && !below.reports) lines.push('Save session reports on your device');
  if (plan.leaderboard && !below.leaderboard) lines.push('Timed quizzes with names, teams and a leaderboard');
  const newExports = plan.exports.filter((e) => !below.exports.includes(e));
  if (newExports.length) lines.push(`Export as ${list(newExports.map((e) => EXPORT_NAMES[e]))}`);
  const newThemes = plan.themes.length - below.themes.length;
  if (newThemes > 0) lines.push(`${newThemes} more themes`);
  if (id === 'advanced') lines.push('Priority support by email');
  return lines;
}
