import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { historicalPacket, runBuffettStudy, fingerprint } from '../core/buffett-paper.mjs';
import { requestHarnessObject } from '../core/manager.mjs';
import { addBuffettReviewNotes } from '../core/buffett-reviewed-notes.mjs';

const bar=(date,open,close)=>({date,open,close,openAt:date+'T14:30:00Z',closeAt:date+'T21:00:00Z'});
const bars=[bar('2016-12-30',60,70),bar('2017-01-03',80,90),bar('2017-03-31',98,100),bar('2017-04-03',110,80),bar('2017-06-30',77,55),bar('2017-07-03',65,60)];
const snapshot=b=>({id:'snapshot-'+b.date,asOf:new Date(Date.parse(b.closeAt)+6*3600000).toISOString(),closeAt:b.closeAt,close:b.close,
  closeAvailableAt:new Date(Date.parse(b.closeAt)+5*3600000).toISOString(),
  evidence:[{id:'company-2016-annual',label:'AZO annual earnings',value:10,unit:'USD/share',periodStart:'2015-04-01',periodEnd:'2016-03-31',
    availableAt:'2016-04-01T21:30:00Z',sourceId:'filing'}]});
const history={security:{ticker:'AZO'},methodSources:[],priceSourceId:'prices',sources:[
  {id:'filing',title:'Issuer filing',url:'https://www.sec.gov/'},{id:'prices',title:'Market bars',url:'https://example.org/'}],
  bars,snapshots:[snapshot(bars[0]),snapshot(bars[2]),snapshot(bars[4])]};
const vote=async packet=>['research','risk','manager'].map(role=>({role,text:'Recorded explanation',
  responseId:'fixture-'+role+packet.review,model:'fixture',evidenceRefs:['E01'],
  ...(role==='manager'?{intent:packet.review===3?'HOLD':'SET_TARGET',targetPct:packet.review===1?100:0,counterargument:'Risk',reconsider:'Future evidence'}:{})}));

test('historical inputs exclude identifiers, later prices and unfiled reports',()=>{
  const current=history.snapshots[0],book={cashCents:1000000,units:0};
  const input=historicalPacket(history,current,book,0);
  assert.deepEqual(input.packet.priorCloses,[{sessionsAgo:0,close:70}]);
  assert.doesNotMatch(JSON.stringify(input.packet),/AZO|2016|sec\.gov|2017|company-2016-annual/i);
  const later=structuredClone(history);
  later.bars.at(-1).close=270;
  assert.deepEqual(historicalPacket(later,current,book,0).packet,input.packet);
  assert.throws(()=>historicalPacket(history,{...current,evidence:[{...current.evidence[0],availableAt:'2017-01-02T00:00:00Z'}]},book,0));
  assert.throws(()=>historicalPacket(history,{...current,closeAvailableAt:'2017-01-02T00:00:00Z'},book,0));
  const unfiled=structuredClone(history);
  unfiled.sources.push({id:'late',title:'Secondary report',url:'https://www.sec.gov/',availableAt:'2017-01-03T20:00:00Z'});
  unfiled.snapshots[0].evidence[0].sourceIds=['filing','late'];
  assert.throws(()=>historicalPacket(unfiled,unfiled.snapshots[0],book,0),/unavailable/);
});

test('historical provider calls isolate user memory, exclude tool events and reject external annotations',async()=>{
  const env={FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'fixture',HARNESSROUTER_HARNESS_ID:'chrn_test'};
  const message={type:'message',role:'assistant',content:[{type:'output_text',text:'{"ok":true}'}]};
  const call=output=>requestHarnessObject({input:{},instructions:'Review',isolatedUser:'case-seat-private',
    timeoutSeconds:1,maxOutputTokens:32,maxStep:1},{env,fetchImpl:async (_url,init)=>{
      const body=JSON.parse(init.body);
      assert.equal(body.user,'case-seat-private');assert.equal(body.store,false);assert.equal(body.max_step,1);
      assert.equal(body.previous_response_id,undefined);
      return Response.json({status:'completed',id:'test-receipt',model:'fixture',output});
    }});
  assert.deepEqual((await call([{type:'reasoning'},message])).value,{ok:true});
  await assert.rejects(()=>call([{type:'web_search_call'},message]));
  await assert.rejects(()=>call([{...message,content:[{...message.content[0],annotations:[{type:'url_citation'}]}]}]));
});

