import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, buildSlide, addSlides, replaceSlide, deleteSlide, outline } from '../src/connector/build.js';
import { handleBody, handleMessage, TOOLS } from '../src/connector/mcp.js';
import { supabaseStore, sha256Hex, validToken } from '../src/connector/supabase-store.js';
import { newConnectorToken, connectorUrl } from '../src/shell/connector.js';
import { normalizeDeck } from '../src/core/schema.js';
import { collectPrompts, collectKeys } from '../src/live/prompts.js';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const kinds = (deck) => deck.slides.flatMap((s) => s.blocks.map((b) => b.type));

test('a described deck becomes a real deck the editor can open, with live questions that work', () => {
  const deck = buildDeck({ title: 'Team offsite', theme: 'paper', slides: [
    { kind: 'title', title: 'Offsite', subtitle: 'October' },
    { title: 'Agenda', bullets: ['Welcome', 'Plans', 'Dinner'], notes: 'Say hi' },
    { kind: 'question', title: 'Warm up', question: { kind: 'poll', text: 'Coffee or tea?', options: ['Coffee', 'Tea'] } },
    { question: { kind: 'quiz', text: 'Capital of France?', options: ['Rome', 'Paris', 'Oslo'], correct: 1, explanation: 'Paris.', time_limit: 20 } },
    { question: { kind: 'wordcloud', text: 'One word for today?' } },
    { question: { kind: 'rating', text: 'How was it?', max: 10 } },
    { question: { kind: 'ranking', text: 'Rank these', options: ['A', 'B', 'C'] } },
    { question: { kind: 'qna', text: 'Ask us anything' } },
    { question: { kind: 'open', text: 'One change?' } },
    { kind: 'two-column', title: 'Before and after', left: ['Slow'], right: 'Fast' },
    { kind: 'section', title: 'Part two' },
  ] });
  assert.equal(deck.meta.title, 'Team offsite');
  assert.equal(deck.theme.id, 'paper');
  assert.equal(deck.slides.length, 11);
  assert.deepEqual(normalizeDeck(deck).warnings, [], 'nothing needed repairing');
  assert.equal(deck.slides[1].notes, 'Say hi');
  const all = deck.slides.flatMap((s) => collectPrompts(s));
  assert.deepEqual(all.map((p) => p.kind), ['poll', 'quiz', 'cloud', 'rating', 'ranking', 'qna', 'open']);
  const quizSlide = deck.slides[3];
  assert.equal([...collectKeys(quizSlide).values()].length, 1, 'the quiz has an answer key');
  const quiz = quizSlide.blocks.find((b) => b.type === 'quiz');
  assert.deepEqual(quiz.props.choices.map((c) => c.correct), [false, true, false]);
  assert.equal(quiz.props.timeLimit, 20);
});

test('sloppy input is repaired, not rejected', () => {
  const s = buildSlide({ kind: 'bogus', title: 'x'.repeat(500), bullets: ['a', '', null, 5], question: { kind: 'poll', text: 'q', options: ['only one'] } });
  assert.ok(s.blocks.length >= 1);
  const poll = buildSlide({ question: { kind: 'poll', text: 'q', options: ['only one'] } }).blocks.find((b) => b.type === 'poll');
  assert.equal(poll.props.options.length, 2, 'a poll always has at least two options');
  const quiz = buildSlide({ question: { kind: 'quiz', text: 'q', options: ['a', 'b'], correct: 99 } }).blocks.find((b) => b.type === 'quiz');
  assert.equal(quiz.props.choices.filter((c) => c.correct).length, 1, 'a quiz always has a right answer');
  const multi = buildSlide({ question: { kind: 'quiz', text: 'q', options: ['a', 'b', 'c'], correct: [0, 2] } }).blocks.find((b) => b.type === 'quiz');
  assert.equal(multi.props.mode, 'multiple');
  assert.throws(() => buildDeck({ title: 't', slides: [] }), /at least one/);
  assert.throws(() => buildDeck({ title: 't', slides: Array.from({ length: 61 }, () => ({})) }), /at most 60/);
});

