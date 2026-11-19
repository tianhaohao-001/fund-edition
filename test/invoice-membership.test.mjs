import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {invoiceRecords,officialInvoice,personalGoodsLinks} from '../core/invoice-membership.mjs';
import {orderPanel} from '../web/one-time-membership.mjs';

const contact='buyer@example.test',other='other@example.test';
const request=(cadence='monthly',email=contact)=>({action:'request',requestKey:randomUUID(),cadence,email,consent:true});
const payment=(id,ref,transactionId,amount='9.99',payerEmail=contact)=>({orderReference:id,providerRef:ref,transactionId,currency:'USD',amount,payerEmail,status:'COMPLETED',category:'goods-services',confirm:true});
const link='https://www.paypal.com/invoice/p/#INV2-1234-5678-ABCD';

test('merchant-supplied personal goods links prepare one private order per payer without activating a pass',()=>{
  const profile='https://paypal.me/ExampleSeller',fixed='https://www.paypal.com/ncp/payment/EXAMPLE123456';
  const links=personalGoodsLinks({FUNDROOM_PAYPAL_ME_GOODS_URL:profile});
  assert.deepEqual(links,{monthly:profile+'/9.99USD',yearly:profile+'/99.99USD'});
  assert.deepEqual(personalGoodsLinks({FUNDROOM_PAYPAL_ME_GOODS_URL:'https://www.paypal.com/paypalme/ExampleSeller/'}),links);
  for(const invalid of ['https://www.sandbox.paypal.com/ncp/payment/EXAMPLE123456',link,profile+'/9.99','https://www.paypal.com/myaccount/','https://example.com']){
    assert.deepEqual(personalGoodsLinks({FUNDROOM_PAYPAL_ME_GOODS_URL:invalid,FUNDROOM_PAYPAL_MONTHLY_GOODS_URL:invalid}),{});
  }
  assert.deepEqual(personalGoodsLinks({FUNDROOM_PAYPAL_MONTHLY_GOODS_URL:fixed}),{monthly:fixed});
  assert.deepEqual(personalGoodsLinks({FUNDROOM_PAYPAL_MONTHLY_GOODS_URL:fixed,FUNDROOM_PAYPAL_YEARLY_GOODS_URL:fixed+'/'}),{});
  const db=new DatabaseSync(':memory:');
  db.exec("CREATE TABLE demo_sessions(session_id TEXT PRIMARY KEY,data TEXT);INSERT INTO demo_sessions VALUES('a','{}'),('b','{}'),('c','{}')");
  const ops=invoiceRecords(db),now=Date.parse('2028-02-29T12:00:00Z');
  try{
    const input=request('yearly'),a=ops.request('a',input,now,links),b=ops.request('b',request('yearly',other),now,links);
    assert.equal(a.status,'awaiting_payment');assert.equal(a.directUrl,links.yearly);assert.equal(a.invoiceUrl,null);
    assert.equal(b.directUrl,a.directUrl);assert.notEqual(a.id,b.id);assert.equal(ops.request('a',input,now,links).id,a.id);
    assert.equal(ops.orderList('a',{})[0].directUrl,null);
    assert.equal(ops.orderList('a',{yearly:fixed})[0].directUrl,null);
    assert.equal(ops.active('a',now),null);
    assert.throws(()=>ops.reportReceipt('b',a.id,'TRANSACTIONX01'),{status:404});
    ops.reportReceipt('a',a.id,'TRANSACTIONX01');assert.equal(ops.orderList('a',links)[0].directUrl,null);assert.equal(ops.active('a',now),null);
    const evidence={...payment(a.id,a.id,'SELLERRECEIPT01','99.99'),orderReference:'',buyerTransactionId:'TRANSACTIONX01'};
    assert.throws(()=>ops.settle(a.id,evidence,now),{code:'invoice-invalid'});
    assert.throws(()=>ops.settle(a.id,{...evidence,verifiedPayerConfirmation:true,buyerTransactionId:'UNRELATEDBUYER01'},now),{code:'invoice-invalid'});
    assert.throws(()=>ops.settle(a.id,{...evidence,verifiedPayerConfirmation:true,orderReference:b.id},now),{code:'invoice-invalid'});
    assert.throws(()=>ops.settle(a.id,{...evidence,verifiedPayerConfirmation:true,category:'friends-family'},now),{code:'invoice-invalid'});
    const paid=ops.settle(a.id,{...evidence,verifiedPayerConfirmation:true},now);assert.equal(paid.endsAt,'2029-02-28T12:00:00.000Z');
    assert.equal(ops.request('a',input,now,links).directUrl,null);
    assert.throws(()=>ops.settle(b.id,payment(b.id,b.id,'SELLERRECEIPT01','99.99',other),now),{code:'invoice-used'});
    const c=ops.request('c',request(),now,links);ops.askToCancel('c',c.id);
    assert.equal(ops.orderList('c',links)[0].directUrl,null);assert.equal(ops.active('c',now),null);
    assert.equal(ops.closeOrder(c.id,{action:'void',providerRef:c.id,confirm:true},now).status,'void');
    assert.equal(ops.closeOrder(a.id,{action:'refund',providerRef:a.id,transactionId:'SELLERRECEIPT01',reversalRef:'REFUNDXY01',confirm:true},now).status,'refunded');
    assert.equal(ops.active('a',now),null);
  }finally{db.close();}
});

