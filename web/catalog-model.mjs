import { CATALOG, FCNTX_MONTHLY, findCatalog } from './catalog-data.mjs';

const UNIT_SCALE = 1_000_000;
const START_CASH = 1_000_000;

function entryFor(id) {
  const item = findCatalog(id);
  if (!item) throw new RangeError('请选择目录中的基金。');
  return item;
}

function syntheticPrices(item) {
  const risk = { growth: 1.2, quality: .85, income: .6, bond: .24, inflation: .5, value: .65, balanced: .35 }[item.model];
  const prices = [];
  let close = 100;
  for (let day = 0; prices.length < 72; day += 1) {
    const date = new Date(Date.UTC(2026, 5, 1 + day));
    if ([0, 6].includes(date.getUTCDay())) continue;
    const index = prices.length;
    const cycle = index < 22 ? .0045 : index < 39 ? -.006 : index < 59 ? .006 : -.0008;
    let change = cycle * risk + Math.sin(index * .48 + item.allocation) * .006 * risk;
    if (item.model === 'income') change = Math.min(change, .0026);
    if (item.model === 'bond') change += .0003;
    if (item.model === 'inflation') change += index >= 23 && index <= 36 ? .005 : -.0008;
    close = Math.round(close * (1 + change) * 10000) / 10000;
    prices.push({ date: date.toISOString().slice(0, 10), close });
  }
  return prices;
}

function priceData(item, imported) {
  if (imported) {
    if (!imported || typeof imported.source !== 'string' || !imported.source.trim() || imported.source.length > 500 || !Array.isArray(imported.prices) || imported.prices.length < 4 || imported.prices.length > 3000) {
      throw new TypeError('导入文件需要 source 和 4–3000 项 prices，每项包含 date 与正数 close。');
    }
    let previous = '';
    const prices = imported.prices.map(point => {
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(point?.date) || !Number.isFinite(point.close) || point.close < .01 || point.close > 1_000_000 || point.date <= previous || Number.isNaN(Date.parse(point.date)) || new Date(point.date).toISOString().slice(0, 10) !== point.date) throw new TypeError('净值日期必须递增，价格需在 $0.01–$1,000,000 之间。');
      previous = point.date;
      return { date: point.date, close: point.close };
    });
    return { prices, source: imported.source.trim(), kind: 'imported', label: '用户导入价格 · 本地计算' };
  }
  return item.id === 'contrafund'
    ? { prices: FCNTX_MONTHLY, source: item.sources[0].url, kind: 'historical', label: 'Fidelity 官方月末净值 · 价格实验' }
    : { prices: syntheticPrices(item), source: 'Morrowfolio deterministic scenario v2', kind: 'synthetic', label: '合成情景 · 方法实验' };
}

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

function signal(item, prices) {
  const window = item.id === 'contrafund' ? 3 : 8;
  if (prices.length < window) return 0;
  const recent = prices.slice(-window);
  const trend = prices.at(-1) > mean(recent);
  if (item.model === 'bond' || item.model === 'balanced') return item.allocation;
  if (item.model === 'value') return trend ? Math.floor(item.allocation / 2) : item.allocation;
  if (item.model === 'income') return trend ? item.allocation : Math.floor(item.allocation / 2);
  return trend ? item.allocation : 0;
}

function ask(cents) { return Math.ceil(cents * 1.0005); }
function bid(cents) { return Math.floor(cents * .9995); }
function exactNumber(value) {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) throw new RangeError('价格样本导致金额超出精确模拟范围。');
  return converted;
}
function worth(units, priceCents) { return exactNumber(BigInt(units) * BigInt(priceCents) / BigInt(UNIT_SCALE)); }
function costOf(units, priceCents) { return exactNumber((BigInt(units) * BigInt(priceCents) + BigInt(UNIT_SCALE) - 1n) / BigInt(UNIT_SCALE)); }
function unitsFor(cashCents, priceCents) { return exactNumber(BigInt(cashCents) * BigInt(UNIT_SCALE) / BigInt(priceCents)); }

