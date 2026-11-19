import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {placePortfolioOrder,studioAllocations,viewPortfolio} from '../core/portfolio-account.mjs';

function workspace(){
  const fund={id:'one',name:'Office',createdAt:'2026-11-18T12:00:00.000Z',
    studioCapital:{unitsMicros:0,netContributionsCents:0},
    portfolio:{cashCents:0,equityCents:0,initialCashCents:0,realizedPnlCents:0,unrealizedPnlCents:0,positions:[]}};
  const data={funds:[{id:'sample'},fund],portfolioAccount:{cashCents:1_000_000,totalOrders:0,positions:{},realizedPnlCents:0}};
  const trade=(side,q)=>placePortfolioOrder(data,{requestId:randomUUID(),productId:'studio:one',side,...q});
  return {fund,data,buy:n=>trade('buy',{amountCents:n}),sell:n=>trade('sell',{unitsMicros:n})};
}

for(const pnl of [3_387,-3_387]){
  test('Unitized Studio subscriptions, partial and full cash redemptions reconcile with P&L '+pnl,()=>{
    const {fund,data,buy,sell}=workspace();
    assert.equal(viewPortfolio(data).products[0].quote.navCents,10_000);
    assert.deepEqual(studioAllocations(data).one,{unitsMicros:0,costBasisCents:0,valueCents:0});
    const first=buy(603_713);
    assert.equal(fund.portfolio.cashCents,603_713);
    assert.equal(first.unitsMicros,60_371_300);
    // A completed strategy trade has now changed cash and equity.
    Object.assign(fund.portfolio,{cashCents:603_713+pnl,equityCents:603_713+pnl,realizedPnlCents:pnl});
    const second=buy(23_123);
    assert.equal(fund.portfolio.initialCashCents,first.amountCents+second.amountCents);
    assert.equal(fund.portfolio.totalPnlCents,pnl);
    assert.equal(viewPortfolio(data).equityCents,1_000_000+pnl);
    assert.equal(studioAllocations(data).one.valueCents,fund.portfolio.equityCents);
    const partial=sell(2_123_274);
    assert.equal(partial.cashAfterCents-partial.cashBeforeCents,partial.amountCents);
    const marked=viewPortfolio(data);
    assert.equal(marked.positions[0].valueCents,fund.portfolio.equityCents);
    assert.equal(marked.realizedPnlCents+marked.positions[0].pnlCents,pnl);
    assert.equal(fund.portfolio.initialCashCents,marked.positions[0].costBasisCents);
    assert.equal(fund.portfolio.realizedPnlCents+fund.portfolio.unrealizedPnlCents,fund.portfolio.totalPnlCents);
    const remainder=fund.portfolio.equityCents;
    assert.equal(sell(fund.studioCapital.unitsMicros).amountCents,remainder);
    assert.equal(viewPortfolio(data).cashCents,1_000_000+pnl);
    assert.deepEqual(viewPortfolio(data).positions,[]);
    assert.equal(fund.portfolio.cashCents,0);
    assert.equal(fund.portfolio.totalPnlCents,0);
    assert.equal(fund.studioCapital.netContributionsCents,-pnl);
    const newCycle=buy(55);
    assert.equal(newCycle.navCents,10_000);
    assert.equal(fund.portfolio.cashCents,55);
    assert.equal(fund.portfolio.totalPnlCents,0);
  });
}

test('Studio redemption uses available fund cash and leaves both books untouched when invested',()=>{
  const {data,fund,buy,sell}=workspace();
  buy(50_000);
  Object.assign(fund.portfolio,{cashCents:10_000,equityCents:50_000,positions:[{symbol:'ABC',quantity:10,marketValueCents:40_000}]});
  const before=structuredClone(data);
  assert.throws(()=>sell(5_000_000),{code:'portfolio-fund-cash'});
  assert.deepEqual(before,data);
  sell(1_000_000);
  assert.equal(fund.portfolio.cashCents,0);
  assert.equal(fund.portfolio.positions[0].weightPercent,100);
  assert.equal(viewPortfolio(data).equityCents,1_000_000);
});