test('private fixed-term purchases verify receipts, calendar periods, retries, refunds and owner isolation',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec("CREATE TABLE demo_sessions(session_id TEXT PRIMARY KEY,data TEXT);INSERT INTO demo_sessions VALUES('alice','{}'),('other','{}')");
  const ops=invoiceRecords(db),date=Date.parse('2027-01-31T12:00:00Z'),input=request();
  try{
    for(const bad of ['https://www.paypal.com.evil.example/invoice/p/TOKEN123','https://www.paypal.com/paypalme/user','https://www.paypal.com/invoice/p/TOKEN123?return=https://other.example','https://user@www.paypal.com/invoice/p/TOKEN123'])assert.equal(officialInvoice(bad),null);
    const a=ops.request('alice',input,date);assert.equal(ops.request('alice',input,date).id,a.id);
    assert.equal(ops.request('alice',request(),date).id,a.id);
    assert.throws(()=>ops.request('alice',request('yearly'),date),{code:'invoice-pending'});
    assert.throws(()=>ops.withdraw('other',a.id),{status:404});
    const otherOrder=ops.request('other',request('yearly',other),date);
    ops.claim(a.id);assert.throws(()=>ops.claim(a.id),{code:'invoice-already-claimed'});assert.throws(()=>ops.withdraw('alice',a.id),{code:'invoice-state'});
    assert.throws(()=>ops.attach(a.id,{method:'invoice',providerRef:'INV0001',url:'https://www.paypal.com/'}));
    ops.attach(a.id,{method:'invoice',providerRef:'INV0001',url:link});
    const details=payment(a.id,'INV0001','TRANSACTION0001');
    for(const mismatch of [{amount:'9.98'},{currency:'EUR'},{status:'PENDING'},{payerEmail:other},{payerEmail:''},{category:'friends-family'},{providerRef:'INV0002'},{orderReference:otherOrder.id},{confirm:false}])assert.throws(()=>ops.settle(a.id,{...details,...mismatch},date));
    const paid=ops.settle(a.id,details,date);
    assert.equal(paid.endsAt,'2027-02-28T12:00:00.000Z');assert.equal(ops.settle(a.id,details,date+500).endsAt,paid.endsAt);
    assert.equal(ops.active('alice',Date.parse(paid.endsAt)),null);
    ops.claim(otherOrder.id);
    assert.throws(()=>ops.attach(otherOrder.id,{method:'invoice',providerRef:'INV0001',url:link}),{code:'invoice-used'});
    ops.attach(otherOrder.id,{method:'request',providerRef:'REQ0002'});assert.equal(ops.orderList('other')[0].invoiceUrl,null);
    assert.throws(()=>ops.settle(otherOrder.id,payment(otherOrder.id,'REQ0002',details.transactionId,'99.99',other),date),{code:'invoice-used'});
    const year=ops.settle(otherOrder.id,payment(otherOrder.id,'REQ0002','TRANSACTION0002','99.99',other),Date.parse('2028-02-29T14:00:00Z'));
    assert.equal(year.endsAt,'2029-02-28T14:00:00.000Z');
    const more=ops.request('alice',request('yearly'),date+86400000);ops.claim(more.id);ops.attach(more.id,{method:'request',providerRef:'REQ0003'});
    const extension=ops.settle(more.id,payment(more.id,'REQ0003','TRANSACTION0003','99.99'),date+86400000);
    assert.equal(extension.startsAt,paid.endsAt);
    const reversal={action:'refund',providerRef:'INV0001',transactionId:details.transactionId,reversalRef:'REFUND0001',confirm:true};
    const refundTime=date+86400000;
    assert.equal(ops.closeOrder(a.id,reversal,refundTime).status,'refunded');assert.equal(ops.closeOrder(a.id,reversal,refundTime).status,'refunded');
    assert.equal(ops.active('alice',refundTime).cadence,'yearly');assert.equal(ops.active('alice',refundTime).periodEnd,'2028-02-01T12:00:00.000Z');
    assert.equal(ops.request('alice',input,date).status,'refunded');
    assert.ok(ops.orderList('alice').every(o=>!('buyerEmail' in o)&&!('transactionId' in o)));
  }finally{db.close();}
});

