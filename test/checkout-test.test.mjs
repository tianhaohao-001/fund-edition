import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {get as httpGet} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server.mjs';
import {testCheckout,testCheckoutRecords} from '../core/checkout-test.mjs';

const input=(cadence='monthly')=>({requestKey:randomUUID(),cadence});
const origin='https://checkout-test.example';
const sandboxEnv={FUNDROOM_PAYPAL_SANDBOX_CLIENT_ID:'test-only',FUNDROOM_PAYPAL_SANDBOX_CLIENT_SECRET:'test-only'};
function sandboxFixture(){
  const registered=new Map();let idx=0,count=0,wrong=false,errorAfterCapture=false;
  const api=async (href,req)=>{
    const url=new URL(href);assert.equal(url.origin,'https://api-m.sandbox.paypal.com');assert.equal(req.redirect,'error');
    if(url.pathname==='/v1/oauth2/token')return Response.json({access_token:'test-access',expires_in:3600});
    assert.equal(req.headers.Authorization,'Bearer test-access');
    if(url.pathname==='/v2/checkout/orders'){
      const payload=JSON.parse(req.body),unit=payload.purchase_units[0],ctx=payload.payment_source.paypal.experience_context;
      assert.equal(payload.intent,'CAPTURE');assert.equal(unit.amount.currency_code,'USD');
      assert.equal(req.headers['PayPal-Request-Id'],unit.reference_id);assert.equal(unit.reference_id,unit.custom_id);
      assert.equal(new URL(ctx.return_url).origin,origin);assert.equal(new URL(ctx.cancel_url).searchParams.get('step'),'cancel');
      const id='SANDBOXORDER'+(++idx),url='https://www.sandbox.paypal.com/checkoutnow?token='+id;
      const order={id,intent:'CAPTURE',status:'PAYER_ACTION_REQUIRED',purchase_units:[unit],links:[{rel:'payer-action',href:url}]};
      registered.set(id,order);return Response.json(order);
    }
    const order=registered.get(url.pathname.split('/')[4]),unit=order.purchase_units[0];
    if(url.pathname.endsWith('/capture')){
      assert.equal(req.headers['PayPal-Request-Id'],'c-'+unit.reference_id);assert.equal(order.status,'APPROVED');
      count++;order.status='COMPLETED';unit.payments={captures:[{id:'SANDBOXPAYMENT'+idx,amount:{...unit.amount,value:wrong?'8.00':unit.amount.value},final_capture:true,status:'COMPLETED'}]};
      if(errorAfterCapture)return new Response('{}',{status:503});
      return Response.json({id:order.id,status:order.status,purchase_units:[{reference_id:unit.reference_id,payments:unit.payments}]});
    }
    return Response.json(order);
  };
  return {api,get count(){return count;},approve(id){registered.get(id).status='APPROVED';},wrongAmount(){wrong=true;},loseResponse(){errorAfterCapture=true;},
    edit(id,fn){fn(registered.get(id));}};
}
test('guest test checkout stays isolated from live access, other visitors, cancellation, and repeated confirmation',async()=>{
  const env={FUNDROOM_DB_PATH:':memory:',FUNDROOM_PUBLIC_HOSTED:'true',FUNDROOM_PUBLIC_ORIGIN:origin,FUNDROOM_INVOICE_ORDERS:'true',FUNDROOM_PAYPAL_MODE:'live',PAYPAL_CLIENT_ID:'never-use',PAYPAL_CLIENT_SECRET:'never-use'};
  const app=await createApp({env,fetchImpl:()=>{throw Error('Unexpected provider call');}});
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base='http://127.0.0.1:'+app.server.address().port,route='/api/checkout-test/';
  const get=(path,cookie,headers)=>fetch(base+path,{headers:{...(cookie?{Cookie:cookie}:{}),...headers}});
  const post=(action,body,cookie,source=origin)=>fetch(base+route+action,{method:'POST',headers:{Origin:source,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  try{
    const navigate=path=>new Promise((resolve,reject)=>httpGet(base+path,{headers:{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));
    for(const path of ['/checkout-test','/checkout-test.html'])assert.equal(await navigate(path),200);
    assert.equal((await get('/checkout-test-missing')).status,404);
    const init=await get(route+'state'),cookie=init.headers.get('set-cookie');assert.match(cookie,/Path=\/api\/checkout-test; HttpOnly; SameSite=Lax/);
    const owner=cookie.split(';')[0],other=(await get(route+'state')).headers.get('set-cookie').split(';')[0];const initial=await init.json();
    assert.deepEqual([initial.mode,initial.sandboxAvailable,initial.testAccess.active],['simulation',false,false]);
    assert.equal((await get(route+'state?mode=sandbox',owner)).status,503);
    assert.equal((await post('create',input(),owner,'https://different.example')).status,403);
    assert.equal((await post('create',input(),null)).status,401);
    const demo=input('yearly'),created=await(await post('create',demo,owner)).json(),id=created.order.id;
    assert.equal(created.order.amountUsd,'99.99');assert.equal((await(await post('create',demo,owner)).json()).order.id,id);
    assert.equal((await post('capture',{id},owner)).status,409);assert.equal((await post('approve',{id},other)).status,404);
    await post('cancel',{id},owner);assert.equal((await post('approve',{id},owner)).status,409);
    const accepted=(await(await post('create',input(),owner)).json()).order.id;
    assert.equal((await(await post('approve',{id:accepted},owner)).json()).testAccess.active,false);
    const confirmation=await(await post('capture',{id:accepted},owner)).json();
    assert.equal(confirmation.testAccess.active,true);assert.equal(confirmation.testAccess.cadence,'monthly');assert.match(confirmation.order.receipt,/^SIM-/);
    assert.deepEqual((await(await post('capture',{id:accepted},owner)).json()).order,confirmation.order);
    assert.equal((await(await get(route+'state',other)).json()).testAccess.active,false);
    assert.equal((await(await get('/api/membership',owner)).json()).membership.subscription.status,'inactive');
    assert.equal((await post('cancel',{id:accepted},owner)).status,409);
  }finally{await new Promise(done=>app.server.close(done));}
});
test('Sandbox Orders v2 verifies buyer, receipt and exact amount, isolates local simulation and recovers a lost capture response',async()=>{
  const db=new DatabaseSync(':memory:'),records=testCheckoutRecords(db),gateway=sandboxFixture();
  const service=testCheckout({env:sandboxEnv,records,fetchImpl:gateway.api});
  const run=(action,body,owner='buyer')=>service.run(action,owner,{mode:'sandbox',...body},origin);
  try{
    assert.equal((await service.run('state','buyer',{},origin)).mode,'sandbox');
    const created=await run('create',input('yearly')),id=created.order.id,providerId=new URL(created.order.approvalUrl).searchParams.get('token');
    await assert.rejects(run('approve',{id}),{code:'test-external-approval'});await assert.rejects(run('capture',{id}),{code:'test-approval-required'});
    await assert.rejects(run('capture',{id},'another'),{code:'test-order-missing'});assert.equal(gateway.count,0);
    gateway.approve(providerId);gateway.loseResponse();await assert.rejects(run('capture',{id}),{code:'billing-unavailable'});
    assert.equal((await run('state',{})).testAccess.active,false);assert.equal(gateway.count,1);
    const paid=await run('capture',{id});assert.equal(paid.order.status,'captured');assert.equal(paid.testAccess.active,true);
    assert.deepEqual(await run('capture',{id}),paid);assert.equal(gateway.count,1);
    assert.equal((await run('state',{mode:'simulation'})).testAccess.active,false);
    const bad=await run('create',input(),'bad'),badId=new URL(bad.order.approvalUrl).searchParams.get('token');
    gateway.approve(badId);gateway.wrongAmount();await assert.rejects(run('capture',{id:bad.order.id},'bad'));
    await assert.rejects(run('capture',{id:bad.order.id},'bad'),{code:'test-unverified'});assert.equal((await run('state',{},'bad')).testAccess.active,false);
    const swap=await run('create',input(),'swap'),swapId=new URL(swap.order.approvalUrl).searchParams.get('token');gateway.approve(swapId);
    gateway.edit(swapId,order=>{order.purchase_units[0].amount.currency_code='EUR';});
    await assert.rejects(run('capture',{id:swap.order.id},'swap'),{code:'test-unverified'});assert.equal(gateway.count,2);
  }finally{db.close();}
});
