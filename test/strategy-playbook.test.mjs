import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, findCatalog } from '../web/catalog-data.mjs';
import { runReplicaStudy } from '../web/catalog-replica.mjs';
import { strategyMandate, researchBrief, evaluatePlaybook } from '../web/strategy-playbook.mjs';
import { planResearchReview, reviewHistoricalResearch } from '../core/historical-review.mjs';
import { renderCatalog } from '../web/catalog-view.mjs';

test('both languages map every fund to a sourced mandate, role-specific assignments and an independent universe',()=>{
  const market=CATALOG.filter(c=>c.section==='market');
  assert.equal(market.length,9);
  assert.equal(CATALOG.length-market.length,5);
  for(const item of CATALOG) {
    const en=strategyMandate(item.id,'en-US'), ch=strategyMandate(item.id,'zh-CN');
    assert.equal(en.catalogId,item.id);
    assert.deepEqual(en.universe.allowedSymbols,ch.universe.allowedSymbols);
    assert.ok(!en.universe.allowedSymbols.includes(item.ticker));
    assert.ok(en.universe.blockedExposures.length);
    assert.ok(en.sources.every(s=>s.title && new URL(s.url).protocol==='https:'));
    assert.equal(new Set(Object.values(en.roles)).size,3);
    assert.notEqual(ch.roles.manager,en.roles.manager);
    const brief=researchBrief(runReplicaStudy(item.id),'en-US');
    assert.equal(brief.modelCalls,0);
    assert.equal(brief.checks.find(c=>c.id==='full-replication').status,'blocked');
    if(item.section==='persona'){
      assert.deepEqual(en.universe.allowedSymbols,[]);
      assert.ok(en.manager.includes('Independent AI'));
    }
  }
  assert.deepEqual(strategyMandate('inflation-curve').universe.allowedSymbols,[]);
  assert.deepEqual(strategyMandate('active-bond').universe.allowedSymbols,[]);
  assert.deepEqual(strategyMandate('nasdaq-income').universe.allowedSymbols,['QQQ']);
  assert.deepEqual(strategyMandate('premium-income').universe.allowedSymbols,['VOO']);
  assert.throws(()=>strategyMandate('arbitrary'));
});
test('real evidence activates only matched returns, filing overlap, or NAV experiment; synthetic prices never promote a document study',()=>{
  const scopes=Object.fromEntries(CATALOG.map(c=>[c.id,runReplicaStudy(c.id).playbook.scope]));
  assert.deepEqual(Object.values(scopes).sort(),[...Array(10).fill('documents'),'matched-returns','matched-returns','nav-price','sampled-holdings'].sort());
  const ark=runReplicaStudy('ark-innovation');
  assert.equal(ark.metrics,null);
  const obs=ark.playbook.checks.find(c=>c.id==='sampled-holdings').observed;
  assert.equal(obs.sampledNames,5);
  assert.equal(obs.knownFilings.length,2);
  assert.ok(obs.knownFilings.every(f=>f.publicAt<obs.decisionAt));
  assert.ok(obs.holdoutPublicAt>obs.decisionAt);
  const nav=runReplicaStudy('contrafund').playbook.checks.find(c=>c.id==='nav-price');
  assert.equal(nav.observed.observations,12);
  assert.equal(nav.observed.trades,8);
  const jepi=runReplicaStudy('premium-income');
  assert.equal(jepi.playbook.scope,'documents');
  assert.ok(researchBrief(jepi,'en-US').checks.some(c=>c.status==='blocked' && c.detail.includes('ELN')));
  assert.equal(jepi.paperFundSupported,false);
});
test('missing dates, forward-looking mandate or mismatched target cannot validate a return experiment; old studies still resolve',()=>{
  const item=findCatalog('wellington'), study=runReplicaStudy(item.id);
  const {playbook,...old}=study;
  assert.deepEqual(researchBrief(old,'en-US'),researchBrief(study,'en-US'));
  assert.equal(playbook.checks[0].observed.observations,23);
  for(const mutated of [{...old,sourceCutoff:old.holdout.end},{...old,sourceCutoff:null},{...old,points:old.points.toReversed()}]){
    assert.equal(evaluatePlaybook(item,mutated).checks[0].status,'blocked');
  }
  assert.throws(()=>evaluatePlaybook(findCatalog('stocks-plus'),old));
});
test('method-only AI meeting submits strategy-specific real request shapes and references; no holdout evidence is fabricated',async()=>{
  const study=runReplicaStudy('inflation-curve');
  const language='en-US', plan=planResearchReview(study,language), calls=[];
  const env={FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'fixture',HARNESSROUTER_HARNESS_ID:'chrn_fixture'};
  const fetchImpl=async(_url,req)=>{
    const input=JSON.parse(JSON.parse(req.body).input);
    calls.push(input);
    const report={text:'The OTC history is incomplete.',evidenceRefs:['coverage']};
    return Response.json({id:'resp_test_'+input.role,status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(report)}]}]});
  };
  const review=await reviewHistoricalResearch({study,language,plan,idempotencyKey:'strategy-test',emit:()=>{}},{env,fetchImpl});
  assert.equal(review.status,'complete');
  assert.equal(calls.length,3);
  assert.deepEqual(calls[2].specialistOpinions.map(s=>s.role),['research','risk']);
  assert.match(calls.find(request => request.role === 'research').assignment, /OTC/u);
  assert.ok(!review.evidenceIds.includes('holdout'));
  assert.equal(review.modelCalls,3);
  assert.match(renderCatalog({catalogId:study.catalogId,researchStudies:{[study.catalogId]:study},provider:{chatEnabled:true}}),/data-action="review-research"/u);
});