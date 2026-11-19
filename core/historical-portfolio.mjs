import { randomUUID } from 'node:crypto';
import { CONTRACT_VERSION, readMandate } from './engine.mjs';

const MICRO_UNITS = 1_000_000;
const BASIS = 'rebased-total-return-units';

export class HistoricalOrderError extends Error {}

export function beginHistoricalFund(fund, study) {
  if (study.catalogId !== 'wellington' || study.status !== 'historical-proxy' || !study.allocation?.length || !study.points?.length) {
    throw new HistoricalOrderError('This study has no verified allocation and history for opening a paper fund.');
  }
  const cap = Math.max(...study.allocation.map(x => x.weightPct));
  fund.maxWeightPercent = cap;
  fund.permissions = { allowBuy: true, allowSell: true, allowedSymbols: study.allocation.map(x => x.symbol) };
  fund.replica = { catalogId: study.catalogId, ticker: study.ticker, basis: BASIS, allocation: study.allocation, point: -1, asOf: null };
  fund.scenarioId = null;
}

function portfolio(previous, shares, prices, costs, cashCents, realizedPnlCents, date) {
  const positions = [];
  for (const [symbol, micros] of Object.entries(shares)) {
    if (micros === 0) continue;
    const quantity = micros / MICRO_UNITS;
    const value = Math.round(quantity * prices[symbol] * 100);
    const cost = costs[symbol];
    positions.push({ symbol, quantity, mark: prices[symbol], markCents: Math.round(prices[symbol] * 100),
      markAsOf: date, basis: BASIS, marketValueCents: value, marketValue: value / 100, costCents: cost, cost: cost / 100,
      unrealizedPnlCents: value - cost, unrealizedPnl: (value - cost) / 100 });
  }
  const equityCents = cashCents + positions.reduce((sum, p) => sum + p.marketValueCents, 0);
  const unrealizedPnlCents = positions.reduce((sum, p) => sum + p.unrealizedPnlCents, 0);
  const totalPnlCents = equityCents - previous.initialCashCents;
  for (const p of positions) p.weightPercent = equityCents ? p.marketValueCents / equityCents * 100 : 0;
  return { ...previous, positions, cashCents, cash: cashCents / 100, equityCents, equity: equityCents / 100,
    unrealizedPnlCents, unrealizedPnl: unrealizedPnlCents / 100, realizedPnlCents, realizedPnl: realizedPnlCents / 100,
    totalPnlCents, totalPnl: totalPnlCents / 100, returnPercent: totalPnlCents / previous.initialCashCents * 100 };
}

