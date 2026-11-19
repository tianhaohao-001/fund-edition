import { deskAssignment } from './staffing.mjs';

export const CONTRACT_VERSION = 'fundroom.decision.v1';

const SYNTHETIC = 'Fundroom synthetic market replay';
const POLICY_SOURCE = 'Independent paper order policy';
const PENNIES_PER_DOLLAR = 100;
const DEFAULT_CASH_CENTS = 1_000_000;
const MAX_QUOTE_AGE_SECONDS = 60;
const PERCENT_SCALE = 10_000;
const FULL_WEIGHT = BigInt(100 * PERCENT_SCALE);

function scenario(data) {
  return Object.freeze({
    source: SYNTHETIC,
    synthetic: true,
    marketOpen: true,
    returnHurdle: 15,
    ...data,
    series: Object.freeze(data.series),
    quote: data.quote ? Object.freeze({ asOf: data.asOf, ...data.quote }) : null,
  });
}

export const SCENARIOS = Object.freeze([
  scenario({
    id: 'innovation-signal',
    title: 'AI demand accelerates',
    summary: 'The synthetic growth and valuation estimates clear the strategy hurdle.',
    symbol: 'NVDA', asOf: '2026-11-16T16:35:00.000Z',
    series: [133.2, 134.6, 133.8, 135.3, 135, 137.2, 137.1, 138.6, 138.3, 140],
    quote: { bid: 139.97, ask: 140.03 }, modeledReturn: 19, demandGrowth: 28,
  }),
  scenario({
    id: 'thin-evidence',
    title: 'Valuation needs more evidence',
    summary: 'Demand is positive, but the synthetic valuation falls short of the strategy hurdle.',
    symbol: 'NVDA', asOf: '2026-11-16T17:15:00.000Z',
    series: [139.6, 140, 140.5, 141.1, 140.9, 143.2, 143.6, 143.1, 144.9, 145.1],
    quote: { bid: 145.07, ask: 145.13 }, modeledReturn: 10, demandGrowth: 16,
  }),
  scenario({
    id: 'de-risk',
    title: 'Growth thesis breaks',
    summary: 'The synthetic demand estimate turns negative. Try this after buying NVDA to see an exit.',
    symbol: 'NVDA', asOf: '2026-11-17T16:35:00.000Z',
    series: [145.1, 144.3, 143.9, 142.1, 142.5, 140.4, 139.8, 138.2, 136.2, 134.5],
    quote: { bid: 134.47, ask: 134.53 }, modeledReturn: -5, demandGrowth: -8,
  }),
  scenario({
    id: 'stale-quote',
    title: 'Strong thesis, stale quote',
    summary: 'The investment signal is positive, but the synthetic quote is 17 minutes old.',
    symbol: 'NVDA', asOf: '2026-11-17T17:00:00.000Z',
    series: [134.5, 134.2, 135.5, 135.2, 136.6, 137.1, 137.8, 138.2, 138.9, 140],
    quote: { bid: 139.97, ask: 140.03, asOf: '2026-11-17T16:43:00.000Z' },
    modeledReturn: 21, demandGrowth: 25,
  }),
  scenario({
    id: 'closed-market',
    title: 'After the close',
    summary: 'The synthetic quote is present and current, but the regular session has ended.',
    symbol: 'AAPL', asOf: '2026-11-17T21:05:00.000Z', marketOpen: false,
    series: [222.8, 221.9, 222.6, 223.3, 223.2, 223.8, 224.1, 224.4, 224.1, 224.5],
    quote: { bid: 224.48, ask: 224.52 }, modeledReturn: 17, demandGrowth: 14,
  }),
  scenario({
    id: 'missing-quote',
    title: 'Quote unavailable',
    summary: 'The synthetic price history is available, but the current bid and ask are missing.',
    symbol: 'MSFT', asOf: '2026-11-17T19:00:00.000Z',
    series: [402.3, 403.5, 405.1, 404.5, 405.8, 406, 405.3, 407.4, 408.1, 408.6],
    quote: null, modeledReturn: 18, demandGrowth: 22,
  }),
  scenario({
    id: 'index-rebound',
    title: 'Broad market rebounds',
    summary: 'A synthetic broad market scenario with an eligible quote and a positive return estimate.',
    symbol: 'SPY', asOf: '2026-11-17T18:30:00.000Z',
    series: [568.2, 568.8, 570.2, 569.8, 571.5, 573.3, 573.9, 573.7, 574.1, 575.1],
    quote: { bid: 575.08, ask: 575.12 }, modeledReturn: 16, demandGrowth: 6,
  }),
]);

