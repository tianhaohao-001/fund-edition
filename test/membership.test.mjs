import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../server.mjs';
import { openStore } from '../core/store.mjs';
import { studioMembership, changeSimulatedMembership } from '../core/membership.mjs';
import { annualFeeExample } from '../web/membership-plan.mjs';

test('simulated checkout is two-step, tied to the workspace and never enables production entitlements',()=>{
  const now=Date.parse('2026-01-31T12:00:00Z');
  const guest={studioMembership:{startedAt:'2025-01-01T00:00:00Z'}};
  const view=(at=now)=>studioMembership(guest,at,{simulation:true});
  assert.equal(view().monthlyUsd,9.99);
  assert.throws(()=>changeSimulatedMembership(guest,{action:'confirm',revision:0},now));
  changeSimulatedMembership(guest,{action:'prepare',revision:0},now);
  const offer=view().checkout;
  assert.throws(()=>changeSimulatedMembership({},{action:'confirm',checkoutId:offer.id,revision:0},now));
  assert.throws(()=>changeSimulatedMembership(guest,{action:'confirm',checkoutId:offer.id,revision:1},now+16*60_000));
  changeSimulatedMembership(guest,{action:'confirm',checkoutId:offer.id,revision:1},now);
  assert.equal(view().status,'member');
  assert.equal(view().subscription.periodEnd,'2026-02-28T12:00:00.000Z');
  assert.equal(studioMembership(guest,now).status,'expired');
  changeSimulatedMembership(guest,{action:'cancel',revision:2},now);
  assert.equal(view().subscription.status,'canceling');
  assert.equal(view(Date.parse('2026-02-28T12:00:00Z')).subscription.status,'inactive');
  changeSimulatedMembership(guest,{action:'resume',revision:3},now+1);
  assert.equal(view(Date.parse('2026-02-28T12:00:00Z')).subscription.periodEnd,'2026-03-31T12:00:00.000Z');
  assert.throws(()=>changeSimulatedMembership(guest,{action:'cancel',revision:2},now));
});

test('fee examples distinguish the original expense ratio, estimated all-in cost and comparison scenario', () => {
  const amounts = annualFeeExample(10000);
  assert.deepEqual(Object.fromEntries(Object.entries(amounts).map(([k,v]) => [k, Math.round(v * 100)])),
    { platform:1500, underlying:365, combined:1865, wellington:2400, comparison:5000 });
  assert.equal(annualFeeExample(0).combined, 0);
  assert.throws(()=>annualFeeExample(-10),RangeError);
  const data={studioMembership:{startedAt:'2026-11-18T12:00:00Z'}};
  assert.equal(studioMembership(data,Date.parse('2026-11-25T11:59:59Z')).daysRemaining,1);
  assert.equal(studioMembership(data,Date.parse('2026-11-25T12:00:00Z')).status,'expired');
});

