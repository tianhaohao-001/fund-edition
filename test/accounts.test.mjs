import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';
import { messagesForSeat } from '../web/seat-messages.mjs';

test('the model and seat window recover attributed legacy replies and exclude other or unattributed messages',()=>{
  const member={id:'seat-research',name:'Lin'};
  const history=[
    {role:'user',memberId:'seat-risk',recipient:'Lin',text:'another seat'},
    {role:'assistant',memberId:'seat-research',name:'old name',text:'stable ID'},
    {role:'user',recipient:'Lin',text:'legacy question'},
    {role:'assistant',name:'Lin',text:'legacy answer'},
    {role:'assistant',name:'Jay',text:'other legacy answer'},
    {role:'user',text:'unattributed'},
  ];
  assert.deepEqual(messagesForSeat(history,member).map(row=>row.text),['stable ID','legacy question','legacy answer']);
});

const profile = () => ({email:randomBytes(7).toString('hex')+'@example.test', password:randomBytes(18).toString('base64url')});

test('a founder staffs named seats, confirms a whole proposal once and revises one private assignment',async()=>{
  const people=[{name:'林',title:'会计研究',role:'research',duty:'核对现金流'},{name:'周',title:'风险控制',role:'risk',duty:'研究下行'}];
  const next=[{name:'沈',title:'执行核对',role:'trader',duty:'核对模拟报价'}];
  const inputs=[];
  const app=await start(':memory:',async(_url,request)=>{
    const input=JSON.parse(JSON.parse(request.body).input);inputs.push(input);
    const value=input.mode==='fund-design'?{answer:'请查看团队。',profile:{goal:'研究现金流',horizon:'五年',risk:'conservative',name:'远帆'},staffing:people}:
      input.mode==='staffing-proposal'?{answer:'请确认新席位。',hires:next}:
      input.mode==='team-assignment'?{answer:'请确认新职责。',title:'收盘核对',duty:'复核收盘报价'}:{answer:'这是这个席位的观察。'};
    return Response.json({id:'resp_seat',model:'fixture',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
  });
  try{
    const {cookie}=await app.state();
    const act=async(body)=>{const r=await app.action(cookie,body);assert.equal(r.status,200,JSON.stringify(r.value).slice(0,250));return r.value;};
    const design=await act({action:'designConversation',requestId:'de-1',message:'我要林看财报、周来管风险，长期稳健。',provider:'harnessrouter'});
    const founded=await act({action:'confirmFundDraft',requestId:'de-2',draftId:design.guide.draft.id});
    const fundId=founded.createdFundId, fund=v=>v.funds.find(f=>f.id===fundId);
    assert.deepEqual(fund(founded).team.map(s=>s.name),['Maya Chen','林','周']);
    const chat=(memberId,message,requestId)=>act({action:'sendChat',fundId,requestId,memberId,message,provider:'harnessrouter'});
    const offer=fund(await chat('maya-chen','我想要一位交易员','hire-seats')).hiringDraft;
    const confirm={action:'confirmHire',fundId,draftId:offer.id,requestId:'confirm-new-seat'};
    assert.equal(fund(await act(confirm)).team.length,4);assert.equal(fund(await act(confirm)).team.length,4);
    const seat=offer.hires[0];
    const plan=fund(await chat(seat.id,'以后你负责收盘核验','change-duty')).team.find(s=>s.id===seat.id);
    assert.equal(plan.duty,'核对模拟报价');
    await act({action:'confirmAssignment',requestId:'save-duty',fundId,memberId:seat.id,draftId:plan.assignmentDraft.id});
    const cash=fund(founded).portfolio.cash;
    let updated=fund(await chat(seat.id,'这里的证据是什么？','read-bond'));
    assert.equal(updated.team.find(s=>s.id===seat.id).duty,'复核收盘报价');assert.equal(updated.portfolio.cash,cash);assert.equal(updated.runs.length,0);
    await chat(updated.team[1].id,'我之前问过你什么？','read-equity');
    assert.equal(inputs.at(-1).conversation.length,0);
    const solo=await act({action:'prepareSoloStudio',requestId:'solo-fresh'});
    assert.equal(solo.guide.draft.roster.length,1);assert.equal(solo.guide.draft.permissions.allowBuy,false);
  }finally{await app.close();}
});

async function start(dbPath = ':memory:', model) {
  const env = {FUNDROOM_DB_PATH:dbPath, FUNDROOM_BROKER_DB_PATH:':memory:', FUNDROOM_ENABLE_LOCAL_VOICE:'false'};
  if (model) Object.assign(env,{FUNDROOM_ENABLE_HARNESS:'true', HARNESSROUTER_API_KEY:'local-fixture-only',HARNESSROUTER_HARNESS_ID:'chrn_local_fixture'});
  const {server,host}=await createApp({env,fetchImpl: model ?? (() => assert.fail('Unexpected external request'))});
  server.listen(0,host); await once(server,'listening');
  const base='http://'+host+':'+server.address().port;
  async function request(path,{body,cookie,origin=base}={}) {
    const headers = {...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})};
    if(origin) headers.Origin=origin;
    const response=await fetch(base+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
    return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0],value:await response.json()};
  }
  return {request, state:cookie=>request('/api/state',{cookie}),
    auth:(action,body,cookie,origin)=>request('/api/auth/'+action,{body,cookie,origin}),
    action:(cookie,body)=>request('/api/action',{body,cookie}), close:()=>new Promise(resolve=>server.close(resolve))};
}

