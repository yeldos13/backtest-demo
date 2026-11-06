import { drawEquityChart } from './chart.js';
import { INTERVALS, loadCandles, PAIRS } from './data.js';
import { runBacktest } from './engine.js';
import { parseForm } from './form.js';
import { equityCurve, summarize, tradesToCsv } from './report.js';
import { MAX_CONDITIONS } from './rules.js';

const DEFAULT_PERIOD = { sma: 50, ema: 20, rsi: 14 };
const $ = (id) => document.getElementById(id);

let lastRun = null;

function fillSelect(select, values) {
  select.append(...values.map((value) => new Option(value, value)));
}

function syncRow(row) {
  row.querySelector('.left-number').hidden = row.querySelector('.left-type').value === 'price';
  row.querySelector('.right-number').hidden = row.querySelector('.right-type').value === 'price';
}

function syncFieldset(fieldset) {
  const rows = fieldset.querySelectorAll('.condition');
  fieldset.querySelector('.add').hidden = rows.length >= MAX_CONDITIONS;
  rows.forEach((row) => { row.querySelector('.remove').hidden = rows.length === 1; });
}

function addCondition(fieldset, { leftType = 'price', op = 'crosses_above', rightType = 'sma' } = {}) {
  const row = $('condition-template').content.firstElementChild.cloneNode(true);
  row.querySelector('.left-type').value = leftType;
  row.querySelector('.left-number').value = DEFAULT_PERIOD[leftType] ?? 14;
  row.querySelector('.op').value = op;
  row.querySelector('.right-type').value = rightType;
  row.querySelector('.right-number').value = DEFAULT_PERIOD[rightType] ?? 50;

  for (const side of ['left', 'right']) {
    row.querySelector(`.${side}-type`).addEventListener('change', (event) => {
      const period = DEFAULT_PERIOD[event.target.value];
      if (period) row.querySelector(`.${side}-number`).value = period;
      syncRow(row);
    });
  }
  row.querySelector('.remove').addEventListener('click', () => {
    row.remove();
    syncFieldset(fieldset);
  });

  fieldset.querySelector('.conditions').append(row);
  syncRow(row);
  syncFieldset(fieldset);
}

const readConditions = (fieldset) =>
  [...fieldset.querySelectorAll('.condition')].map((row) => ({
    leftType: row.querySelector('.left-type').value,
    leftNumber: row.querySelector('.left-number').value,
    op: row.querySelector('.op').value,
    rightType: row.querySelector('.right-type').value,
    rightNumber: row.querySelector('.right-number').value,
  }));

const readForm = () => ({
  symbol: $('symbol').value,
  interval: $('interval').value,
  start: $('start').value,
  end: $('end').value,
  stake: $('stake').value,
  fee: $('fee').value,
  entry: readConditions($('entry')),
  exit: readConditions($('exit')),
});

const money = (value) => `${value.toFixed(2)} USDT`;

function showSummary(summary) {
  const rows = [
    ['Net profit / loss', money(summary.totalPnl)],
    ['Trades', `${summary.tradeCount} (${summary.wins} won, ${summary.losses} lost)`],
    ['Win rate', summary.winRatePct === null ? 'n/a' : `${summary.winRatePct.toFixed(1)}%`],
    ['Max drawdown', `${money(summary.maxDrawdown)} (${summary.maxDrawdownPct.toFixed(1)}%)`],
    ['Fees paid', money(summary.totalFees)],
  ];
  $('summary').replaceChildren(
    ...rows.map(([term, detail]) => {
      const group = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = detail;
      group.append(dt, dd);
      return group;
    }),
  );
}

const utc = (time) => new Date(time).toISOString().slice(0, 16).replace('T', ' ');

function showTrades(trades) {
  $('no-trades').hidden = trades.length > 0;
  $('trades-block').hidden = trades.length === 0;
  $('trades').replaceChildren(
    ...trades.map((trade) => {
      const row = document.createElement('tr');
      const cells = [
        utc(trade.entryTime),
        trade.entryPrice,
        utc(trade.exitTime),
        trade.exitPrice,
        trade.fees.toFixed(2),
        trade.pnl.toFixed(2),
        trade.exitReason === 'end' ? 'End of period' : 'Exit rule',
      ];
      row.append(...cells.map((text) => {
        const cell = document.createElement('td');
        cell.textContent = text;
        return cell;
      }));
      return row;
    }),
  );
}

// Needs a visible container, because the chart is sized to its real width.
function showChart() {
  const { trades, stake } = lastRun;
  $('equity-block').hidden = trades.length === 0;
  if (trades.length > 0) drawEquityChart($('equity-chart'), equityCurve(trades, stake), stake);
}

function downloadCsv() {
  const url = URL.createObjectURL(new Blob([tradesToCsv(lastRun.trades)], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = lastRun.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setStatus(text, kind = '') {
  $('status').textContent = text;
  $('status').dataset.kind = kind;
}

function sourceNote({ candles, source, interval, fetchedAt }, requestedInterval) {
  if (source === 'live') return `${candles.length} ${interval} candles from Binance.`;
  const swapped = interval === requestedInterval ? '' : ` instead of ${requestedInterval}`;
  const date = fetchedAt.slice(0, 10);
  return `Binance is unavailable, so this uses ${candles.length} ${interval} candles${swapped}, saved on ${date}.`;
}

async function run(event) {
  event.preventDefault();
  $('run').disabled = true;
  $('results').hidden = true;
  setStatus('Loading prices...');
  try {
    const { request, strategy } = parseForm(readForm());
    const data = await loadCandles(request);
    const note = sourceNote(data, request.interval);
    const kind = data.source === 'snapshot' ? 'warning' : '';
    if (data.candles.length === 0) {
      setStatus(`${note} Choose another period.`, kind);
      return;
    }
    const trades = runBacktest(data.candles, strategy);
    lastRun = { trades, stake: strategy.stake, fileName: `backtest-${request.symbol}-${data.interval}.csv` };
    showSummary(summarize(trades, strategy.stake));
    showTrades(trades);
    $('results').hidden = false;
    showChart();
    setStatus(note, kind);
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    $('run').disabled = false;
  }
}

fillSelect($('symbol'), PAIRS);
fillSelect($('interval'), Object.keys(INTERVALS));
$('interval').value = '1d';

const yesterday = new Date(Date.now() - 86_400_000);
const yearBefore = new Date(yesterday);
yearBefore.setUTCFullYear(yearBefore.getUTCFullYear() - 1);
$('start').value = yearBefore.toISOString().slice(0, 10);
$('end').value = yesterday.toISOString().slice(0, 10);

addCondition($('entry'));
addCondition($('exit'), { op: 'crosses_below' });
for (const fieldset of [$('entry'), $('exit')]) {
  fieldset.querySelector('.add').addEventListener('click', () => addCondition(fieldset));
}
$('form').addEventListener('submit', run);
$('download').addEventListener('click', downloadCsv);
window.addEventListener('resize', () => {
  if (!$('results').hidden) showChart();
});
