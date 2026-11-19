import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [entry]=process.argv.slice(2);if(!entry)throw Error('Pass the packaged Worker entrypoint');
const {default:worker}=await import(pathToFileURL(resolve(entry)));
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('./drizzle/0000_conversations.sql',import.meta.url),'utf8'));
class Statement{
  constructor(sql,params=[]){this.sql=sql;this.params=params;}
  bind(...params){return new Statement(this.sql,params);}
  async all(){return {results:sqlite.prepare(this.sql).all(...this.params)};}
  async first(){return sqlite.prepare(this.sql).get(...this.params);}
  run(){const {changes}=sqlite.prepare(this.sql).run(...this.params);return {meta:{changes}};}
}
sqlite.exec(readFileSync(new URL('./drizzle/0001_public_examples.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('./drizzle/0002_visitors.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('./drizzle/0003_thread_archive.sql',import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('./drizzle/0004_drafts.sql',import.meta.url),'utf8'));
const DB={prepare:sql=>new Statement(sql),batch:async items=>{sqlite.exec('BEGIN');try{const out=items.map(item=>item.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const live=process.argv.includes('--hosted'),env={DB,FUNDROOM_DIRECT_APPLICATION_SERVER:true,FUNDROOM_HR_KEY:live?process.env.HARNESSROUTER_API_KEY:'unit-fixture'};
if(live&&!env.FUNDROOM_HR_KEY)throw Error('A configured runtime is required');
const origin='https://qa.example',steps=[];
if(live){
  const network=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    const response=await network(url,init);
    const payload=await response.clone().json().catch(()=>({}));
    const parts=(payload.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text');
    console.error(JSON.stringify({mode:JSON.parse(JSON.parse(init.body).input).mode,http:response.status,status:payload.status,responseId:payload.id,code:payload.error?.code,reason:payload.incomplete_details?.reason,outputTypes:(payload.output||[]).map(x=>x.type),textLength:parts.reduce((sum,x)=>sum+x.text.length,0)}));
    return response;
  };
}
if(!live)globalThis.fetch=async(_url,init)=>{
  const request=JSON.parse(init.body),input=JSON.parse(request.input);
  let result={answer:'This licensed study is limited by the timing of its historical disclosures.'};
  if(input.mode==='fund-design')result={answer:'Your blueprint is ready.',profile:{goal:'Value',horizon:'three years',risk:'balanced',name:'Paper Research'}};
  if(input.mode==='staffing-proposal')result={answer:'Two seats ready for review.',hires:[
    {name:'Lin',title:'Financials analyst',role:'research',duty:'Read company financials.'},
    {name:'Jay',title:'Quote analyst',role:'trader',duty:'Review paper quote age.'}]};
  if(input.mode==='team-advice')result={answer:input.teammate.name+' will examine '+input.teammate.duty};
  if(input.mode==='team-assignment')result={answer:'Review my new duty.',duty:'Check the closing paper quote.',title:'Closing quotes'};
  return Response.json({status:'completed',id:'resp_fixture',model:'fixture',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(result)}]}]});
};
const request=async(path,{owner='',body,from=origin,headers={}}={})=>worker.fetch(new Request(origin+path,{method:body?'POST':'GET',headers:{...(owner?{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@example.invalid'}:{}),...(body?{'Content-Type':'application/json',Origin:from}:{}),...headers},body:body?JSON.stringify(body):undefined}),env);
const run=async(body,owner='first')=>request('/api/chat',{owner,body});
const body=(topic,message,revision,action='chat')=>({id:crypto.randomUUID(),topic,message,revision,action,language:'en-US'});
try{
  const list=await (await request('/api/catalog?lang=en-US')).json();assert.equal(list.length,14);
  for(const {id} of list)assert.equal((await request('/api/study?id='+id)).status,200);
  const mp4=await request('/tour.mp4',{headers:{Range:'bytes=0-1'}});assert.equal(mp4.status,206);assert.equal((await mp4.arrayBuffer()).byteLength,2);
  const wavPath='/assets/maya-opening-en.wav',allBytes=new Uint8Array(await (await request(wavPath)).arrayBuffer());
  for(const [from,to] of [[1,5],[7,7],[allBytes.length-5,allBytes.length-1]]){
    const part=await request(wavPath,{headers:{Range:'bytes='+from+'-'+to}});
    assert.deepEqual(new Uint8Array(await part.arrayBuffer()),allBytes.slice(from,to+1));
    const head=await worker.fetch(new Request(origin+wavPath,{method:'HEAD',headers:{Range:'bytes='+from+'-'+to}}),env);
    assert.equal(Number(head.headers.get('Content-Length')),to-from+1);
    assert.equal((await head.arrayBuffer()).byteLength,0);
  }
  assert.equal((await request('/api/thread?topic=studio')).status,200);
  const question=body('studio','Build a three year balanced paper fund for growing cash flow. Use sensible defaults.',0);
  assert.equal((await request('/api/chat',{owner:'first',from:'https://other.example',body:question})).status,403);
  const result=await run(question),design=await result.json();assert.equal(result.status,200,JSON.stringify(design));
  assert.equal(design.value.phase,'ready');assert.ok(design.value.messages.at(-1).responseId);steps.push(['studio',design.value.messages.at(-1).responseId]);
  const duplicate=await (await run(question)).json();assert.deepEqual(duplicate,design);
  const confirmation=await (await run(body('studio','',1,'confirm'))).json();assert.equal(confirmation.value.fund.cashCents,1000000);assert.equal(confirmation.value.fund.orderCount,0);
  if(!live){
    const owner='studio-team-test';
    let current={revision:0};
    const act=async(action,seatId,message='',proposalId)=>{
      const input={...body('studio',message,current.revision,action),...(seatId?{seatId}:{}),...(proposalId?{proposalId}:{})};
      const response=await run(input,owner),result=await response.json();
      assert.equal(response.status,200,JSON.stringify(result));current=result;
      return input;
    };
    await act('solo');await act('confirm');assert.equal(current.value.fund.team.length,1);
    await act('hire','maya-chen','Hire two colleagues.');assert.equal(current.value.fund.team.length,1);
    const offer=current.value.fund.proposals['maya-chen'];
    const receipt=await act('accept','maya-chen','',offer.id);
    assert.deepEqual(await (await run(receipt,owner)).json(),current);
    const [,lin,jay]=current.value.fund.team;assert.equal(lin.name,'Lin');assert.equal(jay.name,'Jay');
    await act('ask',lin.id,'Read financials');await act('ask',jay.id,'Inspect prices');
    assert.ok(current.value.fund.threads[lin.id].at(-1).text.includes('Lin'));
    assert.ok(!JSON.stringify(current.value.messages).includes('Inspect prices'));
    assert.ok(!JSON.stringify(current.value.fund.threads[jay.id]).includes('Read financials'));
    await act('assign',jay.id,'From now on check closing quotes.');
    assert.equal(current.value.fund.team[2].title,'Quote analyst');
    await act('accept',jay.id,'',current.value.fund.proposals[jay.id].id);
    assert.equal(current.value.fund.team[2].title,'Closing quotes');
    const restored=await (await request('/api/thread?topic=studio',{owner})).json();
    assert.deepEqual(restored.value.fund,current.value.fund);assert.equal(restored.value.fund.orderCount,0);
    assert.equal((await run({...body('studio','Hello',0,'ask'),seatId:jay.id},'separate-team')).status,409);
    for(const language of ['en-US','zh-CN']){
      const guest='studio-formation-'+language;
      let stage=await (await request('/api/thread?topic=studio&lang='+language,{owner:guest})).json();
      async function advance(action, message='', seatId, proposalId) {
        const input={...body('studio',message,stage.revision,action),language,...(seatId?{seatId}:{}),...(proposalId?{proposalId}:{})};
        const response=await run(input,guest);stage=await response.json();assert.equal(response.status,200,JSON.stringify(stage));
      }
      await advance('prepare');
      assert.equal(stage.value.phase,'ready');assert.equal(stage.value.draft.permissions.allowBuy,false);
      const startingSeats=stage.value.draft.roster.length;assert.ok(startingSeats>=1);
      await advance('confirm');
      await advance('chat',language==='zh-CN'?'招聘两位同事，分别负责阅读财务报表和审查模拟价格。':'Hire two teammates to review financial statements and paper prices.');
      assert.equal(stage.value.fund.team.length,startingSeats);
      const invitation=stage.value.fund.proposals['maya-chen'];
      assert.equal(invitation.hires.length,2);assert.ok(stage.value.messages.at(-1).responseId);
      await advance('accept','','maya-chen',invitation.id);
      assert.equal(stage.value.fund.team.length,startingSeats+2);assert.equal(stage.value.fund.arrivals.length,2);
      assert.equal(stage.value.fund.orderCount,0);
    }
  }
  const discussion=await (await run(body('active-bond','Which risk is hardest to verify with this BOND study, and why?',0))).json();assert.ok(discussion.value?.messages.at(-1).responseId,JSON.stringify(discussion));steps.push(['fund-research',discussion.value.messages.at(-1).responseId]);
  const other=await (await request('/api/thread?topic=studio',{owner:'second'})).json();assert.equal(other.revision,0);assert.equal(other.value.fundId,null);
  const malicious=await run({...body('active-bond','Hello',1),model:'wrong'});assert.equal(malicious.status,400);
  for(const privateRoute of ['/api/review/fund-bars','/api/fund-operator','/api/action','/api/broker/account','/api/paper/account','/.fundroom/market-review/etf-bars.json']){
    assert.equal((await request(privateRoute)).status,404,privateRoute);
  }
  if(!live){
    const owner='draft-owner',other='draft-neighbor';
    const read=async(who,topic)=>(await request('/api/draft?topic='+topic,{owner:who})).json();
    const save=(who,topic,message,revision)=>worker.fetch(new Request(origin+'/api/draft?topic='+topic,{
      method:'PUT',headers:{Origin:origin,'Content-Type':'application/json','oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.invalid'},body:JSON.stringify({message,revision})
    }),env);
    const prompt='  Explain bond duration.  ',topic='active-bond';
    for(const [who,subject] of [[owner,topic],[owner,'studio'],[other,topic]])assert.equal((await save(who,subject,prompt,0)).status,200);
    const send={...body(topic,prompt,0),draftRevision:1};
    assert.equal((await run({...send,draftRevision:-1},owner)).status,400);
    assert.equal((await run(send,owner)).status,200);
    assert.equal((await read(owner,topic)).message,'');
    assert.equal((await read(owner,topic)).revision,2);
    assert.equal((await read(owner,'studio')).message,prompt);
    assert.equal((await read(other,topic)).message,prompt);
    assert.equal((await save(owner,topic,prompt,1)).status,409);
    assert.equal((await save(owner,topic,prompt,2)).status,200);
    assert.equal((await run(send,owner)).status,200);
    assert.equal((await read(owner,topic)).revision,3);
    const originalFetch=globalThis.fetch;
    const started=Promise.withResolvers(),finish=Promise.withResolvers();
    globalThis.fetch=async(...args)=>{started.resolve();await finish.promise;return originalFetch(...args);};
    try {
      const waiting=run({...body(topic,prompt,1),draftRevision:3},owner);
      await started.promise;
      assert.equal((await save(owner,topic,'Another tab wrote this.',3)).status,200);
      assert.equal((await save(owner,topic,prompt,4)).status,200);
      finish.resolve();
      assert.equal((await waiting).status,200);
    }finally{finish.resolve();globalThis.fetch=originalFetch;}
    assert.equal((await read(owner,topic)).revision,5);
    assert.equal((await read(owner,topic)).message,prompt);
    const mismatch={...body(topic,'Different content',2),draftRevision:5};
    assert.equal((await run(mismatch,owner)).status,200);
    assert.equal((await read(owner,topic)).message,prompt);
    const stale={...body(topic,prompt,2),draftRevision:5};
    assert.equal((await run(stale,owner)).status,409);
    assert.equal((await read(owner,topic)).revision,5);
    globalThis.fetch=async()=>Response.json({error:'fixture upstream failure'},{status:503});
    try{
      const failed={...body(topic,prompt,3),draftRevision:5};
      assert.equal((await run(failed,owner)).status,503);
      assert.equal((await read(owner,topic)).message,prompt);
      assert.equal((await read(owner,topic)).revision,5);
    }finally{globalThis.fetch=originalFetch;}
  }
  for(let i=0;i<20;i++)sqlite.prepare("INSERT INTO calls(owner,request_id,topic,fingerprint,started,status) VALUES('second',?,'studio','fixture',?,'done')").run(String(i),Date.now());
  assert.equal((await run(body('studio','Research equities',0),'second')).status,429);
  if(!live){
    const enter=async headers=>request('/api/session',{headers});
    const getCookie=r=>r.headers.get('Set-Cookie').split(';')[0];
    const headersA={Cookie:getCookie(await enter({}))},headersB={Cookie:getCookie(await enter({}))};
    const firstGuest=await request('/api/thread?topic=studio',{headers:headersA});assert.equal((await firstGuest.json()).revision,0);
    const guestOrder=body('studio','A five year balanced paper fund for cash flow. Use sensible defaults.',0);
    const guestResult=await (await request('/api/chat',{body:guestOrder,headers:headersA})).json();
    assert.equal(guestResult.value.phase,'ready');
    const sameCookie=await (await request('/api/thread?topic=studio',{headers:headersA})).json();
    const otherCookie=await (await request('/api/thread?topic=studio',{headers:headersB})).json();
    assert.equal(sameCookie.revision,1);assert.equal(otherCookie.revision,0);
    // Simulated native identity input is used ONLY by the local D1 fixture. The deployment trusts Sites dispatch.
    const adoption=await request('/api/session',{owner:'claim-fixture-A',headers:headersA});
    assert.match(adoption.headers.get('Set-Cookie'),/Max-Age=0/);
    const restored=await (await request('/api/thread?topic=studio',{owner:'claim-fixture-A'})).json();assert.equal(restored.revision,1);assert.equal(restored.value.draft.name,guestResult.value.draft.name);
    const archive=await (await request('/api/history',{owner:'claim-fixture-A'})).json();assert.ok(archive.workspaces.length===2);assert.ok(archive.active.startsWith('guest/'));
    const denied=await (await request('/api/thread?topic=studio',{owner:'claim-fixture-B',headers:headersA})).json();assert.equal(denied.revision,0);
    assert.equal((await request('/api/history/select',{owner:'claim-fixture-B',body:{id:archive.active}})).status,404);
    const released=await (await request('/api/thread?topic=studio',{headers:headersA})).json();assert.equal(released.revision,0);
    const expiredId=headersB.Cookie.split('=')[1],expiredHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(expiredId))),b=>b.toString(16).padStart(2,'0')).join('');
    sqlite.prepare('UPDATE visitor_spaces SET expires=0 WHERE token_hash=?').run(expiredHash);
    const renewed=await enter(headersB);assert.notEqual(getCookie(renewed),headersB.Cookie);
    const sampleUrl=origin+'/api/example/studio?lang=zh-CN',requestFixed=()=>worker.fetch(new Request(sampleUrl,{method:'POST',headers:{Origin:origin}}),env);
    const before=sqlite.prepare('SELECT COUNT(*) AS n FROM calls').get().n;
    const metadata=await (await worker.fetch(new Request(sampleUrl),env)).json();assert.equal(metadata.mode,'available');
    const unexpected=await worker.fetch(new Request(sampleUrl,{method:'POST',headers:{Origin:origin},body:'fund anything'}),env);assert.equal(unexpected.status,400);
    const wrongOrigin=await worker.fetch(new Request(sampleUrl,{method:'POST',headers:{Origin:'https://another.example'}}),env);assert.equal(wrongOrigin.status,403);
    const parallel=await Promise.all([requestFixed(),requestFixed()]);const modes=await Promise.all(parallel.map(async r=>(await r.json()).mode));
    assert.ok(modes.includes('live'));assert.ok(modes.includes('pending') || modes.includes('cached'));
    const cached=await (await requestFixed()).json();assert.equal(cached.mode,'cached');assert.ok(cached.responseId);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM public_examples').get().n,1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM calls').get().n,before);
    for(let i=0;i<3;i++)sqlite.prepare("INSERT INTO public_examples(id,sample,language,started,status) VALUES(?,'research','en-US',?,'failed')").run('quota-'+i,Date.now());
    const capped=await worker.fetch(new Request(origin+'/api/example/research?lang=zh-CN',{method:'POST',headers:{Origin:origin}}),env);assert.equal(capped.status,429);
    // Dedicated monthly budget covers ordinary chats and examples, including
    // tasks with unknown outcomes. Completed retries cost no additional task.
    sqlite.exec('DELETE FROM calls; DELETE FROM public_examples');
    const now=Date.now(),day=86_400_000;
    const insertExample=sqlite.prepare("INSERT INTO public_examples(id,sample,language,started,status) VALUES(?,'research','en-US',?,'failed')");
    insertExample.run('previous-month',now-31*day);
    insertExample.run('earlier-this-month',now-29*day);
    env.FUNDROOM_MODEL_30D_LIMIT='2';
    const lastSlot=body('active-bond','Explain duration risk',0);
    assert.equal((await run(lastSlot,'monthly-first')).status,200);
    assert.equal((await run(lastSlot,'monthly-first')).status,200);
    assert.equal((await run(body('studio','I want a paper fund',0),'monthly-next')).status,429);
    assert.equal((await requestFixed()).status,429);
    env.FUNDROOM_MODEL_30D_LIMIT='0';
    const paused=await (await request('/api/session',{owner:'paused'})).json();
    assert.equal(paused.agentReady,false);
    assert.equal(paused.managerAvailability.reason,'operator-paused');
    assert.equal((await (await requestFixed()).json()).mode,'recorded');
    assert.equal((await run(body('active-bond','Explain duration risk',0),'paused')).status,503);
    assert.equal((await run(lastSlot,'monthly-first')).status,200);
    delete env.FUNDROOM_MODEL_30D_LIMIT;
    sqlite.exec('DELETE FROM calls; DELETE FROM public_examples');
    const insertChat=sqlite.prepare("INSERT INTO calls(owner,request_id,topic,fingerprint,started,status,billable) VALUES(?,'test','studio','fixture',?,'busy',1)");
    for(let seat=0;seat<3;seat++)insertChat.run('active-'+seat,now);
    sqlite.prepare("INSERT INTO public_examples(id,sample,language,started,status) VALUES('active-example','research','en-US',?,'busy')").run(now);
    assert.equal((await run(body('active-bond','Explain duration',0),'later')).status,429);
    assert.equal((await requestFixed()).status,429);
    sqlite.prepare("UPDATE calls SET started=? WHERE owner='active-0'").run(now-151_000);
    assert.equal((await run(body('active-bond','Explain duration',0),'later')).status,200);
    sqlite.exec('DELETE FROM calls; DELETE FROM public_examples');
    const reachedFour=Promise.withResolvers(),completeTasks=Promise.withResolvers();
    const normalFetch=globalThis.fetch;
    let activeTasks=0;
    globalThis.fetch=async(...args)=>{
      activeTasks++;
      if(activeTasks===4)reachedFour.resolve();
      await completeTasks.promise;
      return normalFetch(...args);
    };
    try{
      const requests=Array.from({length:3},(_,i)=>run(body('active-bond','Explain duration',0),'concurrent-'+i));
      requests.push(requestFixed());
      await reachedFour.promise;
      assert.equal((await run(body('studio','I want a paper fund',0),'queued')).status,429);
      assert.equal(activeTasks,4);
      completeTasks.resolve();
      assert.deepEqual((await Promise.all(requests)).map(r=>r.status),[200,200,200,200]);
      assert.equal((await run(body('studio','I want a paper fund',0),'queued')).status,200);
    }finally{completeTasks.resolve();globalThis.fetch=normalFetch;}
  }
  console.log(JSON.stringify({runtime:live?'real HarnessRouter in local Worker+D1 interface':'fixture',catalog:list.length,studio:steps[0],fundResearch:steps[1],confirmedCashCents:1000000,orders:0,retryReused:true,foreignAccountBlank:true,quota:429,videoRange:206,...(!live?{sharedMonthlyLimit:true,globalConcurrentReservations:4,pausedNewTasks:true,expiredLeaseReleased:true}:{})}));
}finally{sqlite.close();}
