import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readdir, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createApp } from '../server.mjs';

function hostedFixture(calls) {
  return async (_url, options) => {
    const request = JSON.parse(options.body);
    const input = JSON.parse(request.input);
    calls.push({ request, input });
    const zh = input.language === 'zh-CN';
    const text = zh ? '根据已提供的证据审议，保留独立风险检查。' : 'Review the supplied evidence and preserve independent risk checks.';
    let value;
    if (input.mode === 'fund-design') {
      value = { answer: text, profile: { goal: 'Quality companies', horizon: '5 years', risk: 'balanced', name: 'Language Test' } };
    } else if (['team-advice', 'catalog-discussion'].includes(input.mode)) {
      value = { answer: text };
    } else if (input.assignment) {
      value = { sentiment: 'caution', summary: text, reconsider: text, evidenceRefs: ['returns', 'cap'] };
    } else {
      value = { action: 'BUY', symbol: input.scenario.symbol, targetWeightPercent: 10, summary: text, reconsider: text };
    }
    return Response.json({ status: 'completed', id: `resp_language_fixture_${calls.length}`, model: 'language-test-fixture', output: [
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
    ] });
  };
}

async function start({ database = ':memory:', calls = [], configured = true } = {}) {
  const { server, host } = await createApp({
    env: {
      FUNDROOM_DB_PATH: database, FUNDROOM_ENABLE_LOCAL_VOICE: 'false',
      ...(configured ? { FUNDROOM_ENABLE_HARNESS: 'true', HARNESSROUTER_API_KEY: 'fixture-only', HARNESSROUTER_HARNESS_ID: 'chrn_language' } : {}),
    },
    fetchImpl: hostedFixture(calls),
  });
  server.listen(0, host);
  await once(server, 'listening');
  const base = `http://${host}:${server.address().port}`;
  return {
    base, calls, close: () => new Promise(resolve => server.close(resolve)),
    async state(cookie, language) {
      const response = await fetch(`${base}/api/state${language ? `?language=${encodeURIComponent(language)}` : ''}`, { headers: cookie ? { Cookie: cookie } : {} });
      return { status: response.status, body: await response.json(), cookie: cookie ?? response.headers.get('set-cookie')?.split(';')[0] };
    },
    async action(cookie, body) {
      const response = await fetch(`${base}/api/action`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    },
  };
}

test('selected language reaches every hosted desk while previous messages and drafts retain their text', async () => {
  const app = await start();
  try {
    const first = await app.state(undefined, 'en-US');
    assert.equal(first.body.guide.language, 'en-US');
    assert.match(first.body.guide.messages[0].text, /^I’m Maya/u);
    const { cookie } = first;
    const goal = { action: 'designConversation', language: 'en-US', message: '长期研究科技，风险适中', requestId: 'language-goal' };
    const english = await app.action(cookie, goal);
    assert.equal(english.status, 200);
    assert.equal(english.body.guide.language, 'en-US');
    assert.match(english.body.guide.messages.at(-1).text, /^Review/u);
    const previousMessages = structuredClone(english.body.guide.messages);
    const snapshot = await app.state(cookie, 'zh-CN');
    assert.deepEqual(snapshot.body.guide, english.body.guide);
    assert.deepEqual(snapshot.body.funds, english.body.funds);
    const repeated = await app.action(cookie, { ...goal, language: 'zh-CN' });
    assert.equal(repeated.body.guide.draft.id, english.body.guide.draft.id);
    assert.equal(app.calls.length, 1);
    const chinese = await app.action(cookie, { action: 'designConversation', language: 'zh-CN', message: 'Keep the same plan.', requestId: 'language-next' });
    assert.equal(chinese.body.guide.language, 'zh-CN');
    assert.match(chinese.body.guide.messages.at(-1).text, /根据/u);
    assert.deepEqual(chinese.body.guide.messages.slice(0, previousMessages.length), previousMessages);
    const fundId = first.body.fund.id;
    const risk = first.body.fund.team.find(({ role }) => role === 'risk');
    const member = await app.action(cookie, { action: 'sendChat', fundId, memberId: risk.id, language: 'en-US', message: '请解释风险' });
    assert.equal(member.status, 200);
    assert.match(member.body.fund.chat.at(-1).text, /^Review/u);
    const catalog = await app.action(cookie, { action: 'catalogChat', catalogId: 'contrafund', language: 'zh-CN', message: 'Explain the evidence.', requestId: 'language-catalog' });
    assert.equal(catalog.status, 200);
    assert.match(catalog.body.catalogChats.contrafund.at(-1).text, /根据/u);
    const beforeCommittee = app.calls.length;
    const review = { action: 'runScenario', fundId, provider: 'committee', language: 'en-US', requestId: 'language-review' };
    const committee = await app.action(cookie, review);
    assert.equal(committee.status, 200);
    assert.equal(committee.body.run.language, 'en-US');
    assert.ok(app.calls.slice(beforeCommittee).every(({ input }) => input.language === 'en-US'));
    assert.ok(committee.body.run.reviews.every(({ language }) => language === 'en-US'));
    const taskCount = app.calls.length;
    const retried = await app.action(cookie, { ...review, language: 'zh-CN' });
    assert.equal(retried.body.run.id, committee.body.run.id);
    assert.deepEqual(retried.body.run, committee.body.run);
    assert.equal(app.calls.length, taskCount);
    const shared = await app.action(cookie, { action: 'runShared', strategyId: 'innovation', provider: 'committee', language: 'zh-CN', requestId: 'language-shared' });
    assert.equal(shared.status, 200);
    assert.ok(app.calls.slice(taskCount).every(({ input }) => input.language === 'zh-CN'));
    for (const { input, request } of app.calls) {
      assert.match(request.instructions, input.language === 'zh-CN' ? /selected Simplified Chinese/u : /selected US English/u);
    }
  } finally { await app.close(); }
});

test('changing the selected language cannot create or buy twice, including an older language-specific receipt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'morrowfolio-language-'));
  const database = join(directory, 'test.sqlite');
  let app = await start({ database, configured: false });
  try {
    const { cookie } = await app.state();
    const goal = await app.action(cookie, { action: 'designConversation', provider: 'replay', language: 'en-US', message: 'Long-term quality companies, balanced risk.', requestId: 'locale-draft' });
    const confirm = { action: 'confirmFundDraft', draftId: goal.body.guide.draft.id, requestId: 'locale-confirm', language: 'en-US' };
    const opened = await app.action(cookie, confirm);
    const switched = await app.action(cookie, { ...confirm, language: 'zh-CN' });
    assert.equal(switched.status, 200);
    assert.equal(switched.body.fund.id, opened.body.fund.id);
    assert.equal(switched.body.funds.length, opened.body.funds.length);
    assert.equal(opened.body.portfolioCashCents, 0);
    const claim = await fetch(`${app.base}/api/portfolio/claim`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: randomUUID(), workspaceRef: opened.body.funds[0].id }),
    });
    assert.equal(claim.status, 200);
    const buy = { action: 'catalogBuy', catalogId: 'contrafund', amount: 1000, requestId: 'legacy-language-buy', language: 'zh-CN' };
    const filled = await app.action(cookie, buy);
    assert.equal(filled.status, 200);
    await app.close();
    const oldFields = [buy.action, buy.fundId, buy.strategyId, buy.scenarioId, buy.name, buy.mandate, buy.maxWeightPercent, buy.provider, buy.permissions, buy.message, buy.draftId, buy.restart, buy.language, buy.catalogId, buy.amount];
    const oldSignature = createHash('sha256').update(JSON.stringify(oldFields)).digest('hex');
    const db = new DatabaseSync(database);
    try { db.prepare('UPDATE decision_receipts SET signature = ? WHERE request_id = ?').run(oldSignature, buy.requestId); } finally { db.close(); }
    app = await start({ database, configured: false });
    const retried = await app.action(cookie, { ...buy, language: 'en-US' });
    assert.equal(retried.status, 200);
    assert.deepEqual(retried.body.catalogAccounts, filled.body.catalogAccounts);
    assert.equal(retried.body.catalogAccounts.contrafund.history.length, 1);
    assert.equal((await app.action(cookie, { ...buy, amount: 2000 })).status, 409);
  } finally {
    await app.close();
    for (const filename of await readdir(directory)) await rm(join(directory, filename));
    await rmdir(directory);
  }
});

