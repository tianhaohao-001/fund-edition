import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createApp } from '../server.mjs';

const require=createRequire(import.meta.url);
let chromium;
try { ({chromium}=require('playwright')); }
catch { ({chromium}=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const deployment=process.argv[2];
if(deployment && deployment!=='https://fund-edition-web-production.up.railway.app')throw Error('Unrecognized destination');
const directory=resolve('release/review-web/portfolio-wallet',deployment?'production':'local');
await mkdir(directory,{recursive:true});
let app;
if(!deployment){
  let turn=0;
  app=await createApp({env:{FUNDROOM_DB_PATH:':memory:',FUNDROOM_BROKER_DB_PATH:':memory:',FUNDROOM_ENABLE_LOCAL_VOICE:'false',FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'local-fixture',HARNESSROUTER_HARNESS_ID:'chrn_fixture'},fetchImpl:async()=>{
    const name=++turn===1?'Cedar Quality':'Harbor Income';
    const value={answer:'The proposed team will review the named strategy.',profile:{name,goal:'Review quality cash flows',horizon:'ten years',risk:'conservative'}};
    return Response.json({id:'resp_local_fixture_'+turn,status:'completed',model:'fixture',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
  }});
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
}
const origin=deployment||'http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={testedAt:new Date().toISOString(),origin,model:deployment?'Live deployment: deterministic prepare-team shortcut, no model calls required.':'Only Maya’s naming response uses a fixture. Wallet, user, NAV, orders, SQLite, and views use the application.',orders:[],screens:[]};
try{
  const c=await browser.newContext({viewport:{width:1440,height:900},locale:'en-US',serviceWorkers:'block'});
  const page=await c.newPage();page.setDefaultTimeout(13000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const read=()=>page.evaluate(async()=>await(await fetch('/api/portfolio')).json());
  const nav=async url=>{await page.goto(origin+url);};
  const mobile=async()=>page.setViewportSize({width:390,height:844});
  const capture=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);await page.screenshot({path:resolve(directory,name+'.png')});report.screens.push(name);};
  await nav('/?lang=en-US');await page.locator('.ge-rail .wallet-nav').click();await page.locator('#wallet-product').waitFor();
  assert.equal(await page.locator('a.wallet-back').getAttribute('href'),'#/');
  const openingCashCents=10_000_000;
  assert.equal((await read()).cashCents,openingCashCents);
  async function create(name){
    await page.locator('[data-wallet-new]').click();
    await page.locator('.receiver-opening').waitFor();
    if(!deployment){
      await page.locator('.receiver-options summary').click();
      await page.locator('[data-action=toggle-typing]').click();await page.locator('#guide-message').fill('Study quality cash flows over ten years, conservative. Name the fund '+name+'.');
      await page.locator('[data-form=studio-onboard] [type=submit]').click();
      await page.locator('[data-action=confirm-team]').waitFor();
    }else{
      await page.locator('[data-action=prepare-team]').click();
    }
    await page.locator('[data-action=confirm-team]').click();
    const office=page.locator('[data-office-id]');
    await office.waitFor();
    const id=await office.getAttribute('data-office-id');
    assert.ok(id);
    const officeHash='#/office?fund='+encodeURIComponent(id);
    assert.equal(new URL(page.url()).hash,officeHash);
    await nav('/studio?lang=en-US');
    await page.locator('[data-office-fund="'+id+'"]').click();
    await office.waitFor();
    assert.equal(await office.getAttribute('data-office-id'),id);
    await page.locator('a[href^="#/fund-record"]').click();
    await page.getByRole('heading',{name:'Fund trading record'}).waitFor();
    await page.locator('a[href="'+officeHash+'"]').first().click();
    await office.waitFor();
    const productId='studio:'+id;
    await page.locator('a[href="#/portfolio?product='+encodeURIComponent(productId)+'"]').click();
    await page.locator('#wallet-size').waitFor();
    assert.equal(await page.locator('#wallet-product').inputValue(),productId);

    await page.locator('a.wallet-back[href="'+officeHash+'"]').click();
    await office.waitFor();
    assert.equal(await office.getAttribute('data-office-id'),id);
    await page.locator('a[href="#/portfolio?product='+encodeURIComponent(productId)+'"]').click();
    await page.locator('#wallet-size').waitFor();
    return productId;
  }
  async function trade(amount,duplicate=false) {
    await page.locator('#wallet-size').fill(amount);
    await page.locator('#wallet-size').press('Enter');await page.locator('#wallet-check').waitFor();
    const reply=page.waitForResponse(r=>r.url().endsWith('/api/portfolio')&&r.request().method()==='POST');
    await page.locator('[data-wallet-confirm]').press('Enter');
    const response=await reply, result=await response.json();assert.equal(response.status(),200,JSON.stringify(result));
    await page.locator('.wallet-invest .wallet-message').waitFor();report.orders.push(result.receipt);
    if(duplicate){
      const again=await page.evaluate(async order=>await(await fetch('/api/portfolio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(order)})).json(),response.request().postDataJSON());
      assert.equal(again.receipt.id,result.receipt.id);assert.equal(again.cashCents,result.cashCents);assert.equal(again.totalOrders,result.totalOrders);report.idempotentReceipt=again.receipt.id;
    }
    return result;
  }
  const first=await create('Cedar Quality');
  const seeded=await read();
  assert.equal(seeded.cashCents,0);
  assert.equal(seeded.equityCents,openingCashCents);
  assert.deepEqual(seeded.positions.map(p=>[p.productId,p.costBasisCents]),[[first,openingCashCents]]);
  await page.locator('[data-wallet-funding]').click();
  const claimResponse=page.waitForResponse(r=>r.url().endsWith('/api/portfolio/claim')&&r.request().method()==='POST');
  await page.locator('[data-wallet-claim]').click();
  const credited=await claimResponse;
  assert.equal(credited.status(),200);
  const funded=await credited.json();
  assert.equal(funded.cashCents,openingCashCents);
  assert.equal(funded.pnlCents,seeded.pnlCents);
  await trade('1000',true);
  const second=await create('Harbor Income');assert.notEqual(first,second);await trade('1500');
  for(const [id,amount] of [['buffett','2000'],['ark-innovation','1750']]){
    await nav('/funds?id='+id+'&lang=en-US');await page.locator('.wallet-entry .wallet-order-link').click();
    assert.equal(await page.locator('#wallet-product').inputValue(),'catalog:'+id);
    await trade(amount);
  }
  assert.equal((await read()).positions.length,4);
  await page.locator('[data-manage-product="'+first+'"]').click();await trade('250');
  const beforeSell=await read();await page.locator('[data-manage-product="catalog:ark-innovation"]').click();
  await page.locator('[data-wallet-side=sell]').click();const partial=await trade('1');
  assert.equal(partial.cashCents-beforeSell.cashCents,partial.receipt.amountCents);
  const ids=partial.orders.map(o=>o.id);await page.reload();await page.locator('.wallet-positions li').first().waitFor();
  assert.deepEqual((await read()).orders.map(o=>o.id),ids);
  await capture('portfolio-en-1440');
  await mobile();await capture('portfolio-en-390');
  await nav('/portfolio?lang=zh-CN');await page.locator('.wallet-positions li').first().waitFor();await capture('portfolio-zh-390');
  await page.setViewportSize({width:1440,height:900});await capture('portfolio-zh-1440');
  await page.locator('.wallet-orders summary').first().click();await page.locator('.wallet-orders details[open]').getByText(partial.receipt.id).waitFor();
  await page.locator('[data-manage-product="catalog:ark-innovation"]').click();await page.locator('[data-wallet-side=sell]').click();await page.locator('[data-wallet-all]').click();
  const last=await trade(await page.locator('#wallet-size').inputValue());assert.equal(last.positions.length,3);
  const isolated=await browser.newContext({serviceWorkers:'block'}),other=await isolated.newPage();
  await other.goto(origin+'/portfolio?lang=zh-CN');await other.locator('#wallet-product').waitFor();const fresh=await other.evaluate(async()=>await(await fetch('/api/portfolio')).json());
  assert.equal(fresh.cashCents,openingCashCents);assert.equal(fresh.totalOrders,0);assert.equal(fresh.products.filter(x=>x.kind==='studio').length,0);
  report.verified={partialSell:partial.receipt.id,totalOrders:last.totalOrders,endingCash:last.cashCents,endingEquity:last.equityCents,otherCash:fresh.cashCents,fourFunds:beforeSell.positions.map(p=>({productId:p.productId,name:p.name,source:p.quote.source,asOf:p.quote.asOf})),errors};
  assert.deepEqual(errors,[]);await isolated.close();await c.close();
  await writeFile(resolve(directory,'journey.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.verified));
}finally{await browser.close();if(app)await new Promise(done=>app.server.close(done));}
