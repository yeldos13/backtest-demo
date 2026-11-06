import test from 'node:test';
import assert from 'node:assert/strict';
import { parseForm } from '../src/form.js';

const row = { leftType: 'price', leftNumber: '', op: '>', rightType: 'sma', rightNumber: '50' };
const form = {
  symbol: 'BTCUSDT',
  interval: '1d',
  start: '2026-01-01',
  end: '2026-01-02',
  stake: '1000',
  fee: '0.1',
  entry: [row],
  exit: [row],
};

test('converts form text into a request and a strategy', () => {
  const { request, strategy } = parseForm(form);
  assert.deepEqual(request, {
    symbol: 'BTCUSDT',
    interval: '1d',
    startTime: Date.UTC(2026, 0, 1),
    endTime: Date.UTC(2026, 0, 3) - 1,
  });
  assert.equal(strategy.stake, 1000);
  assert.equal(strategy.feePct, 0.1);
  assert.deepEqual(strategy.entry, [{ left: { type: 'price' }, op: '>', right: { type: 'sma', period: 50 } }]);
});

test('a one-day period is valid because the end date is inclusive', () => {
  assert.doesNotThrow(() => parseForm({ ...form, end: form.start }));
});

test('a zero fee and a zero condition value are valid', () => {
  const zero = { ...row, rightType: 'value', rightNumber: '0' };
  const { strategy } = parseForm({ ...form, fee: '0', entry: [zero] });
  assert.equal(strategy.feePct, 0);
  assert.deepEqual(strategy.entry[0].right, { type: 'value', value: 0 });
});

test('bad input gets a readable error', () => {
  const cases = [
    [{ start: '' }, /both dates/],
    [{ start: '2026-02-01' }, /before its end/],
    [{ stake: '' }, /Stake/],
    [{ stake: '-5' }, /Stake/],
    [{ stake: 'Infinity' }, /Stake/],
    [{ fee: '' }, /Fee/],
    [{ fee: '100' }, /Fee/],
    [{ entry: [] }, /entry rule/],
    [{ exit: [] }, /exit rule/],
    [{ entry: [{ ...row, rightNumber: '' }] }, /period/],
    [{ entry: [{ ...row, rightNumber: '1.5' }] }, /period/],
    [{ entry: [{ ...row, rightNumber: '501' }] }, /period/],
    [{ entry: [{ ...row, rightType: 'value', rightNumber: '' }] }, /number/],
  ];
  for (const [change, message] of cases) {
    assert.throws(() => parseForm({ ...form, ...change }), message, JSON.stringify(change));
  }
});
