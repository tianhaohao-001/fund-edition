import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {once} from 'node:events';
import {createPayPalBilling,paypalRecords,PAYPAL_CYCLES,PAYPAL_EVENTS} from '../core/paypal-billing.mjs';
import {prepareMerchant} from '../scripts/setup-paypal-merchant.mjs';

function vendor(mode){
  const host=mode==='live'?'www.paypal.com':'www.sandbox.paypal.com',plans={},subs=new Map(),sales=new Map(),products=[],hooks=[];
  let calls=0;
  async function api(path,{method='GET',body}={}){
    const url=new URL(path,'https://example.test'),route=url.pathname;
    if(route==='/v1/catalogs/products'){
      if(method==='POST'){
        assert.equal(body.id,undefined);
        const item={...body,id:'PROD-'+String(products.length+1).padStart(17,'0')};
        products.push(item);return item;
      }
      return {products};
    }
    if(route.startsWith('/v1/catalogs/products/'))return products.find(p=>p.id===route.split('/').at(-1));
    if(route==='/v1/billing/plans'){
      if(method==='POST'){
        assert.match(body.product_id,/^PROD-[A-Z0-9]{17}$/);
        assert.ok(products.some(p=>p.id===body.product_id));
        const id='P-PLAN0'+Object.keys(plans).length;return plans[id]={...body,id};
      }
      return {plans:Object.values(plans).filter(p=>p.product_id===url.searchParams.get('product_id'))};
    }
    if(route.startsWith('/v1/billing/plans/'))return plans[route.split('/').at(-1)];
    if(route==='/v1/notifications/webhooks'){
      if(method==='POST'){const hook={...body,id:'webhook_fixture'};hooks.push(hook);return hook;}return {webhooks:hooks};
    }
    if(route==='/v1/notifications/verify-webhook-signature')return {verification_status:body.transmission_sig==='verified'&&body.webhook_id==='webhook_fixture'?'SUCCESS':'FAILURE'};
    if(route==='/v1/billing/subscriptions'){
      const id='I-USER0'+(subs.size+1),s={id,plan_id:body.plan_id,custom_id:body.custom_id,status:'APPROVAL_PENDING',links:[{rel:'approve',href:'https://'+host+'/webapps/billing/subscriptions?ba_token='+id}]};
      subs.set(id,s); return s;
    }
    const id=route.split('/')[4];const s=subs.get(id);assert.ok(s);
    if(route.endsWith('/transactions')){calls++;return {transactions:sales.has(id)?[sales.get(id)]:[]};}
    if(route.endsWith('/cancel')){assert.ok(['ACTIVE','SUSPENDED'].includes(s.status));s.status='CANCELLED';return null;}
    return s;
  }
  function paid(id,amount,when=new Date(Date.now()-10000).toISOString()){
    const s=subs.get(id),gross={currency_code:'USD',value:amount};
    s.status='ACTIVE';s.billing_info={last_payment:{amount:gross,time:when},next_billing_time:new Date(Date.now()+366*86400000).toISOString()};
    sales.set(id,{id:'SALE'+id,time:when,status:'COMPLETED',amount_with_breakdown:{gross_amount:gross}});
  }
  const fetchImpl=async(input,opts)=>{
    const u=new URL(input);assert.equal(u.host,mode==='live'?'api-m.paypal.com':'api-m.sandbox.paypal.com');
    if(u.pathname==='/v1/oauth2/token')return Response.json({access_token:'fixture',expires_in:28800});
    const result=await api(u.pathname+u.search,{method:opts.method,body:opts.body?JSON.parse(opts.body):undefined});
    return result===null?new Response(null,{status:204}):Response.json(result);
  };
  return {api,fetchImpl,subs,sales,plans,hooks,products,paid,verificationCalls:()=>calls};
}

