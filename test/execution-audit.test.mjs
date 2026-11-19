import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { evaluateRun, SCENARIOS } from '../core/engine.mjs';
import { createApp } from '../server.mjs';

// Enumerate prospective whole-share books. This oracle does not use the engine's sizing equation.
function auditOrder(ledger, scenario, action, target, cap, permissions) {
  const { symbol, quote } = scenario;
  const position = ledger.holdings.get(symbol) ?? { shares: 0, cost: 0, mark: 0 };
  const bid = Math.round(quote?.bid * 100), ask = Math.round(quote?.ask * 100);
  const age = quote ? Date.parse(scenario.asOf) - Date.parse(quote.asOf) : Infinity;
  const fresh = age >= 0 && age <= 60_000;
  if (scenario.marketOpen && fresh) position.mark = Math.round((bid + ask) / 2);
  if (action === 'HOLD') return 'manager-hold';
  const buy = action === 'BUY';
  if (!(buy ? permissions.allowBuy : permissions.allowSell) ||
      (permissions.allowedSymbols.length && !permissions.allowedSymbols.includes(symbol))) return 'mandate-restricted';
  if (target > cap) return 'target-over-limit';
  if (!scenario.marketOpen) return 'market-closed';
  if (!quote) return 'quote-missing';
  if (!fresh) return 'quote-stale';
  if (!buy && !position.shares) return 'no-holdings';

  const otherValue = [...ledger.holdings].reduce((value, [ticker, p]) => value + (ticker === symbol ? 0 : p.mark * p.shares), 0);
  const price = buy ? ask : bid;
  const withinTarget = (quantity) => {
    const delta = buy ? quantity : -quantity;
    const stock = (position.shares + delta) * position.mark;
    const total = ledger.cash - delta * price + otherValue + stock;
    return stock * 100 <= total * target;
  };
  let quantity = 0;
  if (buy) {
    while (withinTarget(quantity + 1)) quantity++;
  } else {
    while (!withinTarget(quantity) && quantity < position.shares) quantity++;
  }
  if (!quantity) return buy && !position.shares ? 'target-below-one-share' : 'already-at-target';
  if (buy && price * quantity > ledger.cash) return 'cash-insufficient';
  const value = price * quantity;
  const retired = buy ? 0 : Math.floor(position.cost * quantity / position.shares);
  ledger.cash += buy ? -value : value;
  ledger.realized += buy ? 0 : value - retired;
  position.cost += buy ? value : -retired;
  position.shares += buy ? quantity : -quantity;
  if (position.shares) ledger.holdings.set(symbol, position);
  else ledger.holdings.delete(symbol);
  return 'filled';
}

test('seeded long-only replay reconciles each decision with an independent cent book', t => {
  let seed = 20261118;
  const next = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 2 ** 32 * max); };
  const scenarios = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));
  const ledger = { cash: 1_000_000, realized: 0, holdings: new Map() };
  const frequencies = {};
  let portfolio = { cashCents: ledger.cash };
  for (let i = 0; i < 720; i++) {
    const scenario = i === 0 ? scenarios['innovation-signal'] : SCENARIOS[next(SCENARIOS.length)];
    const action = i === 0 ? 'BUY' : ['BUY', 'SELL', 'HOLD'][next(3)];
    const target = i === 0 ? 12 : action === 'HOLD' ? 0 : [1, 5, 10, 25, 50, 75, 100][next(7)];
    const cap = i === 0 ? 12 : [0, 5, 25, 50, 100, 100][next(6)];
    const permissions = i === 0 ? { allowBuy: true, allowSell: true, allowedSymbols: [] } :
      { allowBuy: next(5) > 0, allowSell: next(5) > 0, allowedSymbols: next(5) === 0 ? ['SPY'] : [] };
    const expected = auditOrder(ledger, scenario, action, target, cap, permissions);
    const run = evaluateRun({ scenarioId: scenario.id, portfolio, permissions, maxWeightPercent: cap,
      managerProposal: { action, targetWeightPercent: target, symbol: scenario.symbol, summary: 'Replay audit.', reconsider: 'Recheck the next snapshot.' } });
    const label = 'step ' + i + ' / ' + expected;
    assert.equal(run.execution.code, expected, label);
    portfolio = run.portfolio;
    const positions = [...ledger.holdings].sort(([a],[b]) => a.localeCompare(b));
    assert.deepEqual(portfolio.positions.map(p => [p.symbol,p.quantity,p.markCents,p.costCents]),
      positions.map(([symbol,p]) => [symbol,p.shares,p.mark,p.cost]), label);
    assert.equal(portfolio.cashCents, ledger.cash, label);
    assert.equal(portfolio.equityCents, ledger.cash + positions.reduce((sum,[,p]) => sum + p.shares * p.mark, 0), label);
    assert.equal(portfolio.realizedPnlCents, ledger.realized, label);
    assert.equal(portfolio.totalPnlCents, portfolio.realizedPnlCents + portfolio.unrealizedPnlCents, label);
    const bucket = expected === 'filled' ? action : expected;
    frequencies[bucket] = (frequencies[bucket] ?? 0) + 1;
  }
  for (const bucket of ['BUY','SELL','manager-hold','mandate-restricted','target-over-limit','market-closed','quote-missing','quote-stale','cash-insufficient']) {
    assert.ok(frequencies[bucket] > 0, bucket);
  }
  t.diagnostic(JSON.stringify({ seed:20261118, decisions:720, frequencies, cashCents:ledger.cash, equityCents:portfolio.equityCents }));
});

