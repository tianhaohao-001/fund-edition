import {createHmac, randomUUID, timingSafeEqual} from 'node:crypto';

// This pinned API version exposes subscription.current_period_end and invoice.charge.
const version = '2024-06-20';
const cents = 999;
const seconds = () => Math.floor(Date.now() / 1000);

export class BillingError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
const unavailable = () => new BillingError(503,'billing-unavailable','The billing service is temporarily unavailable.');
function busy() { return new BillingError(409,'billing-pending','A checkout or subscription already exists. Open membership again or manage billing.'); }

export function billingRecords(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS stripe_memberships (
    mode TEXT NOT NULL, workspace TEXT NOT NULL REFERENCES demo_sessions(session_id),
    customer TEXT, intent TEXT NOT NULL, checkout TEXT, status TEXT, period_end INTEGER, price TEXT, revision INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(mode,workspace), UNIQUE(mode,customer)
  )`);
  if(!db.prepare("PRAGMA table_info('stripe_memberships')").all().some(c=>c.name==='revision')) {
    db.exec('ALTER TABLE stripe_memberships ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
  }
  const byWorkspace=db.prepare('SELECT * FROM stripe_memberships WHERE mode=? AND workspace=?');
  const byCustomer=db.prepare('SELECT workspace FROM stripe_memberships WHERE mode=? AND customer=?');
  const insert=db.prepare('INSERT OR IGNORE INTO stripe_memberships(mode,workspace,intent) VALUES (?,?,?)');
  const assign=db.prepare('UPDATE stripe_memberships SET customer=? WHERE mode=? AND workspace=? AND customer IS NULL');
  const remember=db.prepare('UPDATE stripe_memberships SET checkout=? WHERE mode=? AND workspace=? AND intent=?');
  const rotate=db.prepare('UPDATE stripe_memberships SET checkout=NULL,intent=? WHERE mode=? AND workspace=? AND intent=?');
  const begin=db.prepare('UPDATE stripe_memberships SET revision=revision+1 WHERE mode=? AND workspace=? RETURNING revision');
  const save=db.prepare('UPDATE stripe_memberships SET status=?,period_end=?,price=? WHERE mode=? AND workspace=? AND revision=?');
  db.exec('CREATE TABLE IF NOT EXISTS stripe_events (mode TEXT NOT NULL,id TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(mode,id))');
  const seen=db.prepare('SELECT 1 FROM stripe_events WHERE mode=? AND id=?');
  const rememberEvent=db.prepare('INSERT OR IGNORE INTO stripe_events VALUES(?,?,?)');
  const purge=db.prepare('DELETE FROM stripe_events WHERE at<?');
  return {get:(mode,workspace)=>byWorkspace.get(mode,workspace), owner:(mode,id)=>byCustomer.get(mode,id)?.workspace,
    create:(mode,workspace)=>insert.run(mode,workspace,randomUUID()), assign:(...args)=>assign.run(...args),
    remember:(...args)=>remember.run(...args), rotate:(...args)=>rotate.run(randomUUID(),...args),
    begin:(mode,ws)=>begin.get(mode,ws).revision,save:(...args)=>save.run(...args),
    seen:(mode,id)=>Boolean(seen.get(mode,id)),rememberEvent(mode,id){rememberEvent.run(mode,id,seconds());purge.run(seconds()-7*86400);}};
}

const stripeId=(value,prefix)=>typeof value==='string' && value.startsWith(prefix+'_') && /^[A-Za-z0-9_]+$/.test(value);
const priceMatches=(price,id,live)=>price?.id===id && price.livemode===live && price.currency==='usd' && price.unit_amount===cents
  && price.recurring?.interval==='month' && price.recurring.interval_count===1 && price.recurring.usage_type==='licensed'
  && price.billing_scheme==='per_unit' && !price.transform_quantity;

function hostedLink(value,host) {
  let url;
  try {url=new URL(value);} catch { throw unavailable(); }
  if(url.protocol!=='https:'||url.host!==host||url.username||url.password)throw unavailable();
  return {url:url.href};
}

function verifiedAccess(sub, record, priceId, live) {
  const invoice=sub.latest_invoice, charge=invoice?.charge, line=invoice?.lines?.data?.[0];
  const item=sub.items?.data?.[0], now=seconds();
  if(sub.livemode!==live||sub.customer!==record.customer||sub.metadata?.fundroom_workspace!==record.workspace||
     sub.status!=='active'||sub.pause_collection||sub.items?.data?.length!==1||sub.items.has_more||item.quantity!==1||!priceMatches(item.price,priceId,live))return null;
  if(invoice?.livemode!==live||invoice.customer!==record.customer||invoice.subscription!==sub.id||invoice.status!=='paid'||
     invoice.paid!==true||invoice.paid_out_of_band||invoice.currency!=='usd'||invoice.subtotal!==cents||!(invoice.amount_paid>=cents)||
     invoice.lines?.has_more||invoice.lines?.data?.length!==1||line.price?.id!==priceId||line.subscription!==sub.id||line.amount!==cents||
     line.quantity!==1||line.proration||!Number.isSafeInteger(line.period?.start)||line.period.start>now||!Number.isSafeInteger(line.period?.end))return null;
  if(charge?.livemode!==live||charge.customer!==record.customer||charge.invoice!==invoice.id||charge.status!=='succeeded'||
     charge.currency!=='usd'||!(charge.amount_captured>=cents)||charge.amount_refunded!==0||charge.disputed!==false)return null;
  const end=Math.min(line.period.end,sub.current_period_end,sub.cancel_at??Infinity);
  if(!Number.isSafeInteger(end)||end<=now)return null;
  return {status:sub.cancel_at_period_end||sub.cancel_at?'canceling':'active',end};
}

export function createStripeBilling({env,records,origin,fetchImpl=fetch}) {
  const mode=env.FUNDROOM_STRIPE_MODE;
  if(!['test','live'].includes(mode))return null;
  const live=mode==='live', key=env.STRIPE_SECRET_KEY, secret=env.STRIPE_WEBHOOK_SECRET, priceId=env.STRIPE_MONTHLY_PRICE_ID;
  if(!origin?.startsWith('https://')||!key?.startsWith('sk_'+mode+'_')||!secret?.startsWith('whsec_')||!stripeId(priceId,'price'))return null;
  const pending=new Map();
  // The Node/SQLite service has a single application process. Stripe keys also
  // make retries during request loss or process restart safe.
  async function locked(workspace,operation) {
    const before=pending.get(workspace)??Promise.resolve();
    const running=before.catch(()=>{}).then(operation);
    pending.set(workspace,running);
    try {return await running;} finally {if(pending.get(workspace)===running)pending.delete(workspace);}
  }
  async function stripe(path,params={},post=false,idempotency) {
    const form=new URLSearchParams(params);
    const headers={Authorization:'Bearer '+key,'Stripe-Version':version};
    if(post)headers['Content-Type']='application/x-www-form-urlencoded';
    if(idempotency)headers['Idempotency-Key']=idempotency;
    try {
      const res=await fetchImpl('https://api.stripe.com/v1/'+path+(!post&&form.size?'?'+form:''),{
        method:post?'POST':'GET',headers,body:post?form:undefined,redirect:'error',signal:AbortSignal.timeout(8000)});
      if(!res.ok)throw unavailable();
      return await res.json();
    } catch {throw unavailable();}
  }
  async function reconcile(record) {
    const revision=records.begin(mode,record.workspace);
    let access, open=false, cursor;
    const visited=new Set();
    do {
      const params={customer:record.customer,status:'all',limit:'100','expand[]':'data.latest_invoice.charge'};
      if(cursor)params.starting_after=cursor;
      const list=await stripe('subscriptions',params);
      if(!Array.isArray(list.data))throw unavailable();
      for(const sub of list.data) {
        if(['canceled','incomplete_expired'].includes(sub.status))continue;
        open=true;
        access??=verifiedAccess(sub,record,priceId,live);
      }
      if(access||!list.has_more)break;
      cursor=list.data.at(-1)?.id;
      if(!stripeId(cursor,'sub')||visited.has(cursor))throw unavailable();
      visited.add(cursor);
    }while(cursor);
    if(!records.save(access?.status??null,access?.end??null,priceId,mode,record.workspace,revision).changes)throw unavailable();
    return {open};
  }
  async function refresh(workspace) {
    return locked(workspace,async()=>{
      const record=records.get(mode,workspace);
      if(record?.customer)await reconcile(record);
    });
  }
  function back(language) {
    return origin+'/membership.html?view=account&lang='+(language==='en-US'?'en-US':'zh-CN');
  }
  async function checkout(workspace,language) {
    return locked(workspace,async()=>{
      const price=await stripe('prices/'+priceId);
      if(!price.active||!priceMatches(price,priceId,live))throw unavailable();
      records.create(mode,workspace);
      let record=records.get(mode,workspace);
      if(!record.customer) {
        const customer=await stripe('customers',{'metadata[fundroom_workspace]':workspace},true,'fundroom-customer-'+mode+'-'+workspace);
        if(!stripeId(customer.id,'cus')||customer.livemode!==live)throw unavailable();
        records.assign(customer.id,mode,workspace);
        record=records.get(mode,workspace);
      }
      const current=await reconcile(record);
      if(current.open)throw busy();
      if(record.checkout) {
        const existing=await stripe('checkout/sessions/'+record.checkout);
        if(existing.customer!==record.customer||existing.client_reference_id!==workspace||existing.livemode!==live)throw unavailable();
        if(existing.status==='open')return hostedLink(existing.url,'checkout.stripe.com');
        if(!['expired','complete'].includes(existing.status))throw busy();
        // A completed session may have finished while subscriptions were read.
        if(existing.status==='complete'&&(!existing.subscription||(await reconcile(record)).open))throw busy();
        records.rotate(mode,workspace,record.intent);
        record=records.get(mode,workspace);
      }
      // A retry uses the same return URL even if the visitor changed language.
      const canonicalReturn=origin+'/membership.html?view=account';
      const session=await stripe('checkout/sessions',{mode:'subscription',customer:record.customer,client_reference_id:workspace,
        'payment_method_types[0]':'card','line_items[0][price]':priceId,'line_items[0][quantity]':'1',
        'subscription_data[metadata][fundroom_workspace]':workspace,success_url:canonicalReturn,cancel_url:canonicalReturn},
        true,'fundroom-checkout-'+record.intent);
      if(!stripeId(session.id,'cs')||session.customer!==record.customer||session.livemode!==live||session.status!=='open')throw unavailable();
      records.remember(session.id,mode,workspace,record.intent);
      return hostedLink(session.url,'checkout.stripe.com');
    });
  }
  async function portal(workspace,language) {
    const customer=records.get(mode,workspace)?.customer;
    if(!customer)throw new BillingError(409,'billing-no-customer','This account has no billing profile yet.');
    const session=await stripe('billing_portal/sessions',{customer,return_url:back(language)},true);
    if(session.customer!==customer||session.livemode!==live)throw unavailable();
    return hostedLink(session.url,'billing.stripe.com');
  }
  async function webhook(raw,signature) {
    const entries=String(signature??'').split(',');
    const timestamp=entries.find(p=>p.startsWith('t='))?.slice(2);
    const digest=createHmac('sha256',secret).update(timestamp+'.').update(raw).digest();
    if(!/^\d{1,12}$/.test(timestamp??'')||Math.abs(seconds()-Number(timestamp))>300||
       !entries.some(p=>/^v1=[0-9a-f]{64}$/.test(p)&&timingSafeEqual(digest,Buffer.from(p.slice(3),'hex')))) {
      throw new BillingError(400,'billing-signature','Invalid payment notification.');
    }
    let event;
    try {event=JSON.parse(raw);} catch {throw new BillingError(400,'billing-event','Invalid payment notification.');}
    if(event?.livemode!==live||!stripeId(event.id,'evt')||!event.data?.object||records.seen(mode,event.id))return;
    const obj=event.data.object;
    let customer=obj.customer;
    if(['charge.dispute.created','charge.dispute.closed'].includes(event.type)&&stripeId(obj.charge,'ch')) {
      customer=(await stripe('charges/'+obj.charge)).customer;
    } else if(!['checkout.session.completed','invoice.paid','invoice.payment_failed','customer.subscription.created',
      'customer.subscription.updated','customer.subscription.deleted','charge.refunded'].includes(event.type))return;
    const workspace=stripeId(customer,'cus')?records.owner(mode,customer):null;
    // Notification bodies never set access. Redeliveries and delayed older
    // events reconcile against the same current subscription and paid charge.
    if(workspace) {
      await refresh(workspace);
      records.rememberEvent(mode,event.id);
    }
  }
  return {configured:true,testMode:!live,checkout,portal,webhook,refresh,
    hasCustomer:workspace=>Boolean(workspace&&records.get(mode,workspace)?.customer),
    subscriptionFor(workspace) {
      if(!workspace)return null;
      const record=records.get(mode,workspace);
      if(record?.price!==priceId||!record.status||record.period_end<=seconds())return null;
      return {status:record.status,periodEnd:new Date(record.period_end*1000).toISOString()};
    }};
}
