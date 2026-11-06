import { INTERVALS, loadCandles, PAIRS } from './data.js';
import { runBacktest } from './engine.js';
import { parseForm } from './form.js';
import { summarize } from './report.js';
import { MAX_CONDITIONS } from './rules.js';

const DEFAULT_PERIOD = { sma: 50, ema: 20, rsi: 14 };
const $ = (id) => document.getElementById(id);

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
    ...rows.flatMap(([term, detail]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = detail;
      return [dt, dd];
    }),
  );
}

function sourceNote({ candles, source, interval, fetchedAt }) {
  if (source === 'live') return `${candles.length} ${interval} candles from Binance.`;
  const date = fetchedAt.slice(0, 10);
  return `Binance is unavailable, so this uses ${candles.length} saved ${interval} candles from ${date}.`;
}

async function run(event) {
  event.preventDefault();
  $('run').disabled = true;
  $('results').hidden = true;
  $('status').textContent = 'Loading prices...';
  try {
    const { request, strategy } = parseForm(readForm());
    const data = await loadCandles(request);
    if (data.candles.length === 0) {
      $('status').textContent = `${sourceNote(data)} Choose another period.`;
      return;
    }
    showSummary(summarize(runBacktest(data.candles, strategy), strategy.stake));
    $('results').hidden = false;
    $('status').textContent = sourceNote(data);
  } catch (error) {
    $('status').textContent = error.message;
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
