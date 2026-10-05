import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Persistence } from '../src/editor/persist.js';
import { when } from '../src/editor/history-dialog.js';

const deck = (title, n = 1) => ({ meta: { title }, slides: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, blocks: [] })) });

test('versions are kept per deck, newest first, and removed with the deck', async () => {
  const p = new Persistence();
  await p.init();
  await p.saveVersion('a', deck('One'));
  await new Promise((r) => setTimeout(r, 3));
  await p.saveVersion('a', deck('Two', 3), 'Before the workshop');
  await p.saveVersion('b', deck('Other'));
  const a = await p.listVersions('a');
  assert.deepEqual(a.map((v) => v.title), ['Two', 'One']);
  assert.equal(a[0].label, 'Before the workshop');
  assert.equal(a[0].slideCount, 3);
  assert.equal((await p.listVersions('b')).length, 1);
  await p.deleteDeck('a');
  assert.equal((await p.listVersions('a')).length, 0);
  assert.equal((await p.listVersions('b')).length, 1);
});

test('only the latest 40 automatic versions are kept, named ones stay', async () => {
  const p = new Persistence();
  await p.init();
  await p.saveVersion('d', deck('Named'), 'Keep me');
  for (let i = 0; i < 45; i++) await p.saveVersion('d', deck(`Auto ${i}`));
  const all = await p.listVersions('d');
  assert.equal(all.filter((v) => !v.label).length, 40);
  assert.ok(all.some((v) => v.label === 'Keep me'));
});

test('version times read naturally', () => {
  const now = new Date(2026, 9, 5, 15, 0).getTime();
  assert.equal(when(now - 20_000, now), 'Just now');
  assert.equal(when(now - 5 * 60_000, now), '5 min ago');
  assert.match(when(new Date(2026, 9, 5, 9, 30).getTime(), now), /^Today, /);
  assert.match(when(new Date(2026, 9, 4, 9, 30).getTime(), now), /^Yesterday, /);
});
