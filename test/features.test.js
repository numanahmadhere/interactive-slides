import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlights } from '../src/billing/features.js';
import { PLANS, PLAN_ORDER } from '../src/billing/plans.js';

test('every plan lists what it gives, built from the real numbers', () => {
  const free = highlights('free').join('\n');
  assert.match(free, new RegExp(`${PLANS.free.cloudDecks} decks online`));
  assert.match(free, new RegExp(`${PLANS.free.livePhones} phones`));
  assert.match(free, /deck file and PNG/);
  const starter = highlights('starter').join('\n');
  assert.match(starter, /Everything in Free/);
  assert.match(starter, /25 decks online/);
  assert.match(starter, /100 phones/);
  assert.match(starter, /Word cloud, open answers, ranking, pins on a picture and audience Q&A/);
  assert.match(starter, /logo, colours and font/);
  assert.match(starter, /spreadsheet/);
  assert.match(starter, /web page and PDF/);
  assert.match(highlights('pro').join('\n'), /Export as PowerPoint/);
  assert.match(highlights('advanced').join('\n'), /1,000 phones/);
});

test('a plan never lists something the one below it already had, and every line is a real sentence', () => {
  for (const id of PLAN_ORDER.slice(1)) {
    const lines = highlights(id);
    assert.equal(lines[0], `Everything in ${PLANS[PLAN_ORDER[PLAN_ORDER.indexOf(id) - 1]].name}`);
    assert.ok(!lines.some((l) => /undefined|NaN/.test(l)));
    assert.equal(new Set(lines).size, lines.length);
  }
  assert.ok(!highlights('pro').some((l) => /logo|spreadsheet/.test(l)), 'Pro does not repeat Starter\'s extras');
});
