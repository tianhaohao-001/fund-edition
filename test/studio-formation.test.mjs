import test from 'node:test';
import assert from 'node:assert/strict';
import { designConversationTurn, newGuide, prepareTeamBlueprint } from '../core/conversation.mjs';
import { defersTeam, explicitTradePermissions, legacyDraftAdjustments, meaningfulIdea, pendingFormationPreview, requestedFundName, wantsTeamPreview } from '../web/studio-formation.mjs';
const turn=(guide,message,language='en-US')=>designConversationTurn({guide,message,language});
test('Maya names a fund during formation and keeps company names in the strategy', async () => {
  for (const [language, message, expected] of [
    ['zh-CN', '给这个基金起名为青山，然后研究现金流。', '青山'],
    ['zh-CN', '基金取名叫山岚并研究消费企业', '山岚'],
    ['zh-CN', '把这个基金改名为金橡树，跟踪一家名字叫晨星的公司。', '金橡树'],
    ['en-US', 'Name my fund Blue Sky and track a company called Morningstar.', 'Blue Sky'],
    ['en-US', 'Call it Juniper. Study retail margins.', 'Juniper'],
  ]) {
    const initial = prepareTeamBlueprint(newGuide(language), language);
    const named = await turn(initial, message, language);
    assert.equal(named.draft.name, expected);
    assert.equal(named.profile.name, expected);
    assert.equal(named.fundId, null);
    const company = language === 'zh-CN' ? '研究一家名字叫晨星的公司。' : 'Research a company called Morningstar.';
    const unchanged = await turn(named, company, language);
    assert.equal(unchanged.draft.name, expected);
    assert.equal((await turn(initial, company, language)).draft.name, initial.draft.name);
  }
});
test('Maya offers a real editable staffing plan from the first investment idea and respects a visitor who wants to explore',async()=>{
  let guide=newGuide('en-US');
  for(const message of ['hello','not sure yet']){guide=await turn(guide,message);assert.equal(guide.phase,'discovery');assert.ok(!guide.profile.goal);}
  guide=await turn(guide,'I want to study retail cash flows and margins.');
  assert.equal(guide.phase,'ready');assert.ok(guide.draft.roster.length>=3);
  const second=await turn(guide,'Compare debt and cash conversion.');
  assert.equal(second.phase,'ready');assert.ok(second.draft.roster.length>=3);
  assert.deepEqual(second.draft.permissions,{allowBuy:false,allowSell:false,allowedSymbols:[]});
  assert.equal(second.profile.horizon,undefined);assert.equal(second.profile.risk,undefined);
  const paused=await turn(guide,'Just exploring, do not hire anyone yet.');
  assert.equal(paused.phase,'discovery');
  assert.equal((await turn(paused,'Tell me more about retail earnings.')).phase,'discovery');
  const resumed=await turn(paused,'I want to build my own AI fund now.');
  assert.equal(resumed.phase,'ready');assert.ok(resumed.draft.id);assert.equal(resumed.fundId,null);
});
test('a returning visitor keeps explicit employees, names, position limit and trading restrictions when requesting a blueprint',async()=>{
  const guide=newGuide('en-US');const first=await turn(guide,'Name it Juniper. Research store margins. Cap at 7%. No buys. Allow sells.');
  first.profile.staffing=[{id:'seat-jess',name:'Jess',title:'Retail analyst',role:'research',duty:'Test store margins against inventory growth',desk:'research'}];
  const preview=prepareTeamBlueprint({...first,phase:'discovery',draft:null},'en-US');
  assert.equal(preview.draft.name,'Juniper');assert.equal(preview.draft.maxWeightPercent,7);assert.deepEqual(preview.draft.permissions,{allowBuy:false,allowSell:true,allowedSymbols:[]});
  assert.deepEqual(preview.draft.roster.map(seat=>seat.id),['maya-chen','seat-jess']);assert.equal(preview.draft.roster[1].duty,first.profile.staffing[0].duty);
  assert.equal(prepareTeamBlueprint(preview,'en-US').draft.id,preview.draft.id);assert.equal(preview.fundId,null);
  const unsafeLegacy={...preview,draft:{...preview.draft,name:'Juniper. Research store',permissions:{allowBuy:true,allowSell:true,allowedSymbols:[]},formationVersion:undefined}};
  assert.ok(legacyDraftAdjustments(unsafeLegacy).needsReview);
  const repaired=prepareTeamBlueprint(unsafeLegacy,'en-US');
  assert.equal(repaired.draft.name,'Juniper');assert.deepEqual(repaired.draft.permissions,preview.draft.permissions);assert.deepEqual(repaired.draft.roster,preview.draft.roster);
});
test('spoken Chinese and English preserve recruitment intent, consent and explicit deferral',()=>{
  assert.ok(wantsTeamPreview('我想现在建自己的基金。'));assert.ok(wantsTeamPreview('Show me my team.'));
  assert.ok(defersTeam('我只是聊聊，先不要招人'));assert.equal(wantsTeamPreview('Do not hire anyone yet'),false);
  assert.equal(meaningfulIdea('你好！'),false);assert.equal(requestedFundName('Name it Juniper, with Tess on risk.'),'Juniper');
  assert.deepEqual(explicitTradePermissions('禁止模拟买入，允许模拟卖出。'),{allowBuy:false,allowSell:true});
  assert.deepEqual(explicitTradePermissions('Do not allow buys. Research only.'),{allowBuy:false,allowSell:false});
});

