import { sma, ema, rsi } from './indicators.js';

export const MAX_CONDITIONS = 3;

const INDICATORS = { sma, ema, rsi };

const OPERATORS = {
  '>': (l, r) => l > r,
  '<': (l, r) => l < r,
  crosses_above: (l, r, prevL, prevR) => prevL !== null && prevR !== null && prevL <= prevR && l > r,
  crosses_below: (l, r, prevL, prevR) => prevL !== null && prevR !== null && prevL >= prevR && l < r,
};

// An operand is { type: 'price' }, { type: 'value', value } or { type: 'sma' | 'ema' | 'rsi', period }.
function series(operand, closes) {
  if (operand?.type === 'price') return closes;
  if (operand?.type === 'value') {
    if (!Number.isFinite(operand.value)) throw new RangeError(`Invalid value: ${operand.value}`);
    return closes.map(() => operand.value);
  }
  const indicator = Object.hasOwn(INDICATORS, operand?.type) ? INDICATORS[operand.type] : null;
  if (!indicator) throw new RangeError(`Unknown operand: ${operand?.type}`);
  return indicator(closes, operand.period);
}

// Returns one boolean per candle: true when every condition holds (AND).
// No conditions means no signal, so an empty rule never opens or closes a trade.
export function evaluateRule(conditions, closes) {
  if (conditions.length > MAX_CONDITIONS) {
    throw new RangeError(`A rule can have at most ${MAX_CONDITIONS} conditions`);
  }
  const compiled = conditions.map(({ left, op, right }) => {
    if (!Object.hasOwn(OPERATORS, op)) throw new RangeError(`Unknown operator: ${op}`);
    return { test: OPERATORS[op], l: series(left, closes), r: series(right, closes) };
  });
  return closes.map((_, i) =>
    compiled.length > 0 &&
    compiled.every(({ test, l, r }) =>
      l[i] !== null && r[i] !== null && test(l[i], r[i], l[i - 1] ?? null, r[i - 1] ?? null),
    ),
  );
}
