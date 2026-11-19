import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {nextWatchSlot} from '../core/watch-clock.mjs';
import {openWatchJournal} from '../core/watch-journal.mjs';
import {createWatchSources,readHeadlines,readWatchQuote,watchList} from '../core/watch-sources.mjs';
import {createWatchWorker,watchSignals} from '../core/watch-worker.mjs';
import {createApp} from '../server.mjs';
const time=Date.parse;
const fixture={id:'abc',name:'Test',mandate:'Review Apple earnings',permissions:{allowBuy:false,allowSell:false,allowedSymbols:[]},portfolio:{positions:[]}};
const info=stamp=>JSON.stringify({data:{symbol:'AAPL',primaryData:{lastSalePrice:'$174.50',lastTradeTimestamp:stamp,isRealTime:false}}});
const xml=(stamp='Wed, 18 Nov 2026 14:00:00 GMT',host='www.nasdaq.com')=>`<rss><channel><item><title><![CDATA[Apple publishes results]]></title><link>https://${host}/post</link><pubDate>${stamp}</pubDate></item></channel></rss>`;
const clock=(str,opts)=>{const v=nextWatchSlot(time(str),opts);return v&&[new Date(v.at).toISOString(),v.kind];};
test('watch calendar respects open, NYSE holidays, early closes, daylight saving, independent daily news and per-fund cadence',()=>{
  assert.deepEqual(clock('2026-11-26T00:00Z'),['2026-11-26T13:30:00.000Z','news']);
  assert.deepEqual(clock('2026-11-26T12:00Z',{marketOnly:true}),['2026-11-27T14:30:00.000Z','open']);
  assert.deepEqual(clock('2026-11-27T17:31Z',{marketOnly:true,interval:30}),['2026-11-30T14:30:00.000Z','open']);
  assert.deepEqual(clock('2026-11-27T14:30Z',{marketOnly:true,interval:120}),['2026-11-27T16:30:00.000Z','market']);
  assert.deepEqual(clock('2027-03-13T00:00Z',{marketOnly:true}),['2027-03-15T13:30:00.000Z','open']);
  assert.equal(clock('2029-01-01T18:00Z'),null);
});
test('fund coverage follows holdings, approvals and mandate; headlines, prices and feed requests keep provenance and shared caching',async()=>{
  const fund={...fixture,portfolio:{positions:[{symbol:'NVDA'},{symbol:'OTHER'}]},permissions:{allowedSymbols:['MSFT']}};
  assert.deepEqual(watchList(fund),{symbols:[{symbol:'NVDA',basis:'holding'},{symbol:'MSFT',basis:'authorized-list'},{symbol:'AAPL',basis:'mandate'}],uncovered:['OTHER']});
  const now=()=>time('2026-11-18T15:00Z');
  assert.equal(readWatchQuote(info('Nov 18, 2026 9:55 AM ET'),'AAPL',now()).status,'delayed');
  assert.throws(()=>readWatchQuote(info('Nov 19, 2026'),'AAPL',now()));
  assert.equal(readWatchQuote(info('Nov 16, 2026'),'AAPL',now()).status,'stale');
  assert.deepEqual(readHeadlines(xml('Thu, 19 Nov 2026 14:00:00 GMT'),{host:'www.nasdaq.com',now:now()}),[]);
  assert.deepEqual(readHeadlines(xml(undefined,'another.example'),{host:'www.nasdaq.com',now:now()}),[]);
  const cache=new Map(),calls=[];
  const sources=createWatchSources({now,cache:{get:k=>cache.get(k),set:(k,v)=>cache.set(k,v)},fetchImpl:async url=>{
    calls.push(url);await delay(5);return new Response(url.includes('/info?')?info('Nov 18, 2026 9:55 AM ET'):xml(undefined,new URL(url).hostname));}});
  const [a,b]=await Promise.all([sources(fixture),sources(fixture)]);
  assert.deepEqual(a,b);assert.equal(calls.length,3);assert.equal(a.news.length,2);assert.equal(a.quotes[0].executionEligible,false);
  await sources(fixture);assert.equal(calls.length,3);
});
test('market slot is claimed once across processes, keeps the due time across restart, persists pause / cadence, and misses a historical slot honestly',async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'watch-claim-')),path=join(tmp,'watch.sqlite');
  const open=()=>{const db=new DatabaseSync(path);db.exec("PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS demo_sessions(session_id TEXT PRIMARY KEY,data TEXT);INSERT OR IGNORE INTO demo_sessions VALUES('owner','{}')");return {db,j:openWatchJournal(db)};};
  const a=open(),b=open();const origin=time('2026-11-18T14:30:00Z'),data={funds:[{id:'default'},fixture]};let now=origin;
  try{
    a.j.sync('owner',data,now);
    const first=a.j.claim(now);assert.ok(first);assert.equal(b.j.claim(now),null);
    a.j.complete(first,'complete',{rule:'news-only'});assert.equal(b.j.read('owner','abc').history.length,1);
    a.j.setPolicy('owner','abc',{intervalMinutes:30},now);assert.equal(b.j.read('owner','abc').due,time('2026-11-18T15:00Z'));
    a.j.setPolicy('owner','abc',{enabled:false},now);assert.equal(b.j.next(),undefined);
    b.j.setPolicy('owner','abc',{enabled:true},now);assert.equal(a.j.next().due,time('2026-11-18T15:00Z'));
    assert.equal(a.j.reserveModel('owner','abc','2026-11-18',now),true);assert.equal(b.j.reserveModel('owner','abc2','2026-11-18',now),false);
    let calls=0;now=time('2026-11-19T16:01Z');
    const worker=createWatchWorker({journal:b.j,enabled:true,now:()=>now,readOwner:()=>({data}),membership:()=>({status:'trial'}),readSources:()=>{calls++;},provider:{}});
    await worker.tick();assert.equal(calls,0);assert.equal(a.j.read('owner','abc').history[0].status,'missed');
    a.db.close();const reopened=open();try{assert.equal(reopened.j.read('owner','abc').history.length,2);assert.equal(reopened.j.read('owner','abc').interval,30);}finally{reopened.db.close();}
  }finally{try{a.db.close()}catch{}b.db.close();await rm(tmp,{recursive:true,force:true});}
});
test('no open web page is required for a founded fund to archive its news and decision; guest preferences and history survive account registration',async()=>{
  const app=await createApp({env:{FUNDROOM_DB_PATH:':memory:',FUNDROOM_BROKER_DB_PATH:':memory:',FUNDROOM_ENABLE_LOCAL_VOICE:'false',FUNDROOM_WATCH_ENABLED:'true'},fetchImpl:async url=>{
    if(String(url).includes('press_all.xml')||String(url).includes('rssoutbound'))return new Response(xml(new Date(Date.now()-60_000).toUTCString(),new URL(url).hostname));
    return new Response('{}',{status:503});}});
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const root='http://127.0.0.1:'+app.server.address().port;
  const query=async(path,{body,cookie}={})=>{const r=await fetch(root+path,{method:body?'POST':'GET',headers:{origin:root,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,v:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  try{
    const start=await query('/api/state');const cookie=start.cookie;
    const act=(action,fields={})=>query('/api/action',{cookie,body:{action,requestId:randomUUID(),...fields}});
    const proposal=await act('prepareTeamStudio');const founded=await act('confirmFundDraft',{draftId:proposal.v.guide.draft.id}),fund=founded.v.createdFundId;
    await delay(220); // No watch read, webpage, or client tick has occurred.
    const url='/api/studio-watch?fund='+fund;
    const check=await query(url,{cookie});assert.equal(check.status,200);assert.equal(check.v.history[0].status,'complete');
    assert.equal(check.v.history[0].record.ai.status,'offline');assert.equal(check.v.history[0].record.packet.news.length,2);assert.equal(check.v.history[0].record.execution.status,'no-order');
    assert.equal((await query(url)).status,404);
    const pref=await query('/api/studio-watch',{cookie,body:{fundId:fund,intervalMinutes:120}});assert.equal(pref.v.intervalMinutes,120);
    assert.equal((await query('/api/studio-watch',{cookie,body:{fundId:fund,intervalMinutes:1}})).status,400);
    const disabled=await query('/api/studio-watch',{cookie,body:{fundId:fund,enabled:false}});assert.equal(disabled.v.nextAt,null);
    const account=await query('/api/auth/register',{cookie,body:{email:'watch@example.test',password:'just-a-test-012345'}});assert.equal(account.status,200);
    const claimed=await query(url,{cookie:account.cookie});assert.equal(claimed.v.intervalMinutes,120);assert.equal(claimed.v.enabled,false);assert.equal(claimed.v.history[0].record.rule,'news-only');
    assert.equal((await query(url,{cookie})).status,404);
  }finally{await new Promise(r=>app.server.close(r));}
});

test('watch compares like-for-like dated sources and never converts news, duplicate observations or old prices into a fill',()=>{
  const first={quotes:[{symbol:'AAPL',provider:'Nasdaq',kind:'reference-close',status:'current',asOf:'2026-11-16',valueUsd:100}],news:[]};
  const next={quotes:[{...first.quotes[0],asOf:'2026-11-17',valueUsd:103}],news:[{url:'https://www.nasdaq.com/articles/example',symbol:'AAPL'}]};
  assert.deepEqual(watchSignals(first,null),{baseline:true,newHeadlines:[],changes:[]});
  assert.equal(watchSignals(next,first).changes[0].percent,3);
  assert.equal(watchSignals({...next,quotes:[{...next.quotes[0],kind:'last-sale'}]},first).changes.length,0);
  assert.equal(watchSignals({...next,quotes:[{...next.quotes[0],status:'stale'}]},first).changes.length,0);
  assert.deepEqual(watchSignals(next,next),{baseline:false,newHeadlines:[],changes:[]});
});
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
test('two independent Node processes contend for the same durable slot without duplicate receipts',async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'watch-race-')),file=join(tmp,'watch.sqlite'),db=new DatabaseSync(file);
  try{
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE demo_sessions(session_id TEXT PRIMARY KEY,data TEXT);INSERT INTO demo_sessions VALUES('tester','{}')");
    const journal=openWatchJournal(db),slot=Date.parse('2026-11-18T14:30:00Z');journal.sync('tester',{funds:[{},fixture]},slot);
    const at=Date.now()+400;
    const src=`import {DatabaseSync}from'node:sqlite';import{setTimeout as wait}from'node:timers/promises';
      import{openWatchJournal}from ${JSON.stringify(new URL('../core/watch-journal.mjs',import.meta.url).href)};
      const db=new DatabaseSync(process.argv[1]);db.exec('pragma busy_timeout=5000');const j=openWatchJournal(db);await wait(Math.max(0,Number(process.argv[3])-Date.now()));
      const slot=j.claim(Number(process.argv[2]));if(slot)j.complete(slot,'complete',{});
      console.log(slot?'claimed':'none');db.close();`;
    const args=['--input-type=module','-e',src,file,String(slot),String(at)];
    const outputs=await Promise.all([exec(process.execPath,args),exec(process.execPath,args)]);
    assert.deepEqual(outputs.map(x=>x.stdout.trim()).sort(),['claimed','none']);assert.equal(journal.read('tester','abc').history.length,1);
  }finally{db.close();await rm(tmp,{recursive:true,force:true});}
});
test('provider receipt is attached only to validated watch evidence and a paid trial opportunity; expired trials still record the data',async()=>{
  const timeline=[time('2026-11-18T14:30:00Z'),time('2026-11-19T14:30:00Z')];
  let timeNow=timeline[0],modelCalls=0,approved=true;
  const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE demo_sessions(session_id TEXT PRIMARY KEY,data TEXT);INSERT INTO demo_sessions VALUES('owner','{}')");
  const journal=openWatchJournal(db),data={funds:[{},fixture]};journal.sync('owner',data,timeNow);
  const sources=async()=>({quotes:[{symbol:'AAPL',valueUsd:123,status:'current',asOf:'2026-11-17'}],news:[],symbols:[{symbol:'AAPL',basis:'mandate'}],feeds:[],capturedAt:new Date(timeNow).toISOString()});
  const env={FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'fixture',HARNESSROUTER_HARNESS_ID:'chrn_fixture'};
  const worker=createWatchWorker({journal,enabled:true,now:()=>timeNow,readOwner:()=>({data}),readSources:sources,membership:()=>({status:approved?'trial':'expired'}),provider:{chatEnabled:true},env,budget:(_n,fn,reserve)=>{reserve();return fn();},fetchImpl:async()=>{
    modelCalls++;return Response.json({id:'resp_watch_test',status:'completed',model:'fixture',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({decision:'MONITOR',zh:'继续跟踪报价。',en:'Monitor the price observation.',refs:['Q1']})}]}]});}});
  try{
    await worker.tick();assert.equal(journal.read('owner','abc').history[0].record.ai.responseId,'resp_watch_test');
    timeNow=timeline[0]+60*60_000;approved=false;
    await worker.tick();const run=journal.read('owner','abc').history[0];assert.equal(run.record.ai.status,'membership-paused');assert.equal(run.record.execution.status,'no-order');assert.equal(run.record.packet.quotes.length,1);assert.equal(modelCalls,1);
  }finally{db.close();}
});

