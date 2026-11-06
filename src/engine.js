import { evaluateRule } from './rules.js';

// Long only, one position at a time, a fixed stake per trade.
// Signals are read at a candle's close and filled at the next candle's open,
// so a trade never uses a price that was unknown when the signal fired.
// A position still open at the end is closed at the last close.
export function runBacktest(candles, { entry, exit, stake, feePct }) {
  if (!Number.isFinite(stake) || stake <= 0) throw new RangeError(`Invalid stake: ${stake}`);
  if (!Number.isFinite(feePct) || feePct < 0 || feePct >= 100) throw new RangeError(`Invalid fee: ${feePct}`);

  const closes = candles.map((candle) => candle.close);
  const entrySignals = evaluateRule(entry, closes);
  const exitSignals = evaluateRule(exit, closes);
  const feeRate = feePct / 100;

  const trades = [];
  let position = null;

  const closePosition = (exitTime, exitPrice, exitReason) => {
    const fees = (stake + position.quantity * exitPrice) * feeRate;
    const pnl = position.quantity * (exitPrice - position.entryPrice) - fees;
    trades.push({ ...position, exitTime, exitPrice, exitReason, fees, pnl });
    position = null;
  };

  for (let i = 0; i < candles.length - 1; i++) {
    const next = candles[i + 1];
    if (position && exitSignals[i]) {
      closePosition(next.time, next.open, 'signal');
    } else if (!position && entrySignals[i]) {
      position = { entryTime: next.time, entryPrice: next.open, quantity: stake / next.open };
    }
  }

  if (position) {
    const last = candles[candles.length - 1];
    closePosition(last.time, last.close, 'end');
  }
  return trades;
}