// A plan holds total-return index units at the study's historical observation dates.
// Money is rounded to cents per leg, unit quantities are integral millionths.
export function runHistoricalAllocation(fund, study, requestId, language) {
  const replica = fund.replica;
  const index = replica.point + 1;
  const point = study?.points?.[index];
  if (!point) throw new HistoricalOrderError('The last historical observation has already been reached.');
  const date = point.date;
  const finalObservation = index === study.points.length - 1;
  const zh = language !== 'en-US';
  const prices = {}, shares = {}, costs = {};
  for (const {symbol} of replica.allocation) {
    if (!Number.isFinite(point[symbol]) || point[symbol] <= 0) throw new HistoricalOrderError('The study lacks a sleeve index observation.');
    prices[symbol] = point[symbol];
    const p = fund.portfolio.positions.find(pos => pos.symbol === symbol);
    shares[symbol] = Math.round((p?.quantity ?? 0) * MICRO_UNITS);
    costs[symbol] = p?.costCents ?? 0;
  }
  let cash = fund.portfolio.cashCents;
  let realized = fund.portfolio.realizedPnlCents;
  const before = portfolio(fund.portfolio, shares, prices, costs, cash, realized, date);
  const turnoverEstimate = replica.allocation.reduce((sum, {symbol,weightPct}) => {
    const value = before.positions.find(p => p.symbol === symbol)?.marketValueCents ?? 0;
    return sum + Math.abs(before.equityCents * weightPct / 100 - value);
  }, 0);
  const investable = before.equityCents - Math.round(turnoverEstimate * .0005);
  const targets = (finalObservation ? [] : replica.allocation).map(({symbol,weightPct}) => ({
    symbol, weightPct, target: Math.round(investable * weightPct / 100 / (prices[symbol] * 100) * MICRO_UNITS),
  }));
  targets.sort((a,b) => (a.target-shares[a.symbol]) / MICRO_UNITS * prices[a.symbol] - (b.target-shares[b.symbol]) / MICRO_UNITS * prices[b.symbol]);
  const checks = (finalObservation ? [] : replica.allocation).map(({symbol,weightPct}) => {
    const mandate = readMandate(fund.mandate, symbol);
    const allowed = (!fund.permissions.allowedSymbols.length || fund.permissions.allowedSymbols.includes(symbol)) && mandate.allowedSymbol && weightPct <= Math.min(fund.maxWeightPercent,mandate.cap);
    return { id: 'weight-'+symbol, label: symbol+' target', status: allowed ? 'pass' : 'block', detail: weightPct+'% / '+fund.maxWeightPercent+'%' };
  });
  for (const {symbol,target} of targets) {
    if (target === shares[symbol]) continue;
    const side = target > shares[symbol] ? 'BUY' : 'SELL';
    const mandate = readMandate(fund.mandate, symbol);
    const permitted = !mandate.noTrades && (side === 'BUY' ? fund.permissions.allowBuy && !mandate.noBuys : fund.permissions.allowSell && !mandate.noSells);
    checks.push({id: 'authorization-'+symbol, label: symbol+' '+side, status: permitted ? 'pass' : 'block', detail: permitted ? 'Paper authorization on' : 'Paper authorization off'});
  }
  const blocked = checks.some(c => c.status === 'block');
  const legs = [];
  for (const {symbol,target} of targets) {
    if (blocked) break;
    const old = shares[symbol];
    const buying = target > old;
    let micros = Math.abs(target - old);
    const price = prices[symbol];
    const notional = units => Math.round(units / MICRO_UNITS * price * 100);
    const fee = value => Math.round(value * .0005);
    if (buying && notional(micros) + fee(notional(micros)) > cash) {
      micros = Math.min(micros,Math.floor((cash / 1.0005) / (price * 100) * MICRO_UNITS));
      while (micros > 0 && notional(micros) + fee(notional(micros)) > cash) micros--;
    }
    const value = notional(micros);
    if (micros === 0 || value === 0) continue;
    const charge = fee(value);
    if (buying) {
      shares[symbol] += micros; cash -= value + charge; costs[symbol] += value + charge;
    } else {
      const retired = Math.round(costs[symbol] * micros / old);
      shares[symbol] -= micros; cash += value - charge; costs[symbol] -= retired; realized += value - charge - retired;
    }
    legs.push({ symbol, side: buying ? 'BUY' : 'SELL', quantity: micros / MICRO_UNITS, price, notional: value / 100, notionalCents: value, fee: charge / 100, feeCents: charge, date, basis: BASIS });
  }
  const after = portfolio(fund.portfolio, shares, prices, costs, cash, realized, date);
  const allocationText = replica.allocation.map(a => a.symbol+' '+a.weightPct+'%').join(' / ');
  const summary = finalObservation ? (zh ? '最后一个已公开观察点只更新历史市值。没有下一持有期，本期没有调仓或费用。' : 'At the final observation the historical sleeves are marked to their index values. With no next holding period there is no rebalance or fee.') : zh ? '按公开方法代理的固定权重进行季度模拟配置：'+allocationText+'。使用以留出期基日为 100 的总回报指数单位。' : 'Quarterly paper allocation to the historical method proxy: '+allocationText+'. Sleeve units use total-return indices rebased to 100.';
  const source = zh ? '发布方季度总回报 · 归一化历史研究单位' : 'Issuer quarterly total returns · rebased historical research units';
  const evidence = replica.allocation.map(({symbol,weightPct}) => ({id:symbol,label:symbol,value:weightPct+'% · '+prices[symbol],source,asOf:date}));
  const run = { contractVersion: CONTRACT_VERSION, id: randomUUID(), requestId, fundId: fund.id, createdAt:new Date().toISOString(), origin:'manual', provider:'historical-proxy', language,
    scenario:{id:'historical-'+date, symbol:replica.ticker, title:replica.ticker+' · '+date, source, asOf:date, synthetic:false, summary},
    evidence, reviews:[], decision:{action:finalObservation?'MARK':'ALLOCATE',symbol:replica.ticker,summary,reconsider:zh?'数据或授权变化时复核。':'Review changes to evidence and paper authorization.'}, policy:{source:'Historical sleeve allocation policy v1',maxWeightPercent:fund.maxWeightPercent,permissions:fund.permissions,checks},
    execution:{status:blocked?'blocked':legs.length?'filled':'held', code:finalObservation?'final-mark':blocked?'mandate-restricted':'historical-allocation', basis:BASIS, symbol:replica.ticker, side:null, quantity:0, price:null, notional:legs.reduce((s,l)=>s+l.notionalCents,0)/100, fee:legs.reduce((s,l)=>s+l.feeCents,0)/100, legs, date,
      reason:blocked?(zh?'模拟授权拦截了本期调仓。':'Paper authorization blocked this allocation.'):summary},
    portfolioBefore:before, portfolio:after };
  fund.portfolio = after;
  replica.point=index;
  replica.asOf=date;
  fund.runs = [run,...fund.runs].slice(0,30);
  return run;
}

