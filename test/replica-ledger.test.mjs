import assert from 'node:assert/strict';
import test from 'node:test';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {QUARTERLY_RETURNS} from '../web/catalog-vanguard-returns.mjs';
import {STOCKS_PLUS_ANNUAL} from '../web/catalog-stocksplus-returns.mjs';

// Independent audit from issuer rows. Production solves for fee-adjusted wealth
// by bisection. This check instead solves the signed linear cash equation and
// accepts it only if the implied trades have the assumed directions.
function auditQuarterly(rows) {
  const weights=[.65,.35], fee=.0005, points=[];
  let openingCash=100, sleeves=[0,0], target=100;
  for (const [date,fund,equity,bond] of rows) {
    const pre=openingCash+sleeves[0]+sleeves[1];
    let checked;
    for (const a of [-1,1]) for (const b of [-1,1]) {
      const signs=[a,b];
      const post=(pre+fee*(a*sleeves[0]+b*sleeves[1]))/(1+fee*(a*weights[0]+b*weights[1]));
      const trades=weights.map((w,i)=>post*w-sleeves[i]);
      if (trades.every((v,i)=>signs[i]*v>=-1e-10)) checked=post;
    }
    assert.ok(Number.isFinite(checked),'cash equation has no feasible solution');
    openingCash=0;
    sleeves=[checked*weights[0]*(1+equity/100),checked*weights[1]*(1+bond/100)];
    target*=1+fund/100;
    points.push({date,replica:sleeves[0]+sleeves[1],target});
  }
  return points;
}
const near=(a,b,tolerance)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} does not match ${b} within ${tolerance}`);

test('independent end-to-end audit of the complete VWELX paper account and PSTKX total-return baseline',async t=>{
  const modelRequests=[];
  const affiliate=await createApp({env:{
    FUNDROOM_DB_PATH:':memory:',FUNDROOM_BROKER_DB_PATH:':memory:',FUNDROOM_ENABLE_LOCAL_VOICE:'false',
    FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'local-audit-fixture',HARNESSROUTER_HARNESS_ID:'chrn_audit_fixture',
  },fetchImpl:async(_url,opts)=>{
    const input=JSON.parse(JSON.parse(opts.body).input);
    assert.equal(input.mode,'lobby-concierge'); modelRequests.push(input.mode);
    return Response.json({id:'resp_fixture_for_independent_audit',model:'test-fixture',status:'completed',
      output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({answer:'请先审阅公开授权和研究假设，再确认建盘。',route:'lab',fundAction:'history'})}]}]});
  }});
  const {server,host}=affiliate;server.listen(0,host);await once(server,'listening');
  const base='http://'+host+':'+server.address().port;
  try {
    const initial=await fetch(base+'/api/state');
    const cookie=initial.headers.get('set-cookie').split(';')[0];
    async function action(body, expected=200) {
      const response=await fetch(base+'/api/action',{method:'POST',headers:{cookie,origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();
      assert.equal(response.status,expected,body.action+': '+(result.error||''));
      return result;
    }
    const proposed=await action({action:'concierge',message:'帮我复刻惠灵顿 VWELX',requestId:'audit-proposal'});
    assert.equal(proposed.researchDraft.catalogId,'wellington');
    assert.ok(proposed.funds.every(f=>!f.replica));
    const order={action:'confirmResearch',draftId:proposed.researchDraft.id,requestId:'audit-confirm',createFund:true};
    const open=await action(order);
    const id=open.fund.id, receipt=open.run.id;
    assert.equal((await action(order)).run.id,receipt);
    const curves=open.researchStudies.wellington;
    const separate=auditQuarterly(QUARTERLY_RETURNS.filter(r=>r[0]>'2020-12-31'));
    for(let i=0;i<separate.length;i++) {
      const published=curves.points[i+1], audit=separate[i];
      assert.equal(published.date,audit.date); near(published.replica,audit.replica,1e-8); near(published.target,audit.target,1e-8);
    }
    let state=open, feeCents=0, trades=0;
    for(let i=0;i<=separate.length;i++) {
      if(i>0) state=await action({action:'runScenario',fundId:id,requestId:'audit-quarter-'+i});
      const {portfolioBefore:before,portfolio:after,execution,evidence,policy}=state.run;
      const date=i===0?'2020-12-31':separate[i-1].date;
      assert.equal(state.fund.replica.asOf,date);
      assert.ok(policy.source && evidence.length === 2 && evidence.every(e=>e.asOf===date));
      if (i<separate.length) assert.ok(policy.checks.length);
      else assert.equal(execution.code,'final-mark');
      const net=execution.legs.reduce((cash,leg)=>{
        assert.ok(['VYM','VCIT'].includes(leg.symbol));assert.equal(leg.basis,'rebased-total-return-units');
        assert.equal(leg.date,date);assert.equal(leg.feeCents,Math.round(leg.notionalCents*.0005));
        feeCents+=leg.feeCents;trades++;
        return cash+(leg.side==='BUY'?-1:1)*leg.notionalCents-leg.feeCents;
      },before.cashCents);
      assert.equal(net,after.cashCents);assert.ok(after.cashCents>=0);
      assert.equal(after.equityCents,after.cashCents+after.positions.reduce((v,p)=>v+p.marketValueCents,0));
      assert.ok(after.positions.every(p=>p.quantity>=0 && p.basis==='rebased-total-return-units'));
      if(i>0) near(before.equityCents/100,separate[i-1].replica*100,.12);
    }
    await action({action:'runScenario',fundId:id,requestId:'no-quarter-24'},409);
    near(state.fund.portfolio.equity, separate.at(-1).replica*100,.12);
    assert.equal(state.fund.runs.length,24);
    assert.equal(state.run.execution.legs.length,0,'no additional rebalance after the last observation');
    const afterOverflow=await (await fetch(base+'/api/state',{headers:{cookie}})).json();
    assert.deepEqual(afterOverflow.fund.portfolio,state.fund.portfolio);
    const report=await action({action:'prepareResearch',catalogId:'stocks-plus',message:'PSTKX',requestId:'pimco-research'});
    const data=await action({action:'confirmResearch',draftId:report.researchDraft.id,requestId:'pimco-ok',createFund:false});
    const pimco=data.researchStudies['stocks-plus'];
    let voo=100/1.0005, benchmark=100;
    for(const [,original,component] of STOCKS_PLUS_ANNUAL.slice(5)){voo*=1+component/100;benchmark*=1+original/100;}
    near(pimco.points.at(-1).replica,voo,1e-8);near(pimco.points.at(-1).target,benchmark,1e-8);
    assert.deepEqual(modelRequests,['lobby-concierge']);
    t.diagnostic(JSON.stringify({mode:'isolated API; hosted response fixture',periods:separate.length,trades,feeUSD:feeCents/100,openingEquity:open.run.portfolio.equity,closingEquity:state.fund.portfolio.equity,finalCash:state.fund.portfolio.cash,frictionalProxyEquity:separate.at(-1).replica*100,targetEquity:separate.at(-1).target*100,observationsPSTKX:pimco.holdout.periods}));
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
