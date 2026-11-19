import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../server.mjs';

async function open(dbPath = ':memory:', capture) {
  const env = { FUNDROOM_DB_PATH: dbPath, FUNDROOM_BROKER_DB_PATH: ':memory:', FUNDROOM_ENABLE_LOCAL_VOICE: 'false' };
  if (capture) Object.assign(env, {
    FUNDROOM_ENABLE_HARNESS: 'true', HARNESSROUTER_API_KEY: 'fixture-role', HARNESSROUTER_HARNESS_ID: 'chrn_role_fixture',
  });
  const { server, host } = await createApp({ env, fetchImpl: capture ?? (() => assert.fail('Unexpected model request')) });
  server.listen(0, host);
  await once(server, 'listening');
  const base = 'http://' + host + ':' + server.address().port;
  let cookie;
  async function get(path, existingCookie = cookie) {
    const response = await fetch(base + path, { headers: existingCookie ? { Cookie: existingCookie } : {} });
    assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie')?.split(';')[0] ?? existingCookie;
    return response.json();
  }
  return {
    get, cookie: () => cookie,
    async act(action, fields, expectedStatus = 200) {
      const response = await fetch(base + '/api/action', {
        method: 'POST', headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, requestId: crypto.randomUUID(), language: 'en-US', ...fields }),
      });
      const result = await response.json();
      assert.equal(response.status, expectedStatus, JSON.stringify(result.error));
      return result;
    },
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}

