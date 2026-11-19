import assert from 'node:assert/strict';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {createApp} from '../server.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const scratch=await mkdtemp(join(tmpdir(),'fundroom-formation-')),file=join(scratch,'workspace.sqlite');
const people=['Uma','Tariq','Rae','Linh'].map((name,i)=>({name,title:['Demand analyst','Liquidity lead','Disclosure reviewer','Risk analyst'][i],role:i===3?'risk':'research',duty:['Check store traffic','Cross-check cash on hand','Compare filings','Limit issuer exposure'][i]}));
const originalIdea='研究消费电子企业过去五年的库存周转，暂不允许任何模拟买卖。';
const namedRequest='再招两个人，林雨负责研究消费电子，陈海负责查财报';
const named=[{name:'林雨',role:'research',title:'消费电子研究员',duty:'研究消费电子'},{name:'陈海',role:'research',title:'财报研究员',duty:'查财报'}];
const {server}=await createApp({env:{FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'test-only',HARNESSROUTER_HARNESS_ID:'chrn_fixture',FUNDROOM_DB_PATH:file,FUNDROOM_BROKER_DB_PATH:':memory:'},fetchImpl:async(_url,options)=>{
  const turn=JSON.parse(JSON.parse(options.body).input).conversation.at(-1).text;
  const plan=turn===originalIdea?{profile:{goal:originalIdea}}:turn===namedRequest?{profile:{},staffing:named}:{profile:{},staffing:people};
  return Response.json({id:'resp_fixture',status:'completed',model:'fixture',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({...plan,answer:'Let’s review the proposed team.'})}]}]});
}});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});
const dir=resolve('release/review-web/maya-team-formation/single-step');await mkdir(dir,{recursive:true});
const report={at:new Date().toISOString(),runtime:'Private Edge with real application and isolated SQLite. Model staffing response uses four test candidates.',results:[]};
try{
 for(const [language,width,useReply] of [['zh-CN',390,true],['en-US',1440,false]]){
  const context=await browser.newContext({locale:language,viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const getState=()=>page.evaluate(async()=>await(await fetch('/api/state')).json());
  await page.goto(origin+'/studio?lang='+language);await page.locator('.receiver-opening').waitFor();
  const baseline=await getState();assert.equal(await page.locator('[data-formation-seat]').count(),0);
  if(useReply)await page.locator('[data-action=send-guide-answer]').first().click();
  else{
    await page.locator('.receiver-options summary').click();await page.locator('[data-action=toggle-typing]').click();
    await page.locator('#guide-message').fill('Hire Uma, Tariq, Rae and Linh to study store margins and liquidity.');
    await page.locator('[data-form=studio-onboard] [type=submit]').click();
  }
  await page.locator('[data-action=confirm-team]').waitFor();
  const pending=await getState(),seats=page.locator('[data-formation-seat]');
  assert.equal(pending.funds.length,baseline.funds.length);assert.equal(pending.guide.fundId,null);
  assert.equal(await seats.count(),5);assert.equal(await page.locator('[data-action=prepare-team]').count(),0);
  assert.equal(await seats.getByRole('radio').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
  const names=await seats.locator('h3').allTextContents();assert.deepEqual(names,['Maya Chen',...people.map(s=>s.name)]);
  for(const person of people){const row=seats.filter({has:page.getByRole('heading',{name:person.name,exact:true})});assert.ok(await row.locator('p').isVisible());assert.equal(await row.locator('p').innerText(),person.duty);}
  await page.locator('[data-action=change-team]').click();assert.ok(await page.locator('#guide-message').evaluate(el=>el===document.activeElement));
  if(useReply){ // Emulate a pre-upgrade saved visitor in this isolated local DB.
    const db=new DatabaseSync(file);const rows=db.prepare('select session_id,data from demo_sessions').all();
    const row=rows.find(row=>JSON.parse(row.data).guide.id===pending.guide.id),data=JSON.parse(row.data);
    data.guide.phase='discovery';data.guide.draft=null;
    db.prepare('update demo_sessions set data=?,revision=revision+1 where session_id=?').run(JSON.stringify(data),row.session_id);db.close();
  }
  await page.reload();await page.locator('[data-action=confirm-team]').waitFor();
  assert.deepEqual(await seats.locator('h3').allTextContents(),names);
  assert.equal((await getState()).funds.length,baseline.funds.length);
  await page.locator('#blueprint-heading').focus();assert.equal(await page.locator('#blueprint-heading').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  await page.screenshot({path:join(dir,language+'.png'),fullPage:true});
  await page.locator('[data-action=confirm-team]').evaluate(el=>{el.click();el.click()});
  await page.locator('[data-office-id]').waitFor();
  const confirmed=await getState();
  assert.equal(confirmed.funds.length,baseline.funds.length+1);
  assert.equal(new URL(page.url()).hash,'#/office?fund='+encodeURIComponent(confirmed.fund.id));
  assert.deepEqual((await getState()).fund.team.map(s=>s.name),names);assert.ok(await page.evaluate(()=>document.activeElement.matches('#studio-chat[data-seat-role=manager]')));assert.deepEqual(errors,[]);
  report.results.push({language,width,entry:useReply?'first suggested reply / resumed old draft':'natural language / refresh',names,allFiveDutiesVisible:true,unchangedBeforeConfirm:true,oneFundAfterDoubleClick:true});
  await context.close();
 }
 const custom=await browser.newContext({locale:'zh-CN',viewport:{width:390,height:844},serviceWorkers:'block'});
 const screen=await custom.newPage();await screen.goto(origin+'/studio?lang=zh-CN');

 await screen.locator('.receiver-opening').waitFor();
 const researchId=await screen.evaluate(async()=>{
   const action=async body=>{
     const result=await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,requestId:crypto.randomUUID()})});
     if(!result.ok)throw Error(body.action+' '+result.status);
     return result.json();
   };
   const proposal=await action({action:'prepareResearch',message:'Study VWELX',catalogId:'wellington'});
   const opened=await action({action:'confirmResearch',draftId:proposal.researchDraft.id,createFund:true});
   return opened.fund.id;
 });
 await screen.reload();
 const archive=screen.locator('.studio-directory-archive');
 await archive.locator('summary').click();await archive.locator('[data-office-fund="'+researchId+'"]').waitFor();
 await screen.locator('[data-action=start-fund]').click();
 await screen.locator('.workspace-toolbar a[href="#/fund"]').waitFor();
 await screen.locator('.receiver-options summary').click();await screen.locator('[data-action=toggle-typing]').click();
 const say=async text=>{await screen.locator('#guide-message').fill(text);await screen.locator('[data-form=studio-onboard] [type=submit]').click();};
 await say(originalIdea);await screen.locator('[data-action=confirm-team]').waitFor();
 const read=()=>screen.evaluate(async()=>(await(await fetch('/api/state')).json()));
 assert.match(await screen.locator('.office-formation-funding').innerText(),/100,000/);
 const before=await read(),beforeNames=await screen.locator('[data-formation-seat] h3').allTextContents();
 await screen.locator('[data-action=change-team]').click();await say(namedRequest);
 await screen.getByRole('heading',{name:'陈海',exact:true}).waitFor();
 assert.deepEqual(await screen.locator('[data-formation-seat] h3').allTextContents(),[...beforeNames,...named.map(p=>p.name)]);
 const after=await read();
 assert.equal(await screen.locator('.formation-intro blockquote p').textContent(),originalIdea);
 assert.equal(after.guide.draft.mandate,before.guide.draft.mandate);assert.deepEqual(after.guide.draft.permissions,before.guide.draft.permissions);
 for(const p of named)assert.equal(await screen.locator('[data-formation-seat]').filter({has:screen.getByRole('heading',{name:p.name,exact:true})}).locator('p').innerText(),p.duty);
 await screen.locator('[data-action=confirm-team]').click();await screen.locator('[data-office-id]').waitFor();const funded=await read();
 assert.equal(new URL(screen.url()).hash,'#/office?fund='+encodeURIComponent(funded.fund.id));
 assert.deepEqual(funded.fund.team.map(p=>p.name),[...beforeNames,...named.map(p=>p.name)]);assert.equal(funded.fund.mandate,before.guide.draft.mandate);

 const paper=await screen.evaluate(async()=>await(await fetch('/api/portfolio')).json());
 assert.deepEqual(paper.positions.map(position=>[position.productId,position.costBasisCents]),[['studio:'+funded.fund.id,10_000_000]]);
 assert.equal(paper.cashCents,0);
 report.researchBeforeFirstStudio={researchId,studioId:funded.fund.id,allocatedCents:paper.positions[0].costBasisCents};
 report.namedAddition={originalIdea,request:namedRequest,preserved:[...beforeNames],added:named,model:'fixture, no external call',fundId:funded.fund.id};
 await custom.close();
 await writeFile(join(dir,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));await rm(scratch,{recursive:true,force:true});}