test('unsupported locales fail before invoking AI and connection errors expose both language messages', async () => {
  const app = await start({ configured: false });
  try {
    const first = await app.state();
    for (const language of ['fr-FR', 'en-us', '', null, {}, ['en-US']]) {
      const result = await app.action(first.cookie, { action: 'designConversation', language, message: 'A long-term fund.', requestId: 'bad-language' });
      assert.equal(result.status, 400);
      assert.equal(result.body.code, 'invalid-language');
      assert.ok(result.body.messages['zh-CN']);
      assert.ok(result.body.messages['en-US']);
    }
    assert.equal((await app.state(undefined, 'fr-FR')).status, 400);
    const missing = await app.action(first.cookie, { action: 'designConversation', language: 'en-US', message: 'A long-term fund.', requestId: 'missing-manager' });
    assert.equal(missing.status, 503);
    assert.equal(missing.body.code, 'manager-unavailable');
    assert.match(missing.body.messages['zh-CN'], /AI 连接/u);
    assert.match(missing.body.messages['en-US'], /hosted guide/u);
    const voice = await fetch(`${app.base}/api/voice/transcribe`, { method: 'POST', headers: { Cookie: first.cookie, 'Content-Type': 'audio/wav', 'X-Voice-Language': 'en-GB' }, body: Buffer.alloc(46) });
    assert.equal(voice.status, 400);
    assert.equal((await voice.json()).code, 'invalid-language');
    assert.equal(app.calls.length, 0);
    assert.deepEqual((await app.state(first.cookie)).body.guide, first.body.guide);
  } finally { await app.close(); }
});
