import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate, ExprError } from '../src/core/expr.js';
import { parseTable, niceScale, toNumber } from '../src/core/csv.js';

test('arithmetic and precedence', () => {
  assert.equal(evaluate('1 + 2 * 3', {}), 7);
  assert.equal(evaluate('(1 + 2) * 3', {}), 9);
  assert.equal(evaluate('10 / 4', {}), 2.5);
  assert.equal(evaluate('2 ^ 3 ^ 2', {}), 512, 'power is right-associative');
  assert.equal(evaluate('-2 ^ 2', {}), -4);
  assert.equal(evaluate('--3', {}), 3);
  assert.equal(evaluate('1.5e2', {}), 150);
});

test('variables and functions', () => {
  const v = { price: 20, qty: 3, rate: 0.1 };
  assert.equal(evaluate('price * qty * (1 - rate)', v), 54);
  assert.equal(evaluate('max(price, qty, 5)', v), 20);
  assert.equal(evaluate('round(10 / 3, 2)', {}), 3.33);
  assert.equal(evaluate('sqrt(16) + abs(-2)', {}), 6);
  assert.equal(evaluate('if(qty > 2, 1, 0)', v), 1);
  assert.equal(evaluate('if(qty >= 5, 1, 0)', v), 0);
  assert.equal(evaluate('qty == 3', v), 1);
});

test('compile reports the variables a formula uses', () => {
  assert.deepEqual([...compile('a * b + c / a').vars].sort(), ['a', 'b', 'c']);
});

test('bad formulas throw ExprError; evaluate returns NaN', () => {
  for (const bad of ['', '1 +', '(1', '1 2', 'foo(1)', 'a b', '2 $ 3', '1 + )']) {
    assert.throws(() => compile(bad), ExprError, bad);
    assert.ok(Number.isNaN(evaluate(bad, {})), bad);
  }
  assert.ok(Number.isNaN(evaluate('missing + 1', {})), 'unknown variable');
  assert.throws(() => compile('x'.repeat(500)), ExprError);
  assert.throws(() => compile('('.repeat(100) + '1' + ')'.repeat(100)), ExprError);
});

test('formulas cannot reach JavaScript', () => {
  for (const evil of ['constructor', 'this', '__proto__', 'process.exit()', 'alert(1)', 'a.b']) {
    assert.ok(Number.isNaN(evaluate(evil, { a: 1 })), evil);
  }
  assert.ok(Number.isNaN(evaluate('toString', {})), 'inherited property names are not values');
});

test('division by zero gives a non-finite number rather than throwing', () => {
  assert.equal(evaluate('1 / 0', {}), Infinity);
  assert.ok(Number.isNaN(evaluate('0 / 0', {})));
});

test('toNumber understands formatted numbers', () => {
  assert.equal(toNumber('1,234.5'), 1234.5);
  assert.equal(toNumber('$12'), 12);
  assert.equal(toNumber('45%'), 45);
  assert.ok(Number.isNaN(toNumber('abc')));
  assert.ok(Number.isNaN(toNumber('')));
});

test('parseTable: header row, delimiters, quotes', () => {
  const t = parseTable('Quarter,Sales,Costs\nQ1,100,60\nQ2,"1,200",80');
  assert.deepEqual(t.headers, ['Sales', 'Costs']);
  assert.deepEqual(t.rows, [{ label: 'Q1', values: [100, 60] }, { label: 'Q2', values: [1200, 80] }]);
  assert.deepEqual(parseTable('a\t1\nb\t2').rows.map((r) => r.values[0]), [1, 2]);
  assert.deepEqual(parseTable('a;1\nb;2').rows.length, 2);
});

test('parseTable without a header and with junk', () => {
  const t = parseTable('Apples,5\nPears,7\n\nbad,row');
  assert.deepEqual(t.headers, ['Value']);
  assert.deepEqual(t.rows.map((r) => r.label), ['Apples', 'Pears']);
  assert.deepEqual(parseTable('').rows, []);
  assert.equal(parseTable('x,1\n'.repeat(100)).rows.length, 40, 'row cap');
});

test('niceScale picks friendly axes', () => {
  assert.deepEqual(niceScale(87), { max: 100, step: 20 });
  assert.deepEqual(niceScale(0), { max: 1, step: 0.2 });
  assert.deepEqual(niceScale(4200), { max: 5000, step: 1000 });
});
