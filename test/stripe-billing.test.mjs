import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {once} from 'node:events';
import {get as httpGet} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server.mjs';

const origin='https://fundroom.example';
const fundingSecret='whsec_fixture';
const current=()=>Math.floor(Date.now()/1000);

function merchant(live) {
  const price={id:'price_fundroom',livemode:live,active:true,unit_amount:999,currency:'usd',billing_scheme:'per_unit',
    recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
  const sessions=[],customers=[],subs=new Map(),calls=[];
  async function fetchImpl(input,opts) {
    const url=new URL(input),path=url.pathname.slice(4),params=opts.body??url.searchParams;
    assert.equal(url.origin,'https://api.stripe.com');
    assert.equal(opts.headers['Stripe-Version'],'2024-06-20');
    calls.push({path,params});
    let body;
    if(path==='prices/'+price.id)body=price;
    else if(path==='customers') {
      const id='cus_'+(customers.length+1);
      customers.push({id,workspace:params.get('metadata[fundroom_workspace]')});body={id,livemode:live};
    }else if(path==='subscriptions') {
      if(!params.has('starting_after'))body={data:[{id:'sub_archive',status:'canceled'}],has_more:true};
      else {
        assert.equal(params.get('starting_after'),'sub_archive');
        body={data:subs.has(params.get('customer'))?[subs.get(params.get('customer'))]:[],has_more:false};
      }
    }
    else if(path==='checkout/sessions') {
      assert.equal(params.get('line_items[0][price]'),price.id);
      assert.equal(params.get('line_items[0][quantity]'),'1');
      assert.ok(params.get('success_url').startsWith(origin+'/membership.html'));
      const id='cs_'+(sessions.length+1);
      body={id,livemode:live,status:'open',customer:params.get('customer'),client_reference_id:params.get('client_reference_id'),url:'https://checkout.stripe.com/c/pay/'+id};
      sessions.push(body);
    }else if(path.startsWith('checkout/sessions/'))body=sessions.find(s=>s.id===path.split('/').at(-1));
    else if(path==='billing_portal/sessions')body={customer:params.get('customer'),livemode:live,url:'https://billing.stripe.com/p/session/example'};
    else throw Error('Unexpected merchant call '+path);
    return Response.json(body);
  }
  function pay() {
    const {id:customer,workspace}=customers[0],start=current()-3600,end=current()+86400;
    const line={price,quantity:1,subscription:'sub_a',amount:999,period:{start,end},proration:false};
    const charge={id:'ch_a',customer,invoice:'in_a',status:'succeeded',currency:'usd',amount_captured:999,amount_refunded:0,disputed:false,livemode:live};
    const invoice={id:'in_a',customer,subscription:'sub_a',status:'paid',paid:true,currency:'usd',subtotal:999,amount_paid:999,livemode:live,
      lines:{data:[line],has_more:false},charge};
    const sub={id:'sub_a',customer,metadata:{fundroom_workspace:workspace},status:'active',items:{data:[{quantity:1,price}]},livemode:live,
      latest_invoice:invoice,current_period_end:end};
    sessions[0].status='complete';sessions[0].subscription=sub.id;subs.set(customer,sub);
    return sub;
  }
  return {fetchImpl,price,sessions,pay,customers,calls};
}

for(const mode of ['test','live'])test('Stripe '+mode+' HTTP checkout, account isolation and paid entitlement reconciliation',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'fundroom-stripe-')),dbPath=join(directory,'accounts.sqlite');
  const vendor=merchant(mode==='live');
  const env={FUNDROOM_PUBLIC_HOSTED:'true',FUNDROOM_PUBLIC_ORIGIN:origin,FUNDROOM_PORT:'0',FUNDROOM_STRIPE_MODE:mode,
    STRIPE_MONTHLY_PRICE_ID:vendor.price.id,STRIPE_SECRET_KEY:'sk_'+mode+'_fixture',STRIPE_WEBHOOK_SECRET:fundingSecret,
    FUNDROOM_DB_PATH:dbPath,FUNDROOM_BROKER_DB_PATH:join(directory,'broker.sqlite')};
  const app=await createApp({env,fetchImpl:vendor.fetchImpl});
  app.server.listen(0,app.host);await once(app.server,'listening');
  const base='http://127.0.0.1:'+app.server.address().port;
  const post=async(path,cookie,body={})=>fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const view=async(cookie,route='/api/membership')=>(await (await fetch(base+route,{headers:{Cookie:cookie}})).json()).membership;
  const register=async(email)=>(await post('/api/auth/register',null,{email,password:'Only-a-local-test-password'})).headers.get('set-cookie').split(';')[0];
  let eventNumber=0;
  async function notify(type='invoice.paid',{id='evt_'+(++eventNumber),valid=true}={}) {
    const raw=JSON.stringify({id,type,livemode:mode==='live',data:{object:{customer:vendor.customers[0].id}}});
    const time=current(),mac=createHmac('sha256',valid?fundingSecret:'unsigned').update(time+'.'+raw).digest('hex');
    return fetch(base+'/api/billing/webhook',{method:'POST',body:raw,headers:{'Content-Type':'application/json','Stripe-Signature':'t='+time+',v1='+mac}});
  }
  try {
    const navigation=await new Promise((resolve,reject)=>httpGet(base+'/membership.html?view=account',
      {headers:{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}},
      response=>{response.resume();resolve(response.statusCode);}).on('error',reject));
    assert.equal(navigation,200);
    assert.equal((await fetch(base+'/membership.html',{headers:{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'cors'}})).status,403);
    assert.equal((await fetch(base+'/api/membership',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
    assert.equal((await post('/api/billing/checkout')).status,401);
    const first=await register('a@example.test'),other=await register('b@example.test');
    const invalidPrice=vendor.price.unit_amount;vendor.price.unit_amount=1000;
    assert.equal((await post('/api/billing/checkout',first)).status,503);vendor.price.unit_amount=invalidPrice;
    const attempts=await Promise.all([post('/api/billing/checkout',first,{price:'other',returnPath:'https://third.example/'}),post('/api/billing/checkout',first)]);
    assert.deepEqual(await attempts[0].json(),await attempts[1].json());assert.equal(vendor.sessions.length,1);
    assert.equal((await view(first)).subscription.status,'inactive');assert.equal((await view(first)).billingTestMode,mode==='test');
    const sub=vendor.pay(),db=new DatabaseSync(dbPath);
    db.prepare("UPDATE demo_sessions SET data=json_set(data,'$.studioMembership.startedAt','2020-01-01T00:00:00.000Z') WHERE session_id=?").run(vendor.customers[0].workspace);db.close();
    assert.equal((await notify('invoice.paid',{valid:false})).status,400);
    assert.equal((await view(first,'/api/state')).status,'expired');
    assert.equal((await notify('invoice.paid',{id:'evt_paid'})).status,200);
    const count=vendor.calls.length;
    assert.equal((await notify('invoice.paid',{id:'evt_paid'})).status,200);assert.equal(vendor.calls.length,count);
    assert.equal((await view(first,'/api/state')).status,'member');
    const action=await post('/api/action',first,{action:'createFund',name:'New example'});
    if(mode==='test')assert.equal(action.status,402);else assert.notEqual(action.status,402);
    assert.equal((await view(other)).subscription.status,'inactive');
    assert.equal((await post('/api/billing/portal',other,{customer:vendor.customers[0].id})).status,409);
    const portal=await post('/api/billing/portal',first,{returnPath:'https://other.example'});
    assert.equal((await portal.json()).url,'https://billing.stripe.com/p/session/example');
    assert.equal((await post('/api/billing/checkout',first)).status,409);
    sub.cancel_at_period_end=true;await notify('customer.subscription.updated');
    assert.equal((await view(first,'/api/state')).subscription.status,'canceling');
    sub.status='past_due';await notify('invoice.payment_failed');await notify('invoice.paid');
    assert.equal((await view(first,'/api/state')).subscription.status,'inactive');
    assert.equal((await view(first)).hasBillingAccount,true);
    sub.status='active';sub.latest_invoice.charge.amount_refunded=999;
    await notify('charge.refunded');assert.equal((await view(first,'/api/state')).subscription.status,'inactive');
    sub.latest_invoice.charge.amount_refunded=0;
    sub.latest_invoice.currency='eur';assert.equal((await view(first)).subscription.status,'inactive');
    sub.latest_invoice.currency='usd';sub.metadata.fundroom_workspace='different-account';
    assert.equal((await view(first)).subscription.status,'inactive');
    sub.metadata.fundroom_workspace=vendor.customers[0].workspace;
    sub.latest_invoice.lines.data[0].period.end=current()-1;assert.equal((await view(first)).subscription.status,'inactive');
  } finally {await new Promise(resolve=>app.server.close(resolve));rmSync(directory,{recursive:true,force:true});}
});