test('register adopts only the guest book, rotates the session, restores it on another browser and preserves receipts after restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'morrow-auth-'));
  const dbPath=join(directory,'work.sqlite');
  const user=profile();
  let app=await start(dbPath);
  try {
    const guest=await app.state();
    const old=guest.cookie;
    const buy={action:'catalogBuy',catalogId:'contrafund',requestId:'before-registration',amount:234};
    const acquired=await app.action(old,buy);
    assert.equal(acquired.status,200);
    const register=await app.auth('register',{...user,email:user.email.toUpperCase()},old);
    assert.equal(register.status,200);
    assert.notEqual(register.cookie,old);
    assert.equal(register.value.user.email,user.email);
    assert.deepEqual(Object.keys(register.value.user).sort(),['email','id']);
    assert.deepEqual((await app.action(register.cookie,buy)).value.catalogAccounts,acquired.value.catalogAccounts);
    assert.equal((await app.action(old,buy)).status,401);
    assert.deepEqual((await app.state(old)).value.catalogAccounts,{});
    assert.equal((await app.auth('session',undefined,register.cookie)).value.user.id,register.value.user.id);
    const second=await app.auth('login',user);
    assert.equal(second.status,200);
    assert.notEqual(second.cookie,register.cookie);
    const otherGuest=await app.state();
    const stranger=await app.auth('register',profile(),otherGuest.cookie);
    assert.deepEqual((await app.state(stranger.cookie)).value.catalogAccounts,{});
    const signout=await app.auth('logout',{},register.cookie);
    assert.equal(signout.status,200);
    assert.equal((await app.auth('session',undefined,register.cookie)).value.user,null);
    assert.deepEqual((await app.state(register.cookie)).value.catalogAccounts,{});
    assert.deepEqual((await app.state(second.cookie)).value.catalogAccounts,acquired.value.catalogAccounts);
    await app.close();app=null;
    const db=new DatabaseSync(dbPath,{readOnly:true});
    const row=db.prepare('SELECT password_hash,salt,workspace_id FROM workspace_users WHERE email=?').get(user.email);
    assert.equal(row.password_hash.length,32);assert.equal(row.salt.length,16);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workspace_logins WHERE digest=?').get(second.cookie.split('=')[1]).n,0);
    db.close();
    app=await start(dbPath);
    assert.deepEqual((await app.state(second.cookie)).value.catalogAccounts,acquired.value.catalogAccounts);
    assert.deepEqual((await app.state('fundroom_session_v1='+row.workspace_id)).value.catalogAccounts,{});
    assert.deepEqual((await app.action(second.cookie,buy)).value.catalogAccounts,acquired.value.catalogAccounts);
  } finally {
    if(app) await app.close();
    for(const name of await readdir(directory)) await unlink(join(directory,name));
    await rmdir(directory);
  }
});

