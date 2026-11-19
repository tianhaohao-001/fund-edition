import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { placePortfolioOrder,viewPortfolio } from '../core/portfolio-account.mjs';
import * as portfolioService from '../core/portfolio-account.mjs';
import { openStore } from '../core/store.mjs';

const buy=(productId,amountCents)=>({requestId:randomUUID(),productId,side:'buy',amountCents});
const sell=(productId,unitsMicros)=>({requestId:randomUUID(),productId,side:'sell',unitsMicros});
test('receipts paginate without overlap, retain their historical dates and scope the cursor to its owner',()=>{
  const store=openStore(':memory:',portfolioService);
  try{
    const seed={funds:[{id:'sample'}]};
    store.create('reader-one',seed);store.create('reader-two',seed);
    const ids=[];
    for(let i=0;i<103;i++)ids.push(store.orderPortfolio('reader-one',buy('catalog:buffett',100)).receipt.id);
    const first=store.readPortfolio('reader-one'),last=store.readPortfolio('reader-one',first.olderOrdersCursor);
    assert.equal(first.orders.length,100);assert.equal(last.orders.length,3);assert.equal(last.olderOrdersCursor,null);
    assert.deepEqual([...first.orders,...last.orders].map(o=>o.id),ids.reverse());
    assert.ok(last.orders.every(o=>o.navCents===10387&&o.asOf==='2017-12-29'));
    assert.deepEqual(store.readPortfolio('reader-two',first.olderOrdersCursor).orders,[]);
  }finally{store.close();}
});
test('a single paper wallet prices its own funds and settles redemptions to the cent',()=>{
  const data={funds:[{id:'sample'},...['first','second'].map(id=>({id,name:id,portfolio:{initialCashCents:1_000_000,equityCents:1_000_000},createdAt:'2026-11-19T00:00:00Z'}))],
    catalogAccounts:{'ark-innovation':{cashCents:1_000_000,unitsMicros:5_000_000}},sharedFollows:{demo:{cashCents:8_000_000}}};
  const before=viewPortfolio(data);
  assert.equal(before.cashCents,1_000_000);assert.equal(before.products.length,16);
  assert.ok(!before.products.some(p=>p.productId==='studio:sample'));
  assert.equal(before.products.find(p=>p.productId==='catalog:buffett').quote.asOf,'2017-12-29');
  assert.equal(before.products.find(p=>p.productId==='catalog:ark-innovation').quote.kind,'synthetic');
  assert.throws(()=>placePortfolioOrder(data,buy('studio:foreign',10)),/not available/);
  assert.throws(()=>placePortfolioOrder(data,{...buy('catalog:buffett',100),requestId:[randomUUID()]}),/Invalid paper fund order/);
  assert.throws(()=>placePortfolioOrder(data,{...buy('catalog:buffett',100),expectedNavCents:1}),/NAV changed/);
  assert.throws(()=>placePortfolioOrder(data,{...buy('catalog:buffett',100),expectedAsOf:'2026-11-19'}),/NAV changed/);
  for(const productId of ['studio:first','studio:second','catalog:buffett','catalog:ark-innovation'])placePortfolioOrder(data,buy(productId,12345));
  assert.equal(viewPortfolio(data).positions.length,4);assert.equal(viewPortfolio(data).equityCents,1_000_000);
  const hp=viewPortfolio(data).positions.find(p=>p.productId==='catalog:buffett');
  assert.throws(()=>placePortfolioOrder(data,sell(hp.productId,hp.unitsMicros+1)),/Insufficient fund units/);
  for(const p of viewPortfolio(data).positions){
    const slice=Math.floor(p.unitsMicros/3);
    placePortfolioOrder(data,sell(p.productId,slice));placePortfolioOrder(data,sell(p.productId,p.unitsMicros-slice));
  }
  assert.deepEqual(viewPortfolio(data).positions,[]);assert.equal(viewPortfolio(data).cashCents,1_000_000);
  assert.equal(viewPortfolio(data).realizedPnlCents,0);assert.equal(data.catalogAccounts['ark-innovation'].cashCents,1_000_000);
  const receipt=placePortfolioOrder(data,buy('studio:first',50_000));
  data.funds[1].portfolio.equityCents=1_100_000;
  const changed=viewPortfolio(data);assert.equal(changed.pnlCents,5_000);assert.equal(receipt.navCents,10_000);
  const final=placePortfolioOrder(data,sell('studio:first',receipt.unitsMicros));
  assert.equal(final.amountCents,55_000);assert.equal(viewPortfolio(data).cashCents,1_005_000);
});

