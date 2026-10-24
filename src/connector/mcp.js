// The Claude connector: a small MCP server (JSON-RPC over HTTP) that lets Claude build decks in a person's account.
// It knows nothing about HTTP frameworks or databases. The caller passes in who the request is for and a `store`
// with five functions, so the whole thing can be tested without a network.
//
//   store.list(owner)                       -> [{ id, title, updated_at }]
//   store.get(owner, id)                    -> { id, title, data } | null
//   store.create(owner, { title, data })    -> { id }        (throws an Error with .code 'deck_limit' past the cap)
//   store.update(owner, id, { title, data })-> true | false  (false when the deck is not theirs)

import { buildDeck, addSlides, replaceSlide, deleteSlide, outline, SLIDE_KINDS, QUESTION_KINDS, THEMES, MAX_SLIDES_PER_CALL } from './build.js';
import { normalizeDeck } from '../core/schema.js';

export const SERVER_INFO = { name: 'densight-slides', version: '1.0.0' };
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];

const SLIDE_SCHEMA = {
  type: 'object',
  description: 'One slide. Pick a kind, then fill in the fields that kind uses.',
  properties: {
    kind: { type: 'string', enum: SLIDE_KINDS, description: 'title (opening slide), section (divider), content (title with bullets or a paragraph), two-column (left and right), or question (a live question the audience answers on their phones). Defaults to content, or question when "question" is given.' },
    title: { type: 'string', description: 'The slide heading. Keep it short.' },
    subtitle: { type: 'string', description: 'A line under the heading (title and section slides).' },
    bullets: { type: 'array', items: { type: 'string' }, description: 'Up to 12 short bullet points (content slides).' },
    text: { type: 'string', description: 'A short paragraph (content slides).' },
    left: { description: 'Left column: a string, or an array of bullet strings (two-column slides).', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
    right: { description: 'Right column: a string, or an array of bullet strings (two-column slides).', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
    notes: { type: 'string', description: 'Speaker notes, only the presenter sees them.' },
    question: {
      type: 'object',
      description: 'A live question (question slides).',
      properties: {
        kind: { type: 'string', enum: QUESTION_KINDS, description: 'poll (pick an option), quiz (one or more correct answers), wordcloud (one short word or phrase each), open (a short written answer), rating (a scale), ranking (put options in order), qna (the audience asks questions).' },
        text: { type: 'string', description: 'The question itself.' },
        options: { type: 'array', items: { type: 'string' }, description: 'Answer options for poll, quiz and ranking (2 to 8).' },
        correct: { description: 'Quiz only: the zero-based index (or array of indexes) of the correct option(s).', oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }] },
        explanation: { type: 'string', description: 'Quiz only: shown after answering.' },
        time_limit: { type: 'integer', enum: [10, 20, 30, 60, 120], description: 'Quiz only: seconds to answer in a live session.' },
        multi: { type: 'boolean', description: 'Poll only: allow several answers.' },
        max: { type: 'integer', enum: [5, 7, 10], description: 'Rating only: top of the scale.' },
        low: { type: 'string', description: 'Rating only: label for the lowest value.' },
        high: { type: 'string', description: 'Rating only: label for the highest value.' },
      },
      required: ['text'],
    },
  },
};

export const TOOLS = [
  {
    name: 'create_deck',
    description: 'Create a new presentation in the person\'s Densight Slides account. A good deck opens with a title slide, uses a few content slides, and puts a question slide every few slides so the audience takes part. They open it from My decks in the app, and can run it live with a code that phones join.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The deck title.' },
        theme: { type: 'string', enum: THEMES, description: 'Optional look. Defaults to densight-dark.' },
        slides: { type: 'array', items: SLIDE_SCHEMA, minItems: 1, maxItems: MAX_SLIDES_PER_CALL, description: 'The slides, in order.' },
      },
      required: ['title', 'slides'],
    },
  },
  {
    name: 'add_slides',
    description: 'Add slides to an existing deck. They go at the end unless you give a position.',
    inputSchema: {
      type: 'object',
      properties: {
        deck_id: { type: 'string', description: 'From create_deck or list_decks.' },
        position: { type: 'integer', minimum: 0, description: 'Zero-based place to insert at. Omit to add at the end.' },
        slides: { type: 'array', items: SLIDE_SCHEMA, minItems: 1, maxItems: MAX_SLIDES_PER_CALL },
      },
      required: ['deck_id', 'slides'],
    },
  },
  {
    name: 'replace_slide',
    description: 'Rewrite one slide of a deck. Use get_deck first to see the slide numbers.',
    inputSchema: {
      type: 'object',
      properties: { deck_id: { type: 'string' }, index: { type: 'integer', minimum: 0, description: 'Zero-based slide number.' }, slide: SLIDE_SCHEMA },
      required: ['deck_id', 'index', 'slide'],
    },
  },
  {
    name: 'delete_slide',
    description: 'Remove one slide from a deck.',
    inputSchema: { type: 'object', properties: { deck_id: { type: 'string' }, index: { type: 'integer', minimum: 0 } }, required: ['deck_id', 'index'] },
  },
  {
    name: 'list_decks',
    description: 'List the decks in the person\'s account, newest first.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_deck',
    description: 'Show a deck as an outline: each slide\'s number, title and, for question slides, the question type.',
    inputSchema: { type: 'object', properties: { deck_id: { type: 'string' } }, required: ['deck_id'] },
  },
];