test('a signed-in studio owner can restore and ask about the same receipt without mutating the ledger or crossing workspaces',async()=>{
  const prompts=[];
  const app=await start(':memory:',async(_url, request)=>{
    prompts.push(JSON.parse(JSON.parse(request.body).input));
    return Response.json({id:'resp_owner_fixture',model:'local-fixture',status:'completed',
      output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({answer:'Recorded paper fill.'})}]}]});
  });
  try {
    const user=profile(), account=await app.auth('register',user);
    const opened=await app.action(account.cookie,{action:'createFund',name:'Brook',requestId:'studio-open',mandate:'Study growth.'});
    const fundId=opened.value.selectedFundId;
    const reviewed=await app.action(account.cookie,{action:'runScenario',fundId,scenarioId:'innovation-signal',provider:'replay',requestId:'studio-run'});
    const original=reviewed.value.fund;
    const restored=await app.auth('login',user);
    const path='/api/studio-review?fund='+fundId;
    const close=await app.request(path,{cookie:restored.cookie});
    assert.equal(close.status,200);
    assert.equal(close.value.changeCents,null);
    assert.ok(['waiting-first-close','calendar-unavailable'].includes(close.value.status));
    const runId=original.runs[0].id;
    const ask={action:'sendChat',fundId,runId,studioReview:true,provider:'harnessrouter',memberId:'maya-chen',message:'Why?',requestId:'studio-ask'};
    const other=await app.auth('register',profile());
    assert.equal((await app.request(path,{cookie:other.cookie})).status,404);
    assert.equal((await app.action(other.cookie,ask)).status,404);
    const answer=await app.action(restored.cookie,ask);
    assert.equal(answer.status,200);
    assert.equal(answer.value.fund.chat.at(-1).runId,runId);
    assert.deepEqual(prompts.at(-1).closeObservation,close.value);
    assert.equal(prompts.at(-1).recordedExecution.execution.quantity,original.runs[0].execution.quantity);
    assert.deepEqual(answer.value.fund.portfolio,original.portfolio);
    assert.deepEqual(answer.value.fund.runs,original.runs);
    assert.deepEqual((await app.action(restored.cookie,ask)).value.fund.chat,answer.value.fund.chat);
    assert.equal(prompts.length,1);
  } finally {await app.close();}
});

test('account changes require same-origin JSON; invalid logins have uniform errors and bounded attempts',async()=>{
  const app=await start(), user=profile();
  try {
    assert.equal((await app.auth('register',user,null,'https://example.invalid')).status,403);
    assert.equal((await app.auth('register',user,null,null)).status,403);
    assert.equal((await app.auth('register',{...user,password:'short'})).status,400);
    const registered=await app.auth('register',user);
    assert.equal(registered.status,200);
    const invalid={...user,password:profile().password};
    const failed=await app.auth('login',invalid);
    const unknown=await app.auth('login',{...invalid,email:profile().email});
    assert.equal(failed.status,401);assert.deepEqual(failed.value,unknown.value);
    for(let i=0;i<9;i++) assert.equal((await app.auth('login',invalid)).status,401);
    assert.equal((await app.auth('login',invalid)).status,429);
    assert.equal((await app.auth('logout',{},registered.cookie,'https://example.invalid')).status,403);
    assert.ok((await app.auth('session',undefined,registered.cookie)).value.user);
  } finally {await app.close();}
});

