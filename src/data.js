// Market-data-only host: no key needed and open to browser requests.
const API_URL = 'https://data-api.binance.vision/api/v3/klines';
const SNAPSHOT_URL = new URL('../data/snapshot.json', import.meta.url);
const PAGE_SIZE = 1000;
const TIMEOUT_MS = 10_000;
const HOUR = 3_600_000;

export const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
export const INTERVALS = { '1h': HOUR, '4h': 4 * HOUR, '1d': 24 * HOUR };
export const MAX_CANDLES = 5000;

// A kline row is [openTime, open, high, low, close, volume, closeTime, ...], with prices as strings.
// Candles still forming are dropped: their close is not final and would move results between runs.
export function parseKlines(rows, now = Date.now()) {
  if (!Array.isArray(rows)) throw new TypeError('Unexpected price response');
  return rows
    .filter((row) => row[6] < now)
    .map((row) => {
      const candle = { time: row[0], open: Number(row[1]), close: Number(row[4]) };
      if (!Number.isFinite(candle.time) || !(candle.open > 0) || !(candle.close > 0)) {
        throw new TypeError('Unexpected price response');
      }
      return candle;
    });
}

export async function fetchCandles({ symbol, interval, startTime, endTime }, fetchFn = fetch, now = Date.now()) {
  const candles = [];
  let cursor = startTime;
  while (true) {
    const query = new URLSearchParams({ symbol, interval, startTime: cursor, endTime, limit: PAGE_SIZE });
    const response = await fetchFn(`${API_URL}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Price request failed with status ${response.status}`);
    const rows = await response.json();
    candles.push(...parseKlines(rows, now));
    if (rows.length < PAGE_SIZE) return candles;
    const lastTime = rows[rows.length - 1][0];
    if (lastTime < cursor) throw new TypeError('Unexpected price response');
    cursor = lastTime + 1;
  }
}

async function loadSnapshot({ symbol, startTime, endTime }, fetchFn) {
  const response = await fetchFn(SNAPSHOT_URL);
  if (!response.ok) throw new Error(`Snapshot request failed with status ${response.status}`);
  const { interval, fetchedAt, pairs } = await response.json();
  const candles = pairs[symbol].filter(({ time }) => time >= startTime && time <= endTime);
  return { candles, source: 'snapshot', interval, fetchedAt };
}

// Falls back to the saved snapshot when Binance is unreachable or blocked for this visitor.
// The snapshot holds daily candles only, so check the returned interval: it can differ from the request.
export async function loadCandles(request, fetchFn = fetch, now = Date.now()) {
  const { symbol, interval, startTime, endTime } = request;
  if (!PAIRS.includes(symbol)) throw new RangeError(`Unknown pair: ${symbol}`);
  if (!Object.hasOwn(INTERVALS, interval)) throw new RangeError(`Unknown interval: ${interval}`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime) {
    throw new RangeError('The start of the period must be before its end');
  }
  if ((endTime - startTime) / INTERVALS[interval] > MAX_CANDLES) {
    throw new RangeError(`The period is too long: the limit is ${MAX_CANDLES} candles`);
  }

  try {
    return { candles: await fetchCandles(request, fetchFn, now), source: 'live', interval };
  } catch {
    try {
      return await loadSnapshot(request, fetchFn);
    } catch {
      throw new Error('Could not load prices from Binance or from the saved snapshot');
    }
  }
}
