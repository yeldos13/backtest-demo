const HEIGHT = 280;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 64 };
const SVG_NS = 'http://www.w3.org/2000/svg';

const day = (time) => new Date(time).toISOString().slice(0, 10);
const amount = (value) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

// Round axis values (steps of 1, 2 or 5 times a power of ten) that enclose min and max.
export function niceTicks(min, max, count = 5) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const ratio = raw / magnitude;
  const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * magnitude;
  const low = Math.floor(min / step);
  const high = Math.max(Math.ceil(max / step), low + 1);
  return Array.from({ length: high - low + 1 }, (_, i) => Number(((low + i) * step).toPrecision(12)));
}

// Pure layout for the equity curve. The path is drawn in steps because equity changes
// only at the moment a trade closes, and a sloped line would suggest otherwise.
export function equityGeometry(curve, stake, width) {
  const times = curve.map((point) => point.time);
  const values = curve.map((point) => point.equity);
  const ticks = niceTicks(Math.min(stake, ...values), Math.max(stake, ...values));
  const low = ticks[0];
  const high = ticks[ticks.length - 1];
  const start = times[0];
  const timeSpan = times[times.length - 1] - start || 1;

  const left = MARGIN.left;
  const right = width - MARGIN.right;
  const top = MARGIN.top;
  const bottom = HEIGHT - MARGIN.bottom;
  const xOf = (time) => left + ((time - start) / timeSpan) * (right - left);
  const yOf = (value) => bottom - ((value - low) / (high - low)) * (bottom - top);

  const points = curve.map(({ time, equity }) => ({ time, equity, x: xOf(time), y: yOf(equity) }));
  const path = points
    .map((point, i) => (i === 0 ? `M${point.x} ${point.y}` : `H${point.x} V${point.y}`))
    .join(' ');

  return {
    width,
    height: HEIGHT,
    left,
    right,
    top,
    bottom,
    points,
    path,
    stakeY: yOf(stake),
    yTicks: ticks.map((value) => ({ value, y: yOf(value) })),
    xTicks: [start, start + timeSpan / 2, start + timeSpan].map((time) => ({ time, x: xOf(time) })),
  };
}

function svg(name, attributes, text) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

const INK = 'var(--text-secondary, #52514e)';
const PRIMARY = 'var(--text-primary, #0b0b0b)';
const GRID = 'var(--grid, #e4e3df)';
const SERIES = 'var(--series-1, #2a78d6)';
const SURFACE = 'var(--surface, #fcfcfb)';

export function drawEquityChart(container, curve, stake) {
  const g = equityGeometry(curve, stake, Math.max(container.clientWidth, 240));
  const first = curve[0];
  const last = curve[curve.length - 1];
  const root = svg('svg', {
    viewBox: `0 0 ${g.width} ${g.height}`,
    width: g.width,
    height: g.height,
    role: 'img',
    'aria-label': `Equity from ${amount(first.equity)} to ${amount(last.equity)} USDT between ${day(first.time)} and ${day(last.time)}. Each trade is listed in the table below.`,
    style: 'display:block;max-width:100%;touch-action:pan-y',
    'font-size': 12,
    'font-family': 'inherit',
  });

  for (const { value, y } of g.yTicks) {
    root.append(
      svg('line', { x1: g.left, x2: g.right, y1: y, y2: y, stroke: GRID }),
      svg('text', { x: g.left - 8, y: y + 4, 'text-anchor': 'end', fill: INK }, amount(value)),
    );
  }
  g.xTicks.forEach(({ time, x }, i) => {
    // Three dates do not fit side by side on a phone.
    if (i === 1 && g.right - g.left < 240) return;
    const anchor = ['start', 'middle', 'end'][i];
    root.append(svg('text', { x, y: g.height - 8, 'text-anchor': anchor, fill: INK }, day(time)));
  });

  root.append(
    svg('line', { x1: g.left, x2: g.right, y1: g.stakeY, y2: g.stakeY, stroke: INK, 'stroke-dasharray': '4 4' }),
    svg('path', { d: g.path, fill: 'none', stroke: SERIES, 'stroke-width': 2, 'stroke-linejoin': 'round' }),
  );

  const crosshair = svg('line', { y1: g.top, y2: g.bottom, stroke: INK, visibility: 'hidden' });
  const marker = svg('circle', { r: 4, fill: SERIES, stroke: SURFACE, 'stroke-width': 2, visibility: 'hidden' });
  const tipBox = svg('rect', { width: 136, height: 44, rx: 4, fill: SURFACE, stroke: GRID });
  const tipDate = svg('text', { x: 10, y: 18, fill: INK });
  const tipValue = svg('text', { x: 10, y: 35, fill: PRIMARY, 'font-weight': 600 });
  const tip = svg('g', { visibility: 'hidden' });
  tip.append(tipBox, tipDate, tipValue);
  root.append(crosshair, marker, tip);

  const setVisible = (visibility) => {
    for (const element of [crosshair, marker, tip]) element.setAttribute('visibility', visibility);
  };

  root.addEventListener('pointermove', (event) => {
    const box = root.getBoundingClientRect();
    const pointerX = ((event.clientX - box.left) / box.width) * g.width;
    // The latest close at or before the pointer is the equity at that time.
    const point = g.points.findLast(({ x }) => x <= pointerX) ?? g.points[0];
    crosshair.setAttribute('x1', point.x);
    crosshair.setAttribute('x2', point.x);
    marker.setAttribute('cx', point.x);
    marker.setAttribute('cy', point.y);
    tipDate.textContent = day(point.time);
    tipValue.textContent = `${amount(point.equity)} USDT`;
    const tipX = point.x + 146 > g.right ? point.x - 146 : point.x + 10;
    const tipY = Math.min(Math.max(point.y - 22, g.top), g.bottom - 44);
    tip.setAttribute('transform', `translate(${tipX} ${tipY})`);
    setVisible('visible');
  });
  root.addEventListener('pointerleave', () => setVisible('hidden'));

  container.replaceChildren(root);
}
