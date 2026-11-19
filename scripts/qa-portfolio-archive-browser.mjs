import assert from 'node:assert/strict';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createApp} from '../server.mjs';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const temp=await mkdtemp(join(tmpdir(),'wallet-archive-browser-')),out=resolve('release/review-web/portfolio-wallet/local');
const previous=resolve('release/cloud/full-web/releases/2026-11-18-office/fund-edition-web.tgz');
const hash=createHash('sha256').update(await readFile(previous)).digest('hex');
assert.equal(hash,'d90a273c650945463d551b099ae8f0a2df4841f53f087091527774d5657299f1');
const env={FUNDROOM_DB_PATH:join(temp,'account.sqlite'),FUNDROOM_BROKER_DB_PATH:':memory:',FUNDROOM_ENABLE_LOCAL_VOICE:'false'};
let server,browser,port=0;
async function start(factory){({server}=await factory({env}));server.listen(port,'127.0.0.1');await once(server,'listening');port=server.address().port;}
async function stop(){if(server){await new Promise(ok=>server.close(ok));server=null;}}
try{
  const old=join(temp,'v2');await mkdir(old);await mkdir(out,{recursive:true});
  execFileSync('tar',['-xzf',previous,'-C',old]);
  await start((await import(pathToFileURL(join(old,'server.mjs')).href)).createApp);
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',serviceWorkers:'block'});
  const p=await context.newPage(),origin='http://127.0.0.1:'+port;
  await p.goto(origin+'/funds?id=ark-innovation&lang=zh-CN');
  await p.locator('details.fd-tools').filter({has:p.locator('[data-form=catalog-buy]')}).locator(':scope > summary').click();
  await p.locator('.unit-sandbox > summary').click();await p.locator('#catalog-amount').fill('275');
  const response=p.waitForResponse(r=>r.url().endsWith('/api/action')&&r.request().postDataJSON()?.action==='catalogBuy');
  await p.locator('[data-form=catalog-buy] button[type=submit]').click();const before=(await(await response).json()).catalogAccounts['ark-innovation'];
  assert.ok(before.unitsMicros>0);await p.goto('about:blank');await stop();
  await start(createApp);await p.goto(origin+'/portfolio?lang=zh-CN');await p.locator('.wallet-legacy summary').click();
  const book=await p.evaluate(async()=>await(await fetch('/api/portfolio')).json());
  const oldBook=book.legacy.catalogPositions[0];assert.equal(oldBook.unitsMicros,before.unitsMicros);
  assert.equal(book.cashCents,1000000);assert.deepEqual(book.positions,[]);assert.equal(book.totalOrders,0);
  await p.locator('.wallet-legacy').getByText('这些旧账户单独保存。下列现金与持仓不计入上方统一钱包。').waitFor();
  assert.equal(await p.locator('.wallet-legacy .wallet-pairs').getByText(oldBook.asOf).count(),1);
  await p.locator('.wallet-legacy h2').scrollIntoViewIfNeeded();
  await p.screenshot({path:join(out,'legacy-arkk-zh-390.png')});
  await p.locator('.wallet-legacy .wallet-order-link').click();await p.locator('[data-study-id="ark-innovation"]').waitFor();
  const legacyReceipt=p.locator('details.fd-tools').filter({hasText:'旧版独立模拟账户记录'});await legacyReceipt.locator(':scope > summary').click();await legacyReceipt.getByText(oldBook.asOf,{exact:false}).waitFor();
  await p.goto(origin+'/portfolio?lang=en-US');await p.setViewportSize({width:1440,height:900});await p.locator('.wallet-legacy summary').click();await p.locator('.wallet-legacy h2').scrollIntoViewIfNeeded();await p.screenshot({path:join(out,'legacy-arkk-en-1440.png')});
  const fresh=await browser.newContext({serviceWorkers:'block'}),other=await fresh.newPage();await other.goto(origin+'/portfolio?lang=zh-CN');await other.locator('#wallet-product').waitFor();assert.equal(await other.locator('.wallet-legacy').count(),0);
  await writeFile(join(out,'legacy-arkk.json'),JSON.stringify({at:new Date().toISOString(),sourceSha256:hash,description:'Ordinary visitor purchased ARKK for $275 on the old packaged application and opened the new application with the same SQLite and browser cookie.',openingCashCents:book.cashCents,openingHoldings:book.positions,legacy:oldBook,freshArchiveHidden:true,archiveDetailAccessible:true},null,2));
  console.log(JSON.stringify({units:oldBook.unitsMicros,price:oldBook.navCents,cash:book.cashCents,archiveDate:oldBook.asOf}));
}finally{
  if(browser)await browser.close();await stop();
  if(resolve(dirname(temp))===resolve(tmpdir())&&basename(temp).startsWith('wallet-archive-browser-'))await rm(temp,{recursive:true,force:true});
}
