import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server.mjs';

const require=createRequire(import.meta.url);
const {chromium,webkit}=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const dir=resolve('release/review-web/fund-watch');
await mkdir(dir,{recursive:true});
process.env.PLAYWRIGHT_BROWSERS_PATH??=join(tmpdir(),'fund-edition-browser-qa');
const scratch=await mkdtemp(join(tmpdir(),'fundroom-watch-ui-'));
const database=join(scratch,'workspace.sqlite');
const {server}=await createApp({env:{FUNDROOM_DB_PATH:database,FUNDROOM_BROKER_DB_PATH:':memory:',FUNDROOM_WATCH_ENABLED:'true',FUNDROOM_ENABLE_HARNESS:'false'}});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
const report={createdAt:new Date().toISOString(),mode:'Local server with an isolated SQLite, unlocked native application UI, offline model, real external source requests, device viewport emulation. No checkout initiated.',cases:[]};
const mobile=await webkit.launch({headless:true,executablePath:join(process.env.PLAYWRIGHT_BROWSERS_PATH,'webkit-2336','Playwright.exe')});
const desktop=await chromium.launch({channel:'msedge',headless:true});
try {
 for(const [language,width,scheme] of [['zh-CN',390,'light'],['en-US',1440,'light'],['en-US',375,'dark'],['zh-CN',1440,'dark']]){
  const context=await(width<500?mobile:desktop).newContext({locale:language,viewport:{width,height:width<500?844:900},isMobile:width<500,hasTouch:width<500,colorScheme:scheme,serviceWorkers:'block'});
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/studio?lang='+language);await p.locator('[data-action=prepare-team]').click();await p.locator('[data-action=confirm-team]').click();
  await p.locator('[data-office-id]').waitFor();
  const watch=p.locator('[data-studio-watch]'),drawer=watch.locator('.sw-drawer>summary'),interval=watch.locator('[data-watch-interval]');
  await drawer.waitFor();const fund=await p.evaluate(async()=>(await(await fetch('/api/state')).json()).fund.id);
  const state=()=>p.evaluate(async id=>await(await fetch('/api/studio-watch?fund='+encodeURIComponent(id))).json(),fund);
  assert.equal((await state()).intervalMinutes,60);assert.equal(await watch.locator('[data-sw-state]').getAttribute('data-sw-state'),'enabled');
  const initialBox=await watch.boundingBox();assert.ok(initialBox.y<844);
  // Leave the Studio before the first server observation finishes.
  await p.goto(origin+'/portfolio?lang='+language);
  await p.waitForFunction(async id=>(await(await fetch('/api/studio-watch?fund='+id)).json()).history.some(h=>h.status==='complete'),fund,{timeout:95000,polling:1200});
  await p.goto(origin+'/studio?lang='+language);
  await p.locator('.studio-directory [data-office-fund="'+fund+'"]').click();
  await drawer.waitFor();
  assert.equal(new URL(p.url()).hash, '#/office?fund='+encodeURIComponent(fund));
  assert.equal(await p.locator('[data-office-id]').getAttribute('data-office-id'),fund);
  const result=await state(),first=result.history.find(h=>h.status==='complete');assert.ok(first.record.packet.feeds.length);
  assert.ok(await watch.innerText().then(s=>s.includes(first.record.packet.symbols[0].symbol)));
  await p.screenshot({path:join(dir,language+'-'+width+'-studio.png')});
  await drawer.focus();await p.keyboard.press('Enter');await interval.selectOption('30');
  await p.waitForFunction(()=>document.querySelector('.sw-context')?.textContent.includes('30'));
  assert.equal((await state()).intervalMinutes,30);
  await interval.selectOption('120');await p.waitForFunction(()=>document.querySelector('.sw-context')?.textContent.includes('120'));
  assert.equal((await state()).intervalMinutes,120);
  const rootSummary=watch.locator('.sw-history>summary').first();await rootSummary.click();
  await watch.locator('.sw-history details>summary').first().click();
  assert.ok(await watch.getByText(first.record.packet.feeds[0].name,{exact:false}).first().isVisible());
  assert.ok((await watch.innerText()).includes(language.startsWith('zh')?'未下单':'No order'));
  await watch.locator('.sw-policy').scrollIntoViewIfNeeded();await p.screenshot({path:join(dir,language+'-'+width+'-policy.png')});
  await watch.locator('.sw-decision').scrollIntoViewIfNeeded();await p.screenshot({path:join(dir,language+'-'+width+'-record.png')});
  await watch.locator('[data-watch-toggle]').click();await p.waitForFunction(()=>document.querySelector('[data-sw-state]')?.dataset.swState==='off');
  assert.equal((await state()).nextAt,null);
  await p.reload();await drawer.waitFor();assert.equal(await watch.locator('[data-sw-state]').getAttribute('data-sw-state'),'off');
  await drawer.click();await watch.locator('[data-watch-toggle]').click();await p.waitForFunction(()=>document.querySelector('[data-sw-state]')?.dataset.swState==='enabled');assert.ok((await state()).nextAt);
  assert.equal(await interval.inputValue(),'120');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
  let paging,prices;
  if(width===1440 && language==='en-US'){
    const db=new DatabaseSync(database),owner=db.prepare('SELECT owner FROM studio_watch_jobs WHERE fund=?').get(fund).owner;
    const add=db.prepare("INSERT INTO studio_watch_runs(owner,fund,slot,started,kind,status,record) VALUES(?,?,?,?,'market','missed',NULL)");
    for(let i=1;i<=40;i++){const at=first.slot-i*3_600_000;add.run(owner,fund,at,at);}
    db.close();await p.reload();await drawer.click();
    assert.equal(await watch.locator('.sw-history').count(),30);
    await watch.locator('[data-watch-older]').click();await p.waitForFunction(()=>document.querySelectorAll('.sw-history').length===41);
    assert.equal(await watch.locator('[data-watch-older]').count(),0);
    await watch.locator('.sw-history>summary').last().click();assert.match(await watch.locator('.sw-history').last().innerText(),/elapsed/);
    paging='isolated archive fixture, 30 + 11 different observations';
  }
  if(width<500){
    await p.goto(origin+'/membership.html?lang='+language);
    await p.locator('[data-cadence=monthly]').click();const monthly=await p.locator('.price').innerText();assert.match(monthly,/9\.99/);
    await p.locator('[data-cadence=yearly]').click();const yearly=await p.locator('.price').innerText();assert.match(yearly,/99\.99/);
    await p.locator('.price').scrollIntoViewIfNeeded();await p.screenshot({path:join(dir,language+'-'+width+'-annual.png')});
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);prices={monthly,yearly};
  }
  assert.deepEqual(errors,[]);report.cases.push({language,width,scheme,watchTop:initialBox.y,marketSession:result.marketSession,observed:first.kind,symbols:first.record.packet.symbols,headlines:first.record.packet.news.length,feeds:first.record.packet.feeds,ai:first.record.ai.status,sourceAsOf:first.record.packet.quotes.map(q=>({symbol:q.symbol,status:q.status,asOf:q.asOf})),paging,billing:prices});console.log(language,width,'passed');
  await context.close();
 }
 await writeFile(join(dir,'acceptance.json'),JSON.stringify(report,null,2));
}finally{await Promise.all([desktop.close(),mobile.close()]);await new Promise(r=>server.close(r));await rm(scratch,{recursive:true,force:true});}
