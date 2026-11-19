import test from 'node:test';
import assert from 'node:assert/strict';
import {runReplicaStudy,resolveResearchTarget,evaluateWellington} from '../web/catalog-replica.mjs';
import {CATALOG} from '../web/catalog-data.mjs';
import {QUARTERLY_RETURNS} from '../web/catalog-vanguard-returns.mjs';
import {STOCKS_PLUS_ANNUAL} from '../web/catalog-stocksplus-returns.mjs';

const near=(actual, expected, tol=1e-8)=>assert.ok(Math.abs(actual-expected)<tol, `${actual} versus ${expected}`);
const growth=returns=>returns.reduce((value,r)=>value*(1+r/100),1);
const holdout=QUARTERLY_RETURNS.filter(([end])=>end>'2020-12-31');

test('dated SEC mandate, independent proxy, full contiguous time holdout and transaction costs',()=>{
  const study=runReplicaStudy('wellington');
  assert.equal(study.paperFundSupported,true);
  assert.equal(study.modelCalls,0);
  assert.deepEqual(study.allocation.map(s=>s.symbol),['VYM','VCIT']);
  assert.equal(study.holdout.periods,23);
  assert.equal(study.reference.periods,20);
  assert.equal(study.points.length,24);
  assert.ok(study.sourceCutoff<study.reference.start);
  near(study.points.at(-1).target,100*growth(holdout.map(r=>r[1])));
  near(study.points.at(-1).VYM,100*growth(holdout.map(r=>r[2])));
  near(study.metrics.replicaReturnPct,58.3586607189);
  near(study.metrics.targetReturnPct,65.0170105210);
  near(study.metrics.trackingErrorPct,5.9402958366);
  near(study.metrics.feesPer100,.07492879846);
  assert.ok(study.metrics.correlation>.83 && study.metrics.correlation<.84);
  assert.ok(study.points.at(-1).replica<evaluateWellington(holdout,{feeBps:0}).points.at(-1).replica);
});
test('future data or target results do not change earlier proxy positions or proxy values',()=>{
  const standard=evaluateWellington(holdout);
  const altered=holdout.map(row=>[row[0],-row[1],row[2],row[3]]);
  const changedTarget=evaluateWellington(altered);
  assert.deepEqual(changedTarget.points.map(p=>p.replica),standard.points.map(p=>p.replica));
  assert.notEqual(changedTarget.points.at(-1).target,standard.points.at(-1).target);
  const shortened=evaluateWellington(holdout.slice(0,12));
  assert.deepEqual(shortened.points,standard.points.slice(0,13));
  assert.throws(()=>evaluateWellington(holdout.slice(1)),/consecutive/u);
  assert.throws(()=>evaluateWellington(holdout,{anchor:'2012-12-31'}),/dated mandate/u);
  assert.throws(()=>evaluateWellington(holdout,{feeBps:-1}),/cost/u);
});
test('PSTKX five held-out calendar years match its filed five- and ten-year net total return',()=>{
  const study=runReplicaStudy('stocks-plus');
  assert.equal(study.paperFundSupported,false);
  assert.equal(study.frequency,'annual');
  assert.deepEqual(study.allocation,[{symbol:'VOO',weightPct:100}]);
  assert.equal(study.holdout.periods,5);
  assert.equal(study.fullSample.periods,10);
  assert.equal(study.sources.length,12);
  assert.ok(STOCKS_PLUS_ANNUAL.every((r,i)=>r[0]===`${2016+i}-12-31` && r[3].startsWith('https://www.sec.gov/')));
  near(100*(growth(STOCKS_PLUS_ANNUAL.map(r=>r[1]))**.1-1),14.42,.006);
  near(100*(growth(STOCKS_PLUS_ANNUAL.slice(5).map(r=>r[1]))**.2-1),13.49,.006);
  near(study.points.at(-1).replica,100*growth(STOCKS_PLUS_ANNUAL.slice(5).map(r=>r[2]))/1.0005);
  near(study.metrics.correlation,.99962559004);
  near(study.metrics.trackingErrorPct,1.39124540584);
  near(study.metrics.gapPct,7.41823979586);
});
test('funds and real people resolve unambiguously; preliminary methods never fabricate histories',()=>{
  for (const item of CATALOG) {
    assert.equal(resolveResearchTarget(item.id)?.id,item.id);
    assert.equal(resolveResearchTarget(item.ticker)?.id,item.id);
    assert.equal(resolveResearchTarget(item.officialName||item.personName)?.id,item.id);
    assert.ok(item.localized['en-US'].sourceTitles.every(Boolean));
    const r=runReplicaStudy(item.id);
    assert.ok(r.sources.every(source=>source.titleEn && new URL(source.url).protocol==='https:'));
    assert.ok(r.seats.every(s=>s.evidence && s.evidenceEn));
    if(r.status==='method-only') {
      assert.equal(r.metrics,null); assert.equal(r.holdout,null); assert.deepEqual(r.points,[]);
      assert.equal(r.paperFundSupported,false);
    }
  }
  assert.equal(resolveResearchTarget('请分析惠灵顿')?.id,'wellington');
  assert.equal(resolveResearchTarget('请研究Roaring Kitty的公开方法')?.id,'keith-gill');
  assert.equal(resolveResearchTarget('compare AGTHX and JEPQ'),null);
  assert.equal(resolveResearchTarget('is MARKETVALUE the same as an ETF?'),null);
  assert.equal(resolveResearchTarget('no such fund'),null);
});
