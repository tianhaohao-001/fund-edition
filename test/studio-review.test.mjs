import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore } from '../core/store.mjs';
import { studioReview } from '../core/studio-review.mjs';

const now = Date.parse('2026-11-18T13:00:00Z');
const old = '2026-11-13T15:00:00Z';
const book = (positions, createdAt = old) => ({id:'demo-fund', createdAt, runs:[], portfolio:{cashCents:98_000,positions}});
function prices(symbol,current,prior,extra={}) {
  return {observations:[{symbol,currency:'USD',provider:'Nasdaq',kind:'stock-close',executionEligible:false,
    status:'current',asOf:'2026-11-17',recentCloses:[
      {asOf:'2026-11-16',valueUsd:prior},{asOf:'2026-11-17',valueUsd:current}],
    sourceUrl:'https://www.nasdaq.com/market-activity/stocks/nvda/historical',retrievedAt:'2026-11-18T12:00:00Z',...extra}]};
}

test('read-only closing observations distinguish gains, losses, cash and incomplete baskets, with immutable account-scoped marks', async t => {
  const db = openStore(':memory:');
  t.after(()=>db.close());
  const holdings=[{symbol:'NVDA',quantity:2}];
  const scoped = async (workspace,fund,readReference) => {
    if (!db.read(workspace)) db.create(workspace,{funds:[fund]});
    return studioReview({workspace, fund, readReference, journal:db.studioMarks, now});
  };
  const invested=book(holdings);
  const snapshot=JSON.stringify(invested);
  const up=await scoped('a',invested,async s=>prices(s,11,10));
  assert.equal(up.status,'gain');
  assert.equal(up.changeCents,200);
  assert.equal(up.current.valueCents,100_200);
  const repeat=await scoped('a',invested,()=>assert.fail('frozen closes must not refetch'));
  assert.deepEqual(repeat,up);
  const down=await scoped('b',invested,async s=>prices(s,9,10));
  assert.equal(down.changeCents,-200);
  assert.equal(down.status,'loss');
  assert.equal(JSON.stringify(invested),snapshot);
  assert.deepEqual(db.read('a').data.funds[0],invested);
  const cash=await scoped('c',book([]),()=>assert.fail('cash has no ticker'));
  assert.equal(cash.status,'flat');
  assert.equal(cash.changeCents,0);
  const incomplete=await scoped('d',book([...holdings,{symbol:'SPY',quantity:1}]),async s=>prices(s,11,10,{status:s==='SPY'?'stale':'current'}));
  assert.equal(incomplete.status,'coverage');
  assert.equal(incomplete.current,null);
  assert.equal(incomplete.changeCents,null);
  const mixed=await scoped('e',invested,async s=>prices(s,11,10,{currency:'CAD'}));
  assert.equal(mixed.changeCents,null);
});

test('new portfolios and changed allocations wait for genuinely comparable full closes',async t=>{
  const store=openStore(':memory:');
  t.after(()=>store.close());
  const fund=book([{symbol:'NVDA',quantity:1}]);
  store.create('a',{funds:[fund]});
  const inspect=()=>studioReview({workspace:'a',fund,journal:store.studioMarks,readReference:async s=>prices(s,11,10),now});
  fund.studioBookChangedAt='2026-11-18T10:00:00Z';
  const pre=await inspect();
  assert.equal(pre.status,'waiting-first-close');
  assert.equal(pre.percent,null);
  fund.studioBookChangedAt='2026-11-17T17:00:00Z';
  const single=await inspect();
  assert.equal(single.status,'waiting-second-close');
  assert.equal(single.current.date,'2026-11-17');
  assert.equal(single.previous,null);
});

test('registering a guest moves its original observation date and frozen closes to the new private workspace', async t => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const fund = book([{symbol:'NVDA', quantity:2}]);
  store.create('guest', {funds:[fund]});
  store.create('another-guest', {funds:[fund]});
  const original = await studioReview({
    workspace:'guest', fund, journal:store.studioMarks, now,
    readReference:async symbol => prices(symbol,11,10),
  });
  assert.equal(original.status,'gain');
  const login = await store.accounts.enter('register',
    {email:'close-review@example.test', password:'frozen-closes-fixture'}, {
      ip:'127.0.0.1', guestId:'guest', initialState:() => assert.fail('Guest workspace exists'),
    });
  const { workspaceId } = store.accounts.authenticate(login.token);
  const restored = await studioReview({
    workspace:workspaceId, fund, journal:store.studioMarks, now,
    readReference:() => assert.fail('A frozen observation must survive registration'),
  });
  assert.deepEqual(restored,original);
  assert.equal(store.studioMarks.firstSeen(workspaceId,fund.id,'later'),new Date(now).toISOString());
  assert.equal(store.studioMarks.read('another-guest',fund.id,original.current.date),null);
  assert.equal(store.studioMarks.read('guest',fund.id,original.current.date),null);
});