test('the real HTTP flow starts one trial only on confirmation; intent and paper results survive expiry, signup, subsequent login and restart',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'fundroom-membership-'));
  const path=join(directory,'accounts.sqlite');
  let server,base;
  async function start(){
    const app=await createApp({env:{FUNDROOM_DB_PATH:path,FUNDROOM_BROKER_DB_PATH:join(directory,'broker.sqlite')}});
    server=app.server;server.listen(0,app.host);await once(server,'listening');base='http://'+app.host+':'+server.address().port;
  }
  async function close(){if(server?.listening)await new Promise(resolve=>server.close(resolve));}
  async function request(route,cookie,body){
    const headers={};
    if(cookie)headers.Cookie=cookie;
    if(body){headers['Content-Type']='application/json';headers.Origin=base;}
    const res=await fetch(base+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
    return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]??cookie};
  }
  try{
    await start();
    const guest=await request('/api/state');
    const action=body=>request('/api/action',guest.cookie,body);
    assert.equal(guest.body.membership.status,'not_started');
    const draft=await action({action:'designConversation',provider:'replay',requestId:'first',message:'采用长期价值投资，投资五年，稳健风险。'});
    assert.equal(draft.body.membership.status,'not_started');
    assert.equal(draft.body.guide.phase,'ready');
    const confirmation={action:'confirmFundDraft',draftId:draft.body.guide.draft.id,requestId:'confirm-test'};
    const created=await action(confirmation);
    assert.equal(created.status,200);assert.equal(created.body.membership.daysRemaining,7);
    assert.equal((await action(confirmation)).body.membership.startedAt,created.body.membership.startedAt);
    const another=await action({action:'createFund',name:'Second workspace fund'});
    assert.equal(another.body.membership.startedAt,created.body.membership.startedAt);
    await action({action:'setMembershipInterest',interested:true});
    const repeat=await action({action:'setMembershipInterest',interested:true});
    assert.ok(repeat.body.membership.interestAt);assert.equal(repeat.body.membership.checkoutEnabled,false);
    const firstId=created.body.fund.id;
    const recorded=await action({action:'runScenario',fundId:firstId,provider:'replay',requestId:'one-review'});
    assert.equal(recorded.status,200);
    await close();
    const store=openStore(path),guestId=guest.cookie.split('=')[1];
    const existing=store.read(guestId);
    existing.data.studioMembership.startedAt='2020-01-01T00:00:00.000Z';
    store.save(guestId,existing.revision,existing.data);store.close();
    await start();
    const credentials={email:'tester@example.test',password:'study-access-once-2026'};
    const registered=await request('/api/auth/register',guest.cookie,credentials);
    assert.equal(registered.status,200);
    const signedIn=await request('/api/auth/login',undefined,credentials);
    assert.equal(signedIn.status,200);
    const state=await request('/api/state',signedIn.cookie);
    assert.equal(state.body.membership.status,'expired');assert.equal(state.body.membership.daysRemaining,0);
    assert.equal(state.body.membership.interestAt,repeat.body.membership.interestAt);
    assert.equal(state.body.funds.find(f=>f.id===firstId).runs[0].id,recorded.body.run.id);
    const get=body=>request('/api/action',signedIn.cookie,body);
    for(const input of [
      {action:'sendChat',fundId:firstId,message:'Explain my account',requestId:'ask'},
      {action:'sendChat',fundId:firstId,message:'Explain my account'},
      {action:'runScenario',fundId:firstId,provider:'committee',requestId:'real'},
      {action:'designConversation',message:'Another strategy',requestId:'again'},
      {action:'createFund',name:'Reset',studioMembership:{status:'paid'},membership:{status:'paid'}},
    ]){
      const denied=await get(input);
      assert.equal(denied.status,402);assert.equal(denied.body.code,'studio-trial-ended');
    }
    assert.equal((await get({action:'setMembershipInterest',interested:false})).body.membership.interestAt,null);
    assert.equal((await get({action:'setMembershipInterest',interested:'paid'})).status,400);
    assert.equal((await request('/api/state')).body.membership.status,'not_started');
    assert.equal((await get({action:'runScenario',fundId:firstId,provider:'replay',requestId:'one-review'})).body.run.id,recorded.body.run.id);
  }finally{await close();rmSync(directory,{recursive:true,force:true});}
});

test('existing custom teams receive a stable grace period while seed and historical-only accounts remain unstarted',()=>{
  const dir=mkdtempSync(join(tmpdir(),'fundroom-membership-migrate-'));
  try{
    const path=join(dir,'legacy.sqlite');
    let store=openStore(path);
    store.create('legacy',{funds:[{id:'seed'},{id:'custom'}]});
    store.create('market',{funds:[{id:'seed'},{id:'historic',replica:{catalogId:'wellington'}}]});
    store.create('welcome',{funds:[{id:'seed'}]});store.close();
    store=openStore(path);
    const start=studioMembership(store.read('legacy').data).startedAt;
    assert.ok(start);
    for(const id of ['market','welcome'])assert.equal(studioMembership(store.read(id).data).status,'not_started');
    store.close();store=openStore(path);
    assert.equal(studioMembership(store.read('legacy').data).startedAt,start);
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