test('old and new order routes recover one receipt, with no ambiguity between full and partial redemptions',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'fund-edition-order-retry-')),db=join(folder,'workspace.sqlite');
  let a,b;
  try{
    a=await start(db);b=await start(db);
    const c=(await request(a,'/api/state')).cookie;
    const id='catalog:ark-innovation',catalogId='ark-innovation';
    const legacy=(action,requestId,extra={})=>request(a,'/api/action',c,{action,requestId,catalogId,...extra});
    const order=body=>request(b,'/api/portfolio',c,body);
    const one={...buy(id,25000),expectedNavCents:10656,expectedAsOf:'2026-09-08'};
    const [old,fresh]=await Promise.all([legacy('catalogBuy',one.requestId,{amount:250}),order(one)]);
    assert.equal(old.status,200);assert.equal(fresh.status,200);assert.equal(old.value.portfolioReceipt.id,fresh.value.receipt.id);
    assert.equal(fresh.value.totalOrders,1);assert.equal(fresh.value.cashCents,9_975_000);
    assert.equal((await legacy('catalogBuy',one.requestId,{amount:251})).status,409);
    assert.equal((await order({...one,expectedNavCents:10655})).status,409);
    const partial=sell(id,12345),small=await order(partial);
    assert.equal(small.status,200);assert.equal((await legacy('catalogSell',partial.requestId)).status,409);
    const finalUnits=small.value.positions[0].unitsMicros,finish=sell(id,finalUnits);
    const close=await legacy('catalogSell',finish.requestId);
    assert.equal(close.status,200);assert.equal((await order(finish)).value.receipt.id,close.value.portfolioReceipt.id);
    assert.equal((await order({...finish,unitsMicros:1})).status,409);
    const another=buy(id,10000),fourth=await order(another);
    assert.equal((await legacy('catalogBuy',another.requestId,{amount:100})).value.portfolioReceipt.id,fourth.value.receipt.id);
    const last=sell(id,fourth.value.positions[0].unitsMicros),fifth=await order(last);
    assert.equal((await legacy('catalogSell',last.requestId)).value.portfolioReceipt.id,fifth.value.receipt.id);
    const ledger=(await request(b,'/api/portfolio',c)).value;assert.equal(ledger.totalOrders,5);
    assert.equal(ledger.cashCents,10_000_000);assert.deepEqual(ledger.positions,[]);
    assert.equal(new Set(ledger.orders.map(o=>o.id)).size,5);
  }finally{if(a)await a.stop();if(b)await b.stop();rmSync(folder,{recursive:true,force:true});}
});

const root=fileURLToPath(new URL('../',import.meta.url));
const origin='https://paper-wallet.example';
async function start(db){
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,
    FUNDROOM_HOST:'127.0.0.1',FUNDROOM_PORT:'0',FUNDROOM_PUBLIC_HOSTED:'true',FUNDROOM_PUBLIC_ORIGIN:origin,
    FUNDROOM_ENABLE_LOCAL_VOICE:'false',FUNDROOM_DB_PATH:db},stdio:['ignore','pipe','pipe'],windowsHide:true});
  const reader=createInterface({input:child.stdout});
  const line=await Promise.race([once(reader,'line').then(v=>v[0]),once(child,'exit').then(code=>{throw Error('Test service exited '+code);})]);
  const url=line.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];assert.ok(url);
  return {url,stop:async()=>{if(child.exitCode!==null||child.signalCode!==null)return;const done=once(child,'exit');child.kill();await done;}};
}
async function request(app,path,cookie,data){
  const r=await fetch(app.url+path,{method:data?'POST':'GET',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]??cookie};
}