for(const mode of ['sandbox','live'])test('PayPal '+mode+' monthly and annual subscriptions reconcile paid periods, cancellations, refunds and out-of-order webhooks',async()=>{
  const v=vendor(mode),origin='https://example.test';
  const config=await prepareMerchant(v.api,origin);
  assert.deepEqual(await prepareMerchant(v.api,origin),config);
  assert.equal(v.products.length,1);assert.equal(Object.keys(v.plans).length,2);assert.equal(v.hooks.length,1);
  assert.equal(v.hooks[0].event_types.length,PAYPAL_EVENTS.length);
  const db=new DatabaseSync(':memory:');
  try{
    db.exec("CREATE TABLE demo_sessions(session_id TEXT PRIMARY KEY); INSERT INTO demo_sessions VALUES('workspace1'),('workspace2'),('workspace3')");
    let unavailableSubscription=false;
    const fetchImpl=(input,options)=>unavailableSubscription&&new URL(input).pathname.startsWith('/v1/billing/subscriptions/')
      ?Promise.resolve(new Response(null,{status:503})):v.fetchImpl(input,options);
    const processor=createPayPalBilling({env:{...config,FUNDROOM_PAYPAL_MODE:mode,PAYPAL_CLIENT_ID:'fake',PAYPAL_CLIENT_SECRET:'fake'},origin,records:paypalRecords(db),fetchImpl});
    const headers={'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.paypal.com/v1/notifications/certs/fake','paypal-transmission-id':'unique',
      'paypal-transmission-sig':'verified','paypal-transmission-time':new Date().toISOString()};
    const event=(type,id,resource,sig='verified')=>processor.webhook(Buffer.from(JSON.stringify({event_type:type,id,resource})),{...headers,'paypal-transmission-sig':sig});
    const monthly=v.plans[config.PAYPAL_MONTHLY_PLAN_ID];monthly.billing_cycles[0].pricing_scheme.fixed_price.value='0.01';
    await assert.rejects(processor.checkout('workspace1','en-US','monthly'));assert.equal(v.subs.size,0);
    monthly.billing_cycles[0].pricing_scheme.fixed_price.value=PAYPAL_CYCLES.monthly.usd;
    const [first,duplicate]=await Promise.all([processor.checkout('workspace1','en-US','yearly'),processor.checkout('workspace1','zh-CN','yearly')]);
    assert.deepEqual(first,duplicate);assert.equal(v.subs.size,1);
    await assert.rejects(processor.checkout('workspace1','en-US','monthly'),{code:'billing-pending'});
    const [s]=v.subs.values();assert.equal(s.plan_id,config.PAYPAL_YEARLY_PLAN_ID);
    s.status='ACTIVE';await processor.refresh('workspace1');assert.equal(processor.subscriptionFor('workspace1'),null);
    v.paid(s.id,'99.99');await assert.rejects(event('PAYMENT.SALE.COMPLETED','WH1',{billing_agreement_id:s.id},'invalid'));
    assert.equal(processor.subscriptionFor('workspace1'),null);await event('PAYMENT.SALE.COMPLETED','WH1',{billing_agreement_id:s.id});
    assert.equal(processor.subscriptionFor('workspace1').cadence,'yearly');assert.equal(processor.subscriptionFor('workspace2'),null);
    const n=v.verificationCalls();await event('PAYMENT.SALE.COMPLETED','WH1',{billing_agreement_id:s.id});assert.equal(v.verificationCalls(),n);
    await processor.cancel('workspace1');assert.equal(processor.subscriptionFor('workspace1').status,'canceling');
    unavailableSubscription=true;
    await assert.rejects(event('PAYMENT.SALE.REFUNDED','WH2',{sale_id:'SALE'+s.id}),{code:'billing-unavailable'});
    assert.equal(processor.subscriptionFor('workspace1'),null);
    unavailableSubscription=false;
    await event('PAYMENT.SALE.REFUNDED','WH2',{sale_id:'SALE'+s.id});assert.equal(processor.subscriptionFor('workspace1'),null);
    await event('BILLING.SUBSCRIPTION.ACTIVATED','WH3',{id:s.id});assert.equal(processor.subscriptionFor('workspace1'),null);
    await processor.checkout('workspace2','zh-CN','monthly');const other=[...v.subs.values()].at(-1);
    v.paid(other.id,'9.99');await processor.refresh('workspace2');assert.equal(processor.subscriptionFor('workspace2').cadence,'monthly');
    v.sales.get(other.id).amount_with_breakdown.gross_amount.value='1.00';await processor.refresh('workspace2');assert.equal(processor.subscriptionFor('workspace2'),null);
    v.paid(other.id,'9.99', new Date(Date.now()-33*86400000).toISOString());await processor.refresh('workspace2');assert.equal(processor.subscriptionFor('workspace2'),null);
    v.paid(other.id,'9.99');other.status='SUSPENDED';await processor.refresh('workspace2');assert.equal(processor.subscriptionFor('workspace2'),null);
    other.status='ACTIVE';other.custom_id='wrong-owner';await assert.rejects(processor.refresh('workspace2'));assert.equal(processor.subscriptionFor('workspace2'),null);
    await processor.checkout('workspace3','zh-CN','monthly');await processor.refresh('workspace3');
    const abandoned=[...v.subs.values()].at(-1);
    assert.equal(processor.pendingCadence('workspace3'),'monthly');
    await assert.rejects(processor.checkout('workspace3','zh-CN','yearly'),{code:'billing-pending'});
    await assert.rejects(processor.cancel('workspace3',{onlyPending:true}),{code:'billing-awaiting-approval'});
    assert.equal(abandoned.status,'APPROVAL_PENDING');
    abandoned.status='EXPIRED';
    await processor.checkout('workspace3','zh-CN','yearly');
    const replacement=[...v.subs.values()].at(-1);assert.notEqual(replacement.id,abandoned.id);
    assert.equal(replacement.plan_id,config.PAYPAL_YEARLY_PLAN_ID);
    v.paid(replacement.id,'99.99');await assert.rejects(processor.cancel('workspace3',{onlyPending:true}),{code:'billing-pending'});
    assert.equal(processor.testMode,mode==='sandbox');
  }finally{db.close();}
});

