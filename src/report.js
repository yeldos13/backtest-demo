// shortcut: equity moves only when a trade closes, so drawdown inside an open trade
// is not counted; upgrade to candle-by-candle equity if a client needs it.
export function equityCurve(trades, stake) {
  if (trades.length === 0) return [];
  let equity = stake;
  return [
    { time: trades[0].entryTime, equity },
    ...trades.map((trade) => {
      equity += trade.pnl;
      return { time: trade.exitTime, equity };
    }),
  ];
}

// The stake stays fixed even after losses, so the percentage can pass 100.
export function summarize(trades, stake) {
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  let peak = stake;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  for (const { equity } of equityCurve(trades, stake)) {
    peak = Math.max(peak, equity);
    if (peak - equity > maxDrawdown) {
      maxDrawdown = peak - equity;
      maxDrawdownPct = (maxDrawdown / peak) * 100;
    }
  }
  return {
    tradeCount: trades.length,
    wins,
    losses: trades.length - wins,
    winRatePct: trades.length > 0 ? (wins / trades.length) * 100 : null,
    totalPnl: trades.reduce((sum, trade) => sum + trade.pnl, 0),
    totalFees: trades.reduce((sum, trade) => sum + trade.fees, 0),
    maxDrawdown,
    maxDrawdownPct,
  };
}

const CSV_HEADER = 'entry_time,entry_price,exit_time,exit_price,quantity,fees,pnl,exit_reason';

// All fields are numbers, dates or the engine's own reason codes, so nothing needs quoting.
export function tradesToCsv(trades) {
  const number = (value) => Number(value.toFixed(8));
  const date = (time) => new Date(time).toISOString();
  const rows = trades.map((t) =>
    [
      date(t.entryTime),
      t.entryPrice,
      date(t.exitTime),
      t.exitPrice,
      number(t.quantity),
      number(t.fees),
      number(t.pnl),
      t.exitReason,
    ].join(','),
  );
  return [CSV_HEADER, ...rows].join('\r\n') + '\r\n';
}
