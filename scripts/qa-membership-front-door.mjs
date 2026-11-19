import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';

const baseline=process.argv.includes('--public-before'),providerOrders=new Map();
const fixture=async(href,request)=>{
  const endpoint=new URL(href);assert.equal(endpoint.origin,'https://api-m.sandbox.paypal.com');
  if(endpoint.pathname==='/v1/oauth2/token')return Response.json({access_token:'test-only',expires_in:3600});
  if(endpoint.pathname==='/v2/checkout/orders'){
    const body=JSON.parse(request.body),id='TESTSANDBOX'+(providerOrders.size+1);
    const approval='https://www.sandbox.paypal.com/checkoutnow?token='+id;
    const row={id,intent:body.intent,status:'PAYER_ACTION_REQUIRED',purchase_units:body.purchase_units,links:[{rel:'payer-action',href:approval}]};
    providerOrders.set(id,{row,urls:body.payment_source.paypal.experience_context});return Response.json(row);
  }
  const {row}=providerOrders.get(endpoint.pathname.split('/')[4]);
  if(endpoint.pathname.endsWith('/capture')){assert.equal(row.status,'APPROVED');row.status='COMPLETED';row.purchase_units[0].payments={captures:[{id:'TESTCAPTURE'+row.id,status:'COMPLETED',amount:row.purchase_units[0].amount,final_capture:true}]};}
  return Response.json(row);
};
const app=baseline?null:await createApp({env:{FUNDROOM_DB_PATH:':memory:',FUNDROOM_BROKER_DB_PATH:':memory:',FUNDROOM_INVOICE_ORDERS:'true',FUNDROOM_PAYPAL_SANDBOX_CLIENT_ID:'test-only',FUNDROOM_PAYPAL_SANDBOX_CLIENT_SECRET:'test-only'},fetchImpl:fixture});
if(app){app.server.listen(0,'127.0.0.1');await once(app.server,'listening');}
const origin=app?'http://127.0.0.1:'+app.server.address().port:'https://fund-edition-web-production.up.railway.app';
const dir=resolve('release/review-web/checkout-test/entry-'+(baseline?'public-before':'candidate'));await mkdir(dir,{recursive:true});
const require=createRequire(import.meta.url);process.env.PLAYWRIGHT_BROWSERS_PATH??=join(tmpdir(),'fund-edition-browser-qa');
const {chromium,webkit}=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const phone=await webkit.launch({headless:true,executablePath:join(process.env.PLAYWRIGHT_BROWSERS_PATH,'webkit-2336','Playwright.exe')});
const computer=await chromium.launch({channel:'msedge',headless:true});
const report={at:new Date().toISOString(),mode:baseline?'Production baseline. Read-only browser navigation; no orders.':'Local isolated SQLite. PayPal responses and sandbox navigation are controlled test fixtures; no requests go to PayPal.',cases:[]};
try{
 for(const [width,language,entry,term,signed] of [[390,'zh-CN','menu','monthly',false],[1440,'en-US','studio','yearly',false],[375,'en-US','menu','yearly',true],[1440,'zh-CN','studio','monthly',true]]){
  const ctx=await(width<500?phone:computer).newContext({locale:language,viewport:{width,height:width<500?844:900},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'}),p=await ctx.newPage(),price=term==='monthly'?'9.99':'99.99';
  p.setDefaultTimeout(15000);
  if(app)await ctx.route('https://www.sandbox.paypal.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Controlled sandbox navigation proof</title>'}));
  const home=origin+'/?lang='+language;await p.goto(home);
  let historicId;
  if(app&&signed){ // A fresh synthetic identity is limited to the local SQLite.
    const id=randomUUID();
    const status=await p.evaluate(async id=>(await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:id+'@example.test',password:'test-only-'+id})})).status,id);
    assert.ok([200,201].includes(status));
    historicId=await p.evaluate(async({id,term})=>{
      const result=await fetch('/api/membership/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'request',requestKey:crypto.randomUUID(),cadence:term,email:id+'@example.test',consent:true})});
      return (await result.json()).order?.id;
    },{id,term});assert.ok(historicId);await p.reload();
  }
  if(entry==='menu'){
    await p.getByRole('button',{name:language==='zh-CN'?'设置':'Settings',exact:true}).click();await p.locator('dialog a[href*=membership]').click();
  }else{
    await p.locator('a[href="#/fund"]:visible').last().click();await p.locator('[data-footer-plans]').click();
  }
  await p.locator('[data-cadence='+term+']').click();
  const card=p.locator('.plan-card');await card.locator('.commit').first().waitFor();assert.ok((await card.locator('.price').innerText()).includes(price));
  const primary=await card.locator('.commit').first().innerText();
  if(baseline){assert.match(primary,/登录申请付款单|Sign in to request payment/);assert.equal(await card.locator('#try-checkout').count(),0);}
  else{await p.waitForFunction(()=>document.querySelector('#try-checkout')?.textContent.includes('PayPal'));assert.equal(await card.locator('.commit#try-checkout').count(),1);assert.equal(await card.locator('.commit').count(),1);}
  await card.scrollIntoViewIfNeeded();await p.screenshot({path:join(dir,language+'-'+width+'-primary.png')});
  const summary={width,language,entry,cadence:term,price,authenticated:app? signed:false,primary:await card.locator('.commit').innerText(),cardTestCTA:await card.locator('#try-checkout').count(),regularOrderCreated:false};
  if(app){
    await card.locator('#official-orders').click();await p.waitForURL(url=>url.searchParams.get('view')==='orders');
    assert.ok((await p.locator('.price').innerText()).includes(price));assert.equal(await p.locator('html').getAttribute('lang'),language);
    summary.secondary=p.url().split('?')[1];summary.regularShowsLogin=!!await p.locator('.login-to-checkout').count();
    if(historicId){await p.locator('[data-withdraw="'+historicId+'"]').waitFor();summary.originalOrderVisible=true;}
    await p.goBack();await card.locator('#try-checkout').waitFor();
    await card.locator('#try-checkout').click();await p.waitForURL('https://www.sandbox.paypal.com/**');
    const id=new URL(p.url()).searchParams.get('token'),provider=providerOrders.get(id);assert.ok(provider);
    assert.equal(provider.row.purchase_units[0].amount.value,price);assert.equal(new URL(provider.urls.return_url).searchParams.get('lang'),language);
    summary.handoff=new URL(p.url()).hostname;provider.row.status='APPROVED';
    await p.goto(provider.urls.return_url);
    try{await p.waitForFunction(()=>document.querySelector('#test-create')?.textContent.match(/Try again|再试一次/));}
    catch(error){console.error('Controlled sandbox return:',new URL(p.url()).origin,new URL(p.url()).pathname,(await p.locator('main').innerText()).slice(-560),provider.row.status);throw error;}
    await p.locator('#back').click();await p.locator('#test-access-summary a').waitFor();
    assert.equal(await p.locator('html').getAttribute('lang'),language);
    assert.ok((await card.locator('.price').innerText()).includes(price));
    const receiptLink=p.locator('#test-access-summary a');await receiptLink.click();await p.locator('#test-create').waitFor();
    await p.locator('#back').click();await p.locator('#test-access-summary a').waitFor();
    await p.locator('#try-checkout').click();await p.waitForURL('https://www.sandbox.paypal.com/**');
    assert.notEqual(new URL(p.url()).searchParams.get('token'),id);summary.receiptVisible=true;summary.repeatSentNewTest=true;
  }
  report.cases.push(summary);await writeFile(join(dir,'acceptance.json'),JSON.stringify(report,null,2));console.log(width,language,entry,'passed');await ctx.close();
 }
}finally{await Promise.all([computer.close(),phone.close()]);if(app)await new Promise(r=>app.server.close(r));}