test('published Buffett study independently reconstructs every receipt, evidence cutoff and fill from the historical files',async()=>{
  const get=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
  const history=await get('../data/buffett-study/history.json'),archive=await get('../web/data/buffett-ai-study.json');
  assert.equal(archive.provenance.dataSha256,fingerprint(history));
  let cursor=0;
  const replay=await runBuffettStudy(history,async packet=>{
    const meeting=archive.decisions[cursor++];
    assert.equal(fingerprint(packet),meeting.packetHash);
    assert.deepEqual(packet,meeting.modelPacket);
    assert.doesNotMatch(JSON.stringify(packet),/autozone|\bAZO\b|201[5678]-\d\d-|www\.sec\.gov/i);
    for(const seat of meeting.seats) {
      assert.ok(seat.responseId.length>10 && seat.outputTypes.includes('message'));
      assert.match(seat.requestHash,/^[a-f0-9]{64}$/u);
      for(const id of seat.evidenceRefs) {
        const evidence=meeting.evidence.find(e=>e.id===id);
        assert.ok(evidence.sources.length>0 && Date.parse(evidence.availableAt)<=Date.parse(meeting.asOf));
        for(const s of evidence.sources) assert.ok(s.url.startsWith('https://') && Date.parse(s.availableAt)<=Date.parse(meeting.asOf));
      }
    }
    assert.ok(Date.parse(meeting.execution.at)>Date.parse(meeting.asOf));
    return meeting.seats;
  });
  addBuffettReviewNotes(replay);
  assert.deepEqual(replay.decisions,archive.decisions);
  assert.ok(archive.decisions[2].corrections.some(n=>n.id==='capex-3'));
  assert.ok(archive.decisions[3].corrections.some(n=>n.id==='pe-4'));
  assert.deepEqual(replay.points,archive.points);
  assert.deepEqual(replay.benchmarkExecution,archive.benchmarkExecution);
  assert.deepEqual(replay.metrics,archive.metrics);
  assert.deepEqual(archive.method.priceGaps,['2017-11-08']);
  assert.ok(!archive.points.some(p=>p.date==='2017-11-08'));
});

test('precommitted whole-budget entry and exit execute at the subsequent open with identical baseline costs',async()=>{
  const archive=await runBuffettStudy(history,vote);
  const [entry,exit,hold]=archive.decisions.map(d=>d.execution);
  assert.deepEqual(entry,archive.benchmarkExecution);
  assert.equal(entry.price,80);
  assert.equal(entry.date,'2017-01-03');
  assert.equal(exit.price,110);
  assert.equal(exit.quantity,entry.quantity);
  assert.equal(exit.cashAfter,+(entry.cashAfter+exit.notional-exit.fee).toFixed(2));
  assert.equal(exit.sharesAfter,0);
  assert.equal(hold.status,'no-trade');
  assert.equal(hold.price,null);
  assert.equal(hold.fee,0);
  assert.equal(archive.points[0].date,'2016-12-30');
  assert.equal(archive.points[1].aiEquity,archive.points[1].benchmarkEquity);
  assert.equal(archive.points.at(-1).aiEquity,exit.cashAfter);
  assert.ok(archive.points.at(-1).benchmarkEquity<entry.notional);
  await assert.rejects(()=>runBuffettStudy(history,async p=>(await vote(p)).slice(1)),/Incomplete/);
});
