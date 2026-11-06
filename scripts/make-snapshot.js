// Refreshes data/snapshot.json, the fallback used when Binance is unreachable.
// Run from the project root: node scripts/make-snapshot.js
import { writeFileSync } from 'node:fs';
import { fetchCandles, INTERVALS, PAIRS } from '../src/data.js';

const INTERVAL = '1d';
const DAYS = 730;

const endTime = Date.now();
const startTime = endTime - DAYS * INTERVALS[INTERVAL];

const pairs = {};
for (const symbol of PAIRS) {
  pairs[symbol] = await fetchCandles({ symbol, interval: INTERVAL, startTime, endTime });
}

const snapshot = { fetchedAt: new Date(endTime).toISOString(), interval: INTERVAL, pairs };
writeFileSync(new URL('../data/snapshot.json', import.meta.url), JSON.stringify(snapshot));
