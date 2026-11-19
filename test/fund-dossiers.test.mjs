import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, catalogBacktest } from '../web/catalog-model.mjs';
import { comparativeSeries } from '../web/fund-performance.mjs';
import { runReplicaStudy } from '../web/catalog-replica.mjs';
import { studyVisual } from '../web/fund-gallery.mjs';
import { chartSample } from '../web/fund-gallery-data.mjs';
import { arkHoldingsStudy, ARK_FILING_LINKS } from '../web/replication-cases.mjs';
import { researchBrief } from '../web/strategy-playbook.mjs';
import { renderCatalog } from '../web/catalog-view.mjs';
import { renderReplication } from '../web/replication.mjs';

test('the four rules-based styles display their own 72 simulations and its own recent fills',()=>{
  for(const item of CATALOG.filter(x=>x.section==='persona' && x.id!=='buffett')){
    const comparison=comparativeSeries(item), source=catalogBacktest(item.id);
    assert.equal(comparison.kind,'scenario');
    assert.equal(comparison.points.length,72);
    assert.deepEqual(comparison.points.map(p=>p.date),source.points.map(p=>p.date));
    for(const [i,p] of comparison.points.entries()){
      assert.equal(p.a,100*source.points[i].equity/source.startingCash);
      assert.equal(p.b,100*source.points[i].benchmarkEquity/source.startingCash);
    }
    const html=studyVisual(item,'en-US');
    assert.match(html,/zero AI calls/);
    assert.match(html,/no investor track record or AI decisions/);
    assert.equal(comparison.summary.cashStart,8);
    assert.ok(html.includes(source.metrics.benchmarkReturnPercent.toFixed(2)+'%'));
    for(const trade of source.trades)assert.ok(html.includes('<time>'+trade.date+'</time>')&&html.includes(trade.price.toFixed(2)));
    assert.ok(html.includes('Show '+(source.trades.length-3)+' earlier fills'));
  }
});

test('persona comparison discloses both risks and identical growth proxies',()=>{
  const references=[
    ['lynch',23.33,9.74],['dalio',57.78,2.99],
    ['cathie-wood',23.33,9.74],['keith-gill',18.75,6.93],
  ];
  for (const [id,mean,holdDrawdown] of references) {
    const item=CATALOG.find(x=>x.id===id), series=comparativeSeries(item);
    assert.equal(+series.summary.meanTarget.toFixed(2),mean);
    assert.equal(+series.summary.holdDrawdown.toFixed(2),holdDrawdown);
    const html=studyVisual(item,'zh-CN');
    assert.ok(html.includes('模型调用 0 次')&&html.includes('不能跨人排名'));
    assert.equal(html.includes('林奇和伍德共用相同'),['lynch','cathie-wood'].includes(id));
  }
  assert.deepEqual(catalogBacktest('lynch').points,catalogBacktest('cathie-wood').points);
});

test('only audited holdouts produce a proxy pair on a market dossier',()=>{
  for(const item of CATALOG.filter(x=>x.section==='market')){
    const data=comparativeSeries(item),html=studyVisual(item,'en-US');
    if(['wellington','stocks-plus'].includes(item.id)){
      const study=runReplicaStudy(item.id);
      assert.deepEqual(data.points[0],{date:study.holdout.start,a:100,b:100});
      assert.equal(data.points.at(-1).date,study.holdout.end);
      assert.equal(data.points.length,study.holdout.periods+1);
      assert.ok(html.includes(study.metrics.trackingErrorPct.toFixed(2)+'%'));
      assert.ok(html.includes(study.sources[0].url));
      assert.ok(html.includes(study.sourceCutoff) && html.includes('0 AI calls'));
    }else{
      assert.equal(data,null);assert.ok(chartSample(item.ticker));
      assert.match(html,/aligned proxy-versus-fund return series has not been established/);
      assert.doesNotMatch(html,/data-fd-kind="holdout"/);
    }
  }
});

test('ARKK opens the dated SEC sample and its manager works from the same five weights',()=>{
  const item=CATALOG.find(entry=>entry.id==='ark-innovation'), run=arkHoldingsStudy(), study=runReplicaStudy(item.id);
  const html=studyVisual(item,'en-US');
  assert.ok(html.indexOf('data-ark-study')<html.indexOf('Original fund price history'));
  assert.ok(html.includes(run.decisionAt.slice(0,10)) && html.includes(run.modelCovered.toFixed(2)+'%') && html.includes(run.holdout.covered.toFixed(2)+'%'));
  for(const filing of [...run.training,run.holdout]){
    assert.ok(html.includes(ARK_FILING_LINKS[filing.source]) && html.includes(filing.publicAt.slice(0,10)));
  }
  const expected=run.rows.map(({symbol,modelWeight,disclosedWeight})=>({symbol,estimated:modelWeight,laterDisclosed:disclosedWeight}));
  for(const language of ['en-US','zh-CN']){
    const observed=researchBrief(study,language).checks.find(c=>c.id==='sampled-holdings').observed;
    assert.deepEqual(observed.weightsPctOfFundNAV,expected);
    assert.equal(observed.holdoutCoveragePct,run.holdout.covered);
  }
  const stored=structuredClone(study);
  delete stored.playbook.checks.find(c=>c.id==='sampled-holdings').observed.weightsPctOfFundNAV;
  assert.deepEqual(researchBrief(stored,'en-US'),researchBrief(study,'en-US'));
  const detail=renderCatalog({catalogId:item.id});
  assert.match(detail,/fundroom-replication data-initial-case="sec"/);
  assert.match(detail,/<textarea id="catalog-message"[^>]*maxlength="800"/);
  assert.doesNotMatch(detail,/class="funds-team-strip"/);
  assert.match(renderReplication(),/data-initial-case="synthetic"/);
});
