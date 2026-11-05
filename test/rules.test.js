import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRule } from '../src/rules.js';

const price = { type: 'price' };
const value = (v) => ({ type: 'value', value: v });

const T = true;
const F = false;

test('compares price with a fixed value', () => {
  assert.deepEqual(evaluateRule([{ left: price, op: '>', right: value(2) }], [1, 2, 3]), [F, F, T]);
  assert.deepEqual(evaluateRule([{ left: price, op: '<', right: value(2) }], [1, 2, 3]), [T, F, F]);
});

test('an indicator in warm-up never signals', () => {
  const rule = [{ left: price, op: '>', right: { type: 'sma', period: 2 } }];
  assert.deepEqual(evaluateRule(rule, [1, 2, 3]), [F, T, T]);
});

test('crosses fire only on the candle of the cross', () => {
  const closes = [1, 3, 3, 1, 3];
  assert.deepEqual(evaluateRule([{ left: price, op: 'crosses_above', right: value(2) }], closes), [F, T, F, F, T]);
  assert.deepEqual(evaluateRule([{ left: price, op: 'crosses_below', right: value(2) }], closes), [F, F, F, T, F]);
});

test('touching the level is not a cross until it passes through', () => {
  const rule = [{ left: price, op: 'crosses_above', right: value(2) }];
  assert.deepEqual(evaluateRule(rule, [1, 2, 3]), [F, F, T]);
});

test('a cross needs the previous indicator value', () => {
  const rule = [{ left: price, op: 'crosses_above', right: { type: 'sma', period: 2 } }];
  // At index 1 the sma has just appeared, so there is nothing to cross from.
  assert.deepEqual(evaluateRule(rule, [1, 2, 3, 1, 5]), [F, F, F, F, T]);
});

test('conditions are combined with AND', () => {
  const rule = [
    { left: price, op: '>', right: value(1) },
    { left: price, op: '<', right: value(3) },
  ];
  assert.deepEqual(evaluateRule(rule, [1, 2, 3]), [F, T, F]);
});

test('an empty rule never signals', () => {
  assert.deepEqual(evaluateRule([], [1, 2]), [F, F]);
});

test('more than 3 conditions are rejected', () => {
  const condition = { left: price, op: '>', right: value(1) };
  assert.equal(evaluateRule(Array(3).fill(condition), [2]).length, 1);
  assert.throws(() => evaluateRule(Array(4).fill(condition), [2]), RangeError);
});

test('bad input is rejected', () => {
  assert.throws(() => evaluateRule([{ left: price, op: '==', right: value(1) }], [2]), RangeError);
  assert.throws(() => evaluateRule([{ left: price, op: 'constructor', right: value(1) }], [2]), RangeError);
  assert.throws(() => evaluateRule([{ left: { type: 'macd' }, op: '>', right: value(1) }], [2]), RangeError);
  assert.throws(() => evaluateRule([{ left: price, op: '>', right: value(NaN) }], [2]), RangeError);
});
