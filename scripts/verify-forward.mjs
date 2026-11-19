import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createApp } from '../server.mjs';

// Explicit hosted acceptance check. One meeting invokes three HarnessRouter seats.
const {server,host}=await createApp({env:{...process.env,FUNDROOM_DB_PATH:':memory:',FUNDROOM_ENABLE_HARNESS:'true',FUNDROOM_DEFAULT_PROVIDER:'committee'}});
server.listen(0,host);
await once(server,'listening');
const endpoint='http://'+host+':'+server.address().port+'/api/fund-operator';
try {
  const get=await fetch(endpoint+'?fund=wellington&lang=zh-CN');
  const cookie=get.headers.get('set-cookie').split(';')[0];
  await get.arrayBuffer();
  const rid='live-'+randomUUID();
  async function act(body) {
    const res=await fetch(endpoint,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({catalogId:'wellington',language:'zh-CN',...body})});
    const result=await res.json(); assert.equal(res.status,200,JSON.stringify(result));return result;
  }
  const meeting={action:'meet',requestId:rid};
  const result=await act(meeting), decision=result.book.decisions[0];
  console.log(JSON.stringify({status:decision.status,receipts:decision.record.seats.map(s=>[s.role,s.status,s.reason,s.responseId]),proposal:decision.record.proposal},null,2));
  assert.equal(decision.status,'sealed');
  const repeated=await act(meeting);
  assert.equal(repeated.book.decisions.length,1);
  assert.equal(repeated.book.decisions[0].seal,decision.seal);
  const approved=await act({action:'approve',requestId:rid+'-approve',decisionId:rid});
  const order=approved.book.orders[0];
  const question='为什么做这个配置？我的模拟账户已经买入了吗？';
  const before=JSON.stringify([approved.book.cashCents,approved.book.unitsMicros,approved.book.orders,approved.book.decisions]);
  const explained=await act({action:'ask',requestId:rid+'-ask',decisionId:rid,question});
  const reply=explained.book.questions.at(-1);
  assert.equal(before,JSON.stringify([explained.book.cashCents,explained.book.unitsMicros,explained.book.orders,explained.book.decisions]));
  const archive={environment:'isolated local paper account; real HarnessRouter calls and Nasdaq closing observations',
    decision,order,reply,cashCents:approved.book.cashCents,unitsMicros:approved.book.unitsMicros};
  await writeFile(new URL('../release/review-web/forward-hosted-dialogue.json',import.meta.url),JSON.stringify(archive,null,2)+'\n');
  console.log(JSON.stringify({answer:reply.text,answerReceipt:reply.responseId}));
  console.log(JSON.stringify({order:order.status,pricingDate:order.pricingDate,cashCents:archive.cashCents}));
} finally { await new Promise(resolve=>server.close(resolve)); }

