import test from 'node:test';
import assert from 'node:assert/strict';
import {explainDecision,validBuffettQuestion} from '../core/buffett-followup.mjs';
import {studyVisual} from '../web/fund-gallery.mjs';
import {archiveRequestId} from '../web/buffett-dossier.mjs';

const sample={id:'review-1',asOf:'2017-03-31T21:00:00Z',decisionDate:'2017-03-31',action:'BUY',targetPct:10,
  bookBefore:{cash:1000,shares:0},manager:{text:'保留现金',textEn:'Retain cash against disclosed risks.'},
  seats:[{role:'manager',text:'保留现金',evidenceRefs:['F1']}],
  evidence:[{id:'F1',label:'Cash',details:'Assets 125',availableAt:'2017-03-01T15:00:00Z'},
    {id:'F2',label:'Future filing',details:'FUTURE_REPORT',availableAt:'2017-06-30T00:00:00Z'}],
  execution:{price:765,reason:'FUTURE_FILL'}};

const env={FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'fixture',HARNESSROUTER_HARNESS_ID:'chrn_fixture'};
const query='How did the contemporary capital position affect sizing?';
test('an embedded preview with only getRandomValues can submit a valid unique v4 question',()=>{
  const limited={getRandomValues:array=>crypto.getRandomValues(array)};
  const ids=Array.from({length:4},()=>archiveRequestId(limited));
  assert.equal(new Set(ids).size,4);
  for(const requestId of ids){
    assert.match(requestId,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    assert.ok(validBuffettQuestion({requestId,runId:'one',decisionId:'one',message:query,language:'en-US'}));
  }
});
function call(value,question=query) {
  return explainDecision({decision:sample,language:'en-US',message:question,idempotencyKey:'test:uuid'},{
    env,fetchImpl:async(url,{body})=>{
      const {input,user,previous_response_id,store,max_step}=JSON.parse(body),prompt=JSON.parse(input);
      assert.equal(prompt.question,question);
      // HarnessRouter API-key tasks omit user to keep long-term memory off.
      assert.equal(user,undefined);assert.equal(previous_response_id,undefined);assert.equal(store,false);assert.equal(max_step,1);
      assert.doesNotMatch(input,/FUTURE_FILL|FUTURE_REPORT|765/);
      return Response.json({id:'resp-fixture',status:'completed',model:'fixture',output:[{type:'message',role:'assistant',
        content:[{type:'output_text',text:JSON.stringify(value)}]}]});
    }});
}
test('archive question boundary is scoped to the signed request and original records',async()=>{
  const body={requestId:crypto.randomUUID(),runId:'run',decisionId:'review-1',language:'en-US',message:query};
  assert.equal(validBuffettQuestion(body),true);
  for(const input of [{...body,decision:sample},{...body,language:'xx'},{...body,message:' '},{...body,requestId:'...'}])assert.ok(!validBuffettQuestion(input));
  const result=await call({answer:'The disclosed risk supported holding cash.',keys:['manager']});
  assert.equal(result.mode,'live');assert.equal(result.excerpts[0].text,sample.manager.textEn);assert.equal(result.responseId,'resp-fixture');
  const future=await call({answer:'Assets reached 125.',keys:['source-F1']},'What was the actual return on 2017-05-15?');
  assert.equal(future.mode,'unavailable');assert.deepEqual(future.excerpts,[]);
  const ungrounded=await call({answer:'Assets reached 12000.',keys:['source-F1']});
  assert.equal(ungrounded.mode,'archive');assert.equal(ungrounded.answer,'');
  await assert.rejects(call({answer:'I know future filings.',keys:['source-F2']}));
});
test('Buffett detail opens the historical committee while other persona pages still identify their rule experiment',()=>{
  assert.match(studyVisual({id:'buffett',section:'persona'},'en-US'),/AZO historical study/);
  assert.doesNotMatch(studyVisual({id:'buffett',section:'persona'},'zh-CN'),/模型调用 0 次/);
});