test('saved pre-roster conversations restore once they contain an idea and respect other workflows',async()=>{
  const fresh=newGuide('zh-CN');
  assert.equal(pendingFormationPreview(fresh),false);
  const guide=await turn(fresh,'我想研究零售公司的经营现金流。','zh-CN');
  const legacy={...guide,phase:'discovery',draft:null};
  assert.equal(pendingFormationPreview(legacy),true);
  assert.equal(pendingFormationPreview(guide),false);
  assert.equal(pendingFormationPreview({...guide,draft:{...guide.draft,formationVersion:undefined}}),true);
  assert.equal(pendingFormationPreview({...legacy,profile:{...legacy.profile,formationPaused:true}}),false);
  assert.equal(pendingFormationPreview(legacy,{catalogId:'wellington'}),false);
  assert.equal(pendingFormationPreview({...guide,phase:'created'}),false);
});

test('only the founder can select a manager-only studio or clear a personalized roster', async()=>{
  const empty={env:{FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'fixture',HARNESSROUTER_HARNESS_ID:'chrn_fixture'},fetchImpl:async()=>Response.json({
    id:'resp_fixture',status:'completed',model:'fixture',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({answer:'A proposed paper team is ready.',profile:{},staffing:[]})}]}]})};
  const hired={id:'seat-iris',name:'Iris',title:'Risk researcher',role:'risk',desk:'risk',duty:'Check inventory turnover.'};
  for(const [language,goal,only,negation] of [
    ['zh-CN','我想找现金流持续增长的企业。','我只要 Maya，不要其他员工。','不要只让 Maya 来研究经营现金流。'],
    ['en-US','I want to find businesses with growing cash flow.','No other employees. Only Maya.','I want an independent risk review, not just Maya.']]){
    const next=(guide,message)=>designConversationTurn({guide,message,hosted:true,language},empty);
    const first=await next(newGuide(language),goal);assert.ok(first.draft.roster.length>=3);assert.equal(first.fundId,null);
    assert.ok((await next(newGuide(language),negation)).draft.roster.length>=3);
    const singleDuty=language==='zh-CN'?'只让 Maya 决定仓位，其他成员分析风险。':'Only Maya can approve sizing; the other staff will review risk.';
    assert.ok((await next(newGuide(language),singleDuty)).draft.roster.length>=3);
    const approvalOnly=language==='zh-CN'?'不需要其他员工审批交易，现有研究员继续研究现金流。':'Only Maya can authorize orders. No other staff may trade.';
    assert.ok((await next(newGuide(language),approvalOnly)).draft.roster.length>=3);
    if(language==='zh-CN'){
      assert.deepEqual((await next(first,'只要 Maya，一个人管理基金。')).draft.roster.map(s=>s.id),['maya-chen']);
      assert.ok((await next(first,'只让 Maya 管理基金，另设两人研究。')).draft.roster.length>=3);
    }
    const dont=language==='zh-CN'?'不要玛雅一个人管理这支基金，还得有人复核。':"I don’t want Maya alone.";
    assert.ok((await next(newGuide(language),dont)).draft.roster.length>=3);
    const named={...first,profile:{...first.profile,staffing:[hired]}};
    assert.deepEqual((await next(named,goal)).draft.roster.map(s=>s.id),['maya-chen','seat-iris']);
    const solo=await next(named,only);assert.deepEqual(solo.draft.roster.map(s=>s.id),['maya-chen']);assert.equal(solo.fundId,null);
    assert.deepEqual((await next(solo,goal)).draft.roster.map(s=>s.id),['maya-chen']);
    assert.deepEqual((await next(solo,negation)).draft.roster.map(s=>s.id),['maya-chen','seat-iris']);
    const noSolo=language==='zh-CN'?'不要让 Maya 一个人管理这支基金。':'I do not want a manager-only team.';
    assert.ok((await next(first,noSolo)).draft.roster.length>=3);
    const soloDefault=await next(first,only);assert.ok((await next(soloDefault,noSolo)).draft.roster.length>=3);
    const concept=language==='zh-CN'?'单人基金是什么意思？':'What is a manager-only team?';
    assert.deepEqual((await next(named,concept)).draft.roster.map(s=>s.id),['maya-chen','seat-iris']);
  }
});