test('slides can be added, replaced and deleted in place', () => {
  const deck = buildDeck({ title: 'D', slides: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }] });
  const more = addSlides(deck, [{ title: 'Inserted' }], 1);
  assert.deepEqual(outline(more).map((s) => s.title), ['One', 'Inserted', 'Two', 'Three']);
  const swapped = replaceSlide(more, 0, { question: { kind: 'poll', text: 'Now a poll', options: ['a', 'b'] } });
  assert.equal(outline(swapped)[0].question, 'poll');
  assert.deepEqual(outline(deleteSlide(swapped, 3)).map((s) => s.title), ['Now a poll', 'Inserted', 'Two']);
  assert.throws(() => replaceSlide(deck, 9, {}), /no slide 9/);
  assert.throws(() => deleteSlide(buildDeck({ title: 'x', slides: [{}] }), 0), /at least one slide/);
});

// ---- the protocol -------------------------------------------------------------------------

function memoryStore() {
  const rows = new Map();
  let n = 0;
  return {
    rows,
    async list(owner) { return [...rows.values()].filter((r) => r.owner === owner).map(({ id, title, updated_at }) => ({ id, title, updated_at })); },
    async get(owner, id) { const r = rows.get(id); return r && r.owner === owner ? r : null; },
    async create(owner, { title, data }) { const id = `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`; rows.set(id, { id, owner, title, data, updated_at: 'now' }); return { id }; },
    async update(owner, id, { title, data }) { const r = rows.get(id); if (!r || r.owner !== owner) return false; Object.assign(r, { title, data }); return true; },
  };
}
const rpc = (method, params, id = 1) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
const call = async (store, owner, name, args) => {
  const { body } = await handleBody(rpc('tools/call', { name, arguments: args }), { owner, store, appUrl: 'https://x.test' });
  return body.result;
};

test('the server speaks MCP: initialize, list tools, ping, and ignores notifications', async () => {
  const ctx = { owner: OWNER, store: memoryStore() };
  const init = (await handleBody(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }), ctx)).body.result;
  assert.equal(init.protocolVersion, '2025-06-18');
  assert.ok(init.capabilities.tools && init.serverInfo.name === 'densight-slides' && init.instructions);
  assert.equal((await handleBody(rpc('initialize', { protocolVersion: '1999-01-01' }), ctx)).body.result.protocolVersion, '2025-06-18', 'an unknown version gets ours');
  const listed = (await handleBody(rpc('tools/list'), ctx)).body.result.tools;
  assert.deepEqual(listed.map((t) => t.name), ['create_deck', 'add_slides', 'replace_slide', 'delete_slide', 'list_decks', 'get_deck']);
  for (const t of TOOLS) assert.ok(t.description.length > 20 && t.inputSchema.type === 'object', t.name);
  assert.deepEqual((await handleBody(rpc('ping'), ctx)).body.result, {});
  assert.equal((await handleBody(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), ctx)).status, 202);
  assert.equal((await handleBody('not json', ctx)).status, 400);
  assert.equal((await handleBody(rpc('nope'), ctx)).body.error.code, -32601);
  assert.equal((await handleMessage({ foo: 1 }, ctx)).error.code, -32600);
  const batch = (await handleBody(JSON.stringify([JSON.parse(rpc('ping', undefined, 1)), JSON.parse(rpc('tools/list', undefined, 2))]), ctx)).body;
  assert.equal(batch.length, 2);
});

test('create, read, change and list decks through the tools', async () => {
  const store = memoryStore();
  const made = await call(store, OWNER, 'create_deck', { title: 'Launch', slides: [{ kind: 'title', title: 'Launch' }, { title: 'Why', bullets: ['a'] }] });
  assert.ok(!made.isError, JSON.stringify(made));
  const id = made.structuredContent.deck_id;
  assert.match(made.content[0].text, /My decks/);
  assert.equal(store.rows.get(id).data.slides.length, 2);
  assert.match((await call(store, OWNER, 'get_deck', { deck_id: id })).content[0].text, /0\. Launch[\s\S]*1\. Why/);
  assert.match((await call(store, OWNER, 'add_slides', { deck_id: id, slides: [{ question: { kind: 'poll', text: 'Ready?', options: ['Yes', 'No'] } }] })).content[0].text, /now has 3/);
  assert.match((await call(store, OWNER, 'replace_slide', { deck_id: id, index: 1, slide: { title: 'Because' } })).content[0].text, /Replaced slide 1/);
  assert.match((await call(store, OWNER, 'delete_slide', { deck_id: id, index: 0 })).content[0].text, /now has 2/);
  assert.equal((await call(store, OWNER, 'list_decks', {})).structuredContent.decks.length, 1);
  assert.equal(normalizeDeck(store.rows.get(id).data).warnings.length, 0, 'the saved deck is clean');
});

