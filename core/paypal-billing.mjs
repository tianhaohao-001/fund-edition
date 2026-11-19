import {randomUUID} from 'node:crypto';
import {BillingError} from './stripe-billing.mjs';

export const PAYPAL_CYCLES=Object.freeze({monthly:{usd:'9.99',unit:'MONTH',months:1},yearly:{usd:'99.99',unit:'YEAR',months:12}});
export const PAYPAL_EVENTS=['BILLING.SUBSCRIPTION.ACTIVATED','BILLING.SUBSCRIPTION.UPDATED','BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED','BILLING.SUBSCRIPTION.PAYMENT.FAILED','PAYMENT.SALE.COMPLETED','PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED'];
const unavailable=()=>new BillingError(503,'billing-unavailable','PayPal could not verify your billing information.');
const pending=()=>new BillingError(409,'billing-pending','Check your existing subscription before starting another checkout.');
const subId=id=>typeof id==='string'&&/^I-[A-Z0-9]{5,32}$/.test(id);
const isMoney=(m,usd)=>m?.currency_code==='USD'&&typeof m.value==='string'&&/^\d+(?:\.\d{1,2})?$/.test(m.value)&&Number(m.value)===Number(usd);

export function paypalRecords(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS paypal_memberships (
    scope TEXT NOT NULL,workspace TEXT NOT NULL REFERENCES demo_sessions(session_id),intent TEXT NOT NULL,
    cadence TEXT NOT NULL, provider_id TEXT, sale_id TEXT, status TEXT, paid_until INTEGER, created_at INTEGER NOT NULL,
    PRIMARY KEY(scope,workspace), UNIQUE(scope,provider_id));
    CREATE TABLE IF NOT EXISTS paypal_events (scope TEXT NOT NULL,id TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(scope,id));
    CREATE TABLE IF NOT EXISTS paypal_refunds (scope TEXT NOT NULL,sale TEXT NOT NULL,PRIMARY KEY(scope,sale));`);
  const get=db.prepare('SELECT * FROM paypal_memberships WHERE scope=? AND workspace=?');
  const owner=db.prepare('SELECT workspace FROM paypal_memberships WHERE scope=? AND provider_id=?');
  const bySale=db.prepare('SELECT workspace FROM paypal_memberships WHERE scope=? AND sale_id=?');
  const open=db.prepare('INSERT OR IGNORE INTO paypal_memberships(scope,workspace,intent,cadence,created_at) VALUES(?,?,?,?,?)');
  const replace=db.prepare('UPDATE paypal_memberships SET intent=?,cadence=?,provider_id=NULL,sale_id=NULL,status=NULL,paid_until=NULL,created_at=? WHERE scope=? AND workspace=? AND intent=?');
  const bind=db.prepare('UPDATE paypal_memberships SET provider_id=? WHERE scope=? AND workspace=? AND intent=?');
  const save=db.prepare('UPDATE paypal_memberships SET sale_id=?,status=?,paid_until=? WHERE scope=? AND workspace=? AND intent=?');
  const seen=db.prepare('SELECT 1 FROM paypal_events WHERE scope=? AND id=?');
  const mark=db.prepare('INSERT OR IGNORE INTO paypal_events VALUES (?,?,?)');
  const prune=db.prepare('DELETE FROM paypal_events WHERE at<?');
  const refund=db.prepare('INSERT OR IGNORE INTO paypal_refunds VALUES(?,?)');
  const refunded=db.prepare('SELECT 1 FROM paypal_refunds WHERE scope=? AND sale=?');
  return {get:(scope,ws)=>get.get(scope,ws),owner:(scope,id)=>owner.get(scope,id)?.workspace,bySale:(scope,id)=>bySale.get(scope,id)?.workspace,
    open:(scope,ws,cadence)=>open.run(scope,ws,randomUUID(),cadence,Date.now()),
    replace:(scope,row,cadence)=>replace.run(randomUUID(),cadence,Date.now(),scope,row.workspace,row.intent),
    bind:(...args)=>bind.run(...args),save:(...args)=>save.run(...args),seen:(...args)=>Boolean(seen.get(...args)),
    remember:(scope,id)=>{mark.run(scope,id,Date.now());prune.run(Date.now()-10*86400000);},
    refund:(...args)=>refund.run(...args),refunded:(...args)=>Boolean(refunded.get(...args))};
}

export function paypalClient({mode,id,secret,fetchImpl=fetch}) {
  const host=mode==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
  let token,expiry=0;
  const options={redirect:'error',signal:()=>AbortSignal.timeout(10000)};
  async function accessToken(){
    if(token&&Date.now()<expiry)return token;
    const res=await fetchImpl(host+'/v1/oauth2/token',{method:'POST',redirect:options.redirect,signal:options.signal(),
      headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
    if(!res.ok)throw unavailable();
    const data=await res.json();
    if(!data.access_token||!Number.isFinite(data.expires_in))throw unavailable();
    token=data.access_token;expiry=Date.now()+Math.max(0,data.expires_in-60)*1000;
    return token;
  }
  return async function api(path,{method='GET',body,requestId}={}) {
    for(let attempt=0;attempt<2;attempt++){
      try {
        const headers={Authorization:'Bearer '+await accessToken(),Accept:'application/json'};
        if(body)headers['Content-Type']='application/json';
        if(requestId)headers['PayPal-Request-Id']=requestId;
        if(method==='POST')headers.Prefer='return=representation';
        const res=await fetchImpl(host+path,{method,headers,redirect:options.redirect,signal:options.signal(),body:body?JSON.stringify(body):undefined});
        if(res.status===401&&!attempt){token=null;continue;}
        if(!res.ok)throw unavailable();
        return res.status===204?{}:await res.json();
      }catch{throw unavailable();}
    }
    throw unavailable();
  };
}

export function validPayPalPlan(plan,id,term){
  const cycle=plan?.billing_cycles?.[0],spec=PAYPAL_CYCLES[term];
  const setup=plan?.payment_preferences?.setup_fee;
  return spec&&plan?.id===id&&plan.status==='ACTIVE'&&plan.billing_cycles.length===1&&cycle.tenure_type==='REGULAR'
    &&cycle.total_cycles===0&&cycle.frequency?.interval_unit===spec.unit&&cycle.frequency.interval_count===1
    &&isMoney(cycle.pricing_scheme?.fixed_price,spec.usd)&&!Number(plan.taxes?.percentage??0)&&(!setup||isMoney(setup,'0'));
}

function periodEnd(start,months) {
  const d=new Date(start),day=d.getUTCDate();
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months+1,0);d.setUTCDate(Math.min(day,d.getUTCDate()));
  return +d;
}

export function createPayPalBilling({env,records,origin,fetchImpl=fetch}) {
  const mode=env.FUNDROOM_PAYPAL_MODE,id=env.PAYPAL_CLIENT_ID,secret=env.PAYPAL_CLIENT_SECRET,hook=env.PAYPAL_WEBHOOK_ID;
  const plans={monthly:env.PAYPAL_MONTHLY_PLAN_ID,yearly:env.PAYPAL_YEARLY_PLAN_ID};
  if(!['live','sandbox'].includes(mode)||!id||!secret||!hook||!origin?.startsWith('https://')||
     !Object.values(plans).every(p=>/^P-[A-Z0-9]{5,32}$/.test(p??''))||plans.monthly===plans.yearly)return null;
  const scope=mode+':'+id,host=mode==='live'?'www.paypal.com':'www.sandbox.paypal.com';
  const api=paypalClient({mode,id,secret,fetchImpl}),locks=new Map();
  async function lock(ws,work) {
    const next=(locks.get(ws)??Promise.resolve()).catch(()=>{}).then(work);locks.set(ws,next);
    try{return await next;}finally{if(locks.get(ws)===next)locks.delete(ws);}
  }
  function approval(sub) {
    const link=sub.links?.find(l=>l.rel==='approve')?.href;
    try{
      const url=new URL(link);
      if(url.protocol==='https:'&&url.host===host&&!url.username&&!url.password)return {url:url.href};
    }catch{}
    throw unavailable();
  }
  async function verify(row) {
    const path='/v1/billing/subscriptions/'+row.provider_id;
    const sub=await api(path);
    if(sub.id!==row.provider_id||sub.custom_id!==row.intent||sub.plan_id!==plans[row.cadence]||sub.plan_overridden||
      Number(sub.quantity??1)!==1){records.save(null,'invalid',null,scope,row.workspace,row.intent);throw unavailable();}
    const info=sub.billing_info??{}, payment=info.last_payment, paid=Date.parse(payment?.time), now=Date.now();
    let saleId=null,end=null,status=sub.status;
    const spec=PAYPAL_CYCLES[row.cadence];
    if(['ACTIVE','CANCELLED'].includes(status)&&isMoney(payment?.amount,spec.usd)&&Number.isFinite(paid)&&paid<=now&&periodEnd(paid,spec.months)>now) {
      // Query the payment day, even for annual subscriptions whose last debit was months ago.
      const query=new URLSearchParams({start_time:new Date(paid-86400000).toISOString(),end_time:new Date(Math.min(now,paid+86400000)).toISOString()});
      const result=await api(path+'/transactions?'+query);
      const sale=result.transactions?.find(tx=>tx.status==='COMPLETED'&&isMoney(tx.amount_with_breakdown?.gross_amount,spec.usd)
        &&Math.abs(Date.parse(tx.time)-paid)<300000 && typeof tx.id==='string');
      if(sale&&!records.refunded(scope,sale.id)) {
        saleId=sale.id;
        const next=Date.parse(info.next_billing_time);
        end=Math.min(periodEnd(paid,spec.months),Number.isFinite(next)?next:Infinity);
      }
    }else if(status==='CANCELLED'&&!payment&&row.sale_id&&row.paid_until>now&&!records.refunded(scope,row.sale_id)) {
      saleId=row.sale_id;end=row.paid_until;
    }
    records.save(saleId,status,end,scope,row.workspace,row.intent);
    return sub;
  }
  function subscriptionFor(ws){
    const row=ws&&records.get(scope,ws);
    if(!row?.sale_id||records.refunded(scope,row.sale_id)||!['ACTIVE','CANCELLED'].includes(row.status)||!(row.paid_until>Date.now()))return null;
    return {status:row.status==='CANCELLED'?'canceling':'active',periodEnd:new Date(row.paid_until).toISOString(),cadence:row.cadence};
  }
  async function checkout(ws,language='en-US',cadence='monthly'){
    if(!Object.hasOwn(plans,cadence))throw new BillingError(400,'billing-plan','Choose monthly or yearly.');
    return lock(ws,async()=>{
      if(!validPayPalPlan(await api('/v1/billing/plans/'+plans[cadence]),plans[cadence],cadence))throw unavailable();
      records.open(scope,ws,cadence);
      let row=records.get(scope,ws);
      if(row.provider_id){
        const old=await verify(row);
        if(old.status==='APPROVAL_PENDING'&&row.cadence===cadence)return approval(old);
        if(!['CANCELLED','EXPIRED'].includes(old.status)||subscriptionFor(ws))throw pending();
        records.replace(scope,row,cadence);row=records.get(scope,ws);
      }
      if(row.cadence!==cadence)throw pending();
      const base=origin+'/membership.html?view=account&cadence='+cadence;
      // The request ID and body must survive a timeout, logout, language change and restart.
      const sub=await api('/v1/billing/subscriptions',{method:'POST',requestId:row.intent,body:{plan_id:plans[cadence],custom_id:row.intent,
        application_context:{brand_name:'Fund Edition',user_action:'SUBSCRIBE_NOW',shipping_preference:'NO_SHIPPING',
          return_url:base+'&paypal=return',cancel_url:base+'&paypal=cancel'}}});
      if(!subId(sub.id)||sub.custom_id!==row.intent||sub.plan_id!==plans[cadence])throw unavailable();
      records.bind(sub.id,scope,ws,row.intent);
      return approval(sub);
    });
  }
  async function refresh(ws){return lock(ws,async()=>{const row=records.get(scope,ws);if(row?.provider_id)await verify(row);});}
  async function cancel(ws,{onlyPending=false}={}){
    return lock(ws,async()=>{
      const row=records.get(scope,ws);if(!row?.provider_id)throw pending();
      const current=await verify(row);
      if(current.status==='CANCELLED')return;
      if(['APPROVAL_PENDING','APPROVED'].includes(current.status))throw new BillingError(409,'billing-awaiting-approval','This unpaid request can be resumed until PayPal reports it cancelled or expired.');
      if(onlyPending||!['ACTIVE','SUSPENDED'].includes(current.status))throw pending();
      await api('/v1/billing/subscriptions/'+row.provider_id+'/cancel',{method:'POST',body:{reason:'Cancelled by the signed-in account owner.'}});
      if((await verify(records.get(scope,ws))).status!=='CANCELLED')throw pending();
    });
  }
  async function webhook(raw,h){
    let event;try{event=JSON.parse(raw);}catch{throw new BillingError(400,'billing-event','Invalid notification.');}
    const fields={'auth_algo':'paypal-auth-algo','cert_url':'paypal-cert-url','transmission_id':'paypal-transmission-id','transmission_sig':'paypal-transmission-sig','transmission_time':'paypal-transmission-time'};
    const body={webhook_id:hook,webhook_event:event};
    for(const [field,header] of Object.entries(fields)){
      if(typeof h[header]!=='string'||!h[header]||h[header].length>4096)throw new BillingError(400,'billing-signature','Invalid notification.');
      body[field]=h[header];
    }
    if(!PAYPAL_EVENTS.includes(event?.event_type)||typeof event.id!=='string'||event.id.length>100)return;
    if(records.seen(scope,event.id))return;
    const result=await api('/v1/notifications/verify-webhook-signature',{method:'POST',body});
    if(result.verification_status!=='SUCCESS')throw new BillingError(400,'billing-signature','Invalid notification.');
    const resource=event.resource??{},sid=resource.billing_agreement_id??resource.id;
    let ws=subId(sid)?records.owner(scope,sid):null;
    if(event.event_type==='PAYMENT.SALE.REFUNDED'||event.event_type==='PAYMENT.SALE.REVERSED'){
      const sale=resource.sale_id??resource.id;
      if(typeof sale==='string'&&sale.length<=80){records.refund(scope,sale);ws??=records.bySale(scope,sale);}
    }
    if(ws)await refresh(ws);
    records.remember(scope,event.id);
  }
  return {configured:true,provider:'paypal',testMode:mode==='sandbox',checkout,webhook,refresh,cancel,subscriptionFor,
    hasCustomer:ws=>Boolean(ws&&records.get(scope,ws)?.provider_id),
    pendingCadence:ws=>{const row=ws&&records.get(scope,ws);return row&&(!row.provider_id||row.status==='APPROVAL_PENDING')?row.cadence:null;},
    portal:async ws=>{if(!records.get(scope,ws)?.provider_id)throw pending();return {url:'https://'+host+'/myaccount/autopay'};}};
}
