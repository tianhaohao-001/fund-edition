import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {newGuide,prepareTeamBlueprint,designConversationTurn} from '../core/conversation.mjs';
import {renderFund} from '../web/views.mjs';
import {spokenDraftChange} from '../web/formation-recruiting.mjs';

test('a founder can add, replace, and remove proposed hires, keep the mandate, and talk to the six saved seats',async()=>{
  const path=join(await mkdtemp(join(tmpdir(),'fund-edition-formation-')),'qa.sqlite');
  const env={FUNDROOM_DB_PATH:path,FUNDROOM_BROKER_DB_PATH:':memory:'};
  const first=await createApp({env});
  let server=first.server;
  async function listen(){server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;}
  let base=await listen();
  const guest=await fetch(base+'/api/state'),cookie=guest.headers.get('set-cookie').split(';')[0];
  async function perform(action,body={},requestId=randomUUID()){
    const res=await fetch(base+'/api/action',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action,requestId,language:'zh-CN',...body})});
    return {status:res.status,data:await res.json()};
  }
  async function good(action,body,id){const res=await perform(action,body,id);assert.equal(res.status,200,JSON.stringify(res.data.error));return res.data;}
  try{
    const first=await good('prepareTeamStudio');
    assert.equal(first.guide.draft.roster.length,3);
    const original=first.guide.draft, defaults=original.roster.map(p=>p.id);
    const beforeFunds=first.funds.length;
    const spoken=await good('designConversation',{message:'再加两个人，一个看宏观，一个看债券',provider:'replay'});
    let draft=spoken.guide.draft;
    assert.deepEqual(draft.roster.map(p=>p.id),[...defaults,'nora-bell','owen-reed']);
    assert.equal(draft.mandate,original.mandate);assert.deepEqual(draft.permissions,original.permissions);
    assert.equal((await perform('confirmFundDraft',{draftId:original.id})).status,409);
    const retry=randomUUID(), add={draftId:draft.id,operation:'add',candidateId:'leah-kim'};
    const six=await good('adjustDraftRoster',add,retry);
    assert.deepEqual((await good('adjustDraftRoster',add,retry)).guide.draft,six.guide.draft);
    assert.equal((await perform('adjustDraftRoster',{...add,candidateId:'eli-morgan'},retry)).status,409);
    draft=(await good('adjustDraftRoster',{operation:'replace',memberId:'leah-kim',candidateId:'eli-morgan',draftId:six.guide.draft.id})).guide.draft;
    assert.equal(draft.roster.length,6);
    assert.equal((await perform('adjustDraftRoster',{operation:'remove',memberId:'maya-chen',draftId:draft.id})).status,409);
    draft=(await good('adjustDraftRoster',{operation:'remove',memberId:'eli-morgan',draftId:draft.id})).guide.draft;
    assert.equal(draft.roster.length,5);
    draft=(await good('designConversation',{message:'再招一位量化分析师，负责检查仓位漂移',provider:'replay'})).guide.draft;
    assert.equal(draft.roster.find(p=>p.id==='leah-kim').duty,'检查仓位漂移');
    await new Promise(done=>server.close(done));server=(await createApp({env})).server;base=await listen();
    const fresh=await (await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();
    assert.deepEqual(fresh.guide.draft,draft);assert.equal(fresh.funds.length,beforeFunds);
    const done=await good('confirmFundDraft',{draftId:draft.id});
    const fund=done.funds.find(f=>f.id===done.createdFundId);assert.equal(fund.team.length,6);
    for(const member of fund.team){
      assert.notEqual(member.desk,'bench');
      const result=await good('sendChat',{fundId:fund.id,memberId:member.id,provider:'replay',message:'请介绍你的职责。'});
      const last=result.funds.find(f=>f.id===fund.id).chat.at(-1);
      assert.equal(last.memberId,member.id);assert.equal(last.name,member.name);
    }
  }finally{if(server.listening)await new Promise(done=>server.close(done));}
});

test('an open-ended request for more specialists preserves every existing seat in either language',async()=>{
  for(const [language,message] of [['zh-CN','再多招两名，你推荐岗位'],['en-US','Add two more specialists. You choose the roles.']]){
    const guide=prepareTeamBlueprint(newGuide(language),language);
    const next=await designConversationTurn({guide,message,language});
    assert.equal(next.draft.roster.length,5);
    assert.deepEqual(next.draft.roster.slice(0,3),guide.draft.roster);
    assert.equal(new Set(next.draft.roster.map(s=>s.id)).size,5);
  }
});

