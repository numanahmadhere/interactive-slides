// A small, safe expression evaluator for calculator blocks. It parses numbers,
// variables, + - * / ^, comparisons, parentheses and a few functions, and never
// touches eval or Function, so a deck cannot run code through a formula.

export class ExprError extends Error {}

const FUNCTIONS = Object.assign(Object.create(null), {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  round: (x, d = 0) => { const k = 10 ** d; return Math.round(x * k) / k; },
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  sqrt: Math.sqrt,
  pow: Math.pow,
  mod: (a, b) => a % b,
  if: (c, a, b) => (c ? a : b),
});

const MAX_LENGTH = 400;
const MAX_DEPTH = 40;

function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|[-+*/^(),<>]))/gy;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(pos))) break;
      throw new ExprError(`Unexpected "${src.slice(pos).trim()[0]}"`);
    }
    pos = re.lastIndex;
    if (m[1] !== undefined) tokens.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ t: 'id', v: m[2] });
    else tokens.push({ t: 'op', v: m[3] });
  }
  return tokens;
}

// Returns { vars: Set<string>, evaluate(values) }. Throws ExprError on bad input.
export function compile(source) {
  const src = String(source ?? '');
  if (!src.trim()) throw new ExprError('Formula is empty');
  if (src.length > MAX_LENGTH) throw new ExprError('Formula is too long');
  const tokens = tokenize(src);
  const vars = new Set();
  let i = 0;

  const peek = () => tokens[i];
  const eat = (v) => {
    const tok = tokens[i];
    if (tok && tok.t === 'op' && tok.v === v) { i++; return true; }
    return false;
  };
  const expect = (v) => { if (!eat(v)) throw new ExprError(`Expected "${v}"`); };

  // Each parse function returns a closure (values) => number.
  function comparison(depth) {
    let left = additive(depth);
    for (;;) {
      const tok = peek();
      if (tok?.t === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(tok.v)) {
        i++;
        const right = additive(depth);
        const l = left; const op = tok.v;
        left = (v) => {
          const a = l(v); const b = right(v);
          return Number(op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : op === '>=' ? a >= b : op === '==' ? a === b : a !== b);
        };
      } else return left;
    }
  }
  function additive(depth) {
    let left = term(depth);
    for (;;) {
      if (eat('+')) { const r = term(depth); const l = left; left = (v) => l(v) + r(v); }
      else if (eat('-')) { const r = term(depth); const l = left; left = (v) => l(v) - r(v); }
      else return left;
    }
  }
  function term(depth) {
    let left = unary(depth);
    for (;;) {
      if (eat('*')) { const r = unary(depth); const l = left; left = (v) => l(v) * r(v); }
      else if (eat('/')) { const r = unary(depth); const l = left; left = (v) => l(v) / r(v); }
      else return left;
    }
  }
  function unary(depth) {
    if (eat('-')) { const x = unary(depth); return (v) => -x(v); }
    if (eat('+')) return unary(depth);
    return power(depth);
  }
  function power(depth) {
    const base = primary(depth);
    if (eat('^')) { const exp = unary(depth); return (v) => base(v) ** exp(v); } // right-associative
    return base;
  }
  function primary(depth) {
    if (depth > MAX_DEPTH) throw new ExprError('Formula is nested too deeply');
    const tok = tokens[i++];
    if (!tok) throw new ExprError('Formula ends unexpectedly');
    if (tok.t === 'num') return () => tok.v;
    if (tok.t === 'id') {
      if (eat('(')) {
        const fn = FUNCTIONS[tok.v];
        if (!fn) throw new ExprError(`Unknown function "${tok.v}"`);
        const args = [];
        if (!eat(')')) {
          do args.push(comparison(depth + 1)); while (eat(','));
          expect(')');
        }
        return (v) => fn(...args.map((a) => a(v)));
      }
      vars.add(tok.v);
      return (v) => {
        // Own properties only: "constructor" and friends must not resolve.
        const x = Object.prototype.hasOwnProperty.call(v, tok.v) ? v[tok.v] : undefined;
        if (typeof x !== 'number') throw new ExprError(`Unknown value "${tok.v}"`);
        return x;
      };
    }
    if (tok.v === '(') {
      const inner = comparison(depth + 1);
      expect(')');
      return inner;
    }
    throw new ExprError(`Unexpected "${tok.v}"`);
  }

  const root = comparison(0);
  if (i < tokens.length) throw new ExprError(`Unexpected "${tokens[i].v}"`);
  return { vars, evaluate: (values) => root(values) };
}

// Evaluate with a values object; returns NaN instead of throwing.
export function evaluate(source, values) {
  try {
    return compile(source).evaluate(values);
  } catch {
    return NaN;
  }
}