test('broker walkthrough is workspace-owned, retryable, and independent of the paper wallet and live broker',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'fund-edition-broker-demo-')),db=join(folder,'workspace.sqlite');
  let app;
  try{
    app=await start(db);
    const guest=await request(app,'/api/state'), other=await request(app,'/api/state');
    const route='/api/broker-demo';
    const workspaceRef=guest.value.funds[0].id;
    const connect={workspaceRef,expectedVersion:0,provider:'alpaca'};
    const initial={provider:null,version:0};
    const wallet=(await request(app,'/api/portfolio',guest.cookie)).value;
    assert.deepEqual(guest.value.brokerDemo,initial);
    assert.deepEqual((await request(app,route,other.cookie)).value,initial);
    assert.equal((await request(app,route,guest.cookie,{...connect,apiKey:'unused-placeholder'})).status,400);
    assert.equal((await request(app,route,guest.cookie,{...connect,provider:'live'})).status,400);
    assert.equal((await request(app,route,other.cookie,connect)).status,409);
    const first=await request(app,route,guest.cookie,connect);
    assert.equal(first.status,200);
    assert.deepEqual(first.value,{version:1,provider:'alpaca'});
    assert.deepEqual((await request(app,route,guest.cookie,connect)).value,first.value);
    const form={email:'broker-demo-'+randomUUID()+'@example.test',password:randomUUID()};
    const registered=await request(app,'/api/auth/register',guest.cookie,form);
    assert.equal(registered.status,200);
    assert.deepEqual((await request(app,route,registered.cookie)).value,first.value);
    assert.deepEqual((await request(app,route,guest.cookie)).value,initial);
    const switchTo={workspaceRef,expectedVersion:1,provider:'ibkr'};
    assert.deepEqual((await request(app,route,registered.cookie,switchTo)).value,{version:2,provider:'ibkr'});
    assert.equal((await request(app,route,registered.cookie,{...connect,provider:null})).status,409);
    assert.deepEqual((await request(app,route,other.cookie)).value,initial);
    assert.deepEqual((await request(app,'/api/portfolio',registered.cookie)).value,wallet);
    await app.stop();app=await start(db);
    assert.deepEqual((await request(app,'/api/state',registered.cookie)).value.brokerDemo,{version:2,provider:'ibkr'});
    assert.deepEqual((await request(app,route,registered.cookie,{workspaceRef,expectedVersion:2,provider:null})).value,{version:3,provider:null});
    assert.deepEqual((await request(app,'/api/portfolio',registered.cookie)).value,wallet);
    assert.equal((await request(app,'/api/broker/action',registered.cookie,{action:'status'})).status,404);
  }finally{if(app)await app.stop();rmSync(folder,{recursive:true,force:true});}
});

