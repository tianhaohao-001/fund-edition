import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../server.mjs';
import { officeWatchBrief, proposeTeamReply } from '../core/team-coach.mjs';

async function office(t, model) {
  const env = {
    FUNDROOM_DB_PATH: ':memory:',
    FUNDROOM_BROKER_DB_PATH: ':memory:',
    FUNDROOM_ENABLE_LOCAL_VOICE: 'false',
  };
  if (model) Object.assign(env, {
    FUNDROOM_ENABLE_HARNESS: 'true',
    HARNESSROUTER_API_KEY: 'office-context-fixture-only',
    HARNESSROUTER_HARNESS_ID: 'chrn_office_fixture',
  });
  const { server, host } = await createApp({
    env, fetchImpl: model ?? (() => assert.fail('Unexpected upstream call')),
  });
  server.listen(0, host);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const origin = 'http://' + host + ':' + server.address().port;
  const state = await fetch(origin + '/api/state');
  const cookie = state.headers.get('set-cookie').split(';')[0];
  await state.json();
  return async (action, args = {}, expectedStatus = 200) => {
    const response = await fetch(origin + '/api/action', {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, requestId: crypto.randomUUID(), language: 'en-US', ...args }),
    });
    const value = await response.json();
    assert.equal(response.status, expectedStatus, JSON.stringify(value.error));
    return value;
  };
}

function captureOfficeRequests(requests) {
  return async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push({ input: JSON.parse(request.input), instructions: request.instructions });
    return Response.json({
      status: 'completed', model: 'office-fixture', id: 'resp_office_' + requests.length,
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ answer: 'Recorded fixture answer.' }) }] }],
    });
  };
}

function manager(fund) {
  return fund.team.find(member => member.role === 'manager');
}

test('before the first review, the replay manager describes this fund and its assigned people', async t => {
  const act = await office(t);
  const mandate = 'Study the resilience of freight profits.';
  const { fund } = await act('createFund', { name: 'Harbour Research', mandate });
  const result = await act('sendChat', {
    provider: 'replay', fundId: fund.id, memberId: manager(fund).id, message: 'What is my team working on?',
  });
  const reply = result.fund.chat.at(-1);
  assert.equal(reply.memberId, manager(fund).id);
  assert.match(reply.text, /freight profits/i);
  const active = fund.team.filter(member => member.role !== 'manager' && member.desk !== 'bench');
  assert.ok(active.some(member => reply.text.includes(member.name)));
  assert.match(reply.text, /no .*?(trade|order|decision|review|fill|execution)|not yet .*?(traded|reviewed)|no record/i);
  assert.doesNotMatch(reply.text, /\bNVDA\b/);
  assert.deepEqual(result.fund.portfolio, fund.portfolio);
  assert.equal(result.fund.runs.length, 0);
});

test('asking Maya about an older simulated fill returns the selected decision and execution', async t => {
  const act = await office(t);
  const { fund } = await act('createFund', { name: 'Scoped receipt' });
  const run = scenarioId => act('runScenario', { provider: 'replay', fundId: fund.id, scenarioId });
  const { run: buy } = await run('innovation-signal');
  const { run: sell } = await run('de-risk');
  assert.equal(buy.execution.status, 'filled');
  assert.equal(buy.execution.side, 'BUY');
  assert.equal(sell.execution.side, 'SELL');
  const result = await act('sendChat', {
    provider: 'replay', fundId: fund.id, memberId: manager(fund).id,
    runId: buy.id, message: 'Why was this particular order filled?',
  });
  const reply = result.fund.chat.at(-1);
  assert.equal(reply.runId, buy.id);
  assert.ok(reply.text.includes(buy.decision.summary));
  assert.ok(reply.text.includes(buy.execution.price.toFixed(2)));
  assert.ok(reply.text.includes(String(buy.execution.quantity)));
  assert.ok(reply.text.includes(buy.execution.symbol));
  assert.ok(!reply.text.includes(sell.decision.summary));
  assert.deepEqual(result.fund.portfolio, sell.portfolio);
});

