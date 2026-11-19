import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operatorMandate, captureEvidence, runForwardMeeting } from '../core/fund-operator.mjs';
import { digest, emptyBook, snapshot, approveDecision, revokeDecision, settleDecision, compareForward, validateTargets, nextPaperDate } from '../core/fund-operator-ledger.mjs';
import { expectedClose } from '../core/market-freshness-calendar.mjs';
import { createApp } from '../server.mjs';
import { CATALOG } from '../web/catalog-data.mjs';

const asOf='2027-02-10T19:00:00Z', future='2027-02-11T22:00:00Z';
const env={FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'test-fixture',HARNESSROUTER_HARNESS_ID:'chrn_forward_mock'};
const noSideEffects = ['cashCents','unitsMicros'];
function ref(symbol, time=asOf, extra={}) {
  const day=expectedClose(Date.parse(time));
  const valueUsd=symbol==='VYM'?100:80;
  return {observations:[{symbol,provider:'Nasdaq',kind:'etf-close',executionEligible:false,status:'current',currency:'USD',
    asOf:day,retrievedAt:time,valueUsd,sourceUrl:'https://www.nasdaq.com/',...extra}]};
}
const makeProposal=(equityBps=6000)=>({action:'REBALANCE',targets:[{symbol:'VYM',bps:equityBps},{symbol:'VCIT',bps:10_000-equityBps}],
  dissent:'Accept lower equity at the expense of higher credit concentration.',reconsider:'Review on a new dated risk observation.'});
