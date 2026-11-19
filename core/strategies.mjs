const STARTING_CASH_CENTS = 1_000_000;
const SESSION_COUNT = 72;
const HALF_SPREAD_BPS = 4;

export const STRATEGIES = Object.freeze([
  Object.freeze({
    id: 'innovation',
    name: 'Innovation Scout',
    category: 'Thematic growth',
    symbol: 'NVDA',
    summary: 'Follow accelerating momentum with a fixed allocation limit and a bias toward staying in cash when the signal fades.',
    mandate: 'Evaluate disruptive innovation and momentum. Buy only when the supplied evidence supports growth. Keep at most 25% in one holding and cut exposure when evidence deteriorates.',
    maxWeightPercent: 25,
    scenarioId: 'innovation-signal',
    method: 'Target 25% when four-session momentum exceeds 1% and price is above its eight-session moving average. Otherwise target 0%.',
  }),
  Object.freeze({
    id: 'core',
    name: 'Market Core',
    category: 'Broad market',
    symbol: 'SPY',
    summary: 'Use a broad-market proxy with a slower trend filter that steps down exposure during weaker periods.',
    mandate: 'Review the broad US equity market. Favor steady upward trends, hold cash when the evidence is weak, and keep the position at or below 60%.',
    maxWeightPercent: 60,
    scenarioId: 'index-rebound',
    method: 'Target 60% above the 12-session moving average, and 20% at or below it.',
  }),
  Object.freeze({
    id: 'defensive',
    name: 'Drawdown Guard',
    category: 'Risk control',
    symbol: 'NVDA',
    summary: 'Use a small risk budget and reduce exposure when price falls away from its recent peak.',
    mandate: 'Review downside risk in the existing position. Reduce exposure when the supplied evidence shows deterioration. Cap any remaining exposure at 15%.',
    maxWeightPercent: 15,
    scenarioId: 'de-risk',
    method: 'Target 15% above the eight-session moving average and within 3% of the 12-session high. Otherwise target 0%.',
  }),
]);

export const FOLLOWER_ACCOUNTS = Object.freeze([
  Object.freeze({ id: 'launch', name: 'Launch account', cash: 2_500 }),
  Object.freeze({ id: 'builder', name: 'Builder account', cash: 10_000 }),
  Object.freeze({ id: 'reserve', name: 'Reserve account', cash: 50_000 }),
]);

function dateAtSession(calendar, index) {
  const current = new Date(calendar);
  current.setUTCDate(current.getUTCDate() + index);
  return current;
}

