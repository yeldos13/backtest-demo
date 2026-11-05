// Each indicator returns an array as long as the input, with null during warm-up,
// so an index always refers to the same candle.

function checkPeriod(period) {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`Period must be a positive integer, got ${period}`);
  }
}

export function sma(values, period) {
  checkPeriod(period);
  const result = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

// Seeded with the SMA of the first `period` values.
export function ema(values, period) {
  checkPeriod(period);
  const result = new Array(values.length).fill(null);
  if (values.length < period) return result;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result[i] = prev;
  }
  return result;
}

// Wilder's smoothing. A completely flat window gives 50, not 100.
export function rsi(values, period) {
  checkPeriod(period);
  const result = new Array(values.length).fill(null);
  if (values.length <= period) return result;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (i >= period) {
      if (avgLoss === 0) result[i] = avgGain === 0 ? 50 : 100;
      else result[i] = 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return result;
}