test('first Studio confirmation invests only available cash once and subsequent funds receive only subscribed cash',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'fund-edition-studio-capital-'));
  const db=join(folder,'workspace.sqlite');
  let firstServer,secondServer;
  try{
    firstServer=await start(db);
    secondServer=await start(db);
    const guest=await request(firstServer,'/api/state');
    const cookie=guest.cookie;
    const state=()=>request(firstServer,'/api/state',cookie);
    const wallet=()=>request(secondServer,'/api/portfolio',cookie);
    const act=(action,fields={})=>request(firstServer,'/api/action',cookie,{action,requestId:randomUUID(),...fields});
    const opening=(await wallet()).value;
    assert.equal(opening.cashCents,10_000_000);
    assert.equal(opening.initialCashCents,opening.cashCents);

    const existing=await request(secondServer,'/api/portfolio',cookie,buy('catalog:buffett',125_000));
    assert.equal(existing.status,200);
    const available=existing.value.cashCents;
    const draft=await act('prepareTeamStudio');
    assert.equal(draft.status,200);
    assert.equal((await wallet()).value.cashCents,available);

    const confirm={action:'confirmFundDraft',draftId:draft.value.guide.draft.id,requestId:randomUUID()};
    const confirmOn=app=>request(app,'/api/action',cookie,confirm);
    const results=await Promise.all([confirmOn(firstServer),confirmOn(secondServer)]);
    assert.ok(results.some(r=>r.status===200));
    for(const result of results){
      if(result.status!==200)assert.deepEqual([result.status,result.value.code],[409,'state-conflict']);
    }
    const firstId=results.find(r=>r.status===200).value.fund.id;
    const recovered=await confirmOn(secondServer);
    assert.equal(recovered.status,200);
    assert.equal(recovered.value.fund.id,firstId);
    assert.equal(recovered.value.funds.length,2);
    assert.equal(recovered.value.fund.portfolio.cashCents,available);
    assert.equal(recovered.value.fund.portfolio.equityCents,available);
    const afterFirst=(await wallet()).value;
    assert.equal(afterFirst.totalOrders,2);
    assert.equal(afterFirst.cashCents,0);
    assert.equal(afterFirst.equityCents,opening.equityCents);
    assert.equal(afterFirst.pnlCents,0);
    const firstProduct='studio:'+firstId;
    const held=afterFirst.positions.find(row=>row.productId===firstProduct);
    assert.equal(held.valueCents,available);
    assert.equal(afterFirst.orders.filter(row=>row.productId===firstProduct).length,1);
    assert.deepEqual(afterFirst.positions.find(row=>row.kind==='catalog'),existing.value.positions[0]);

    await act('resetDesignConversation');
    const secondDraft=await act('prepareTeamStudio');
    const created=await act('confirmFundDraft',{draftId:secondDraft.value.guide.draft.id});
    assert.equal(created.status,200);
    const secondId=created.value.fund.id;
    assert.notEqual(secondId,firstId);
    assert.equal(created.value.fund.portfolio.cashCents,0);
    const afterSecond=(await wallet()).value;
    assert.equal(afterSecond.totalOrders,2);
    assert.deepEqual(afterSecond.positions,afterFirst.positions);
    const redemption=await request(firstServer,'/api/portfolio',cookie,sell(firstProduct,10_000_000));
    assert.equal(redemption.status,200);
    const freed=redemption.value.cashCents;
    assert.ok(freed>0 && freed<available);
    const invest=buy('studio:'+secondId,freed);
    const purchase=await request(secondServer,'/api/portfolio',cookie,invest);
    assert.equal(purchase.status,200);
    assert.equal(purchase.value.cashCents,0);
    assert.equal(purchase.value.equityCents,opening.equityCents);
    assert.equal(purchase.value.pnlCents,0);
    const reopened=await act('selectFund',{fundId:firstId});
    assert.equal(reopened.status,200);
    assert.equal(reopened.value.fund.portfolio.cashCents,available-freed);
    assert.equal((await state()).value.funds.find(fund=>fund.id===secondId).portfolio.cashCents,freed);

    const registration=await request(firstServer,'/api/auth/register',cookie,{email:'fund-owner-'+randomUUID()+'@example.test',password:randomUUID()});
    assert.equal(registration.status,200);
    const registered=await request(secondServer,'/api/portfolio',registration.cookie);
    assert.deepEqual(registered.value.positions,purchase.value.positions);
    assert.deepEqual(registered.value.orders,purchase.value.orders);
    const repeat=await request(firstServer,'/api/portfolio',registration.cookie,invest);
    assert.equal(repeat.value.receipt.id,purchase.value.receipt.id);
    assert.equal(repeat.value.totalOrders,4);
    assert.deepEqual((await wallet()).value.positions,[]);
  }finally{
    if(firstServer)await firstServer.stop();
    if(secondServer)await secondServer.stop();
    rmSync(folder,{recursive:true,force:true});
  }
});