test('merchant initialization reuses the generated product and checks the configured plan association',async()=>{
  const v=vendor('sandbox'),origin='https://example.test';
  const config=await prepareMerchant(v.api,origin);
  const configured={monthly:config.PAYPAL_MONTHLY_PLAN_ID,yearly:config.PAYPAL_YEARLY_PLAN_ID};
  assert.deepEqual(await prepareMerchant(v.api,origin,{monthly:configured.monthly}),config);
  assert.deepEqual(await prepareMerchant(v.api,origin,configured),config);
  assert.equal(v.products.length,1);
  assert.equal(Object.keys(v.plans).length,2);
  v.plans[configured.yearly].product_id='PROD-00000000000000002';
  await assert.rejects(prepareMerchant(v.api,origin,configured),/same membership product/);
});

test('checkout recovers a lost creation response after restart without changing its request ID or body',async()=>{
  const v=vendor('sandbox'),origin='https://example.test',config=await prepareMerchant(v.api,origin);
  const db=new DatabaseSync(':memory:');
  try{
    db.exec("CREATE TABLE demo_sessions(session_id TEXT PRIMARY KEY); INSERT INTO demo_sessions VALUES('ws')");
    let requestKey,requestBody,accepted;
    const fetchImpl=async(url,options)=>{
      if(!url.endsWith('/v1/billing/subscriptions'))return v.fetchImpl(url,options);
      if(!accepted){
        requestKey=options.headers['PayPal-Request-Id'];requestBody=options.body;
        accepted=await (await v.fetchImpl(url,options)).json();
        throw new Error('Response lost after PayPal stored the subscription.');
      }
      assert.equal(options.headers['PayPal-Request-Id'],requestKey);
      assert.equal(options.body,requestBody);
      return Response.json(accepted);
    };
    const open=()=>createPayPalBilling({env:{...config,FUNDROOM_PAYPAL_MODE:'sandbox',PAYPAL_CLIENT_ID:'fake',PAYPAL_CLIENT_SECRET:'fake'},origin,records:paypalRecords(db),fetchImpl});
    await assert.rejects(open().checkout('ws','en-US','monthly'),{code:'billing-unavailable'});
    const recovered=open();assert.equal(recovered.pendingCadence('ws'),'monthly');
    await assert.rejects(recovered.checkout('ws','zh-CN','yearly'),{code:'billing-pending'});
    assert.equal((await recovered.checkout('ws','zh-CN','monthly')).url,accepted.links[0].href);
    assert.equal(v.subs.size,1);assert.equal(recovered.subscriptionFor('ws'),null);
  }finally{db.close();}
});

test('published Node route keeps anonymous chat available, serves both PayPal terms and binds payment state to the signed-in account',async()=>{
  const {createApp}=await import('../server.mjs');
  const v=vendor('live'),origin='https://member.example',config=await prepareMerchant(v.api,origin);
  const app=await createApp({env:{...config,FUNDROOM_PUBLIC_HOSTED:'true',FUNDROOM_PUBLIC_ORIGIN:origin,FUNDROOM_PAYPAL_MODE:'live',
    PAYPAL_CLIENT_ID:'local-fixture',PAYPAL_CLIENT_SECRET:'local-fixture',FUNDROOM_DB_PATH:':memory:',FUNDROOM_BROKER_DB_PATH:':memory:'},fetchImpl:v.fetchImpl});
  app.server.listen(0,app.host);await once(app.server,'listening');
  const base='http://127.0.0.1:'+app.server.address().port;
  const post=(path,cookie,data)=>fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
  const view=async(cookie)=>{const r=await fetch(base+'/api/membership',{headers:cookie?{Cookie:cookie}:{}});return (await r.json()).membership;};
  try {
    const guest=await view();assert.equal(guest.billingProvider,'paypal');assert.equal(guest.yearlyUsd,99.99);
    assert.equal((await post('/api/billing/checkout',null,{cadence:'yearly'})).status,401);
    const user=await post('/api/auth/register',null,{email:'paypal-only@example.test',password:'local-fixture-password'});
    const cookie=user.headers.get('set-cookie').split(';')[0];
    const p=await post('/api/billing/checkout',cookie,{cadence:'yearly',price:'0.01',user:'someone-else',returnPath:'https://third.example'});
    assert.equal(p.status,200);assert.equal(new URL((await p.json()).url).hostname,'www.paypal.com');
    const [sub]=v.subs.values();assert.equal(sub.plan_id,config.PAYPAL_YEARLY_PLAN_ID);
    assert.equal((await view(cookie)).subscription.status,'inactive');
    v.paid(sub.id,'99.99');const paid=await view(cookie);assert.equal(paid.subscription.status,'active');assert.equal(paid.subscription.cadence,'yearly');
    assert.equal((await view()).subscription.status,'inactive');
    assert.equal((await post('/api/billing/cancel',cookie,{confirm:false})).status,400);
    assert.equal((await post('/api/billing/cancel',cookie,{confirm:true})).status,200);
    assert.equal((await view(cookie)).subscription.status,'canceling');
  }finally{await new Promise(resolve=>app.server.close(resolve));}
});