export function catalogBacktest(id, options = {}) {
  const item = entryFor(id);
  const data = priceData(item, options.prices ? options : null);
  const points = [];
  const trades = [];
  const closes = [];
  let cash = START_CASH;
  let units = 0;
  let target = 0;
  let peak = START_CASH;
  let maxDrawdownPercent = 0;
  const firstPrice = Math.round(data.prices[0].close * 100);
  const benchmarkUnits = unitsFor(START_CASH, ask(firstPrice));
  const benchmarkCash = START_CASH - costOf(benchmarkUnits, ask(firstPrice));
  for (const [index, point] of data.prices.entries()) {
    const price = Math.round(point.close * 100);
    const equity = cash + worth(units, price);
    const targetUnits = unitsFor(Math.floor(equity * target / 100), price);
    if (targetUnits > units) {
      const buy = Math.min(targetUnits - units, unitsFor(cash, ask(price)));
      const cost = costOf(buy, ask(price));
      if (buy > 0) {
        units += buy;
        cash -= cost;
        trades.push({ date: point.date, signalDate: data.prices[index - 1]?.date, action: 'BUY', units: buy / UNIT_SCALE, price: ask(price) / 100, cash: cash / 100 });
      }
    } else if (targetUnits < units) {
      const sell = units - targetUnits;
      cash += worth(sell, bid(price));
      units = targetUnits;
      trades.push({ date: point.date, signalDate: data.prices[index - 1]?.date, action: 'SELL', units: sell / UNIT_SCALE, price: bid(price) / 100, cash: cash / 100 });
    }
    const ending = cash + worth(units, price);
    peak = Math.max(peak, ending);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, (peak - ending) / peak * 100);
    points.push({ date: point.date, equity: ending / 100, benchmarkEquity: (benchmarkCash + worth(benchmarkUnits, price)) / 100, close: point.close, weightPercent: target });
    closes.push(point.close);
    target = signal(item, closes);
  }
  return {
    catalogId: id, kind: data.kind, source: data.source, label: data.label,
    startDate: points[0].date, endDate: points.at(-1).date, startingCash: START_CASH / 100,
    metrics: { returnPercent: (points.at(-1).equity / (START_CASH / 100) - 1) * 100, benchmarkReturnPercent: (points.at(-1).benchmarkEquity / (START_CASH / 100) - 1) * 100, maxDrawdownPercent, endingEquity: points.at(-1).equity, tradeCount: trades.length },
    points, trades,
    assumptions: [
      `规则上限 ${item.allocation}%，${item.model === 'value' ? '偏离近期均值时提高样例配置' : item.model === 'bond' || item.model === 'balanced' ? '固定比例再平衡' : '高于过去均值时提高配置'}。这是公开可复算的实验规则。`,
      '只用上一观察点已经知道的价格产生信号，在下一观察点价格成交。月频样本按下月月末成交。',
      '买卖点差各按 5 个基点计算，再向不利方向取整到美分。现金不计利息，不含派息、资本利得分配、税和其他费用。',
      '收益为样本累计价格收益。观察点之间的波动未被捕捉，回撤可能被低估。',
      '这项规则实验衡量数据与方法；尚未验证复现原基金经理的交易或原基金总收益。',
    ],
  };
}

export function catalogQuote(id) {
  const item = entryFor(id);
  const data = priceData(item);
  const last = data.prices.at(-1);
  return { catalogId: id, date: last.date, priceCents: Math.round(last.close * 100), source: data.label, kind: data.kind, currency: 'USD', environment: 'catalog-paper' };
}

function normalizedAccount(account, id) {
  if (account) {
    if (account.catalogId !== id || account.environment !== 'catalog-paper' || !Number.isSafeInteger(account.cashCents) || account.cashCents < 0 || !Number.isSafeInteger(account.unitsMicros) || account.unitsMicros < 0) throw new TypeError('模拟基金账户不匹配。');
    return structuredClone(account);
  }
  return { catalogId: id, environment: 'catalog-paper', initialCashCents: START_CASH, cashCents: START_CASH, unitsMicros: 0, history: [] };
}

function resultAccount(account, quote) {
  const marketValueCents = worth(account.unitsMicros, quote.priceCents);
  return { ...account, priceCents: quote.priceCents, quote, cash: account.cashCents / 100, units: account.unitsMicros / UNIT_SCALE, marketValue: marketValueCents / 100, equity: (account.cashCents + marketValueCents) / 100 };
}

export function catalogBuy(previous, { catalogId, amount, requestId }) {
  const quote = catalogQuote(catalogId);
  const account = normalizedAccount(previous, catalogId);
  if (typeof requestId !== 'string' || !requestId || requestId.length > 100) throw new TypeError('需要有效的交易编号。');
  if (account.history.some(trade => trade.requestId === requestId)) return resultAccount(account, quote);
  if (!Number.isFinite(amount) || amount < 10 || amount > 10000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) throw new RangeError('模拟买入金额为 $10–$10,000，最多两位小数。');
  const budget = Math.round(amount * 100);
  if (budget > account.cashCents) throw new RangeError('模拟现金不足。可先卖出持有份额。');
  const price = ask(quote.priceCents);
  const units = unitsFor(budget, price);
  const cost = costOf(units, price);
  if (!units) throw new RangeError('该金额不足以形成模拟份额。');
  account.cashCents -= cost;
  account.unitsMicros += units;
  account.history = [{ requestId, side: 'BUY', units: units / UNIT_SCALE, price: price / 100, value: cost / 100, quoteDate: quote.date, source: quote.source }, ...account.history].slice(0, 100);
  return resultAccount(account, quote);
}

export function catalogSell(previous, { catalogId, requestId }) {
  const quote = catalogQuote(catalogId);
  const account = normalizedAccount(previous, catalogId);
  if (typeof requestId !== 'string' || !requestId || requestId.length > 100) throw new TypeError('需要有效的交易编号。');
  if (account.history.some(trade => trade.requestId === requestId)) return resultAccount(account, quote);
  if (!account.unitsMicros) throw new RangeError('当前没有可卖出的模拟份额。');
  const price = bid(quote.priceCents);
  const value = worth(account.unitsMicros, price);
  account.cashCents += value;
  account.history = [{ requestId, side: 'SELL', units: account.unitsMicros / UNIT_SCALE, price: price / 100, value: value / 100, quoteDate: quote.date, source: quote.source }, ...account.history].slice(0, 100);
  account.unitsMicros = 0;
  return resultAccount(account, quote);
}

export { CATALOG, findCatalog };