test('shared quote cache re-evaluates the prior reference date on regular and early market closes',async()=>{
  for(const [before,after,previous] of [['2026-11-18T20:58Z','2026-11-18T21:03Z','2026-11-17'],['2026-11-27T17:58Z','2026-11-27T18:03Z','2026-11-25']]){
    let n=Date.parse(before),closeRequests=0;const saved=new Map(),date=previous.endsWith('17')?'Nov 17, 2026':'Nov 25, 2026';
    const src=createWatchSources({now:()=>n,cache:{get:(k,t)=>saved.get(k)?.expires>t?saved.get(k).v:null,set:(k,v,expires)=>saved.set(k,{v,expires})},
      fetchImpl:async url=>new Response(url.includes('/info?')?info(date):xml()),
      readReference:async()=>{closeRequests++;return {observations:[{provider:'Nasdaq',sourceUrl:'https://www.nasdaq.com/',valueUsd:100,asOf:previous,status:closeRequests===1?'current':'stale'}]};}});
    assert.equal((await src(fixture)).quotes[0].status,'current');n=Date.parse(after);
    assert.equal((await src(fixture)).quotes[0].status,'stale');assert.equal(closeRequests,2);
  }
});

test('a site-capacity decline never consumes the daily background allowance',async()=>{
  const at=time('2026-11-18T14:30:00Z'),db=new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE demo_sessions(session_id TEXT PRIMARY KEY,data TEXT);INSERT INTO demo_sessions VALUES('owner','{}')");
    const journal=openWatchJournal(db),data={funds:[{},fixture]};journal.sync('owner',data,at);
    const worker=createWatchWorker({journal,enabled:true,now:()=>at,readOwner:()=>({data}),readSources:async()=>({quotes:[{symbol:'AAPL',valueUsd:100,status:'current',asOf:'2026-11-17'}],news:[],symbols:[],feeds:[]}),
      membership:()=>({status:'trial'}),provider:{chatEnabled:true},budget:async()=>{throw Object.assign(new Error('site capacity'),{status:429});}});
    await worker.tick();
    const record=journal.read('owner',fixture.id).history[0].record;
    assert.equal(record.ai.status,'shared-budget');
    assert.equal(db.prepare('SELECT count(*) AS n FROM studio_watch_budget').get().n,0);
    assert.equal(journal.reserveModel('owner',fixture.id,'2026-11-18',at),true);
  } finally {db.close();}
});