test('parallel historical paper runs book one allocation, and revoked sales block the entire next basket', async t => {
  const {server,host} = await createApp({ env:{ FUNDROOM_DB_PATH:':memory:', FUNDROOM_BROKER_DB_PATH:':memory:', FUNDROOM_ENABLE_LOCAL_VOICE:'false' },
    fetchImpl: () => assert.fail('The historical audit needs no external connection') });
  server.listen(0,host); await once(server,'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://' + host + ':' + server.address().port;
  const first = await fetch(origin+'/api/state');
  const cookie = first.headers.get('set-cookie').split(';')[0];
  async function submit(body, status = 200) {
    const response = await fetch(origin+'/api/action', {method:'POST', headers:{cookie,origin,'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result.error));
    return result;
  }
  const draft = await submit({action:'prepareResearch',catalogId:'wellington',message:'VWELX',requestId:'audit-draft'});
  const confirm = {action:'confirmResearch',draftId:draft.researchDraft.id,createFund:true,requestId:'audit-open'};
  const opened = await Promise.all(Array.from({length:8}, () => submit(confirm)));
  const account = opened[0].fund;
  assert.ok(opened.every(result => result.fund.id === account.id && result.run.id === opened[0].run.id));
  assert.equal(account.portfolio.cashCents, 0);
  const before = account.portfolio.positions.map(p => [p.symbol,p.quantity,p.costCents]);
  const advance = {action:'runScenario',fundId:account.id,requestId:'audit-advance',permissions:{allowSell:false}};
  const advanced = await Promise.all(Array.from({length:8}, () => submit(advance)));
  assert.ok(advanced.every(result => result.run.id === advanced[0].run.id));
  const {run, fund} = advanced[0];
  assert.equal(fund.runs.length, 2);
  assert.equal(fund.permissions.allowSell, false);
  assert.equal(fund.replica.point, 1);
  assert.equal(run.execution.code,'mandate-restricted');
  assert.deepEqual(run.execution.legs,[]);
  assert.equal(run.execution.fee,0);
  assert.equal(run.portfolio.cashCents,0);
  assert.equal(run.portfolio.realizedPnlCents,0);
  assert.deepEqual(run.portfolio.positions.map(p => [p.symbol,p.quantity,p.costCents]),before);
  assert.ok(run.policy.checks.some(x => x.label.includes('SELL') && x.status === 'block'));
  assert.notEqual(run.portfolio.equityCents, account.portfolio.equityCents);
  await submit({...advance, fundId:'different-fund'},409);
  const saved = await (await fetch(origin+'/api/state',{headers:{cookie}})).json();
  assert.deepEqual(saved.fund.portfolio, run.portfolio);
  assert.equal(saved.fund.runs.length,2);
});
