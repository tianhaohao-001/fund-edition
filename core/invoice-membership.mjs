import {randomBytes} from 'node:crypto';
import {BillingError} from './stripe-billing.mjs';

const costs={monthly:999,yearly:9999};
const iso=n=>new Date(n).toISOString();
const issue=(code,message,status=409)=>new BillingError(status,code,message);
const reject=message=>{throw issue('invoice-invalid',message,400);};
const refId=s=>typeof s==='string'&&/^[A-Z0-9][A-Z0-9_-]{4,63}$/.test(s);
// Only an operator configures a reusable seller link. Request bodies never supply a destination.
export function personalGoodsLinks(env) {
  const parse=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash?url:null;}catch{return null;}};
  const me=parse(env.FUNDROOM_PAYPAL_ME_GOODS_URL);
  const handle=me?.host==='paypal.me'?me.pathname.match(/^\/([A-Za-z0-9]{1,20})\/?$/)?.[1]:
    me?.host==='www.paypal.com'?me.pathname.match(/^\/paypalme\/([A-Za-z0-9]{1,20})\/?$/i)?.[1]:null;
  const links={};
  for(const [term,cents] of Object.entries(costs)){
    const raw=env[term==='monthly'?'FUNDROOM_PAYPAL_MONTHLY_GOODS_URL':'FUNDROOM_PAYPAL_YEARLY_GOODS_URL'];
    if(raw){
      const fixed=parse(raw);
      if(fixed?.host==='www.paypal.com'&&/^\/ncp\/payment\/[A-Z0-9][A-Z0-9_-]{5,59}\/?$/i.test(fixed.pathname))links[term]=fixed.href.replace(/\/$/,'');
    }else if(handle)links[term]='https://paypal.me/'+handle+'/'+(cents/100).toFixed(2)+'USD';
  }
  if(links.monthly&&links.monthly.toLowerCase()===links.yearly?.toLowerCase())return {};
  return links;
}
export function officialInvoice(value) {
  let u;try{u=new URL(value);}catch{return null;}
  if(u.origin!=='https://www.paypal.com'||u.username||u.password||u.search)return null;
  const id='[A-Za-z0-9_-]{7,100}';
  if(new RegExp('^/invoice/(?:p/|payerView/details/)'+id+'/?$').test(u.pathname)&&!u.hash)return u.href;
  if(u.pathname==='/invoice/p/'&&new RegExp('^#'+id+'$').test(u.hash))return u.href;
  return null;
}
export function afterTerm(start,cadence) {
  const date=new Date(start),day=date.getUTCDate();
  date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+(cadence==='yearly'?12:1)+1,0);date.setUTCDate(Math.min(day,date.getUTCDate()));
  return +date;
}
function safeView(row,links={}){
  const directUrl=row.method==='goods-link'&&row.status==='awaiting_payment'&&!row.cancel_requested&&!row.buyer_receipt&&links[row.cadence]===row.direct_url?row.direct_url:null;
  return {id:row.id,cadence:row.cadence,amountUsd:row.cents/100,currency:'USD',status:row.status,
    directUrl,receiptReported:Boolean(row.buyer_receipt),
    method:row.method,invoiceUrl:row.status==='awaiting_payment'&&!row.cancel_requested?row.invoice_url:null,cancelRequested:Boolean(row.cancel_requested),
    createdAt:iso(row.created),startsAt:row.starts?iso(row.starts):null,endsAt:row.ends?iso(row.ends):null};
}
export function invoiceRecords(db,{readOnly=false}={}){
  if(!readOnly)db.exec(`CREATE TABLE IF NOT EXISTS membership_orders(
    id TEXT PRIMARY KEY,workspace TEXT NOT NULL REFERENCES demo_sessions(session_id),cadence TEXT NOT NULL,
    cents INTEGER NOT NULL,buyer TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,
    method TEXT,provider_ref TEXT UNIQUE,invoice_url TEXT UNIQUE,transaction_id TEXT UNIQUE,paid_at INTEGER,starts INTEGER,ends INTEGER,
    reversal_ref TEXT UNIQUE,voided_at INTEGER,cancel_requested INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS membership_order_pending_v2 ON membership_orders(workspace) WHERE status IN ('requested','issuing','awaiting_payment');
    CREATE INDEX IF NOT EXISTS membership_order_history ON membership_orders(workspace,created DESC);
    CREATE TABLE IF NOT EXISTS membership_order_requests(workspace TEXT NOT NULL,request_key TEXT NOT NULL,order_id TEXT NOT NULL REFERENCES membership_orders(id),PRIMARY KEY(workspace,request_key));`);
  if(!readOnly){
    const columns=new Set(db.prepare("PRAGMA table_info('membership_orders')").all().map(c=>c.name));
    for(const [name,type] of [['cancel_requested','INTEGER'],['direct_url','TEXT'],['buyer_receipt','TEXT']]){
      if(!columns.has(name))db.exec('ALTER TABLE membership_orders ADD COLUMN '+name+' '+type);
    }
  }
  const get=id=>db.prepare('SELECT * FROM membership_orders WHERE id=?').get(id);
  const historyExists=db.prepare('SELECT 1 FROM membership_orders WHERE workspace=? LIMIT 1');
  function exists(id){const r=get(id);if(!r)throw issue('invoice-not-found','Order not found.',404);return r;}
  const pending=ws=>db.prepare("SELECT * FROM membership_orders WHERE workspace=? AND status IN ('requested','issuing','awaiting_payment')").get(ws);
  function atomic(fn){
    db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
  }
  function request(workspace,{cadence,email,consent,requestKey},now=Date.now(),links={}){
    if(!Object.hasOwn(costs,cadence)||consent!==true||!/^([a-z0-9]{8}-[a-z0-9-]{27})$/i.test(requestKey??'')||
      typeof email!=='string'||email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim()))reject('Choose a term and confirm your PayPal contact email.');
    const buyer=email.trim().toLowerCase();
    return atomic(()=>{
      const matched=db.prepare('SELECT o.* FROM membership_order_requests k JOIN membership_orders o ON o.id=k.order_id WHERE k.workspace=? AND k.request_key=?').get(workspace,requestKey);
      const existing=matched??pending(workspace);
      if(existing&&(existing.cadence!==cadence||existing.buyer!==buyer))throw issue('invoice-pending','There is already a different order. Check your order history.');
      const id=existing?.id??('FE-'+randomBytes(9).toString('hex').toUpperCase());
      if(!existing){
        if(links[cadence])db.prepare("INSERT INTO membership_orders(id,workspace,cadence,cents,buyer,status,created,method,provider_ref,direct_url) VALUES(?,?,?,?,?,'awaiting_payment',?,'goods-link',?,?)").run(id,workspace,cadence,costs[cadence],buyer,now,id,links[cadence]);
        else db.prepare("INSERT INTO membership_orders(id,workspace,cadence,cents,buyer,status,created) VALUES(?,?,?,?,?,'requested',?)").run(id,workspace,cadence,costs[cadence],buyer,now);
      }
      if(!matched)db.prepare('INSERT INTO membership_order_requests VALUES(?,?,?)').run(workspace,requestKey,id);
      return safeView(exists(id),links);
    });
  }
  function attach(id,{method,providerRef,url}){
    if(!['invoice','request'].includes(method)||!refId(providerRef))reject('Enter the official PayPal invoice or request reference.');
    const link=method==='invoice'?officialInvoice(url):null;
    if((method==='invoice'&&!link)||(method==='request'&&url))reject('Use an individual PayPal invoice URL or choose a payment request without a link.');
    return atomic(()=>{
      const r=exists(id);
      if(r.method===method&&r.provider_ref===providerRef&&r.invoice_url===link&&r.status==='awaiting_payment')return safeView(r);
      if(r.status!=='issuing')throw issue('invoice-state','Claim the order before issuing an invoice or payment request.');
      if(db.prepare('SELECT 1 FROM membership_orders WHERE provider_ref=? OR invoice_url=?').get(providerRef,link))throw issue('invoice-used','This PayPal reference is already attached.');
      db.prepare("UPDATE membership_orders SET status='awaiting_payment',method=?,provider_ref=?,invoice_url=? WHERE id=?").run(method,providerRef,link,id);
      return safeView(exists(id));
    });
  }
  function settle(id,input,now=Date.now()){
    return atomic(()=>{
      const r=exists(id),tx=input.transactionId?.trim().toUpperCase();
      const missingNote=input.orderReference==null||input.orderReference==='';
      const matchingBuyerReceipt=refId(input.buyerTransactionId)&&r.buyer_receipt===input.buyerTransactionId;
      const independentlyMatched=missingNote&&r.method==='goods-link'&&matchingBuyerReceipt&&input.verifiedPayerConfirmation===true;
      if(input.status!=='COMPLETED'||input.category!=='goods-services'||input.currency!=='USD'||input.amount!==(r.cents/100).toFixed(2)||
        (input.orderReference!==id&&!independentlyMatched)||!r.provider_ref||input.providerRef!==r.provider_ref||typeof input.payerEmail!=='string'||
        input.payerEmail.trim().toLowerCase()!==r.buyer||!refId(tx)||input.confirm!==true)reject('Verify the completed Goods and Services transaction, payer, order reference, invoice/request reference, exact gross amount and USD.');
      if(r.status==='paid'&&r.transaction_id===tx)return safeView(r);
      if(r.status!=='awaiting_payment')throw issue('invoice-state','This order is not payable.');
      if(db.prepare('SELECT 1 FROM membership_orders WHERE transaction_id=?').get(tx))throw issue('invoice-used','The transaction has already been applied.');
      const previous=db.prepare("SELECT max(ends) AS expires FROM membership_orders WHERE workspace=? AND status='paid'").get(r.workspace).expires;
      const trial=db.prepare("SELECT json_extract(data,'$.studioMembership.startedAt') AS started FROM demo_sessions WHERE session_id=?").get(r.workspace)?.started;
      const trialEnd=trial?Date.parse(trial)+7*86400000:0;
      const start=Math.max(now,previous??0,Number.isFinite(trialEnd)?trialEnd:0);
      db.prepare("UPDATE membership_orders SET status='paid',transaction_id=?,paid_at=?,starts=?,ends=? WHERE id=?").run(tx,now,start,afterTerm(start,r.cadence),id);
      return safeView(exists(id));
    });
  }
  function closeGap(workspace,now){
    const trial=db.prepare("SELECT json_extract(data,'$.studioMembership.startedAt') AS started FROM demo_sessions WHERE session_id=?").get(workspace)?.started;
    const trialEnd=Date.parse(trial)+7*86400000;
    let cursor=Math.max(now,Number.isFinite(trialEnd)?trialEnd:0);
    const remaining=db.prepare("SELECT * FROM membership_orders WHERE workspace=? AND status='paid' AND ends>? ORDER BY starts,paid_at,id").all(workspace,now);
    for(const next of remaining){
      // Running or historical time belongs to the buyer. Only unstarted passes can move earlier.
      if(next.starts>now && next.starts>Math.max(cursor,next.paid_at)){
        const start=Math.max(cursor,next.paid_at),end=afterTerm(start,next.cadence);
        db.prepare('UPDATE membership_orders SET starts=?,ends=? WHERE id=?').run(start,end,next.id);
        cursor=end;
      }else cursor=Math.max(cursor,next.ends);
    }
  }
  function closeOrder(id,{action,providerRef,transactionId,reversalRef,confirm},now=Date.now()){
    return atomic(()=>{
      const r=exists(id);
      if(confirm!==true)reject('Confirm the operator action.');
      if(action==='refund'){
        if(!refId(reversalRef)||!r.transaction_id||transactionId!==r.transaction_id||providerRef!==r.provider_ref)reject('Verify the original payment and confirmed refund or reversal in PayPal Activity.');
        if(r.status==='refunded'&&r.reversal_ref===reversalRef)return safeView(r);
        if(r.status!=='paid')throw issue('invoice-state','Only a paid order can be reversed.');
        if(db.prepare('SELECT 1 FROM membership_orders WHERE reversal_ref=?').get(reversalRef))throw issue('invoice-used','The reversal was already recorded.');
        db.prepare("UPDATE membership_orders SET status='refunded',reversal_ref=?,voided_at=? WHERE id=?").run(reversalRef,now,id);
        closeGap(r.workspace,now);
      }else if(action==='void'){
        if(r.status==='void')return safeView(r);
        if(!['requested','issuing','awaiting_payment'].includes(r.status)||(r.provider_ref&&providerRef!==r.provider_ref))throw issue('invoice-state','Check that the request was voided in PayPal before closing it here.');
        db.prepare("UPDATE membership_orders SET status='void',voided_at=? WHERE id=?").run(now,id);
      }else reject('Choose void or refund.');
      return safeView(exists(id));
    });
  }
  return {request,attach,settle,closeOrder,
    hasOrders:ws=>Boolean(ws&&historyExists.get(ws)),
    claim(id){return atomic(()=>{const r=exists(id);
      if(r.status==='issuing')throw issue('invoice-already-claimed','Already claimed. Search PayPal using the FE order reference, then attach the existing invoice or request. Do not issue a second bill.');
      if(r.status!=='requested')throw issue('invoice-state','This order cannot be issued.');
      db.prepare("UPDATE membership_orders SET status='issuing' WHERE id=?").run(id);return safeView(exists(id));});},
    orderList:(ws,links={})=>db.prepare('SELECT * FROM membership_orders WHERE workspace=? ORDER BY created DESC,id DESC LIMIT 20').all(ws).map(row=>safeView(row,links)),
    reportReceipt(ws,id,value){return atomic(()=>{
      const row=get(id),tx=typeof value==='string'?value.trim().toUpperCase():'';
      if(!row||row.workspace!==ws)throw issue('invoice-not-found','Order not found.',404);
      if(row.method!=='goods-link'||row.status!=='awaiting_payment')throw issue('invoice-state','Check your current order status.');
      if(!refId(tx))reject('Enter the transaction ID from your PayPal Activity.');
      db.prepare('UPDATE membership_orders SET buyer_receipt=? WHERE id=?').run(tx,id);
      return safeView(exists(id));
    });},
    active(ws,now=Date.now()){
      if(!ws)return null;
      const row=db.prepare("SELECT * FROM membership_orders WHERE workspace=? AND status='paid' AND starts<=? AND ends>? ORDER BY ends DESC LIMIT 1").get(ws,now,now);
      return row?{status:'active',cadence:row.cadence,periodEnd:iso(row.ends),oneTime:true}:null;
    },
    list:()=>db.prepare("SELECT id,cadence,status,created,cancel_requested FROM membership_orders WHERE status IN ('requested','issuing','awaiting_payment') ORDER BY cancel_requested IS NULL,CASE status WHEN 'requested' THEN 0 WHEN 'issuing' THEN 1 ELSE 2 END,created,id").all(),
    askToCancel(ws,id){return atomic(()=>{const r=get(id);if(!r||r.workspace!==ws)throw issue('invoice-not-found','Order not found.',404);
      if(!['issuing','awaiting_payment'].includes(r.status))throw issue('invoice-state','Refresh the order.');
      db.prepare('UPDATE membership_orders SET cancel_requested=coalesce(cancel_requested,?) WHERE id=?').run(Date.now(),id);return safeView(exists(id));});},
    inspect:id=>{const row=exists(id);return {...safeView(row),buyerEmail:row.buyer,providerRef:row.provider_ref,transactionId:row.transaction_id,reportedTransactionId:row.buyer_receipt};},
    withdraw(ws,id){const r=get(id);if(!r||r.workspace!==ws)throw issue('invoice-not-found','Order not found.',404);
      if(r.status!=='requested')throw issue('invoice-state','This order has already reached PayPal.');
      return atomic(()=>{const changed=db.prepare("UPDATE membership_orders SET status='void',voided_at=? WHERE id=? AND status='requested' AND workspace=?").run(Date.now(),id,ws);
        if(!changed.changes)throw issue('invoice-state','Refresh this order.');return safeView(exists(id));});}};
}
