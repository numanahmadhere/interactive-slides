import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, reportCsv, reportHtml } from '../src/live/report.js';
import { Boards } from '../src/live/boards.js';
import { Tally, newRoom } from '../src/live/protocol.js';
import { LiveHost } from '../src/live/host.js';
import { Persistence } from '../src/editor/persist.js';
import { normalizeDeck } from '../src/core/schema.js';
import { parseAppPath } from '../src/shell/paths.js';
import { canReports } from '../src/billing/plans.js';

const poll = { id: 'p', kind: 'poll', question: 'Best day?', options: ['Mon', 'Fri'] };
const rating = { id: 'r', kind: 'rating', question: 'Rate', options: ['1', '2', '3', '4', '5'] };
const open = { id: 'o', kind: 'open', question: 'Thoughts <b>?</b>' };

function sample() {
  const tally = new Tally();
  tally.vote({ cid: 'a', id: 'p', picks: [1] }, poll);
  tally.vote({ cid: 'b', id: 'p', picks: [1] }, poll);
  tally.vote({ cid: 'a', id: 'r', picks: [3] }, rating);
  const boards = new Boards();
  boards.addResponse('o', 'a', '<script>alert(1)</script> nice');
  return buildReport({
    id: 'r_1', title: 'Town hall', startedAt: Date.parse('2026-10-04T10:00:00Z'), endedAt: Date.parse('2026-10-04T10:42:00Z'), participants: 2,
    known: [{ prompt: poll, slide: 2 }, { prompt: rating, slide: 3 }, { prompt: open, slide: 4 }], tally, boards,
    players: [{ name: 'Ana', team: 'Red', points: 1750, correct: 2, answered: 2 }], teams: [{ team: 'Red', average: 1750, members: 1 }],
  });
}

test('a report holds who took part, each question and the scoreboard', () => {
  const r = sample();
  assert.deepEqual([r.title, r.minutes, r.participants, r.questions.length], ['Town hall', 42, 2, 3]);
  assert.deepEqual(r.questions[0].options, [{ text: 'Mon', count: 0 }, { text: 'Fri', count: 2 }]);
  assert.equal(r.questions[0].responses, 2);
  assert.deepEqual([r.questions[1].average, r.questions[1].responses], [4, 1]);
  assert.deepEqual(r.questions[2].answers, ['<script>alert(1)</script> nice'], 'kept as text');
  assert.equal(r.players[0].points, 1750);
  assert.equal(buildReport({ ...r, known: [], tally: new Tally(), boards: new Boards(), players: [], teams: [], title: '' }).title, 'Untitled session');
});

test('the spreadsheet has every answer, the scoreboard, and cannot run formulas', () => {
  const r = sample();
  r.players.push({ name: '=HYPERLINK("http://evil")', team: '', points: 5, correct: 0, answered: 1 });
  const csv = reportCsv(r);
  for (const piece of ['Report: Town hall', 'Best day?,Fri,2', 'Average,4', 'Rank,Name,Team,Points', '1,Ana,Red,1750', 'Red,1750,1']) assert.ok(csv.includes(piece), piece);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`), 'a name that looks like a formula is defused');
  assert.ok(csv.startsWith('﻿'));
});

test('the printable page escapes everything the audience typed', () => {
  const html = reportHtml(sample());
  assert.ok(!html.includes('<script>alert'), 'no script survives');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; nice'));
  assert.ok(html.includes('Town hall') && html.includes('42</b>minutes') && html.includes('Scoreboard'));
  assert.ok(html.includes('Thoughts &lt;b&gt;?&lt;/b&gt;'), 'even a question title is escaped');
});

test('reports are saved on this device, listed newest first, and can be deleted', async () => {
  const p = new Persistence();
  p.mode = 'memory'; // no browser storage in this test
  assert.deepEqual(await p.listReports(), []);
  await p.saveReport({ ...sample(), id: 'old', startedAt: 1000 });
  await p.saveReport({ ...sample(), id: 'new', startedAt: 9000 });
  assert.deepEqual((await p.listReports()).map((r) => r.id), ['new', 'old']);
  assert.equal((await p.getReport('old')).title, 'Town hall');
  assert.equal(await p.getReport('missing'), null);
  await p.saveReport({ ...sample(), id: 'old', startedAt: 1000, title: 'Renamed' });
  assert.equal((await p.listReports()).length, 2, 'saving the same session again replaces it');
  await p.deleteReport('old');
  assert.deepEqual((await p.listReports()).map((r) => r.id), ['new']);
});

test('a live session can report on itself, and knows when it has something worth saving', async () => {
  const { deck } = normalizeDeck({ meta: { title: 'Workshop' }, slides: [{ id: 's', layout: 'content', blocks: [{ id: 'p1', type: 'poll', slot: 'body', props: { question: 'Q', options: [{ text: 'A' }, { text: 'B' }] } }] }] });
  const channels = new Set();
  const transport = { open: (name, { onMessage, onStatus }) => { const me = { onMessage, send(m) { for (const c of channels) if (c !== me && c.name === name) c.onMessage(JSON.parse(JSON.stringify(m))); }, close() {}, name }; channels.add(me); queueMicrotask(() => onStatus('connected')); return me; }, close() {} };
  const room = newRoom();
  const host = new LiveHost({ transport, room, plan: 'pro' });
  host.start();
  after(() => host.stop());
  host.attach({ deck, state: { slide: 0, step: 0 }, nav: { stepCounts: [0] }, subscribe: () => () => {}, next() {}, prev() {}, first() {}, last() {} });
  assert.equal(host.hasAnswers, false);
  const phone = transport.open(`is-a-${room.code}`, { onMessage() {}, onStatus() {} });
  phone.send({ t: 'vote', cid: 'u1', id: 'p1', picks: [1] });
  phone.send({ t: 'hello', cid: 'u2' });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(host.hasAnswers, true);
  const r = host.report();
  assert.deepEqual([r.title, r.participants, r.questions[0].options[1].count], ['Workshop', 2, 1]);
});

test('the reports page has an address, and saving reports belongs to the paid plans', () => {
  assert.deepEqual(parseAppPath('/app/reports'), { page: 'reports' });
  assert.deepEqual(parseAppPath('/app/reports/'), { page: 'reports' });
  assert.ok(!canReports('free') && canReports('starter'));
});