const SCENARIO_BY_ID = new Map(SCENARIOS.map((item) => [item.id, item]));
const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/u;
const KNOWN_TICKERS = /\b(?:AAPL|AMD|AMZN|ARKK|DIA|GOOG|GOOGL|IWM|META|MSFT|NVDA|QQQ|SPY|TSLA|VTI|VOO|VYM|VCIT|VWELX)\b/gu;
const CAP_TEXT = /(?:\b(?:no more than|at most|up to|max(?:imum)?(?:\s+(?:position(?:\s+size)?|weight|allocation))?(?:\s+of)?|cap(?:\s+(?:the\s+)?(?:position|allocation|weight))?\s+at|under|below)\s+|(?:不超过|不得超过|最多|上限(?:为)?|最高)\s*)(\d{1,3}(?:[.,]\d+)?)\s*%/giu;
const NO_TRADES = /(?:\b(?:do not|don['’]?t|never) (?:trade|execute|place orders?)\b|\bno (?:trades?|orders?)\b|\b(?:hold (?:cash|only|everything)|only hold|stay in cash)\b|(?:不要|不许|禁止|不得|别)(?:交易|下单)|保持空仓|只持有现金|不交易|不下单|^(?:hold|wait|observe)[.!]?\s*$)/iu;
const NO_BUYS = /(?:\b(?:do not|don['’]?t|never) buy\b|\bno (?:buys?|buying)\b|(?:不要|不许|禁止|不得|别)买(?:入)?|不买(?:入)?)/iu;
const NO_SELLS = /(?:\b(?:do not|don['’]?t|never) sell\b|\bno (?:sells?|selling)\b|(?:不要|不许|禁止|不得|别)卖(?:出)?|不卖(?:出)?)/iu;

export function readMandate(mandate, symbol) {
  const text = String(mandate ?? '').normalize('NFKC').trim();
  const upper = text.toUpperCase();
  const caps = [...text.matchAll(CAP_TEXT)]
    .map((match) => Number(match[1].replace(',', '.')))
    .filter((cap) => cap <= 100);
  const tickers = new Set([
    ...[...upper.matchAll(/\$([A-Z][A-Z0-9.-]{0,9})\b/gu)].map((match) => match[1]),
    ...[...upper.matchAll(KNOWN_TICKERS)].map((match) => match[0]),
  ]);
  const token = symbol.replaceAll('.', '\\.');
  const exclude = new RegExp(`(?:\\b(?:no|exclude|except|instead of|avoid(?: buying)?)\\s+|(?:排除|不碰|避开)\\s*)\\$?${token}\\b`, 'iu');
  const restrictTickers = /\b(?:only|exclusively|restrict(?:ed)? to|limit(?:ed)? to)\b|只(?:买|投资|交易)|仅(?:买|投资|交易)/iu.test(text);
  return {
    cap: caps.length ? Math.min(...caps) : 100,
    noTrades: NO_TRADES.test(text),
    noBuys: NO_BUYS.test(text),
    noSells: NO_SELLS.test(text),
    allowedSymbol: !exclude.test(text) && (!restrictTickers || !tickers.size || tickers.has(symbol)),
  };
}

function dollars(cents) {
  return cents / PENNIES_PER_DOLLAR;
}

function integer(value, label, allowNegative = false) {
  if (!Number.isSafeInteger(value) || (!allowNegative && value < 0)) {
    throw new TypeError(`${label} must be a safe ${allowNegative ? '' : 'nonnegative '}integer.`);
  }
  return value;
}

function toCents(amount, label, allowNegative = false) {
  if (!Number.isFinite(amount)) throw new TypeError(`${label} must be a finite amount in dollars.`);
  const scaled = amount * PENNIES_PER_DOLLAR;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-7) throw new TypeError(`${label} must use whole cents.`);
  return integer(rounded, label, allowNegative);
}

function money(record, field, fallback, allowNegative = false) {
  const cents = record[`${field}Cents`];
  if (cents !== undefined) return integer(cents, `${field}Cents`, allowNegative);
  if (record[field] !== undefined) return toCents(record[field], field, allowNegative);
  return fallback;
}

function readPortfolio(portfolio) {
  const cash = money(portfolio, 'cash', DEFAULT_CASH_CENTS);
  const positions = new Map();
  if (portfolio.positions !== undefined && !Array.isArray(portfolio.positions)) {
    throw new TypeError('Portfolio positions must be an array.');
  }
  for (const entry of portfolio.positions ?? []) {
    const symbol = entry?.symbol;
    if (!TICKER.test(symbol) || positions.has(symbol)) throw new TypeError('Each position requires a unique ticker.');
    const quantity = integer(entry.quantity, 'position quantity');
    if (quantity === 0) continue;
    const marketValue = money(entry, 'marketValue', 0);
    const mark = money(entry, 'mark', Math.round(marketValue / quantity));
    if (mark <= 0) throw new TypeError('Each position requires a positive price mark.');
    const cost = money(entry, 'cost', integer(mark * quantity, 'position value'));
    positions.set(symbol, { quantity, mark, cost, asOf: entry.markAsOf ?? null });
  }
  const book = { cash, positions, realized: money(portfolio, 'realizedPnl', 0, true) };
  book.initialCash = money(portfolio, 'initialCash', equity(book));
  return book;
}

function equity(book) {
  const invested = [...book.positions.values()].reduce((sum, item) => sum + item.mark * item.quantity, 0);
  return integer(book.cash + invested, 'portfolio equity');
}

function presentPortfolio(book) {
  const endingEquity = equity(book);
  let unrealized = 0;
  const positions = [...book.positions].sort(([left], [right]) => left.localeCompare(right)).map(([symbol, item]) => {
    const marketValue = item.quantity * item.mark;
    const pnl = marketValue - item.cost;
    unrealized += pnl;
    return {
      symbol, quantity: item.quantity, mark: dollars(item.mark), markCents: item.mark, markAsOf: item.asOf,
      marketValue: dollars(marketValue), marketValueCents: marketValue, cost: dollars(item.cost), costCents: item.cost,
      unrealizedPnl: dollars(pnl), unrealizedPnlCents: pnl,
      weightPercent: endingEquity ? marketValue / endingEquity * 100 : 0,
    };
  });
  const pnl = endingEquity - book.initialCash;
  return {
    cash: dollars(book.cash), cashCents: book.cash, equity: dollars(endingEquity), equityCents: endingEquity,
    initialCash: dollars(book.initialCash), initialCashCents: book.initialCash,
    totalPnl: dollars(pnl), totalPnlCents: pnl,
    realizedPnl: dollars(book.realized), realizedPnlCents: book.realized,
    unrealizedPnl: dollars(unrealized), unrealizedPnlCents: unrealized,
    returnPercent: book.initialCash ? pnl / book.initialCash * 100 : null,
    positions,
  };
}

function readQuote(fixture) {
  if (!fixture.quote) return null;
  const bid = toCents(fixture.quote.bid, 'bid');
  const ask = toCents(fixture.quote.ask, 'ask');
  if (bid <= 0 || bid > ask) return null;
  const age = (Date.parse(fixture.asOf) - Date.parse(fixture.quote.asOf)) / 1_000;
  return {
    bid, ask, age, mark: bid + Math.round((ask - bid) / 2),
    fresh: Number.isFinite(age) && age >= 0 && age <= MAX_QUOTE_AGE_SECONDS,
  };
}

const DEFAULT_TEAM = Object.freeze([
  { role: 'research', name: 'Equity Research' },
  { role: 'risk', name: 'Portfolio Risk' },
  { role: 'trader', name: 'Execution Trader' },
  { role: 'quant', name: 'Quant Research' },
]);

function analyze(fixture, quote, cap, restrictions, team, portfolio) {
  const clearsHurdle = fixture.modeledReturn >= fixture.returnHurdle;
  const weakThesis = fixture.modeledReturn <= 0;
  const quoteEligible = Boolean(quote?.fresh && fixture.marketOpen);
  const priceMove = (fixture.series.at(-1) / fixture.series[0] - 1) * 100;
  const currentExposure = portfolio.positions.find(({ symbol }) => symbol === fixture.symbol)?.weightPercent ?? 0;
  const messages = {
    research: {
      sentiment: weakThesis ? 'bearish' : clearsHurdle ? 'bullish' : 'neutral',
      summary: `The replay estimates ${fixture.demandGrowth}% demand growth and a ${fixture.modeledReturn}% five-year annualized return. The hurdle is ${fixture.returnHurdle}%.`,
    },
    risk: {
      sentiment: restrictions.noTrades || !restrictions.allowedSymbol || !quoteEligible ? 'caution' : 'neutral',
      summary: `The effective single-position cap is ${cap}%. ${restrictions.noTrades || !restrictions.allowedSymbol ? 'The mandate blocks trading in this scenario.' : 'The simulator checks projected exposure, available cash and held shares.'}`,
    },
    trader: {
      sentiment: quoteEligible ? 'ready' : 'caution',
      summary: quoteEligible
        ? `The replay market is open. A buy uses the $${dollars(quote.ask).toFixed(2)} ask and a sell uses the $${dollars(quote.bid).toFixed(2)} bid.`
        : 'The replay market or quote fails an execution requirement. See the independent policy checks.',
    },
    quant: {
      sentiment: priceMove >= 0 ? 'bullish' : 'bearish',
      summary: `${fixture.symbol} is ${currentExposure.toFixed(2)}% of the portfolio before the order. Keep any new allocation within the ${cap}% cap. The replay price moved ${priceMove.toFixed(2)}% across this window.`,
    },
  };
  return (team ?? DEFAULT_TEAM).flatMap(member => {
    const assignmentRole = deskAssignment(member);
    if (!Object.hasOwn(messages, assignmentRole)) return [];
    return [{
      ...(member.id === undefined ? {} : { id: member.id }),
      role: member.role, assignmentRole, name: member.name || member.role, duty: member.duty ?? null, desk: member.desk ?? null,
      source: 'Deterministic replay', ...messages[assignmentRole],
    }];
  });
}

function deterministicDecision(fixture, restrictions, cap, mode) {
  const common = { symbol: fixture.symbol, source: 'Deterministic replay' };
  if (restrictions.noTrades || !restrictions.allowedSymbol) {
    return {
      ...common, action: 'HOLD', targetWeightPercent: 0,
      summary: `The mandate does not allow a ${fixture.symbol} order in this scenario.`,
      reconsider: 'Review a permitted ticker or change the mandate.',
    };
  }
  if (fixture.modeledReturn <= 0 && !restrictions.noSells) {
    return {
      ...common, action: 'SELL', targetWeightPercent: 0,
      summary: `The modeled return fell to ${fixture.modeledReturn}% and demand growth to ${fixture.demandGrowth}%. Exit any existing ${fixture.symbol} position.`,
      reconsider: 'Revisit the thesis if synthetic demand and modeled return recover.',
    };
  }
  if (fixture.modeledReturn <= 0 && restrictions.noSells) {
    return {
      ...common, action: 'HOLD', targetWeightPercent: 0,
      summary: 'The investment thesis weakened, and the mandate prohibits a sale.',
      reconsider: 'Review the position if the mandate permits a sale or the investment thesis recovers.',
    };
  }
  if (fixture.modeledReturn >= fixture.returnHurdle && cap > 0 && !restrictions.noBuys) {
    const targetWeightPercent = Math.min(mode === 'shared' ? 8 : 10, cap);
    return {
      ...common, action: 'BUY', targetWeightPercent,
      summary: `The modeled return of ${fixture.modeledReturn}% clears the ${fixture.returnHurdle}% hurdle. Target a ${targetWeightPercent}% position.`,
      reconsider: 'Reassess if the demand signal weakens, valuation rises or the mandate changes.',
    };
  }
  return {
    ...common, action: 'HOLD', targetWeightPercent: 0,
    summary: restrictions.noBuys || cap === 0
      ? 'The mandate or position cap rules out a buy.'
      : `The modeled return of ${fixture.modeledReturn}% falls below the ${fixture.returnHurdle}% hurdle.`,
    reconsider: 'Reevaluate after a material change in evidence or portfolio limits.',
  };
}

function importedDecision(proposal, fixture) {
  const action = typeof proposal?.action === 'string' ? proposal.action.toUpperCase() : '';
  const symbol = typeof proposal?.symbol === 'string' ? proposal.symbol : '';
  const target = proposal?.targetWeightPercent;
  const summary = typeof proposal?.summary === 'string' ? proposal.summary.trim().slice(0, 800) : '';
  const condition = proposal?.reconsider ?? proposal?.whatWouldChange;
  const reconsider = typeof condition === 'string' ? condition.trim().slice(0, 800) : '';
  return {
    action, symbol, targetWeightPercent: Number.isFinite(target) ? target : null,
    summary: summary || 'The manager returned a proposal that requires policy validation.',
    reconsider: reconsider || 'Review the proposal and its policy checks.',
    source: 'Manager proposal',
    valid: ['BUY', 'SELL', 'HOLD'].includes(action) && TICKER.test(symbol) && Boolean(summary && reconsider)
      && Number.isFinite(target) && target >= 0 && target <= 100
      && (action !== 'BUY' || target > 0) && (action !== 'HOLD' || target === 0)
      && Boolean(fixture),
  };
}

function evidence(fixture, quote, cap, restrictions, permissions) {
  const item = (id, label, value, source = fixture.source, asOf = fixture.asOf) => ({ id, label, value, source, asOf });
  return [
    item('demand', 'Normalized demand growth', `${fixture.demandGrowth}%`),
    item('returns', 'Modeled five-year annualized return', `${fixture.modeledReturn}%`),
    item('hurdle', 'Strategy return hurdle', `${fixture.returnHurdle}%`, 'Replay strategy rule'),
    item('quote', 'Replay bid / ask', quote ? `$${dollars(quote.bid).toFixed(2)} / $${dollars(quote.ask).toFixed(2)}` : 'Unavailable', fixture.source, fixture.quote?.asOf ?? null),
    item('quote-age', 'Replay quote age', quote ? `${quote.age} seconds` : 'Unavailable', fixture.source, fixture.quote?.asOf ?? null),
    item('cap', 'Effective single-position cap', `${cap}%`, 'Portfolio settings and mandate'),
    item('authorization', 'Order authorization', `${permissions.allowBuy ? 'Buy enabled' : 'Buy disabled'} · ${permissions.allowSell ? 'Sell enabled' : 'Sell disabled'} · ${permissions.allowedSymbols.join(', ') || 'All replay tickers'}`, 'Fund settings'),
    item('mandate', 'Mandate permissions', restrictions.noTrades || !restrictions.allowedSymbol
      ? 'Orders restricted for this scenario'
      : `${restrictions.noBuys ? 'Buys restricted' : 'Buys permitted'} · ${restrictions.noSells ? 'Sells restricted' : 'Sells permitted'}`, 'User mandate'),
  ];
}

function result(status, code, reason, symbol, side = null, fill = null) {
  return {
    status, code, reason, symbol, side,
    quantity: fill?.quantity ?? 0,
    price: fill ? dollars(fill.price) : null,
    priceCents: fill?.price ?? null,
    fee: 0, feeCents: 0, costBasis: 'synthetic-bid-ask-no-separate-commission',
    notional: fill ? dollars(fill.notional) : null,
    notionalCents: fill?.notional ?? null,
    realizedPnl: fill ? dollars(fill.realized) : null,
    realizedPnlCents: fill?.realized ?? null,
  };
}

function allowOrder({ fixture, quote, decision, book, restrictions, cap, checks }) {
  const { action, symbol, targetWeightPercent: target } = decision;
  const buy = action === 'BUY';
  const side = buy || action === 'SELL' ? action : null;
  const check = (id, label, okay, detail) => checks.push({ id, label, status: okay ? 'pass' : 'block', detail });
  const blocked = (code, reason) => result('blocked', code, reason, fixture.symbol, side);
  const valid = decision.valid !== false;
  check('proposal', 'Proposal format', valid, valid ? 'The proposal has a supported action and target.' : 'The manager proposal could not be validated.');
  if (!valid) return blocked('invalid-proposal', 'The manager proposal could not be validated.');

  const symbolCovered = fixture.symbol === symbol;
  check('symbol', 'Ticker coverage', symbolCovered, symbolCovered ? `${symbol} is covered by this replay.` : 'The proposal names a ticker outside this replay.');
  if (!symbolCovered) return blocked('symbol-mismatch', 'The proposal names a ticker outside this replay.');
  if (!side) {
    checks.push({ id: 'execution', label: 'Order eligibility', status: 'skipped', detail: 'A hold does not place an order.' });
    return result('held', 'manager-hold', 'The manager chose to hold the portfolio.', symbol);
  }

  const permitted = restrictions.allowedSymbol && !restrictions.noTrades && (buy ? !restrictions.noBuys : !restrictions.noSells);
  const validTarget = target <= cap;
  check('mandate', 'Mandate permissions', permitted, permitted ? 'The mandate permits this action.' : 'The mandate blocks this action.');
  check('target', 'Target position limit', validTarget, `Proposed target ${target}% · Effective cap ${cap}%.`);
  check('session', 'Market session', fixture.marketOpen, fixture.marketOpen ? 'Regular replay session is open.' : 'Regular replay session is closed.');
  check('quote', 'Bid and ask', Boolean(quote), quote ? 'Both sides of the replay quote are available.' : 'There is no valid bid and ask.');
  if (quote) check('quote-age', 'Quote freshness', quote.fresh, `Quote age ${quote.age} seconds · Maximum ${MAX_QUOTE_AGE_SECONDS} seconds.`);
  else checks.push({ id: 'quote-age', label: 'Quote freshness', status: 'skipped', detail: 'No quote was available to time.' });

  if (!permitted) return blocked('mandate-restricted', 'The mandate blocks this order.');
  if (!validTarget) return blocked('target-over-limit', 'The proposed target exceeds the effective position cap.');
  if (!fixture.marketOpen) return blocked('market-closed', 'The regular replay session is closed.');
  if (!quote) return blocked('quote-missing', 'A valid replay bid and ask are required.');
  if (!quote.fresh) return blocked('quote-stale', 'The replay quote is stale.');

  const { mark } = quote;
  const price = buy ? quote.ask : quote.bid;
  const position = book.positions.get(symbol);
  const shares = position?.quantity ?? 0;
  const targetWeight = BigInt(Math.floor(target * PERCENT_SCALE));
  const limitWeight = BigInt(Math.floor(cap * PERCENT_SCALE));
  const currentEquity = equity(book);
  const holdingValue = shares * mark;
  // Solve the target using post-fill equity. The spread changes the denominator.
  const denominator = BigInt(mark) * (FULL_WEIGHT - targetWeight) + BigInt(price) * targetWeight;
  const change = BigInt(currentEquity) * targetWeight - BigInt(holdingValue) * FULL_WEIGHT;
  const needsRebalance = buy ? change > 0n : change < 0n;
  const quantity = needsRebalance ? Number(buy ? change / denominator : (-change + denominator - 1n) / denominator) : 0;

  if (!buy && shares === 0) {
    check('shares', 'Shares available', false, 'There is no long position in this ticker.');
    return blocked('no-holdings', 'The account has no shares available to sell.');
  }
  if (buy && shares === 0 && quantity === 0) {
    check('whole-share', 'Whole-share sizing', false, 'The target is too small for one share.');
    return blocked('target-below-one-share', 'The account cannot allocate one whole share within this target.');
  }
  if (quantity === 0) {
    check('whole-share', 'Whole-share sizing', true, 'The existing whole-share position needs no order at this target.');
    return result('held', 'already-at-target', 'The existing whole-share position needs no order at this target.', symbol);
  }

  const notional = integer(quantity * price, 'order notional');
  const cash = book.cash + (buy ? -notional : notional);
  const sharesAfter = shares + (buy ? quantity : -quantity);
  const nextHoldingValue = sharesAfter * mark;
  const nextEquity = BigInt(currentEquity) + BigInt(cash - book.cash) + BigInt(nextHoldingValue - holdingValue);
  const withinLimit = nextEquity >= 0n && BigInt(nextHoldingValue) * FULL_WEIGHT <= nextEquity * limitWeight;
  check('cash', 'Cash available', cash >= 0, cash >= 0 ? 'Cash stays nonnegative after the order.' : 'The order exceeds available cash.');
  check('shares', 'Shares available', sharesAfter >= 0, sharesAfter >= 0 ? 'The order leaves a nonnegative position.' : 'The order exceeds shares held.');
  check('exposure', 'Post-order position limit', withinLimit, withinLimit ? `The order stays within the ${cap}% cap.` : `The order would exceed the ${cap}% cap.`);
  if (cash < 0) return blocked('cash-insufficient', 'The account has insufficient cash for the proposed order.');
  if (sharesAfter < 0) return blocked('shares-insufficient', 'Short sales are disabled in this simulator.');
  if (!withinLimit) return blocked('position-over-limit', 'The post-order position exceeds the effective cap.');

  const oldCost = position?.cost ?? 0;
  const costReleased = buy ? 0 : Number(BigInt(oldCost) * BigInt(quantity) / BigInt(shares));
  const realized = buy ? 0 : notional - costReleased;
  const cost = integer(oldCost + (buy ? notional : -costReleased), 'remaining cost basis');
  book.cash = integer(cash, 'ending cash');
  book.realized = integer(book.realized + realized, 'accumulated realized P&L', true);
  if (sharesAfter > 0) book.positions.set(symbol, { quantity: sharesAfter, mark, cost, asOf: fixture.quote.asOf });
  else book.positions.delete(symbol);
  return result('filled', 'filled', buy ? 'Filled at the synthetic ask.' : 'Filled at the synthetic bid.', symbol, side, { quantity, price, notional, realized });
}

export function evaluateRun({ scenarioId, mandate = '', maxWeightPercent = 12, team, portfolio = {}, mode = 'team', managerProposal, permissions } = {}) {
  const fixture = SCENARIO_BY_ID.get(scenarioId);
  if (!fixture) throw new RangeError(`Unknown replay scenario: ${scenarioId}`);
  if (!Number.isFinite(maxWeightPercent) || maxWeightPercent < 0 || maxWeightPercent > 100) {
    throw new RangeError('The position limit must be between 0% and 100%.');
  }
  const quote = readQuote(fixture);
  const book = readPortfolio(portfolio);
  const previousHolding = book.positions.get(fixture.symbol);
  if (previousHolding && quote?.fresh && fixture.marketOpen) {
    book.positions.set(fixture.symbol, { ...previousHolding, mark: quote.mark, asOf: fixture.quote.asOf });
  }
  const portfolioBefore = presentPortfolio(book);
  const grant = {
    allowBuy: permissions === undefined ? true : permissions?.allowBuy === true,
    allowSell: permissions === undefined ? true : permissions?.allowSell === true,
    allowedSymbols: Array.isArray(permissions?.allowedSymbols) ? permissions.allowedSymbols : [],
  };
  const mandateRestrictions = readMandate(mandate, fixture.symbol);
  const restrictions = {
    ...mandateRestrictions,
    noBuys: mandateRestrictions.noBuys || !grant.allowBuy,
    noSells: mandateRestrictions.noSells || !grant.allowSell,
    allowedSymbol: mandateRestrictions.allowedSymbol && (grant.allowedSymbols.length === 0 || grant.allowedSymbols.includes(fixture.symbol)),
  };
  const cap = Math.min(maxWeightPercent, restrictions.cap);
  const checks = [];
  const decision = managerProposal == null
    ? deterministicDecision(fixture, mandateRestrictions, cap, mode)
    : importedDecision(managerProposal, fixture);
  const execution = allowOrder({ fixture, quote, decision, book, restrictions, cap, checks });
  return {
    contractVersion: CONTRACT_VERSION,
    mode,
    scenario: fixture,
    evidence: evidence(fixture, quote, cap, restrictions, grant),
    reviews: analyze(fixture, quote, cap, restrictions, team, portfolioBefore),
    decision: { ...decision, whatWouldChange: decision.reconsider },
    policy: { source: POLICY_SOURCE, maxWeightPercent, effectiveMaxWeightPercent: cap, permissions: grant, checks },
    execution,
    portfolioBefore,
    portfolio: presentPortfolio(book),
  };
}