test('SQLite serializes two server processes and preserves portfolios, legacy records and receipts on registration/restart',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'fund-edition-wallet-')),db=join(folder,'workspace.sqlite');
  const servers=[];
  try{
    const a=await start(db);servers.push(a);const b=await start(db);servers.push(b);
    const first=await request(a,'/api/state');const second=await request(b,'/api/state');
    const c=first.cookie,other=second.cookie;assert.notEqual(c,other);
    // This workspace already owned two legacy strategy books before wallets existed.
    // Keep its original funds and opening balance independent of the new-account grant.
    const fixtureDb=new DatabaseSync(db);
    const owner=c.split('=')[1];
    const legacyData=JSON.parse(fixtureDb.prepare('SELECT data FROM demo_sessions WHERE session_id=?').get(owner).data);
    delete legacyData.portfolioAccount;
    for(const name of ['Income','Growth']){
      legacyData.funds.push({...structuredClone(legacyData.funds[0]),id:randomUUID(),name});
    }
    legacyData.catalogAccounts={buffett:{environment:'catalog-paper',cashCents:999999,unitsMicros:123}};
    fixtureDb.prepare('UPDATE demo_sessions SET data=? WHERE session_id=?').run(JSON.stringify(legacyData),owner);
    fixtureDb.close();
    const migrated=await request(a,'/api/portfolio',c);
    assert.equal(migrated.value.cashCents,1_000_000);assert.equal(migrated.value.legacy.catalogAccounts,1);assert.deepEqual(migrated.value.positions,[]);
    const own=(await request(b,'/api/portfolio',c)).value.products.filter(p=>p.kind==='studio');
    assert.equal(own.length,2);
    assert.equal((await request(a,'/api/portfolio',other,buy(own[0].productId,100))).status,404);
    const same=buy('catalog:buffett',150000);
    const concurrent=await Promise.all([request(a,'/api/portfolio',c,same),request(b,'/api/portfolio',c,same)]);
    assert.ok(concurrent.every(r=>r.status===200));assert.equal(concurrent[0].value.receipt.id,concurrent[1].value.receipt.id);
    assert.equal(concurrent[1].value.totalOrders,1);
    assert.equal((await request(b,'/api/portfolio',c,{...same,amountCents:149999})).status,409);
    const large=await Promise.all([request(a,'/api/portfolio',c,buy(own[0].productId,700000)),request(b,'/api/portfolio',c,buy('catalog:ark-innovation',700000))]);
    assert.deepEqual(large.map(r=>r.status).sort(),[200,409]);
    assert.equal((await request(a,'/api/portfolio',c)).value.cashCents,150000);
    for(const product of [...own.map(p=>p.productId),'catalog:ark-innovation'])assert.equal((await request(a,'/api/portfolio',c,buy(product,10000))).status,200);
    const held=(await request(a,'/api/portfolio',c)).value;assert.equal(held.positions.length,4);assert.equal(held.cashCents,120000);
    // An already-open old edition must also consume the shared cash.
    const legacy=await request(a,'/api/action',c,{action:'catalogBuy',catalogId:'buffett',requestId:'old-browser-order',amount:20});
    assert.equal(legacy.status,200);assert.equal((await request(a,'/api/portfolio',c)).value.cashCents,118000);
    const crossTab=await request(b,'/api/portfolio',c,buy('catalog:buffett',4000));
    const projected=(await request(a,'/api/state',c)).value.catalogAccounts.buffett;
    assert.equal(projected.cashCents,114000);assert.equal(projected.unitsMicros,crossTab.value.positions.find(p=>p.productId==='catalog:buffett').unitsMicros);
    assert.equal((await request(b,'/api/portfolio',other)).value.cashCents,10_000_000);
    const registration=await request(a,'/api/auth/register',c,{email:'wallet-'+randomUUID()+'@example.test',password:randomUUID()});
    assert.equal(registration.status,200);const user=registration.cookie;assert.notEqual(c,user);
    const claimed=await request(a,'/api/portfolio',user);assert.equal(claimed.value.positions.length,4);assert.equal(claimed.value.totalOrders,7);
    assert.deepEqual((await request(b,'/api/portfolio',c)).value.positions,[]);
    await a.stop();await b.stop();
    const restarted=await start(db);servers.push(restarted);
    const recovered=await request(restarted,'/api/portfolio',user);assert.deepEqual(recovered.value,claimed.value);
    const retried=await request(restarted,'/api/portfolio',user,same);assert.equal(retried.value.receipt.id,concurrent[0].value.receipt.id);
    for(const p of recovered.value.positions)assert.equal((await request(restarted,'/api/portfolio',user,sell(p.productId,p.unitsMicros))).status,200);
    const final=await request(restarted,'/api/portfolio',user);assert.equal(final.value.cashCents,1_000_000);assert.deepEqual(final.value.positions,[]);
    assert.equal(final.value.realizedPnlCents,0);assert.equal(final.value.totalOrders,11);
  }finally{for(const s of servers)await s.stop();rmSync(folder,{recursive:true,force:true});}
});