test('hosted office requests distinguish the manager from specialists and bind history to fund and seat', async t => {
  const requests = [];
  const act = await office(t, captureOfficeRequests(requests));
  const { fund: a } = await act('createFund', { name: 'Same Name', mandate: 'Study foundries.' });
  const { fund: b } = await act('createFund', { name: 'Same Name', mandate: 'Review grain inventories.' });
  const specialist = a.team.find(member => member.role === 'research');
  const standby = a.team.find(member => member.role === 'risk');
  await act('updateMember', { fundId: a.id, memberId: standby.id, desk: 'bench' });
  const { run } = await act('runScenario', { fundId: a.id, provider: 'replay', scenarioId: 'innovation-signal' });
  const ask = (fund, member, message) => act('sendChat', {
    provider: 'harnessrouter', fundId: fund.id, memberId: member.id, message,
  });
  await ask(a, specialist, 'Check supplier concentration.');
  const specialistRequest = requests.at(-1);
  assert.match(specialistRequest.instructions, /specialist/i);
  await ask(a, manager(a), 'Summarize the latest fund review.');
  const managerRequest = requests.at(-1);
  assert.match(managerRequest.instructions, /primary contact/i);
  assert.notEqual(managerRequest.instructions, specialistRequest.instructions);
  assert.equal(managerRequest.input.confirmedRoster.find(p => p.name === standby.name).desk, 'bench');
  assert.equal(managerRequest.input.recordedExecution.id, run.id);
  assert.equal(managerRequest.input.recordedExecution.execution.side, run.execution.side);
  assert.equal(managerRequest.input.recordedExecution.execution.priceCents, run.execution.priceCents);
  assert.equal(managerRequest.input.recordedExecution.source, run.scenario.source);
  assert.equal(managerRequest.input.mandate, a.mandate);
  assert.deepEqual(managerRequest.input.conversation, []);

  await ask(a, manager(a), 'What was my previous question?');
  assert.ok(requests.at(-1).input.conversation.some(row => row.text === 'Summarize the latest fund review.'));
  assert.ok(!requests.at(-1).input.conversation.some(row => row.text.includes('supplier')));
  await ask(b, manager(b), 'What was my previous question?');
  assert.equal(requests.at(-1).input.mandate, b.mandate);
  assert.equal(requests.at(-1).input.recordedExecution, null);
  assert.deepEqual(requests.at(-1).input.conversation, []);
  assert.ok(!JSON.stringify(requests).includes('office-context-fixture-only'));
});

test('a legacy manager on the bench remains the contact while an ordinary reserve seat stays unavailable', async t => {
  const act = await office(t);
  const { fund } = await act('createFund', { name: 'Historical arrangement', mandate: 'Evaluate freight contracts.' });
  const maya = manager(fund);
  const researcher = fund.team.find(member => member.role === 'research');
  for (const member of [maya, researcher]) {
    await act('updateMember', { fundId: fund.id, memberId: member.id, desk: 'bench' });
  }
  const result = await act('sendChat', {
    fundId: fund.id, memberId: maya.id, provider: 'replay', message: 'What is my team working on?',
  });
  assert.equal(result.fund.team.find(member => member.id === maya.id).desk, 'bench');
  assert.equal(result.fund.chat.at(-1).memberId, maya.id);
  assert.equal(result.fund.chat.at(-1).role, 'assistant');
  assert.match(result.fund.chat.at(-1).text, /freight contracts/i);
  const refused = await act('sendChat', {
    fundId: fund.id, memberId: researcher.id, provider: 'replay', message: 'What are your findings?',
  }, 400);
  assert.ok(refused.error);
});

test('only the manager receives the last completed market observation, separately from any trade', async () => {
  const completedAt = '2026-11-18T15:30:00.000Z';
  const finished = {
    finishedAt: completedAt, rule: 'reference-review', execution: { status: 'no-order' },
    ai: { status: 'complete', zh: '已核对收盘参考。', en: 'The reference close was checked.' },
  };
  const watch = officeWatchBrief({
    eligible: true, enabled: true, intervalMinutes: 60, nextAt: '2026-11-18T17:30:00.000Z',
    history: [
      { status: 'running', record: { rule: 'unfinished-watch', ai: { status: 'running', en: 'unfinished note' } } },
      { status: 'complete', record: finished },
    ],
  }, 'en-US');
  assert.equal(watch.latest.at, completedAt);
  assert.equal(watch.latest.managerNote, finished.ai.en);
  assert.equal(watch.latest.executionStatus, 'no-order');
  assert.ok(!JSON.stringify(watch).includes('unfinished'));

  const maya = { id: 'maya', name: 'Maya', role: 'manager', desk: 'management', duty: 'Synthesize the review' };
  const analyst = { id: 'lee', name: 'Lee', role: 'research', desk: 'research', duty: 'Review evidence' };
  const fund = { name: 'Coastal', mandate: 'Review freight revenue', team: [maya, analyst], runs: [], chat: [] };
  const requests = [];
  const options = {
    env: { FUNDROOM_ENABLE_HARNESS: 'true', HARNESSROUTER_API_KEY: 'watch-fixture', HARNESSROUTER_HARNESS_ID: 'chrn_watch' },
    fetchImpl: captureOfficeRequests(requests),
  };
  for (const member of fund.team) {
    await proposeTeamReply({ member, fund, watch, message: 'Which check was recorded?', language: 'en-US' }, options);
  }
  assert.deepEqual(requests[0].input.marketWatch, watch);
  assert.equal(requests[0].input.recordedExecution, null);
  assert.ok(!Object.hasOwn(requests[1].input, 'marketWatch'));
});
