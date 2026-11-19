import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createApp} from '../server.mjs';

const require=createRequire(import.meta.url);
const {chromium,webkit}=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const app=await createApp({env:{FUNDROOM_DB_PATH:':memory:',FUNDROOM_BROKER_DB_PATH:':memory:',FUNDROOM_INVOICE_ORDERS:'true',
  FUNDROOM_PAYPAL_ME_GOODS_URL:'https://paypal.me/ExampleSeller'}});
app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
const origin='http://127.0.0.1:'+app.server.address().port;
const out=resolve('release/review-web/personal-checkout/local');
const phonePath=join(process.env.PLAYWRIGHT_BROWSERS_PATH||join(tmpdir(),'fund-edition-browser-qa'),'webkit-2336','Playwright.exe');
const browsers=[],cases=[];
try{
  await mkdir(out,{recursive:true});
  for(const [lang,width,term] of [['zh-CN',390,'monthly'],['en-US',1440,'yearly'],['zh-CN',390,'yearly'],['en-US',1440,'monthly']]){
    const browser=width<500?await webkit.launch({headless:true,executablePath:phonePath}):await chromium.launch({channel:'msedge',headless:true});
    browsers.push(browser);
    const context=await browser.newContext({viewport:{width,height:900},locale:lang,serviceWorkers:'block'});
    await context.route('https://paypal.me/**',route=>route.fulfill({contentType:'text/html',body:'<main>Isolated PayPal navigation test</main>'}));
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/membership.html?view=account&lang='+lang);
    await page.locator('[data-cadence="'+term+'"]').click();
    await page.locator('.login-to-checkout').waitFor();
    const signin=await page.locator('.login-to-checkout').getAttribute('href');assert.match(signin,new RegExp('cadence='+term));
    assert.equal(await page.locator('#try-checkout.commit').count(),0);
    const membership=async()=>(await context.request.get(origin+'/api/membership')).json();
    const registration=await context.request.post(origin+'/api/auth/register',{headers:{origin},data:{email:lang+term+'@example.test',password:'local-test-12345!'}});
    assert.equal(registration.ok(),true);
    await page.reload();await page.locator('#invoice-recipient').waitFor();
    await page.locator('[data-member-action="submit-order"]').click();
    const payment=page.locator('.order-history a.commit');await payment.waitFor();
    const value=term==='yearly'?'99.99':'9.99';
    const href=await payment.getAttribute('href');assert.equal(href,'https://paypal.me/ExampleSeller/'+value+'USD');
    assert.ok(await page.getByText(/亲友|Friends and Family/).count());
    const state=await membership();assert.equal(state.orderAccount.orders.length,1);assert.equal(state.membership.subscription.status,'inactive');
    const order=state.orderAccount.orders[0];assert.equal(order.status,'awaiting_payment');assert.equal(order.cadence,term);
    const otherTerm=term==='yearly'?'monthly':'yearly';
    const other=page.locator('[data-cadence="'+otherTerm+'"]'),selected=page.locator('[data-cadence="'+term+'"]');
    await other.click();await page.getByRole('button',{name:/查看原订单|View existing order/}).waitFor();
    async function assertLocked(){
      assert.match(await page.locator('.price').innerText(),new RegExp('US\\$'+value.replace('.','\\.')));
      assert.equal(await selected.getAttribute('aria-pressed'),'true');assert.equal(await other.getAttribute('aria-pressed'),'false');
      assert.equal(new URL(page.url()).searchParams.get('cadence'),term);
      assert.equal(await payment.count(),0);assert.equal(await page.locator('[data-member-action="submit-order"]').count(),0);
      assert.ok((await page.locator('#open-order-summary').innerText()).includes('US$'+value));
    }
    await assertLocked();await page.reload();await page.locator('#open-order-summary').waitFor();await assertLocked();
    await page.goto(origin+'/membership.html?view=account&lang='+lang+'&cadence='+otherTerm);await page.locator('#open-order-summary').waitFor();await assertLocked();
    assert.equal((await membership()).orderAccount.orders.length,1);assert.equal((await membership()).orderAccount.orders[0].id,order.id);
    await page.locator('#open-order-summary').scrollIntoViewIfNeeded();await page.screenshot({path:join(out,lang+'-'+term+'-pending-switch.png')});
    await page.locator('[data-member-action="return-to-order"]').click();await payment.waitFor();
    assert.equal(await payment.getAttribute('href'),href);
    await payment.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,lang+'-'+width+'-order.png')});
    const opened=context.waitForEvent('page');await payment.click();const external=await opened;await external.waitForLoadState();
    assert.equal(external.url(),href);await external.close();
    if(term==='yearly'){
      await other.click();await page.locator('[data-cancel-order]').click();await page.waitForFunction(()=>!document.querySelector('[data-cancel-order]'));
      assert.equal((await membership()).orderAccount.orders[0].cancelRequested,true);assert.equal(await payment.count(),0);
    }
    await page.locator('.order-history details summary').click();await page.locator('#receipt-'+order.id).fill('LOCALRECEIPT0001');
    await page.locator('[data-report-receipt]').click();await page.waitForFunction(()=>!document.querySelector('.order-history a.commit'));
    await page.reload();await page.locator('[data-report-receipt]').waitFor({state:'attached'});
    const after=await membership();assert.equal(after.orderAccount.orders[0].receiptReported,true);assert.equal(after.membership.subscription.status,'inactive');
    await other.click();await assertLocked();assert.equal(await page.locator('[data-cancel-order]').count(),0);
    assert.equal(await page.locator('.order-history a.commit').count(),0);assert.deepEqual(errors,[]);
    const returned=new URL(page.url());returned.searchParams.set('paypal','return');
    await page.goto(returned.href);
    await page.waitForFunction(()=>/已从 PayPal 返回|Welcome back from PayPal/.test(document.querySelector('#notice')?.textContent));
    assert.equal((await membership()).membership.subscription.status,'inactive');
    cases.push({lang,width,term,priceUsd:value,oppositeTerm:otherTerm,oppositeLinkHidden:true,pendingPriceMatchesOnDeepLinkAndReload:true,sellerHost:'paypal.me',sameOrderOnRefresh:true,receiptReported:true,realAccess:'inactive',javascriptErrors:errors});
    await context.close();
  }
  await writeFile(join(out,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),network:'Local isolated database and mocked external PayPal destination. No payment.',cases},null,2));
  console.log('Passed '+cases.length+' signed-out and signed-in personal checkout journeys.');
}finally{
  await Promise.all(browsers.map(browser=>browser.close()));await new Promise(resolve=>app.server.close(resolve));
}