test('restart during opening grace records the missed slot and the actual open once using only current evidence',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec("CREATE TABLE demo_sessions(session_id TEXT PRIMARY KEY,data TEXT);INSERT INTO demo_sessions VALUES('owner','{}')");
    const journal=openWatchJournal(db),data={funds:[{},fixture]};
    let at=time('2026-11-17T19:30Z'),reads=0;
    journal.sync('owner',data,at);
    journal.complete(journal.claim(at),'complete',{});
    const expired=journal.next().due,open=time('2026-11-18T14:30Z');
    at=open+5*60_000;
    const worker=createWatchWorker({journal,enabled:true,now:()=>at,readOwner:()=>({data}),membership:()=>({status:'trial'}),
      readSources:async()=>{reads++;return {capturedAt:new Date(at).toISOString(),quotes:[],news:[],feeds:[],symbols:[]};}});
    await worker.tick();await worker.tick();await worker.tick();
    const history=journal.read('owner',fixture.id).history;
    assert.equal(history.find(r=>r.slot===expired)?.status,'missed');
    assert.equal(history[0].slot,open);
    assert.equal(history[0].started,at);
    assert.equal(history[0].record.packet.capturedAt,new Date(at).toISOString());
    assert.equal(history[0].record.execution.status,'no-order');
    assert.equal(reads,1);
    assert.equal(journal.next().due,open+60*60_000);
  }finally{db.close();}
});

