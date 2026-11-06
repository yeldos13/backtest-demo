const DAY = 86_400_000;
const MAX_PERIOD = 500;

// A blank field must not pass as 0.
const toNumber = (text) => (text.trim() === '' ? NaN : Number(text));

function operand(type, text) {
  if (type === 'price') return { type };
  const number = toNumber(text);
  if (type === 'value') {
    if (!Number.isFinite(number)) throw new RangeError('Enter a number for each condition value');
    return { type, value: number };
  }
  if (!Number.isInteger(number) || number < 1 || number > MAX_PERIOD) {
    throw new RangeError(`Indicator period must be a whole number from 1 to ${MAX_PERIOD}`);
  }
  return { type, period: number };
}

function conditions(rows, name) {
  if (rows.length === 0) throw new RangeError(`The ${name} rule needs at least one condition`);
  return rows.map(({ leftType, leftNumber, op, rightType, rightNumber }) => ({
    left: operand(leftType, leftNumber),
    op,
    right: operand(rightType, rightNumber),
  }));
}

// Turns raw form text into the inputs of loadCandles and runBacktest. The end date is inclusive.
export function parseForm({ symbol, interval, start, end, stake, fee, entry, exit }) {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end) + DAY - 1;
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) throw new RangeError('Choose both dates of the period');
  if (startTime > endTime) throw new RangeError('The start of the period must be before its end');

  const stakeValue = toNumber(stake);
  if (!(stakeValue > 0) || !Number.isFinite(stakeValue)) throw new RangeError('Stake must be greater than 0');
  const feePct = toNumber(fee);
  if (!(feePct >= 0 && feePct < 100)) throw new RangeError('Fee must be from 0 to below 100 percent');

  return {
    request: { symbol, interval, startTime, endTime },
    strategy: { entry: conditions(entry, 'entry'), exit: conditions(exit, 'exit'), stake: stakeValue, feePct },
  };
}