test('one person can never reach another person\'s deck, and bad input gives a plain error', async () => {
  const store = memoryStore();
  const id = (await call(store, OWNER, 'create_deck', { title: 'Private', slides: [{ title: 'x' }] })).structuredContent.deck_id;
  for (const [name, args] of [['get_deck', { deck_id: id }], ['add_slides', { deck_id: id, slides: [{}] }], ['replace_slide', { deck_id: id, index: 0, slide: {} }], ['delete_slide', { deck_id: id, index: 0 }]]) {
    const r = await call(store, OTHER, name, args);
    assert.ok(r.isError && /not found/.test(r.content[0].text), name);
  }
  assert.equal(store.rows.get(id).data.slides.length, 1, 'untouched');
  assert.deepEqual((await call(store, OTHER, 'list_decks', {})).structuredContent.decks, []);
  assert.ok((await call(store, OWNER, 'get_deck', { deck_id: 'not-an-id' })).isError);
  assert.ok((await call(store, OWNER, 'create_deck', { title: 't', slides: [] })).isError);
  assert.equal((await handleBody(rpc('tools/call', { name: 'rm_rf' }), { owner: OWNER, store })).body.error.code, -32602);
});

test('a full account gets a clear message', async () => {
  const store = { ...memoryStore(), async create() { const e = new Error('deck_limit'); e.code = 'deck_limit'; throw e; } };
  const r = await call(store, OWNER, 'create_deck', { title: 't', slides: [{ title: 'x' }] });
  assert.ok(r.isError && /limit of online decks/.test(r.content[0].text));
});

// ---- the database side --------------------------------------------------------------------

test('connector links are 43 URL-safe characters, and only their hash would be stored', async () => {
  const a = newConnectorToken();
  assert.ok(validToken(a) && a.length === 43);
  assert.notEqual(a, newConnectorToken());
  assert.match(await sha256Hex(a), /^[0-9a-f]{64}$/);
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(connectorUrl(a, 'https://s.test'), `https://s.test/api/mcp/${a}`);
  for (const bad of ['', 'short', `${a}x`, `${a.slice(1)}!`, null, undefined, 5]) assert.equal(validToken(bad), false, String(bad));
});

test('the store always names the owner, and sends the service key only in headers', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    const body = url.includes('/connector_keys?select') ? [{ user_id: OWNER }] : url.includes('POST') ? [] : init.method === 'POST' ? [{ id: 'd1' }] : init.method === 'PATCH' ? [{ id: 'd1' }] : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const store = supabaseStore({ url: 'https://p.supabase.co/', key: 'SERVICE', fetchImpl });
  const token = newConnectorToken();
  assert.equal(await store.ownerOf(token), OWNER);
  assert.equal(await store.ownerOf('bad'), null, 'a malformed link never reaches the database');
  assert.ok(seen[0].url.includes(`token_hash=eq.${await sha256Hex(token)}`) && !seen[0].url.includes(token), 'the secret itself is never sent in a query');
  await store.get(OWNER, 'abc');
  await store.update(OWNER, 'abc', { title: 't', data: { slides: [] } });
  await store.create(OWNER, { title: 't', data: { slides: [] } });
  await store.list(OWNER);
  for (const { url, init } of seen.filter((s) => s.url.includes('/decks'))) {
    assert.ok(url.includes(`owner=eq.${OWNER}`) || JSON.parse(init.body ?? '{}').owner === OWNER, url);
    assert.ok(!url.includes('SERVICE') && init.headers.apikey === 'SERVICE');
  }
  const limit = supabaseStore({ url: 'https://p', key: 'k', fetchImpl: async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ message: 'deck_limit' }) }) });
  await assert.rejects(limit.create(OWNER, { title: 't', data: { slides: [] } }), (e) => e.code === 'deck_limit');
});