const INSTRUCTIONS = 'Build presentations in Densight Slides. Create a deck with create_deck, then refine it with add_slides, replace_slide and delete_slide. Decks appear in My decks in the app. Question slides (poll, quiz, wordcloud, open, rating, ranking, qna) are answered live by the audience on their phones, so use them to make the session interactive. Keep slide text short.';

const ok = (text, extra = {}) => ({ content: [{ type: 'text', text }], ...extra });
const fail = (text) => ({ isError: true, content: [{ type: 'text', text }] });
const isId = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

async function callTool(name, args = {}, { owner, store, appUrl }) {
  const open = `Open ${appUrl ? `${appUrl}/app/` : 'the app'} and look under My decks.`;
  try {
    if (name === 'create_deck') {
      const deck = buildDeck({ title: args.title, slides: args.slides, theme: args.theme });
      const row = await store.create(owner, { title: deck.meta.title, data: deck });
      return ok(`Created "${deck.meta.title}" with ${deck.slides.length} slides. deck_id: ${row.id}. ${open}`, { structuredContent: { deck_id: row.id, slides: deck.slides.length } });
    }
    if (name === 'list_decks') {
      const rows = await store.list(owner);
      return ok(rows.length ? rows.map((r) => `${r.id}  ${r.title}`).join('\n') : 'No decks yet.', { structuredContent: { decks: rows.map((r) => ({ deck_id: r.id, title: r.title, updated_at: r.updated_at })) } });
    }
    if (!isId(args.deck_id)) return fail('deck_id is missing or not valid. Use list_decks to find it.');
    const row = await store.get(owner, args.deck_id);
    if (!row) return fail('That deck was not found in this account.');
    const { deck } = normalizeDeck(row.data);
    if (name === 'get_deck') {
      const o = outline(deck);
      return ok(`"${deck.meta.title}", ${o.length} slides:\n${o.map((s) => `${s.index}. ${s.title}${s.question ? ` (${s.question})` : ''}`).join('\n')}`, { structuredContent: { deck_id: row.id, title: deck.meta.title, slides: o } });
    }
    let next;
    let message;
    if (name === 'add_slides') { next = addSlides(deck, args.slides, args.position); message = `Added ${next.slides.length - deck.slides.length} slides. The deck now has ${next.slides.length}.`; }
    else if (name === 'replace_slide') { next = replaceSlide(deck, args.index, args.slide); message = `Replaced slide ${args.index}.`; }
    else if (name === 'delete_slide') { next = deleteSlide(deck, args.index); message = `Deleted slide ${args.index}. The deck now has ${next.slides.length}.`; }
    else return fail(`There is no tool called ${name}.`);
    if (!(await store.update(owner, args.deck_id, { title: next.meta.title, data: next }))) return fail('That deck was not found in this account.');
    return ok(`${message} ${open}`, { structuredContent: { deck_id: args.deck_id, slides: next.slides.length } });
  } catch (err) {
    if (err?.code === 'deck_limit') return fail('The account has reached its limit of online decks. Delete an old deck in the app, then try again.');
    return fail(err?.message ? String(err.message).slice(0, 300) : 'That did not work.');
  }
}

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

// One JSON-RPC message in, one out (or null for a notification).
export async function handleMessage(msg, ctx) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid request');
  const { id, method, params } = msg;
  if (id === undefined) return null; // notifications (initialized, cancelled) need no answer
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return { jsonrpc: '2.0', id, result: { protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS } };
    }
    case 'ping': return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list': return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    case 'tools/call': {
      if (typeof params?.name !== 'string') return rpcError(id, -32602, 'Missing tool name');
      if (!TOOLS.some((t) => t.name === params.name)) return rpcError(id, -32602, `Unknown tool ${params.name}`);
      return { jsonrpc: '2.0', id, result: await callTool(params.name, params.arguments, ctx) };
    }
    case 'resources/list': return { jsonrpc: '2.0', id, result: { resources: [] } };
    case 'prompts/list': return { jsonrpc: '2.0', id, result: { prompts: [] } };
    default: return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// A whole POST body (one message or a batch). -> { status, body } where body is JSON or undefined.
export async function handleBody(raw, ctx) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { status: 400, body: rpcError(null, -32700, 'Parse error') }; }
  if (Array.isArray(parsed)) {
    if (!parsed.length || parsed.length > 20) return { status: 400, body: rpcError(null, -32600, 'Invalid batch') };
    const out = (await Promise.all(parsed.map((m) => handleMessage(m, ctx)))).filter(Boolean);
    return out.length ? { status: 200, body: out } : { status: 202 };
  }
  const out = await handleMessage(parsed, ctx);
  return out ? { status: 200, body: out } : { status: 202 };
}
