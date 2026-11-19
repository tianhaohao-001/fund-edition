import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import { execFileSync,spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdir,mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root=fileURLToPath(new URL('../',import.meta.url));
const prior=resolve(root,'release/cloud/full-web/releases/2026-11-18-office/fund-edition-web.tgz');
const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const previousSha=await digest(prior);
assert.equal(previousSha,'d90a273c650945463d551b099ae8f0a2df4841f53f087091527774d5657299f1');
const archiveArg=process.argv.slice(2).find(v=>!v.startsWith('--'));
const incoming=archiveArg?resolve(archiveArg):null,folder=await mkdtemp(join(tmpdir(),'fund-portfolio-upgrade-'));
const checkBrowser=process.argv.includes('--browser');
const destination=join(root,'release/review-web/portfolio-account');
const origin='https://portfolio-upgrade.example',database=join(folder,'same-volume.sqlite');
let app,base;
async function start(cwd,packaged){
  const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,FUNDROOM_PUBLIC_HOSTED:'true',FUNDROOM_PUBLIC_ORIGIN:origin,
    FUNDROOM_CLOUD_BIND:'127.0.0.1',FUNDROOM_HOST:'127.0.0.1',FUNDROOM_PORT:'0',PORT:'0',FUNDROOM_DB_PATH:database,FUNDROOM_ENABLE_LOCAL_VOICE:'false'};
  app=spawn(process.execPath,[packaged?'start.mjs':'server.mjs'],{env,cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const lines=createInterface({input:app.stdout});
  const [line]=await Promise.race([once(lines,'line'),once(app,'exit').then(()=>{throw Error('Application failed to start');})]);
  base='http://127.0.0.1:'+line.match(/(\d+)$/u)[1];
}
async function stop(){if(app){const done=once(app,'exit');app.kill();await done;app=null;}}
async function call(path,cookie,body,expected=200){
  const res=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),
    ...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const value=await res.json();assert.equal(res.status,expected,JSON.stringify([path,value.code,value.error]));
  return {value,cookie:res.headers.get('set-cookie')?.split(';')[0]??cookie};
}
const action=(cookie,name,extra)=>call('/api/action',cookie,{action:name,requestId:randomUUID(),...extra});

async function checkArchivedUI(owner,foreign){
  const require=createRequire(import.meta.url);
  let chromium;
  try{({chromium}=require('playwright'));}
  catch{({chromium}=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const result=[];
  try{
    for(const [cookie,lang,width] of [[owner,'zh-CN',390],[owner,'en-US',1440],[foreign,'en-US',390]]){
      const context=await browser.newContext({locale:lang,serviceWorkers:'block',viewport:{width,height:900}});
      const [name,value]=cookie.split('=');
      await context.addCookies([{name,value,url:base,httpOnly:true}]);
      const page=await context.newPage();
      await page.goto(base+'/portfolio?lang='+lang);
      await page.locator('#wallet-product').waitFor();
      const old=page.locator('.wallet-legacy');
      if(cookie===owner){
        await old.locator('summary').click();
        const text=await old.innerText();
        assert.match(text,/ARKK/u);assert.match(text,/2\.372735/u);assert.match(text,/9,725\.00/u);
        assert.match(text,/275\.00/u);assert.match(text,/Synthetic scenario|合成情景/u);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
        await old.scrollIntoViewIfNeeded();
        const screen='legacy-'+lang+'-'+width+'.png';
        await page.screenshot({path:join(destination,screen)});
        result.push({language:lang,width,oldUnitsVisible:true,oldCashVisible:true,receiptVisible:true,screen});
      }else{
        assert.equal(await old.count(),0);result.push({foreignArchiveAbsent:true});
      }
      await context.close();
    }
  }finally{await browser.close();}
  return result;
}
try {
  await mkdir(destination,{recursive:true});
  const previousRoot=join(folder,'before');await mkdir(previousRoot);execFileSync('tar',['-xzf',prior,'-C',previousRoot]);
  await start(previousRoot,true);
  const guest=(await call('/api/state')).cookie,foreign=(await call('/api/state')).cookie;
  const draft=await action(guest,'prepareTeamStudio',{language:'en-US'});
  const formed=await action(guest,'confirmFundDraft',{draftId:draft.value.guide.draft.id});
  const firstFund=formed.value.fund.id;
  await action(guest,'catalogBuy',{catalogId:'ark-innovation',amount:275});
  const oldState=(await call('/api/state',guest)).value;
  const oldBook=oldState.catalogAccounts['ark-innovation'];
  assert.ok(oldBook.unitsMicros>0);await stop();
  let currentRoot=root;
  if(incoming){currentRoot=join(folder,'after');await mkdir(currentRoot);execFileSync('tar',['-xzf',incoming,'-C',currentRoot]);}
  await start(currentRoot,Boolean(incoming));
  const beginning=(await call('/api/portfolio',guest)).value;
  assert.equal(beginning.cashCents,1_000_000);assert.equal(beginning.positions.length,0);
  assert.equal(beginning.legacy.catalogAccounts,1);assert.ok(beginning.products.some(p=>p.productId==='studio:'+firstFund));
  const archived=beginning.legacy.catalogPositions[0];
  assert.equal(archived.unitsMicros,oldBook.unitsMicros);assert.equal(archived.cashCents,oldBook.cashCents);
  assert.equal(archived.navCents,oldBook.quote.priceCents);assert.equal(archived.asOf,oldBook.quote.date);
  assert.equal(archived.valueCents,Math.round(oldBook.marketValue*100));assert.equal(archived.source,oldBook.quote.source);
  assert.equal(archived.receipts[0].amountCents,27500);
  // Replaying an in-flight v2 browser instruction must never silently buy
  // fresh units from v3 cash. The original v2 route restores its old result.
  const oldId=oldBook.history[0].requestId;
  await call('/api/action',guest,{action:'catalogBuy',requestId:oldId,catalogId:'ark-innovation',amount:275});
  await call('/api/portfolio',guest,{side:'buy',requestId:oldId,productId:'catalog:ark-innovation',amountCents:27500},409);
  assert.equal((await call('/api/portfolio',guest)).value.totalOrders,0);
  const screenChecks=checkBrowser?await checkArchivedUI(guest,foreign):[];
  assert.deepEqual((await call('/api/state',guest)).value.catalogAccounts['ark-innovation'],oldBook);
  await action(guest,'resetDesignConversation',{});
  const next=await action(guest,'prepareTeamStudio',{});
  const secondFund=(await action(guest,'confirmFundDraft',{draftId:next.value.guide.draft.id})).value.fund.id;
  let wallet,firstOrder;
  const purchases=[['studio:'+firstFund,125000],['studio:'+secondFund,200000],['catalog:buffett',150000],['catalog:ark-innovation',100000]];
  for(const [productId,amountCents] of purchases){
    const order={requestId:randomUUID(),side:'buy',productId,amountCents};
    wallet=(await call('/api/portfolio',guest,order)).value;
    firstOrder??=order;
  }
  assert.equal(wallet.cashCents,425000);assert.equal(wallet.positions.length,4);assert.equal(wallet.pnlCents,0);
  assert.deepEqual((await call('/api/portfolio',foreign)).value.positions,[]);
  const user=(await call('/api/auth/register',guest,{email:'upgrade-'+randomUUID()+'@example.test',password:randomUUID()})).cookie;
  assert.notEqual(user,guest);await stop();await start(currentRoot,Boolean(incoming));
  const after=(await call('/api/portfolio',user)).value;assert.deepEqual(after.positions,wallet.positions);assert.equal(after.cashCents,425000);
  const duplicate=(await call('/api/portfolio',user,firstOrder)).value;
  assert.equal(duplicate.totalOrders,4);assert.equal(duplicate.receipt.id,after.orders.find(o=>o.requestId===firstOrder.requestId).id);
  assert.deepEqual((await call('/api/portfolio',guest)).value.positions,[]);
  let last;
  for(const p of after.positions)last=(await call('/api/portfolio',user,{requestId:randomUUID(),side:'sell',productId:p.productId,unitsMicros:p.unitsMicros})).value;
  assert.equal(last.cashCents,1_000_000);assert.equal(last.realizedPnlCents,0);assert.deepEqual(last.positions,[]);
  const record={checkedAt:new Date().toISOString(),previousArchiveSha256:previousSha,
    currentArchiveSha256:incoming?await digest(incoming):null,ledgerSourceSha256:await digest(join(currentRoot,'core/portfolio-account.mjs')),
    runtime:'Private production-mode processes with the same dedicated SQLite volume and durable browser session; no broker or AI credentials.',
    priorStudyPreserved:true,oldStudyCashCents:oldBook.cashCents,oldStudyUnitsMicros:oldBook.unitsMicros,openingWalletCents:beginning.cashCents,
    investedCount:after.positions.length,uninvestedCents:after.cashCents,marks:after.positions.map(p=>({kind:p.kind,mark:p.quote.kind,navCents:p.quote.navCents,asOf:p.quote.asOf})),
    duplicateReceipt:true,registrationAndRestart:true,independentVisitorCashCents:1_000_000,allRedeemedCents:last.cashCents,realizedPnlCents:last.realizedPnlCents};
  record.archivedARKK=archived;record.archivedBrowserChecks=screenChecks;
  await writeFile(join(destination,incoming?'upgrade-packaged.json':'upgrade-source.json'),JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify(record));
}finally{await stop();await rm(folder,{recursive:true,force:true});}