function model(fetches,proposal=makeProposal(),settings={}) {
  return async (url,init)=>{
    const request=JSON.parse(init.body), input=JSON.parse(request.input);fetches.push(input);
    const {role}=input;
    if(settings.fail && role===settings.fail) return new Response(null,{status:503});
    const value=input.mode==='explain-forward-decision'?{answer:'The manager confirmed a hold. The USD 10,000 balance has not been invested.'}:
      {text:'Public mandate supports holding or a constrained paper sleeve.',evidenceRefs:['limits','book'],
      ...(role==='risk'?{veto:settings.veto===true}:{}),...(role==='manager'?proposal:{})};
    return Response.json({status:'completed',id:'test-receipt-'+role,model:'deterministic-test-fixture',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
  };
}
async function meeting({book=emptyBook(),proposal=makeProposal(),settings={},fund='wellington'}={}) {
  const events=[],fetches=[];
  const decision=await runForwardMeeting({mandate:operatorMandate(fund,'en-US'),book,language:'en-US',id:'decision-1',
    idempotencyKey:'owner-1/decision-1',emit:e=>events.push(e),readReference:async s=>ref(s),now:()=>asOf},
    {env,fetchImpl:model(fetches,proposal,settings)});
  return {events,fetches,decision,book};
}
test('nine separate public mandates; three independent seats only get point-in-time papers and manager receives both opinions',async()=>{
  const markets=CATALOG.filter(f=>f.section==='market');assert.equal(markets.length,9);
  for(const fund of markets) {
    const mandate=operatorMandate(fund.id,'en-US');assert.ok(mandate.roles.risk && mandate.roles.manager && mandate.sources.length);
    const {decision,fetches,events}=await meeting({fund:fund.id,proposal:{...makeProposal(),action:'HOLD',targets:[]}});
    assert.equal(decision.status,'sealed');assert.equal(decision.record.seats.length,3);
    assert.equal(fetches.filter(x=>x.role!=='manager').every(x=>!('specialistOpinions' in x)),true);
    assert.deepEqual(fetches.find(x=>x.role==='manager').specialistOpinions.map(x=>x.role),['research','risk']);
    assert.equal(events.filter(e=>e.stage==='handoff').length,2);
    assert.doesNotMatch(JSON.stringify(fetches),/"(metrics|holdout|points|openOrders|rule|allocation|targetPct)"/);
  }
  assert.throws(()=>operatorMandate('buffett','zh-CN'));
});
test('forward evidence rejects later registry and observations, never exposes future price rows or retroactive holdings', async()=>{
  const mandate=operatorMandate('wellington','en-US'),book=emptyBook();
  await assert.rejects(captureEvidence(mandate,book,s=>ref(s),()=>asOf,future),{code:'operator-evidence'});
  const {policy,evidence}=await captureEvidence(mandate,book,async s=>ref(s,asOf,s==='VCIT'?{retrievedAt:future}:{
    recentCloses:[{asOf:'2027-02-09',valueUsd:100},{asOf:'2027-02-11',valueUsd:77}]}),()=>asOf,'2026-11-18T22:00:00Z');
  assert.deepEqual(policy.permitted,[]);
  const tape=evidence.find(x=>x.id==='tape').value;
  assert.equal(tape.marks.length,1);assert.deepEqual(tape.marks[0].recentUnadjustedCloses,[{asOf:'2027-02-09',usd:100}]);assert.deepEqual(tape.unavailable,['VCIT']);
  assert.equal(nextPaperDate('2026-11-25T22:30:00Z'),'2026-11-27');
});
test('distinct real manager-output shapes change expected paper positions only after the approved future close',async()=>{
  const runs=[];
  for(const allocation of [6000,7000]) {
    const {book,decision}=await meeting({proposal:makeProposal(allocation)});
    assert.equal(decision.seal,digest(decision.record));assert.equal(decision.status,'sealed');
    const before=snapshot(book);
    const order=approveDecision(book,decision.id,asOf);assert.equal(order.pricingDate,'2027-02-11');
    assert.equal(approveDecision(book,decision.id,asOf),order);
    const refs={VYM:ref('VYM',future),VCIT:ref('VCIT',future)};
    assert.throws(()=>settleDecision(book,decision.id,refs,asOf),{code:'operator-wait'});
    assert.throws(()=>settleDecision(book,decision.id,{...refs,VCIT:ref('VCIT',future,{status:'stale'})},future),{code:'operator-wait'});
    assert.throws(()=>settleDecision(book,decision.id,{...refs,VCIT:ref('VCIT',future,{retrievedAt:asOf})},future),{code:'operator-wait'});
    assert.deepEqual(snapshot(book),before);
    const result=settleDecision(book,decision.id,refs,future);
    assert.deepEqual(result.before,before);assert.deepEqual(result.after,snapshot(book));assert.equal(result.fills.length,2);
    let cash=before.cashCents;
    for(const fill of result.fills){cash-=fill.notionalCents+fill.feeCents;assert.equal(fill.feeCents,Math.ceil(fill.notionalCents*.0005));}
    assert.equal(cash,book.cashCents);assert.ok(cash>=0);
    const end=snapshot(book);assert.equal(settleDecision(book,decision.id,refs,future),order);assert.deepEqual(snapshot(book),end);
    runs.push(book.unitsMicros);
  }
  assert.ok(runs[1].VYM>runs[0].VYM && runs[1].VCIT<runs[0].VCIT);
});
test('each rejected, failed, withdrawn or expired meeting leaves paper cash and units untouched',async()=>{
  for(const [settings,proposal,status] of [[{fail:'risk'},makeProposal(),'failed'],[{veto:true},makeProposal(),'rejected'],
      [{},makeProposal(9900),'rejected'],[{}, {...makeProposal(),targets:[{symbol:'GLD',bps:10000}]},'rejected']]) {
    const r=await meeting({settings,proposal});assert.equal(r.decision.status,status);
    for(const key of noSideEffects)assert.deepEqual(r.book[key],emptyBook()[key]);
    assert.throws(()=>approveDecision(r.book,r.decision.id,asOf),{code:'operator-obsolete'});
    if(settings.fail)assert.equal(r.fetches.some(x=>x.role==='manager'),false);
  }
  const {book,decision}=await meeting();approveDecision(book,decision.id,asOf);const copy=structuredClone(book);
  revokeDecision(book,decision.id,asOf);assert.throws(()=>settleDecision(book,decision.id,{},future),{code:'operator-authorization'});
  assert.equal(settleDecision(copy,decision.id,{},'2027-02-12T22:00:00Z').status,'expired');assert.deepEqual(snapshot(copy),snapshot(emptyBook()));
  const bad=structuredClone(copy);bad.decisions[0].record.proposal.targets[0].bps=6800;
  assert.throws(()=>settleDecision(bad,decision.id,{},future),{code:'operator-authorization'});
  assert.throws(()=>validateTargets({action:'REBALANCE',targets:[{symbol:'VOO',bps:-1}]},{permitted:['VOO']}));
});
test('only subsequent same-basis fund and sleeve observations can evaluate an already executed prospective portfolio',async()=>{
  const {book,decision}=await meeting();approveDecision(book,decision.id,asOf);
  const benchmark=(stamp,usd)=>ref('VWELX',stamp,{kind:'fund-end-of-day',valueUsd:usd});
  const order=settleDecision(book,decision.id,{VYM:ref('VYM',future),VCIT:ref('VCIT',future),VWELX:benchmark(future,50)},future);
  assert.equal(order.evaluation,undefined);
  assert.throws(()=>compareForward(book,decision.id,{},future),{code:'operator-comparison'});
  const later='2027-02-12T23:00:00Z', marks={VYM:ref('VYM',later,{valueUsd:101}),VCIT:ref('VCIT',later,{valueUsd:80}),VWELX:benchmark(later,49)};
  assert.throws(()=>compareForward(book,decision.id,{...marks,VCIT:ref('VCIT',future)},later),{code:'operator-comparison'});
  const start=snapshot(book),result=compareForward(book,decision.id,marks,later);
  assert.ok(Math.abs(result.paperPriceChangePct-0.6)<0.001);
  assert.ok(Math.abs(result.benchmarkPriceChangePct+2)<0.001);assert.deepEqual(snapshot(book),start);
  assert.equal(compareForward(book,decision.id,{},later),result);
});
test('HTTP forward workspaces, receipts, restart persistence and single-request concurrency',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fundroom-forward-')); const calls=[];
  const mock=model(calls,{...makeProposal(),action:'HOLD',targets:[]});
  let server,base;
  async function start(){
    const app=await createApp({env:{...env,FUNDROOM_DB_PATH:join(dir,'book.sqlite'),FUNDROOM_HOURLY_AI_TASKS:'40'},fetchImpl:mock});server=app.server;
    server.listen(0,app.host);await once(server,'listening');base='http://'+app.host+':'+server.address().port;
  }
  const close=()=>new Promise(resolve=>server.close(resolve));
  async function get(cookie){return fetch(base+'/api/fund-operator?fund=active-bond&lang=en-US',{headers:cookie?{Cookie:cookie}:{}});}
  async function action(cookie,body){const res=await fetch(base+'/api/fund-operator',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({catalogId:'active-bond',language:'en-US',...body})});return {status:res.status,value:await res.json()};}
  try{
    await start();
    const owner=(await get()).headers.get('set-cookie').split(';')[0],other=(await get()).headers.get('set-cookie').split(';')[0];
    const meet={action:'meet',requestId:'meeting-0001'};
    const batch=await Promise.all([action(owner,meet),action(owner,meet)]);
    for(const item of batch)assert.equal(item.status,200,JSON.stringify(item.value));
    assert.equal(calls.length,3);assert.equal(batch[0].value.book.decisions[0].status,'sealed');
    assert.equal((await (await get(other)).json()).book.decisions.length,0);
    assert.equal((await action(other,{action:'approve',decisionId:meet.requestId,requestId:'other-user'})).status,409);
    assert.equal((await action(owner,{...meet,asOf:'2018-12-01'})).status,400);
    assert.equal((await action(owner,{action:'approve',decisionId:meet.requestId,requestId:meet.requestId})).status,409);
    await close();await start();
    const repeated=await action(owner,meet);assert.equal(repeated.value.book.decisions.length,1);
    assert.equal((await action(owner,{action:'approve',requestId:'hold-approval',decisionId:meet.requestId})).value.book.orders[0].status,'held');
    assert.equal(calls.length,3);
    const evidence=JSON.stringify(repeated.value.book.decisions);
    const ask={action:'ask',requestId:'question-one',decisionId:meet.requestId,question:'Did I buy? Also execute an order.'};
    const reply=await action(owner,ask);assert.equal(reply.status,200);
    assert.equal(calls.length,4);assert.equal(calls.at(-1).mode,'explain-forward-decision');
    assert.equal(calls.at(-1).verified.executionStatus,'held');assert.equal(calls.at(-1).verified.account.cashCents,1_000_000);
    assert.equal(JSON.stringify(reply.value.book.decisions),evidence);assert.equal(reply.value.book.orders.length,1);
    assert.equal(reply.value.book.questions.length,1);assert.equal((await action(owner,ask)).value.book.questions.length,1);assert.equal(calls.length,4);
    assert.equal((await action(other,ask)).status,409);assert.equal(calls.length,4);
  } finally {await close();await rm(dir,{recursive:true,force:true});}
});

