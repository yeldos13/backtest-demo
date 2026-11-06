import test from 'node:test';
import assert from 'node:assert/strict';
import { runBacktest } from '../src/engine.js';

const candles = (...pairs) => pairs.map(([open, close], time) => ({ time, open, close }));
const above = (v) => [{ left: { type: 'price' }, op: '>', right: { type: 'value', value: v } }];
const below = (v) => [{ left: { type: 'price' }, op: '<', right: { type: 'value', value: v } }];

test('fills at the open after the signal candle', () => {
  const data = candles([10, 10], [11, 12], [13, 14], [15, 8], [7, 7]);
  const [trade, ...rest] = runBacktest(data, { entry: above(11), exit: below(9), stake: 130, feePct: 0 });
  assert.equal(rest.length, 0);
  assert.equal(trade.entryTime, 2);
  assert.equal(trade.entryPrice, 13);
  assert.equal(trade.exitTime, 4);
  assert.equal(trade.exitPrice, 7);
  assert.equal(trade.exitReason, 'signal');
  assert.equal(trade.quantity, 10);
  assert.ok(Math.abs(trade.pnl - -60) < 1e-9);
});

test('charges the fee on both sides, on the value of each fill', () => {
  const data = candles([5, 12], [10, 5], [20, 20]);
  const [trade] = runBacktest(data, { entry: above(11), exit: below(6), stake: 100, feePct: 1 });
  assert.ok(Math.abs(trade.fees - 3) < 1e-9);
  assert.ok(Math.abs(trade.pnl - 97) < 1e-9);
});

test('closes an open position at the last close', () => {
  const data = candles([5, 12], [10, 15]);
  const [trade] = runBacktest(data, { entry: above(11), exit: [], stake: 100, feePct: 0 });
  assert.equal(trade.exitPrice, 15);
  assert.equal(trade.exitTime, 1);
  assert.equal(trade.exitReason, 'end');
});

test('holds one position at a time', () => {
  const data = candles([1, 1], [2, 2], [3, 3], [4, 4]);
  const trades = runBacktest(data, { entry: above(0), exit: [], stake: 100, feePct: 0 });
  assert.equal(trades.length, 1);
});

test('a signal on the last candle opens nothing', () => {
  const data = candles([1, 1], [1, 20]);
  assert.deepEqual(runBacktest(data, { entry: above(11), exit: [], stake: 100, feePct: 0 }), []);
});

test('does not re-enter on the same open it exited at', () => {
  const data = candles([1, 1], [2, 200], [3, 3], [4, 4]);
  const trades = runBacktest(data, { entry: above(0), exit: above(100), stake: 100, feePct: 0 });
  assert.deepEqual(trades.map((t) => [t.entryTime, t.exitTime, t.exitReason]), [[1, 2, 'signal'], [3, 3, 'end']]);
});

test('future candles do not change past trades', () => {
  const past = [[10, 10], [9, 9], [12, 12], [13, 13], [9, 9], [8, 8]];
  const rule = (op) => [{ left: { type: 'price' }, op, right: { type: 'sma', period: 2 } }];
  const options = { entry: rule('crosses_above'), exit: rule('crosses_below'), stake: 100, feePct: 0.1 };
  const closedInPast = (future) =>
    runBacktest(candles(...past, ...future), options).filter((t) => t.exitTime <= 5);

  const first = closedInPast([[100, 100], [1, 1], [100, 100]]);
  assert.equal(first.length, 1);
  assert.equal(first[0].entryPrice, 13);
  assert.equal(first[0].exitPrice, 8);
  assert.deepEqual(first, closedInPast([[1, 1], [100, 100], [1, 1]]));
});

test('no candles means no trades', () => {
  assert.deepEqual(runBacktest([], { entry: above(0), exit: [], stake: 100, feePct: 0 }), []);
});

test('bad stake or fee is rejected', () => {
  const data = candles([1, 1]);
  for (const stake of [0, -1, NaN]) {
    assert.throws(() => runBacktest(data, { entry: [], exit: [], stake, feePct: 0 }), RangeError);
  }
  for (const feePct of [-1, 100, NaN]) {
    assert.throws(() => runBacktest(data, { entry: [], exit: [], stake: 1, feePct }), RangeError);
  }
});