function syntheticBars(symbol) {
  const start = Date.UTC(2026, 5, 1);
  const bars = [];
  const broadMarket = symbol === 'SPY';
  const volatility = broadMarket ? 0.48 : 1;
  let previousClose = broadMarket ? 59_800 : 11_800;
  for (let offset = 0; bars.length < SESSION_COUNT; offset += 1) {
    const date = dateAtSession(start, offset);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const index = bars.length;
    const trend = index < 18 ? 0.011 : index < 37 ? -0.010 : index < 56 ? 0.015 : -0.002;
    const gap = Math.sin(index * 1.63 + 0.4) * 0.003 * volatility;
    const movement = (trend + Math.sin(index * 0.51) * 0.009 + Math.cos(index * 1.17) * 0.004) * volatility;
    const open = Math.round(previousClose * (1 + gap));
    const close = Math.round(open * (1 + movement));
    bars.push({ date: date.toISOString().slice(0, 10), open, close });
    previousClose = close;
  }
  return bars;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function targetFromClose(strategy, closes) {
  const lastClose = closes.at(-1);
  if (strategy.id === 'innovation' && closes.length >= 8) {
    const momentum = lastClose / closes.at(-5) - 1;
    return momentum > 0.01 && lastClose > mean(closes.slice(-8)) ? 25 : 0;
  }
  if (closes.length < 12) return null;
  if (strategy.id === 'core') return lastClose > mean(closes.slice(-12)) ? 60 : 20;
  const nearPeak = lastClose / Math.max(...closes.slice(-12)) >= 0.97;
  return nearPeak && lastClose > mean(closes.slice(-8)) ? 15 : 0;
}

function askPrice(open) {
  return Math.ceil(open * (10_000 + HALF_SPREAD_BPS) / 10_000);
}

function bidPrice(open) {
  return Math.floor(open * (10_000 - HALF_SPREAD_BPS) / 10_000);
}

function rebalance(book, bar, targetWeight) {
  const openingEquity = book.cash + book.shares * bar.open;
  const targetValue = Math.floor(openingEquity * targetWeight / 100);
  const currentValue = book.shares * bar.open;
  if (targetValue > currentValue) {
    const price = askPrice(bar.open);
    const budget = Math.min(book.cash, targetValue - currentValue);
    const quantity = Math.floor(budget / price);
    if (!quantity) return null;
    book.cash -= quantity * price;
    book.shares += quantity;
    return { action: 'BUY', quantity, price: price / 100 };
  }
  const quantity = Math.max(0, book.shares - Math.floor(targetValue / bar.open));
  if (!quantity) return null;
  const price = bidPrice(bar.open);
  book.cash += quantity * price;
  book.shares -= quantity;
  return { action: 'SELL', quantity, price: price / 100 };
}

export function backtestStrategy(strategyId) {
  const strategy = STRATEGIES.find(({ id }) => id === strategyId);
  if (!strategy) throw new RangeError('Unknown strategy.');

  const bars = syntheticBars(strategy.symbol);
  const book = { cash: STARTING_CASH_CENTS, shares: 0 };
  const benchmark = { ...book };
  rebalance(benchmark, bars[0], 100);
  const points = [];
  const trades = [];
  const closes = [];
  let activeTarget = null;
  let nextTarget = null;
  let peak = STARTING_CASH_CENTS;
  let maxDrawdownPercent = 0;

  for (const [index, bar] of bars.entries()) {
    if (nextTarget !== null && nextTarget !== activeTarget) {
      const order = rebalance(book, bar, nextTarget);
      activeTarget = nextTarget;
      if (order) {
        trades.push({
          ...order,
          date: bar.date,
          signalDate: bars[index - 1].date,
          cash: book.cash / 100,
          equity: (book.cash + book.shares * bar.open) / 100,
        });
      }
    }
    const equity = book.cash + book.shares * bar.close;
    const benchmarkEquity = benchmark.cash + benchmark.shares * bar.close;
    peak = Math.max(peak, equity);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, (peak - equity) / peak * 100);
    points.push({
      date: bar.date,
      close: bar.close / 100,
      equity: equity / 100,
      benchmarkEquity: benchmarkEquity / 100,
      weightPercent: book.shares * bar.close / equity * 100,
    });
    closes.push(bar.close);
    nextTarget = targetFromClose(strategy, closes);
  }

  const first = points[0];
  const last = points.at(-1);
  const startingCash = STARTING_CASH_CENTS / 100;
  return {
    strategyId,
    symbol: strategy.symbol,
    source: 'Fundroom synthetic market replay',
    startDate: first.date,
    endDate: last.date,
    startingCash,
    metrics: {
      returnPercent: (last.equity / startingCash - 1) * 100,
      benchmarkReturnPercent: (last.benchmarkEquity / startingCash - 1) * 100,
      maxDrawdownPercent,
      tradeCount: trades.length,
      endingEquity: last.equity,
    },
    points,
    trades,
    assumptions: [
      `${SESSION_COUNT} generated weekday sessions. Tickers label illustrative instruments; prices and dates are synthetic.`,
      'The strategy reads closes through the signal date. A changed target fills at the following session’s open.',
      'Whole shares, simulated 4 basis-point half-spread and no commissions, taxes, interest or dividends.',
      'The comparison buys as many whole shares as it can afford at the first opening ask and holds them until the end.',
      'The target governs trade sizing. Market moves can change the weight between trades.',
    ],
  };
}