test('moving a specialist updates one office and future replay reviews while preserving saved receipts and balances', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'fund-edition-desk-'));
  const dbPath = join(folder, 'office.sqlite');
  let app;
  try {
    app = await open(dbPath);
    await app.get('/api/state');
    const { fund: first } = await app.act('createFund', { name: 'Same fund name' });
    const { fund: other } = await app.act('createFund', { name: 'Same fund name' });
    const member = first.team.find(person => person.id === 'theo-park');
    const [a, b] = [first.id, other.id];
    const scenario = { fundId: a, provider: 'replay', scenarioId: 'thin-evidence' };
    const { run: original } = await app.act('runScenario', scenario);
    const wallet = await app.get('/api/portfolio');
    const before = (await app.get('/api/state')).funds.find(fund => fund.id === a);
    const cookie = app.cookie();
    await app.act('updateMember', { fundId: a, memberId: member.id, desk: 'risk' });
    await app.close();
    app = null;
    app = await open(dbPath);
    const restored = await app.get('/api/state', cookie);
    const [moved, untouched] = [a, b].map(id => restored.funds.find(fund => fund.id === id));
    assert.deepEqual(moved.team.find(person => person.id === member.id), { ...member, desk: 'risk' });
    assert.equal(untouched.team.find(person => person.id === member.id).desk, 'research');
    assert.deepEqual(moved.permissions, before.permissions);
    assert.deepEqual(moved.portfolio, before.portfolio);
    assert.deepEqual(moved.runs.find(run => run.id === original.id), original);
    const after = await app.get('/api/portfolio');
    assert.equal(after.cashCents, wallet.cashCents);
    assert.equal(after.equityCents, wallet.equityCents);
    assert.deepEqual(after.positions, wallet.positions);
    const { run: next } = await app.act('runScenario', scenario);
    const oldReview = original.reviews.find(row => row.id === member.id);
    const newReview = next.reviews.find(row => row.id === member.id);
    assert.equal(oldReview.desk, 'research');
    assert.equal(newReview.role, 'research');
    assert.equal(newReview.desk, 'risk');
    assert.equal(newReview.assignmentRole, 'risk');
    assert.match(newReview.summary, /concentration|exposure|limit|position cap|risk/i);
    assert.notEqual(newReview.summary, oldReview.summary);
  } finally {
    if (app) await app.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('hosted committee and office chat use the assigned discipline without rewriting the employee specialty', async () => {
  const requests = [];
  const app = await open(':memory:', async (_url, options) => {
    const input = JSON.parse(JSON.parse(options.body).input);
    requests.push(input);
    let answer;
    if (input.assignment) {
      answer = { sentiment: 'neutral', summary: 'Review by ' + input.assignment.role + '.', reconsider: 'Recheck a change in the replay evidence.', evidenceRefs: ['cap'] };
    } else if (input.mode === 'team-advice') {
      answer = { answer: 'Evidence reviewed.' };
    } else {
      answer = { action: 'HOLD', symbol: input.scenario.symbol, targetWeightPercent: 0, summary: 'Hold on incomplete evidence.', reconsider: 'Revisit if risk evidence changes.' };
    }
    return Response.json({ id: 'resp_role_' + requests.length, status: 'completed', model: 'desk-fixture',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] });
  });
  try {
    await app.get('/api/state');
    const { fund } = await app.act('createFund', { name: 'Committee scope' });
    const assign = (memberId, desk) => app.act('updateMember', { fundId: fund.id, memberId, desk });
    await assign('theo-park', 'risk');
    await assign('inez-rao', 'bench');
    const action = { fundId: fund.id, provider: 'committee', scenarioId: 'thin-evidence' };
    const { run } = await app.act('runScenario', action);
    const riskCall = requests.find(input => input.assignment?.role === 'risk');
    assert.ok(riskCall);
    assert.equal(riskCall.assignment.specialty, 'research');
    assert.equal(riskCall.assignment.desk, 'risk');
    const theo = run.reviews.find(row => row.id === 'theo-park');
    assert.equal(theo.role, 'research');
    assert.equal(theo.desk, 'risk');
    assert.equal(theo.assignmentRole, 'risk');
    assert.equal(theo.source, 'HarnessRouter specialist');
    assert.equal(run.reviews.some(row => row.id === 'inez-rao'), false);

    await assign('inez-rao', 'risk');
    requests.length = 0;
    const { run: together } = await app.act('runScenario', action);
    const roles = requests.filter(input => input.assignment).map(input => input.assignment.role);
    assert.equal(roles.filter(role => role === 'risk').length, 1);
    assert.equal(new Set(roles).size, roles.length);
    const notConsulted = together.unconsulted.filter(row => ['theo-park', 'inez-rao'].includes(row.id));
    assert.equal(notConsulted.length, 1);
    assert.equal(notConsulted[0].status, 'not-consulted');
    assert.ok(!together.reviews.some(row => row.id === notConsulted[0].id));

    for (const memberId of ['maya-chen', 'theo-park']) {
      await app.act('sendChat', { fundId: fund.id, memberId, provider: 'harnessrouter', message: 'What did this desk contribute?' });
      const input = requests.at(-1);
      const roster = input.confirmedRoster.find(row => row.name === 'Theo Park');
      assert.equal(roster.role, 'research');
      assert.equal(roster.assignmentRole, 'risk');
      assert.equal(roster.desk, 'risk');
      if (memberId === 'theo-park') {
        assert.equal(input.teammate.role, 'research');
        assert.equal(input.teammate.assignmentRole, 'risk');
        assert.equal(input.teammate.desk, 'risk');
        assert.equal(input.teammate.duty, fund.team.find(person => person.id === memberId).duty);
      }
    }
  } finally { await app.close(); }
});

test('desk changes retain a stable receipt and reject an obsolete office tab', async () => {
  const app = await open();
  try {
    await app.get('/api/state');
    const { fund } = await app.act('createFund', { name: 'Tabbed office' });
    const memberId = 'theo-park';
    const change = { fundId: fund.id, memberId, desk: 'risk', expectedDesk: 'research', requestId: crypto.randomUUID() };
    const currentDesk = async () => {
      const snapshot = await app.get('/api/state');
      return snapshot.funds.find(item => item.id === fund.id).team.find(person => person.id === memberId).desk;
    };
    await app.act('updateMember', change);
    await app.act('updateMember', { ...change, expectedDesk: 'risk', desk: 'execution', requestId: crypto.randomUUID() });
    await app.act('updateMember', change);
    assert.equal(await currentDesk(), 'execution');

    await app.act('updateMember', { ...change, desk: 'bench' }, 409);
    const stale = await app.act('updateMember', { ...change, desk: 'bench', requestId: crypto.randomUUID() }, 409);
    assert.equal(stale.code, 'desk-changed');
    assert.equal(await currentDesk(), 'execution');

    // Previously shipped clients supplied only a fund ID, seat ID and target desk.
    await app.act('updateMember', { fundId: fund.id, memberId, desk: 'research', requestId: undefined });
    assert.equal(await currentDesk(), 'research');
  } finally { await app.close(); }
});
