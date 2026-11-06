import test from 'node:test';
import assert from 'node:assert/strict';
import { equityCurve, summarize, tradesToCsv } from '../src/report.js';

const trades = (...pnls) =>
  pnls.map((pnl, i) => ({ entryTime: i * 10, exitTime: i * 10 + 5, pnl, fees: 1 }));

test('equity starts at the stake and moves with each closed trade', () => {
  assert.deepEqual(equityCurve(trades(10, -30), 100), [
    { time: 0, equity: 100 },
    { time: 5, equity: 110 },
    { time: 15, equity: 80 },
  ]);
});

test('summary counts totals and win rate', () => {
  const summary = summarize(trades(10, -30, 5, -10, 40), 100);
  assert.equal(summary.tradeCount, 5);
  assert.equal(summary.wins, 3);
  assert.equal(summary.losses, 2);
  assert.equal(summary.winRatePct, 60);
  assert.equal(summary.totalPnl, 15);
  assert.equal(summary.totalFees, 5);
});

test('max drawdown is measured from the running peak', () => {
  // Equity: 100, 110, 80, 85, 75, 115. Peak 110, trough 75.
  const summary = summarize(trades(10, -30, 5, -10, 40), 100);
  assert.equal(summary.maxDrawdown, 35);
  assert.ok(Math.abs(summary.maxDrawdownPct - 31.818) < 1e-3);
});

test('a loss from the start is a drawdown from the stake', () => {
  const summary = summarize(trades(-20), 100);
  assert.equal(summary.maxDrawdown, 20);
  assert.equal(summary.maxDrawdownPct, 20);
});

test('a break-even trade is not a win', () => {
  const summary = summarize(trades(0), 100);
  assert.equal(summary.wins, 0);
  assert.equal(summary.losses, 1);
  assert.equal(summary.winRatePct, 0);
});

test('no trades gives zeros and no win rate', () => {
  assert.deepEqual(equityCurve([], 100), []);
  assert.deepEqual(summarize([], 100), {
    tradeCount: 0,
    wins: 0,
    losses: 0,
    winRatePct: null,
    totalPnl: 0,
    totalFees: 0,
    maxDrawdown: 0,
    maxDrawdownPct: 0,
  });
});

test('csv has a header, ISO dates and rounded amounts', () => {
  const csv = tradesToCsv([
    {
      entryTime: Date.UTC(2026, 0, 1),
      entryPrice: 100.5,
      exitTime: Date.UTC(2026, 0, 2),
      exitPrice: 110,
      quantity: 1 / 3,
      fees: 0.1,
      pnl: 3.123456789,
      exitReason: 'signal',
    },
  ]);
  assert.equal(
    csv,
    'entry_time,entry_price,exit_time,exit_price,quantity,fees,pnl,exit_reason\r\n' +
      '2026-01-01T00:00:00.000Z,100.5,2026-01-02T00:00:00.000Z,110,0.33333333,0.1,3.12345679,signal\r\n',
  );
});

test('csv with no trades is only the header', () => {
  assert.equal(tradesToCsv([]).split('\r\n').length, 2);
});