test('research proposals require confirmation before opening historical sleeves; receipts, explanations and hiring stay in the owner’s fund',async()=>{
  const inputs=[];
  const app=await start(':memory:',async(_url,request)=>{
    const sent=JSON.parse(request.body), input=JSON.parse(sent.input);
    inputs.push(input);
    const answer = input.mode==='lobby-concierge' ? {answer:'先提议研究 VWELX，再由你确认。',route:'lab',fundAction:'history'} :
      input.mode==='staffing-proposal'?{answer:'请确认聘用。',candidateId:'avery-khan',duty:'检查集中度'} :
      {answer:'这次模拟建仓使用归一化总回报单位。'};
    return Response.json({id:'resp_fixture',model:'local-fixture',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(answer)}]}]});
  });
  try {
    const initial=await app.state(), cookie=initial.cookie;
    const guide=await app.action(cookie,{action:'concierge',message:'请帮我复刻 VWELX',requestId:'conc-1'});
    assert.equal(guide.status,200);assert.equal(guide.value.funds.length,1);
    const draft=guide.value.researchDraft;
    assert.equal(draft.catalogId,'wellington');
    assert.equal(guide.value.lobbyGuide.route,'lab');
    const confirm={action:'confirmResearch',requestId:'confirm-1',draftId:draft.id,createFund:true};
    const other=await app.state();
    assert.equal((await app.action(other.cookie,confirm)).status,409);
    const confirmed=await app.action(cookie,confirm);
    assert.equal(confirmed.status,200);
    const {fund,run}=confirmed.value;
    assert.equal(fund.replica.asOf,'2020-12-31');
    assert.deepEqual(run.execution.legs.map(l=>l.symbol).sort(),['VCIT','VYM']);
    assert.equal(run.execution.fee,5);
    assert.equal(run.portfolio.cash,0);
    assert.equal(run.portfolio.equity,9995);
    assert.deepEqual((await app.action(cookie,confirm)).value.run,run);
    const chat={action:'sendChat',fundId:fund.id,memberId:'maya-chen',message:'为什么这样买？',runId:run.id,requestId:'why-1'};
    const reply=await app.action(cookie,chat);
    assert.equal(reply.status,200);assert.equal(inputs.at(-1).recordedExecution.execution.legs.length,2);
    assert.deepEqual(reply.value.fund.portfolio,run.portfolio);
    assert.equal((await app.action(cookie,chat)).value.fund.chat.length,2);
    assert.equal((await app.action(cookie,{...chat,runId:'missing',requestId:'why-2'})).status,404);
    const step={action:'runScenario',fundId:fund.id,requestId:'next-1'};
    const advanced=await app.action(cookie,step);
    assert.equal(advanced.status,200);assert.equal(advanced.value.fund.replica.asOf,'2021-03-31');
    assert.ok(advanced.value.fund.portfolio.cashCents>=0);
    assert.equal((await app.action(cookie,step)).value.fund.runs.length,2);
    await app.action(cookie,{action:'updateFund',fundId:fund.id,mandate:'不要交易。'});
    const blocked=await app.action(cookie,{action:'runScenario',fundId:fund.id,requestId:'next-2'});
    assert.equal(blocked.value.run.execution.status,'blocked');
    assert.deepEqual(blocked.value.run.execution.legs,[]);
    const hire=await app.action(cookie,{action:'sendChat',fundId:fund.id,memberId:'maya-chen',message:'招一个风控专员，控制集中度',requestId:'staff-1'});
    assert.equal(hire.status,200);
    const hiring=hire.value.fund.hiringDraft;
    assert.equal(hire.value.fund.team.some(m=>m.id===hiring.candidateId),false);
    const admit={action:'confirmHire',fundId:fund.id,draftId:hiring.id,requestId:'hire'};
    const joined=await app.action(cookie,admit);
    assert.equal(joined.status,200);
    assert.equal(joined.value.fund.team.find(m=>m.id===hiring.candidateId).duty,'检查集中度');
    assert.deepEqual((await app.action(cookie,admit)).value.fund.team,joined.value.fund.team);
  } finally {await app.close();}
});


test('concierge distinguishes browsing, forward operation and a historical draft without placing orders', async () => {
  const questions = [
    ['带我看看惠灵顿基金','details'], ['不做回测。让这支团队决定下一期怎么配置。','forward'],
    ['Please backtest VWELX over its historical sample.','history'],
  ];
  const app = await start(':memory:', async(_url, req) => {
    const input = JSON.parse(JSON.parse(req.body).input);
    assert.equal(input.recognizedFund.ticker, 'VWELX');
    const idx = questions.findIndex(([q]) => q === input.question);
    assert.equal(input.recognizedFund.mentioned, idx === 1 ? 'previous turn' : 'this message');
    return Response.json({id:'resp_navigation_'+idx,model:'fixture',status:'completed',output:[{type:'message',role:'assistant',
      content:[{type:'output_text',text:JSON.stringify({answer:'See this fund.',route:'lab',fundAction:questions[idx][1]})}]}]});
  });
  try {
    const initial = await app.state();
    for (const [message, fundAction] of questions) {
      const reply = await app.action(initial.cookie,{action:'concierge',message,requestId:'route-'+fundAction});
      assert.equal(reply.status,200);
      assert.equal(reply.value.lobbyGuide.fundAction,fundAction);
      assert.equal(reply.value.lobbyGuide.catalogId,'wellington');
      assert.equal(Boolean(reply.value.researchDraft),fundAction==='history');
      assert.deepEqual(reply.value.funds,initial.value.funds);
      assert.deepEqual(reply.value.researchStudies,initial.value.researchStudies);
    }
  } finally { await app.close(); }
});

