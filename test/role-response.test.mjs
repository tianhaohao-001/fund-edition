import test from 'node:test';
import assert from 'node:assert/strict';
import { requestHarnessObject,ManagerUnavailable } from '../core/manager.mjs';

test('spoken turns use only supplied workspace context, stable retry keys and text-only receipts',async()=>{
  const env={FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'fixture',HARNESSROUTER_HARNESS_ID:'chrn_fixture'};
  const sent=[];
  const output={type:'message',role:'assistant',content:[{type:'output_text',text:'{"answer":"Review this ledger."}'}]};
  async function call(owner,items){
    return requestHarnessObject({input:{question:'What is your first assignment?'},instructions:'Speak as this fund’s researcher.',
      idempotencyKey:owner+':same-request',timeoutSeconds:5,maxOutputTokens:300,maxStep:1,conversational:true},
      {env,fetchImpl:async(_url,init)=>{
        const b=JSON.parse(init.body);
        assert.equal(b.user,undefined);assert.equal(b.previous_response_id,undefined);
        assert.equal(b.stream,false);assert.equal(b.store,false);assert.equal(b.reasoning.effort,'none');
        assert.ok(!init.body.includes(owner));sent.push(init.headers['Idempotency-Key']);
        return Response.json({id:'test-receipt',status:'completed',model:'fixture',output:items});
      }});
  }
  const active=await call('private-visitor-a',[output]);
  assert.deepEqual(active.harness.outputTypes,['message']);
  await call('private-visitor-a',[output]);await call('private-visitor-b',[output]);
  assert.equal(sent[0],sent[1]);assert.notEqual(sent[0],sent[2]);
  await assert.rejects(call('private-visitor-a',[{type:'function_call'},output]),ManagerUnavailable);
});
