import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi } from '../src/indicators.js';

function assertClose(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => {
    if (expected[i] === null) assert.equal(value, null, `index ${i}`);
    else assert.ok(Math.abs(value - expected[i]) < 1e-3, `index ${i}: ${value} != ${expected[i]}`);
  });
}

test('sma averages a sliding window', () => {
  assertClose(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test('ema is seeded with the sma, then smoothed', () => {
  assertClose(ema([2, 4, 6, 8, 12], 3), [null, null, 4, 6, 9]);
});

test('rsi uses Wilder smoothing', () => {
  assertClose(rsi([10, 12, 11, 13, 12], 2), [null, null, 66.667, 85.714, 54.545]);
});

test('rsi edge cases: only gains is 100, flat is 50', () => {
  assertClose(rsi([1, 2, 3], 2), [null, null, 100]);
  assertClose(rsi([5, 5, 5], 2), [null, null, 50]);
});

test('too little data gives only nulls', () => {
  for (const fn of [sma, ema, rsi]) assertClose(fn([1, 2], 3), [null, null]);
});

test('invalid period is rejected', () => {
  for (const fn of [sma, ema, rsi]) {
    assert.throws(() => fn([1, 2, 3], 0), RangeError);
    assert.throws(() => fn([1, 2, 3], 1.5), RangeError);
  }
});