test('sign-out while a manager is answering prevents the late reply from entering the book',async()=>{
  let notify,release;
  const entered=new Promise(r=>{notify=r;});
  const resumed=new Promise(r=>{release=r;});
  const app=await start(':memory:',async()=>{
    notify();await resumed;
    return Response.json({id:'resp_delayed',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"answer":"Delayed feedback"}'}]}]});
  });
  try {
    const u=profile(), first=await app.auth('register',u);
    const restored=await app.auth('login',u);
    const {value}=await app.state(first.cookie);
    const pending=app.action(first.cookie,{action:'sendChat',fundId:value.fund.id,memberId:'maya-chen',requestId:'delayed-chat',message:'Explain the last review'});
    await entered;
    await app.auth('logout',{},first.cookie);
    release();
    assert.equal((await pending).status,401);
    assert.equal((await app.state(restored.cookie)).value.fund.chat.length,0);
  } finally {release();await app.close();}
});

test('two live research assignments expose owner-only progress and actual handoffs; partial or total failure never changes cash',async()=>{
  let entered,release,failRisk=false,failAll=false;
  const pending=new Promise(r=>entered=r), gate=new Promise(r=>release=r);
  const inputs=[];
  const app=await start(':memory:',async(_url,request)=>{
    const input=JSON.parse(JSON.parse(request.body).input);
    inputs.push(input);
    if(input.role==='research') {entered();await gate;}
    if(failAll || (failRisk && input.role==='risk')) return Response.json({},{status:503});
    const reply={text:input.role+' cites the common held-out sample.',evidenceRefs:['holdout']};
    return Response.json({id:'resp_'+input.role,status:'completed',model:'test-fixture',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(reply)}]}]});
  });
  try {
    const owner=await app.state(), other=await app.state();
    const draft=await app.action(owner.cookie,{action:'prepareResearch',catalogId:'wellington',message:'VWELX',requestId:'create-study'});
    const setup=await app.action(owner.cookie,{action:'confirmResearch',draftId:draft.value.researchDraft.id,requestId:'confirm-study',createFund:true});
    const body={action:'reviewResearch',catalogId:'wellington',language:'en-US',requestId:'real-work'};
    const live=app.action(owner.cookie,body);
    await pending;
    const timeline=async(cookie,id=body.requestId)=>(await app.request('/api/team/activity?requestId='+id,{cookie})).value.activity;
    assert.equal((await timeline(owner.cookie)).status,'running');
    assert.equal(await timeline(other.cookie),null);
    release();
    const result=await live;
    const review=result.value.researchReviews.wellington;
    assert.equal(review.status,'complete');
    assert.equal(review.seats.length,3);
    assert.ok(review.seats.every(s=>s.responseId));
    const handoffs=review.activity.events.filter(e=>e.stage==='handoff');
    assert.deepEqual(handoffs.map(e=>e.actor).sort(),['research','risk']);
    assert.deepEqual(inputs.at(-1).specialistOpinions.map(s=>s.text),handoffs.map(e=>e.text));
    assert.deepEqual(result.value.fund.portfolio,setup.value.fund.portfolio);
    assert.deepEqual(result.value.researchStudies,setup.value.researchStudies);
    assert.equal((await timeline(owner.cookie)).status,'complete');
    await app.action(owner.cookie,body);assert.equal(inputs.length,3);
    failRisk=true;
    const partial=await app.action(owner.cookie,{...body,requestId:'partial'});
    assert.equal(partial.value.researchReviews.wellington.status,'partial');
    assert.deepEqual(partial.value.researchReviews.wellington.seats.map(s=>s.status),['complete','failed','complete']);
    assert.equal((await timeline(owner.cookie,'partial')).status,'partial');
    failRisk=false;
    const count=inputs.length;
    const retried=await app.action(owner.cookie,{...body,requestId:'retry-partial',retry:true});
    assert.equal(retried.value.researchReviews.wellington.status,'complete');
    assert.equal(retried.value.researchReviews.wellington.seats[0].reused,true);
    assert.equal(inputs.length-count,2);
    failAll=true;
    const failed=await app.action(owner.cookie,{...body,requestId:'all-failed'});
    assert.deepEqual(failed.value.researchReviews.wellington.seats.map(s=>s.status),['failed','failed','skipped']);
    assert.equal((await timeline(owner.cookie,'all-failed')).status,'failed');
    assert.deepEqual(failed.value.fund.portfolio,setup.value.fund.portfolio);
  } finally {release();await app.close();}
});
