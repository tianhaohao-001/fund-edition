// Browser acceptance with an in-memory ledger and a local PayPal Sandbox API double.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createApp} from '../server.mjs';

const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const orders=new Map();
async function gateway(href,req){
  const u=new URL(href);
  assert.equal(u.origin,'https://api-m.sandbox.paypal.com');
  if(u.pathname==='/v1/oauth2/token')return Response.json({access_token:'test-only',expires_in:3600});
  if(u.pathname==='/v2/checkout/orders'){
    const payload=JSON.parse(req.body),id='LOCALORDER'+(orders.size+1);
    const order={id,intent:'CAPTURE',status:'PAYER_ACTION_REQUIRED',purchase_units:payload.purchase_units,links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token='+id}]};
    orders.set(id,{order,back:payload.payment_source.paypal.experience_context.return_url});return Response.json(order);
  }
  const {order}=orders.get(u.pathname.split('/')[4]);
  if(req.method==='POST'){
    assert.equal(order.status,'APPROVED');order.status='COMPLETED';
    const unit=order.purchase_units[0];unit.payments={captures:[{id:'TESTCAPTURE'+order.id,status:'COMPLETED',amount:unit.amount,final_capture:true}]};
  }
  return Response.json(order);
}
const app=await createApp({env:{FUNDROOM_DB_PATH:':memory:',FUNDROOM_BROKER_DB_PATH:':memory:',FUNDROOM_INVOICE_ORDERS:'true',
  FUNDROOM_PAYPAL_SANDBOX_CLIENT_ID:'test-only',FUNDROOM_PAYPAL_SANDBOX_CLIENT_SECRET:'test-only'},fetchImpl:gateway});
app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  for(const [lang,width] of [['zh-CN',390],['en-US',1360]]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    await context.route('https://www.sandbox.paypal.com/**',route=>route.fulfill({contentType:'text/html',body:'<main>Sandbox provider page double</main>'}));
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const initial=orders.size;
    await page.goto(base+'/?lang='+lang);
    await page.getByRole('button',{name:lang==='zh-CN'?'设置':'Settings',exact:true}).click();
    await page.getByRole('link',{name:lang==='zh-CN'?'我的会员资格':'My membership'}).click();
    await page.locator('.plan-card #try-checkout').waitFor();
    await page.waitForFunction(()=>document.querySelector('#try-checkout')?.textContent.includes('PayPal'));
    assert.equal(orders.size,initial);assert.equal(await page.locator('.plan-card [data-member-action="review-order"]').count(),0);
    async function atPayPal(term){
      await page.waitForURL('https://www.sandbox.paypal.com/**');
      const row=orders.get(new URL(page.url()).searchParams.get('token'));
      assert.equal(row.order.purchase_units[0].amount.value,term==='yearly'?'99.99':'9.99');
      assert.equal(new URL(row.back).searchParams.get('lang'),lang);
      return row;
    }
    async function approve(row){
      row.order.status='APPROVED';await page.goto(row.back);await page.locator('#receipt').getByText(/TESTCAPTURE/).waitFor();
      await page.locator('#back').click();await page.locator('#test-access-summary').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('view'),'account');
    }
    await page.locator('#try-checkout').click();await approve(await atPayPal('monthly'));
    await page.locator('[data-cadence="yearly"]').click();await page.locator('#try-checkout').click();await approve(await atPayPal('yearly'));
    const afterTwo=orders.size;
    await page.goto(base+'/membership.html?view=account&step=purchase&lang='+lang);
    await page.locator('#try-checkout').click();await atPayPal('monthly');
    await page.goBack();await page.locator('[data-cadence="yearly"]').click();await page.locator('#try-checkout').click();
    await page.locator('#test-switch').waitFor();assert.match(await page.locator('#test-status').innerText(),/9\.99/);
    assert.equal(orders.size,afterTwo+1);await page.locator('#test-switch').click();await atPayPal('yearly');
    await page.goto(base+'/?auth=membership&lang='+lang+'&cadence=yearly');
    await page.locator('.plan-card #try-checkout').waitFor();assert.equal(await page.locator('[data-cadence="yearly"]').getAttribute('aria-pressed'),'true');
    await page.locator('#official-orders').click();assert.equal(new URL(page.url()).searchParams.get('view'),'orders');
    assert.deepEqual(errors,[]);await context.close();console.log(lang,width,'guest settings, monthly capture, annual repeat, interrupted checkout switch, legacy purchase link, explicit orders passed');
  }
}finally{await browser.close();await new Promise(resolve=>app.server.close(resolve));}
