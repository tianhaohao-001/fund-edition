import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createActionTransport } from '../mobile/src/action-transport.ts';

test('native retries preserve the operation ID across a language switch and release it after success', async () => {
  const sent = [];
  let failures = 1;
  let counter = 0;
  const action = createActionTransport(async body => {
    sent.push(body);
    if (failures-- > 0) throw new Error('Simulated lost response');
    return { completed: true };
  }, () => `native-request-${++counter}`);
  const purchase = { action: 'catalogBuy', catalogId: 'contrafund', amount: 1000, language: 'zh-CN' };
  await assert.rejects(action(purchase), /lost response/);
  await action({ ...purchase, language: 'en-US' });
  assert.equal(sent[1].requestId, sent[0].requestId);
  assert.equal(sent[1].language, 'en-US');
  await action(purchase);
  assert.notEqual(sent[2].requestId, sent[0].requestId);
  const confirmation = { action: 'confirmFundDraft', draftId: 'latest-blueprint', language: 'en-US' };
  failures = 1;
  await assert.rejects(action(confirmation));
  await action({ ...confirmation, language: 'zh-CN' });
  assert.equal(sent[4].requestId, sent[3].requestId);
});
