import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchCandles, loadCandles, parseKlines, PAIRS } from '../src/data.js';

const NOW = 1_000_000;
const row = (time, open = '10.5', close = '11.5', closeTime = time + 1) =>
  [time, open, '12', '9', close, '100', closeTime, '1000', 5, '50', '500', '0'];
const json = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });

const snapshot = {
  fetchedAt: '2026-11-06T00:00:00.000Z',
  interval: '1d',
  pairs: { BTCUSDT: [{ time: 100, open: 1, close: 2 }, { time: 200, open: 2, close: 3 }, { time: 300, open: 3, close: 4 }] },
};
const request = { symbol: 'BTCUSDT', interval: '1d', startTime: 150, endTime: 250 };

// Answers the API with `api` and the snapshot URL with `saved`, recording API calls.
function fakeFetch(api, saved = async () => json(snapshot)) {
  const calls = [];
  const fn = (url) => {
    if (String(url).includes('snapshot.json')) return saved();
    calls.push(new URL(url));
    return api(calls.length);
  };
  return Object.assign(fn, { calls });
}

test('parses string prices into numbers', () => {
  assert.deepEqual(parseKlines([row(5)], NOW), [{ time: 5, open: 10.5, close: 11.5 }]);
});

test('drops a candle that is still forming', () => {
  assert.deepEqual(parseKlines([row(5, '1', '2', NOW + 1)], NOW), []);
});

test('rejects malformed responses', () => {
  assert.throws(() => parseKlines({ code: -1 }, NOW), TypeError);
  assert.throws(() => parseKlines([row(5, 'oops')], NOW), TypeError);
  assert.throws(() => parseKlines([row(5, '1', '0')], NOW), TypeError);
});

test('follows pages until a short one', async () => {
  const fetchFn = fakeFetch(async (call) =>
    json(call === 1 ? Array.from({ length: 1000 }, (_, i) => row(i)) : [row(1000), row(1001)]),
  );
  const candles = await fetchCandles({ ...request, startTime: 0, endTime: 5000 }, fetchFn, NOW);
  assert.equal(candles.length, 1002);
  assert.equal(fetchFn.calls.length, 2);
  assert.equal(fetchFn.calls[1].searchParams.get('startTime'), '1000');
  assert.equal(fetchFn.calls[0].searchParams.get('symbol'), 'BTCUSDT');
});

test('a page that does not advance is an error, not an endless loop', async () => {
  const fetchFn = fakeFetch(async () => json(Array.from({ length: 1000 }, () => row(0))));
  await assert.rejects(fetchCandles({ ...request, startTime: 500 }, fetchFn, NOW), TypeError);
});

test('returns live candles when the API answers', async () => {
  const result = await loadCandles(request, fakeFetch(async () => json([row(200)])), NOW);
  assert.equal(result.source, 'live');
  assert.equal(result.interval, '1d');
  assert.equal(result.candles.length, 1);
});

test('falls back to the snapshot on an HTTP error, a network error or bad data', async () => {
  const failures = [
    async () => json({}, 451),
    async () => { throw new TypeError('network'); },
    async () => json({ code: -1 }),
  ];
  for (const api of failures) {
    const result = await loadCandles(request, fakeFetch(api), NOW);
    assert.equal(result.source, 'snapshot');
    assert.equal(result.fetchedAt, snapshot.fetchedAt);
    assert.deepEqual(result.candles, [{ time: 200, open: 2, close: 3 }]);
  }
});

test('the snapshot reports its own interval when it differs from the request', async () => {
  const result = await loadCandles({ ...request, interval: '1h' }, fakeFetch(async () => json({}, 500)), NOW);
  assert.equal(result.interval, '1d');
});

test('fails with a clear error when both sources fail', async () => {
  const fetchFn = fakeFetch(async () => json({}, 500), async () => json({}, 404));
  await assert.rejects(loadCandles(request, fetchFn, NOW), /Could not load prices/);
});

test('invalid requests are rejected without calling the API', async () => {
  const fetchFn = fakeFetch(async () => json([]));
  const bad = [
    { ...request, symbol: 'DOGEUSDT' },
    { ...request, interval: 'constructor' },
    { ...request, startTime: 300 },
    { ...request, startTime: NaN },
    { ...request, interval: '1h', startTime: 0, endTime: 5001 * 3_600_000 },
  ];
  for (const item of bad) await assert.rejects(loadCandles(item, fetchFn, NOW), RangeError);
  assert.equal(fetchFn.calls.length, 0);
});

test('the saved snapshot covers every pair with ordered, valid candles', () => {
  const saved = JSON.parse(readFileSync(new URL('../data/snapshot.json', import.meta.url)));
  assert.equal(saved.interval, '1d');
  for (const symbol of PAIRS) {
    const candles = saved.pairs[symbol];
    assert.ok(candles.length > 300, symbol);
    candles.forEach((candle, i) => {
      assert.ok(candle.open > 0 && candle.close > 0);
      if (i > 0) assert.ok(candle.time > candles[i - 1].time);
    });
  }
});
