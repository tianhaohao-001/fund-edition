import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createMarketReference, describeIntraday } from '../core/market-freshness.mjs';
import { expectedClose, quoteSession } from '../core/market-freshness-calendar.mjs';
import { createApp } from '../server.mjs';
import { renderCatalog } from '../web/catalog-view.mjs';

const morning = Date.parse('2026-11-18T08:00:00Z');
function feed(symbol, date, value, vanguard) {
  return Response.json(vanguard ? { dashboard:{ ticker:symbol, navPriceAsOfDate:date, navPrice:'$'+value } }
    : { data:{ symbol, tradesTable:{ headers:{close:'Close/Last'}, rows:[{date,close:value}] } } });
}

test('mutual fund observation and issuer NAV keep independent dates, shared inflight requests and a bounded cache', async () => {
  let now = morning;
  let calls = 0;
  const read = createMarketReference({ now:() => now, fetchImpl:async (url, init) => {
    calls++;
    assert.equal(init.redirect,'error');
    assert.ok(!Object.keys(init.headers).some(key => /authorization|cookie|key|secret/i.test(key)));
    const issuer = url.startsWith('https://investor.vanguard.com/');
    if (!issuer) assert.equal(new URL(url).searchParams.get('assetclass'),'mutualfunds');
    return issuer ? feed('VWELX','11/16/2026','46.13',true) : feed('VWELX','11/17/2026','45.82',false);
  } });
  const [a,b] = await Promise.all([read('vwelx'),read(' VWELX ')]);
  assert.equal(calls,2);
  assert.deepEqual(a,b);
  assert.deepEqual(a.observations.map(x=>[x.kind,x.status,x.valueUsd,x.asOf]),
    [['fund-end-of-day','current',45.82,'2026-11-17'],['issuer-nav','stale',46.13,'2026-11-16']]);
  assert.equal(a.executionEligible,false);
  assert.equal(a.timeZone,'America/New_York');
  now += 9*60_000;
  assert.equal((await read('VWELX')).retrievedAt,a.retrievedAt);
  assert.equal(calls,2);
  now += 60_000;
  assert.notEqual((await read('VWELX')).retrievedAt,a.retrievedAt);
  assert.equal(calls,4);
  await assert.rejects(() => read('https://other.invalid/'),RangeError);
  assert.equal(calls,4);
});

test('a failed or regressing refresh preserves last good provenance, ages at the next close, and recovers', async () => {
  let now = morning;
  let date = '11/17/2026';
  let failed = false;
  const read = createMarketReference({now:() => now,fetchImpl:async url => failed ? new Response(null,{status:429})
    : feed('VOO',date,'673.19',url.includes('vanguard.com'))});
  const first = await read('VOO');
  assert.equal(first.kind,'etf-close');
  failed = true;
  now += 11*60_000;
  const cached = await read('VOO');
  assert.equal(cached.status,'unverified');
  assert.equal(cached.error,'provider-http-429');
  assert.equal(cached.retrievedAt,first.retrievedAt);
  assert.notEqual(cached.attemptedAt,first.attemptedAt);
  now = Date.parse('2026-11-18T21:00:00Z');
  const stale = await read('VOO');
  assert.equal(stale.status,'stale');
  assert.equal(stale.expectedAsOf,'2026-11-18');
  assert.equal(stale.retrievedAt,first.retrievedAt);
  failed = false;
  date = '11/16/2026';
  now += 60_000;
  assert.equal((await read('VOO')).error,'publication-regressed');
  date = '11/18/2026';
  now += 60_000;
  const recovered = await read('VOO');
  assert.equal(recovered.error,null);
  assert.equal(recovered.status,'current');
  assert.equal(recovered.executionEligible,false);
});

test('invalid, unrequested, inconsistent and future observations cannot masquerade as a closing price', async () => {
  for (const [date,value] of [['11/19/2026','300'],['11/31/2026','300'],['11/15/2026','300'],['11/17/2026','-5'],['11/17/2026','null']]) {
    const read = createMarketReference({now:()=>morning,fetchImpl:async url => feed('VYM',date,value,url.includes('vanguard.com'))});
    const result = await read('VYM');
    assert.equal(result.status,'unavailable');
    assert.equal(result.valueUsd,null);
    assert.equal(result.asOf,null);
  }
  const mismatch = { data:{symbol:'VYM',tradesTable:{headers:{close:'Close/Last'},rows:[{date:'11/17/2026',close:'300'},{date:'11/17/2026',close:'100'}]}} };
  const read = createMarketReference({now:()=>morning,fetchImpl:async url => url.includes('vanguard.com')
    ? feed('VOO','11/17/2026','300',true) : Response.json(mismatch)});
  assert.equal((await read('VYM')).status,'unavailable');
  const outside = createMarketReference({now:()=>Date.parse('2029-01-04T22:00:00Z'),fetchImpl:async url => feed('VCIT','01/04/2029','60',url.includes('vanguard.com'))});
  assert.equal((await outside('VCIT')).reason,'unreviewed-calendar');
});

test('NYSE close follows EST/EDT, holidays, weekends and early closes', () => {
  for (const [utc,answer] of [
    ['2026-11-18T20:59:59Z','2026-11-17'],['2026-11-18T21:00:00Z','2026-11-18'],
    ['2026-08-07T20:00:00Z','2026-08-07'],['2026-08-09T21:00:00Z','2026-08-07'],
    ['2026-11-26T23:00:00Z','2026-11-25'],['2026-11-27T17:59:59Z','2026-11-25'],
    ['2026-11-27T18:00:00Z','2026-11-27'],['2026-04-03T21:00:00Z','2026-04-02'],
    ['2028-01-01T22:00:00Z','2027-12-31'],['2029-01-02T16:00:00Z',null],
  ]) assert.equal(expectedClose(Date.parse(utc)),answer);
  assert.equal(quoteSession('2026-11-27T14:29:59Z'),'outside-regular');
  assert.equal(quoteSession('2026-11-27T14:30:00Z'),'regular');
  assert.equal(quoteSession('2026-11-27T18:00:00Z'),'outside-regular');
  assert.equal(quoteSession(null),'unknown');
});

test('delayed intraday display and public ETF daily data remain distinguishable from executable quotes', async () => {
  const snap = describeIntraday({source:'Alpaca Market Data',feed:'delayed_sip',freshness:'fresh',quoteAt:'2026-11-17T17:15:11Z',capturedAt:'2026-11-17T17:15:12Z'});
  assert.equal(snap.freshness,'delayed');
  assert.equal(snap.kind,'intraday-quote');
  assert.equal(snap.marketSession,'regular');
  assert.equal(snap.executionEligible,false);
  const { server,host } = await createApp({env:{ FUNDROOM_DB_PATH:':memory:' },fetchImpl:async url => feed('VOO','11/17/2026','673.19',url.includes('vanguard.com'))});
  server.listen(0,host);
  await once(server,'listening');
  const address = 'http://'+host+':'+server.address().port+'/api/market/reference?symbol=';
  try {
    assert.equal((await fetch(address+'%2Fother')).status,400);
    const result = await fetch(address+'VOO');
    assert.equal(result.status,200);
    assert.equal(result.headers.get('set-cookie'),null);
    assert.equal((await result.json()).observations.length,2);
    assert.match(renderCatalog({catalogId:'wellington'}),/data-market-reference="VWELX"/);
    assert.match(renderCatalog({catalogId:'stocks-plus'}),/data-market-reference="VOO"/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