test('recruiting leaves both the displayed investment idea and mandate intact and links to the recruiting desk above the roster',async()=>{
  const goal='研究现金流改善的公司。';
  const guide=await designConversationTurn({guide:newGuide('zh-CN'),message:goal,language:'zh-CN'});
  const hiring='再加两个人，一个看宏观，一个看债券。保留原来的团队。';
  for(const start of [guide,prepareTeamBlueprint(newGuide('zh-CN'),'zh-CN')]){
    const updated=await designConversationTurn({guide:start,message:hiring,language:'zh-CN'});
    assert.equal(updated.draft.mandate,start.draft.mandate);
    const html=renderFund({state:{guide:updated,studioFormationVersion:3,studioTeamCapacity:24},guide:updated,onboarding:true});
    const idea=html.match(/<blockquote>[\s\S]*?<\/blockquote>/u)[0];
    assert.ok(idea.includes(start.profile.goal));assert.ok(!idea.includes(hiring));
    assert.ok(html.indexOf('data-action="open-draft-market"')<html.indexOf('class="formation-all-seats"'));
  }
});

test('explicitly named founders’ hires reach the customized staffing workflow without losing the existing team',async()=>{
  const guide=prepareTeamBlueprint(newGuide('zh-CN'),'zh-CN');
  for(const message of ['再招两个人，林雨负责研究消费电子，陈海负责查财报','Add two specialists, Maya Wu on SEC filings and Aria Li on industry surveys.']){
    assert.equal(spokenDraftChange(message,guide.draft.roster),null);
  }
  const staffing=[{name:'林雨',role:'research',title:'消费电子研究员',duty:'研究消费电子'},{name:'陈海',role:'research',title:'财报研究员',duty:'查财报'}];
  const runtime={env:{FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'fixture',HARNESSROUTER_HARNESS_ID:'chrn_fixture'},fetchImpl:async()=>Response.json({
    id:'resp_fixture',status:'completed',model:'fixture',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({answer:'两位候选人的职责已写入蓝图。',profile:{},staffing})}]}]})};
  const next=await designConversationTurn({guide,message:'再招两个人，林雨负责研究消费电子，陈海负责查财报',language:'zh-CN',hosted:true},runtime);
  assert.deepEqual(next.draft.roster.map(p=>p.id).slice(0,3),guide.draft.roster.map(p=>p.id));
  assert.deepEqual(next.draft.roster.slice(3).map(p=>[p.name,p.duty]),staffing.map(p=>[p.name,p.duty]));
});

test('changing investment style preserves all three names and duties on explicit request; unlocked recommendations may adapt',async()=>{
  const fixture={env:{FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'fixture',HARNESSROUTER_HARNESS_ID:'chrn_fixture'},fetchImpl:async()=>Response.json({
    id:'resp_fixture',status:'completed',model:'fixture',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({answer:'The strategy is ready for review.',profile:{},staffing:[{name:'Replacement',role:'risk',title:'Risk',duty:'Review downside.'}]})}]}]})};
  for(const [language,goal,keep] of [
    ['zh-CN','研究现金流改善的企业','保留当前三人的原名单和职责，同时把投资策略设为研究现金流改善的企业。'],
    ['zh-CN','研究现金流改善的公司','我的投资策略是研究现金流改善的公司，持有三到五年，偏稳健。保留当前三人的原名单和职责，先研究，不交易。'],
    ['en-US','research businesses with improving cash flows','Keep the original team and their duties. Change the investment strategy to research businesses with improving cash flows.'],
  ]){
    const guide=prepareTeamBlueprint(newGuide(language),language);
    for(const hosted of [false,true]){
      const revised=await designConversationTurn({guide,message:keep,language,hosted},fixture);
      assert.equal(revised.draft.templateId,'value');assert.deepEqual(revised.draft.roster,guide.draft.roster);
      assert.ok(revised.draft.mandate.includes(goal));assert.equal(revised.profile.goal,goal);
      const later=await designConversationTurn({guide:revised,message:'再加两个人，一个看宏观，一个看债券',language:'zh-CN'});
      assert.deepEqual(later.draft.roster.slice(0,3),guide.draft.roster);
      assert.deepEqual(later.draft.permissions,guide.draft.permissions);
    }
    const unlocked=await designConversationTurn({guide,message:goal,language});
    assert.equal(unlocked.draft.templateId,'value');assert.notDeepEqual(unlocked.draft.roster,guide.draft.roster);
  }
});
