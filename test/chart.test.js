import test from 'node:test';
import assert from 'node:assert/strict';
import { equityGeometry, niceTicks } from '../src/chart.js';

const curve = [
  { time: 0, equity: 100 },
  { time: 50, equity: 110 },
  { time: 100, equity: 90 },
];

test('ticks are round and enclose the range', () => {
  assert.deepEqual(niceTicks(90, 110), [90, 95, 100, 105, 110]);
  assert.deepEqual(niceTicks(103, 118), [100, 105, 110, 115, 120]);
  assert.deepEqual(niceTicks(0.1, 0.3), [0.1, 0.15, 0.2, 0.25, 0.3]);
});

test('flat values still give a usable range', () => {
  const ticks = niceTicks(100, 100);
  assert.ok(ticks[0] <= 100 && ticks[ticks.length - 1] >= 100);
  assert.ok(ticks.length >= 2);
});

test('points map to the edges of the plot', () => {
  const g = equityGeometry(curve, 100, 600);
  assert.equal(g.points[0].x, g.left);
  assert.equal(g.points[2].x, g.right);
  assert.equal(g.points[1].y, g.top);
  assert.equal(g.points[2].y, g.bottom);
  assert.equal(g.stakeY, g.points[0].y);
});

test('the path holds equity level until a trade closes', () => {
  const g = equityGeometry(curve, 100, 600);
  const [a, b, c] = g.points;
  assert.equal(g.path, `M${a.x} ${a.y} H${b.x} V${b.y} H${c.x} V${c.y}`);
});

test('the axis includes the stake even when equity stays above it', () => {
  const g = equityGeometry([{ time: 0, equity: 150 }, { time: 1, equity: 160 }], 100, 600);
  assert.ok(g.stakeY <= g.bottom);
  assert.equal(g.yTicks[0].value, 100);
});

test('one trade on one candle, or no change, stays finite', () => {
  const g = equityGeometry([{ time: 5, equity: 100 }, { time: 5, equity: 100 }], 100, 600);
  assert.doesNotMatch(g.path, /NaN|Infinity/);
  for (const { y } of g.yTicks) assert.ok(Number.isFinite(y));
  for (const { x } of g.xTicks) assert.ok(Number.isFinite(x));
});