test('recovered feeds retain the last comparable quote and previously seen news after an outage',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec("CREATE TABLE demo_sessions(session_id TEXT PRIMARY KEY,data TEXT);INSERT INTO demo_sessions VALUES('owner','{}')");
    const journal=openWatchJournal(db),data={funds:[{},fixture]};
    let at=time('2026-11-18T14:30Z'),index=0;
    const base={symbol:'AAPL',provider:'Nasdaq',kind:'last-sale',status:'delayed',asOf:new Date(at).toISOString(),valueUsd:100};
    const old={url:'https://www.nasdaq.com/old',symbol:'AAPL'},newer={url:'https://www.nasdaq.com/new',symbol:'AAPL'};
    const packets=[
      {quotes:[base],news:[old]},
      {quotes:[{...base,status:'stale',valueUsd:96}],news:[]},
      {quotes:[{...base,asOf:new Date(at+2*3600_000).toISOString(),valueUsd:103}],news:[newer,old]}
    ];
    const worker=createWatchWorker({journal,enabled:true,now:()=>at,readOwner:()=>({data}),membership:()=>({status:'trial'}),
      readSources:async()=>({...packets[index],symbols:[],feeds:[]}),provider:{chatEnabled:true},budget:async()=>{throw Object.assign(new Error('test budget'),{status:429});}});
    journal.sync('owner',data,at);
    await worker.tick();index++;at+=3600_000;
    await worker.tick();
    assert.equal(journal.read('owner',fixture.id).history[0].record.ai.status,'no-evidence');
    index++;at+=3600_000;await worker.tick();
    const result=journal.read('owner',fixture.id).history[0].record;
    assert.deepEqual(result.signals.newHeadlines,[newer.url]);
    assert.equal(result.signals.changes[0].previous,100);
    assert.equal(result.signals.changes[0].percent,3);
    assert.equal(result.execution.status,'no-order');
  }finally{db.close();}
});

