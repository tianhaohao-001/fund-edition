import { createHash } from 'node:crypto';
import { expectedClose, marketDay, daysBefore, isSession } from './market-freshness-calendar.mjs';

export class ForwardError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const emptyBook = () => ({version:1, cashCents:1_000_000, unitsMicros:{}, decisions:[], orders:[]});
export const snapshot = book => ({cashCents:book.cashCents, unitsMicros:{...book.unitsMicros}});
const maxPriceCents = 100_000_000;
export const feeBps = 5;
const price = x => Math.round(x * 100);
const gross = (units, cents) => Number((BigInt(units)*BigInt(cents)+500_000n)/1_000_000n);
const fee = cents => Math.ceil(cents * feeBps / 10_000);
const isoTime = raw => typeof raw === 'string' && Number.isFinite(Date.parse(raw));
function reject(code, message) { throw new ForwardError(code,message); }

// A dated research observation is never submitted as a broker order. The simulator
// commits in advance to one named series, date, fee schedule and fractional unit.
export function nasdaqMark(reference, symbol, cutoff, date) {
  const referenceKind=symbol==='VWELX'?'fund-end-of-day':'etf-close';
  const candidate = reference?.observations?.find(row=>row.symbol===symbol && row.provider==='Nasdaq' && row.kind===referenceKind);
  if (!candidate || candidate.currency!=='USD' || candidate.status!=='current' || candidate.error ||
      candidate.executionEligible!==false || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.asOf) ||
      candidate.asOf!==expectedClose(Date.parse(cutoff)) || (date && candidate.asOf!==date) ||
      !isoTime(candidate.retrievedAt) || Date.parse(candidate.retrievedAt)>Date.parse(cutoff) ||
      expectedClose(Date.parse(candidate.retrievedAt))!==candidate.asOf ||
      !Number.isFinite(candidate.valueUsd) || price(candidate.valueUsd)<1 || price(candidate.valueUsd)>maxPriceCents) return null;
  return {symbol,asOf:candidate.asOf,observedAt:candidate.retrievedAt,priceCents:price(candidate.valueUsd),
    sourceUrl:candidate.sourceUrl,provider:'Nasdaq',series:symbol==='VWELX'?'unadjusted mutual fund daily NAV':'unadjusted ETF daily close',currency:'USD'};
}

export function validateTargets(proposal, policy) {
  if (!proposal || !['HOLD','REBALANCE'].includes(proposal.action) || !Array.isArray(proposal.targets)) {
    reject('operator-target','The manager returned an invalid target.');
  }
  if (proposal.action==='HOLD') {
    if(proposal.targets.length) reject('operator-target','Hold cannot carry trading instructions.');
    return;
  }
  const targets = new Map();
  for(const item of proposal.targets) {
    if(!item || !policy.permitted.includes(item.symbol) || targets.has(item.symbol) ||
        !Number.isInteger(item.bps) || item.bps<0 || item.bps>10_000) reject('operator-target','Symbol or weight violates the paper mandate.');
    targets.set(item.symbol,item.bps);
  }
  const total = [...targets.values()].reduce((a,b)=>a+b,0);
  if(!targets.size || total>10_000 || !policy.permitted.length) reject('operator-target','Target exceeds the funded paper sleeve.');
  if(policy.catalogId==='wellington' && (targets.size!==2 || targets.get('VYM')<6000 || targets.get('VYM')>7000 ||
      targets.get('VCIT')<3000 || targets.get('VCIT')>4000 || total!==10_000)) reject('operator-target','Wellington paper equity must be 60–70% and credit the balance.');
}

const nyDate = time => marketDay(Date.parse(time)).date;
export function nextPaperDate(approvedAt) {
  let date = daysBefore(nyDate(approvedAt),-1);
  while(!isSession(date)) date = daysBefore(date,-1);
  if(!expectedClose(Date.parse(date+'T23:59:00Z'))) reject('operator-calendar','The market calendar has not been verified for that date.');
  return date;
}
export function latestOrder(book, decisionId) { return book.orders.findLast(o=>o.decisionId===decisionId); }
export function approveDecision(book, decisionId, now) {
  const decision = book.decisions.at(-1);
  if(!decision || decision.id!==decisionId || decision.status!=='sealed' || Date.parse(now)<Date.parse(decision.sealedAt) ||
     nyDate(decision.sealedAt)!==nyDate(now) || decision.seal!==digest(decision.record) || digest(snapshot(book))!==decision.record.bookHash) {
    reject('operator-obsolete','Review a current sealed decision for this paper account.');
  }
  const existing = latestOrder(book,decision.id);
  if(existing) { if(existing.status==='cancelled') reject('operator-revoked','This authorization was withdrawn.'); return existing; }
  const {proposal,policy} = decision.record;
  validateTargets(proposal,policy);
  const isHold = proposal.action==='HOLD';
  const order = {decisionId,seal:decision.seal,status:isHold?'held':'authorized',approvedAt:now,
    pricingDate:isHold?null:nextPaperDate(now),policy:'nasdaq-etf-close-v1',feeBps,before:snapshot(book),fills:[]};
  if(isHold) order.after=snapshot(book);
  book.orders.push(order);
  return order;
}
export function revokeDecision(book,decisionId,now) {
  const order=latestOrder(book,decisionId);
  if(order?.status==='cancelled') return order;
  if(order?.status!=='authorized') reject('operator-authorization','There is no open order to withdraw.');
  order.status='cancelled'; order.cancelledAt=now;
  return order;
}