test('one-time order entry on the HTTP application, private operator confirmation and restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fundroom-invoice-')),database=join(dir,'app.sqlite'),origin='https://test.example';
  const env={FUNDROOM_PUBLIC_HOSTED:'true',FUNDROOM_PUBLIC_ORIGIN:origin,FUNDROOM_DB_PATH:database,FUNDROOM_BROKER_DB_PATH:join(dir,'broker.sqlite'),FUNDROOM_INVOICE_ORDERS:'true'};
  let server,base;
  async function start(){const app=await createApp({env});server=app.server;server.listen(0,app.host);await once(server,'listening');base='http://'+app.host+':'+server.address().port;}
  const close=()=>new Promise(resolve=>server.close(resolve));
  const post=(path,body,cookie,source=origin)=>fetch(base+path,{method:'POST',headers:{Origin:source,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const view=async(cookie,path='/api/membership')=>(await(await fetch(base+path,{headers:cookie?{Cookie:cookie}:{}})).json());
  const signup=async email=>(await post('/api/auth/register',{email,password:'local-test-only-123!'})).headers.get('set-cookie').split(';')[0];
  await start();
  try{
    assert.equal((await view()).membership.checkoutMode,'one-time');assert.equal((await view()).orderAccount,null);
    assert.equal((await post('/api/membership/orders',request())).status,401);
    const a=await signup(contact),b=await signup(other),body=request('yearly');
    assert.equal((await post('/api/membership/orders',body,a,'https://other.example')).status,403);
    assert.equal((await post('/api/membership/orders',{...body,consent:false},a)).status,400);
    const order=(await(await post('/api/membership/orders',body,a)).json()).order;
    assert.equal(order.amountUsd,99.99);assert.equal((await view(b)).orderAccount.orders.length,0);
    assert.equal((await post('/api/membership/orders',{action:'withdraw',orderId:order.id},b)).status,404);
    assert.equal((await post('/api/membership/orders',{action:'paid',orderId:order.id},a)).status,400);
    const db=new DatabaseSync(database),ops=invoiceRecords(db);ops.claim(order.id);ops.attach(order.id,{method:'invoice',providerRef:'INV123456',url:link});
    assert.equal((await view(a)).orderAccount.orders[0].invoiceUrl,link);assert.equal((await view(a)).membership.subscription.status,'inactive');
    ops.settle(order.id,payment(order.id,'INV123456','TRANSACTION123','99.99'));db.close();
    await close();await start();
    assert.equal((await view(a)).membership.subscription.status,'active');assert.equal((await view(a,'/api/state')).membership.subscription.cadence,'yearly');
    assert.equal((await view(b)).membership.subscription.status,'inactive');
    const pendingOrder=(await(await post('/api/membership/orders',request('monthly',other),b)).json()).order;
    const withdrawn=await post('/api/membership/orders',{action:'withdraw',orderId:pendingOrder.id},b);assert.equal((await withdrawn.json()).order.status,'void');
    await close();env.FUNDROOM_PAYPAL_ME_GOODS_URL='https://paypal.me/ExampleSeller';await start();
    const direct=(await(await post('/api/membership/orders',request('monthly',other),b)).json()).order;
    assert.equal(direct.status,'awaiting_payment');assert.match(direct.directUrl,/9\.99USD$/);
    await close();env.FUNDROOM_INVOICE_ORDERS='false';await start();
    const shutdown=await view(b);
    assert.equal(shutdown.membership.checkoutMode,'one-time');assert.equal(shutdown.membership.acceptsOrders,false);
    const history=orderPanel({membership:shutdown.membership,account:shutdown.orderAccount,cadence:'monthly',t:(_zh,en)=>en,formatDate:String});
    assert.ok(history.includes(direct.id));assert.ok(history.includes('data-report-receipt'));assert.ok(!history.includes('https://paypal.me'));
    assert.equal((await post('/api/membership/orders',request('yearly',other),b)).status,400);
    const reported=await post('/api/membership/orders',{action:'reportReceipt',orderId:direct.id,transactionId:'LOCALRECEIPT'},b);
    assert.equal((await reported.json()).order.receiptReported,true);assert.equal((await view(b)).membership.subscription.status,'inactive');
  }finally{await close();rmSync(dir,{recursive:true,force:true});}
});