test('two funds restarting just inside the half-day opening window recover separate checks and respect the early close',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec("CREATE TABLE demo_sessions(session_id TEXT PRIMARY KEY,data TEXT);INSERT INTO demo_sessions VALUES('owner','{}')");
    const journal=openWatchJournal(db),second={...fixture,id:'other'};
    const data={funds:[{},fixture,second]},fridayOpen=time('2026-11-27T14:30Z');
    let at=time('2026-11-25T20:00Z');
    journal.sync('owner',data,at);
    const calls=[];
    const worker=createWatchWorker({journal,enabled:true,now:()=>at,readOwner:()=>({data}),membership:()=>({status:'trial'}),
      readSources:async fund=>{calls.push(fund.id);return {symbols:[],quotes:[],news:[],feeds:[]};}});
    await worker.tick();await worker.tick();
    calls.length=0;at=fridayOpen+20*60_000;
    for(let i=0;i<5;i++)await worker.tick();
    assert.deepEqual(calls.sort(),['abc','other']);
    for(const fund of [fixture,second]){
      const job=journal.read('owner',fund.id);
      assert.equal(job.history[0].slot,fridayOpen);assert.equal(job.history[0].status,'complete');
      assert.equal(job.history[0].record.execution.status,'no-order');
      assert.equal(job.history[1].status,'missed');
    }
    at=time('2026-11-27T18:05Z');
    await worker.tick();await worker.tick();
    assert.equal(journal.next().due,time('2026-11-28T13:30Z'));
    assert.equal(calls.length,2);
  }finally{db.close();}
});