function allocate(book,targets,marks) {
  const symbols = Object.keys(marks);
  const equity = symbols.reduce((value,s)=>value+gross(book.unitsMicros[s]??0,marks[s].priceCents),book.cashCents);
  if(!Number.isSafeInteger(equity) || equity<0 || equity>1e12) reject('operator-cash','Valuation exceeds the supported range.');
  const weights = Object.fromEntries(targets.map(t=>[t.symbol,t.bps]));
  function calc(netEquity) {
    let cashCents=book.cashCents;
    const unitsMicros={}; const fills=[];
    for(const symbol of symbols) {
      const p=marks[symbol].priceCents, held=book.unitsMicros[symbol]??0;
      const quantity=Number(BigInt(netEquity)*BigInt(weights[symbol]??0)*100n/BigInt(p));
      if(!Number.isSafeInteger(quantity) || quantity<0) reject('operator-cash','Position exceeds the supported range.');
      let delta=quantity-held;
      const notional=gross(Math.abs(delta),p);
      if(notional===0) delta=0;
      if(held+delta>0) unitsMicros[symbol]=held+delta;
      if(!delta) continue;
      const feeCents=fee(notional);
      cashCents-=Math.sign(delta)*notional+feeCents;
      fills.push({symbol,side:delta>0?'BUY':'SELL',quantityMicros:Math.abs(delta),priceCents:p,notionalCents:notional,feeCents});
    }
    return {cashCents,unitsMicros,fills:fills.sort((a,b)=>a.side===b.side?0:a.side==='SELL'?-1:1)};
  }
  // Find the greatest fully funded budget at cent precision. Each position grows
  // monotonically with the budget; rounded fees cannot exceed a change in proceeds.
  let low=0,high=equity;
  while(low<high) {
    const middle=low+Math.ceil((high-low)/2);
    if(calc(middle).cashCents>=0) low=middle; else high=middle-1;
  }
  const result=calc(low);
  if(!Number.isSafeInteger(result.cashCents)||result.cashCents<0) reject('operator-cash','Cash or fees fail the independent check.');
  return result;
}
export function settleDecision(book, decisionId, references, now) {
  const decision=book.decisions.find(d=>d.id===decisionId), order=latestOrder(book,decisionId);
  if(!order || !decision || order.seal!==digest(decision.record) || order.seal!==decision.seal) reject('operator-authorization','A sealed, authorized order is required.');
  if(['filled','held','expired'].includes(order.status)) return order;
  if(order.status!=='authorized' || digest(snapshot(book))!==decision.record.bookHash) reject('operator-authorization','The approval no longer matches the account.');
  const {proposal,policy}=decision.record;
  validateTargets(proposal,policy);
  const expected=expectedClose(Date.parse(now));
  if (!expected || expected<order.pricingDate) reject('operator-wait','Waiting for the authorized future close.');
  if (expected>order.pricingDate) { order.status='expired'; order.expiredAt=now; return order; }
  const marks={};
  for(const symbol of new Set([...proposal.targets.map(t=>t.symbol),...Object.keys(book.unitsMicros)])) {
    const mark=nasdaqMark(references[symbol],symbol,now,order.pricingDate);
    if(!mark || Date.parse(mark.observedAt)<=Date.parse(order.approvedAt) || order.pricingDate<=nyDate(decision.sealedAt)) {
      reject('operator-wait','Waiting for all authorized closing observations.');
    }
    marks[symbol]=mark;
  }
  const {cashCents,unitsMicros,fills}=allocate(book,proposal.targets,marks);
  book.cashCents=cashCents; book.unitsMicros=unitsMicros;
  Object.assign(order,{status:'filled',settledAt:now,marks,fills,after:snapshot(book)});
  if(policy.catalogId==='wellington'){
    order.benchmarkStart=nasdaqMark(references.VWELX,'VWELX',now,order.pricingDate);
    order.comparisonDate=nextPaperDate(order.pricingDate+'T17:00:00Z');
  }
  return order;
}

// Price change of the frozen, funded sleeve after execution. Both legs exclude
// distributions. Opening costs are already in the account value at inception.
export function compareForward(book,decisionId,references,now){
  const order=latestOrder(book,decisionId);
  if(order?.status!=='filled' || !order.benchmarkStart || !order.comparisonDate) {
    reject('operator-comparison','A matched benchmark at the filled starting close is required.');
  }
  if(order.evaluation)return order.evaluation;
  if(expectedClose(Date.parse(now))!==order.comparisonDate) reject('operator-comparison','Matched closes from the fixed comparison session are required.');
  const benchmark=nasdaqMark(references.VWELX,'VWELX',now,order.comparisonDate);
  if(!benchmark)reject('operator-comparison','A same-date VWELX price reference is required.');
  const marks={}, fixed=order.after;
  let start=fixed.cashCents,end=start;
  for(const [symbol,units] of Object.entries(fixed.unitsMicros)){
    const mark=nasdaqMark(references[symbol],symbol,now,order.comparisonDate);
    if(!mark || !order.marks[symbol])reject('operator-comparison','All sleeve prices must match both observation dates.');
    marks[symbol]=mark;
    start+=gross(units,order.marks[symbol].priceCents);
    end+=gross(units,mark.priceCents);
  }
  const evaluation={basis:'USD close-to-close price change; no dividends, interest or tax',startDate:order.pricingDate,
    endDate:order.comparisonDate,observedAt:now,startValueCents:start,endValueCents:end,benchmark,marks,
    paperPriceChangePct:100*(end/start-1),benchmarkPriceChangePct:100*(benchmark.priceCents/order.benchmarkStart.priceCents-1)};
  order.evaluation=evaluation;
  return evaluation;
}

