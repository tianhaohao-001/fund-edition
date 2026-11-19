import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../server.mjs';

async function start(dbPath = ':memory:') {
  const { server, host } = await createApp({
    env: { FUNDROOM_DB_PATH: dbPath },
    fetchImpl: async () => assert.fail('Paper follows must not call an external service.'),
  });
  server.listen(0, host);
  await once(server, 'listening');
  const base = `http://${host}:${server.address().port}`;
  return {
    close: () => new Promise(resolve => server.close(resolve)),
    async state(cookie) {
      const response = await fetch(`${base}/api/state`, { headers: cookie ? { Cookie: cookie } : {} });
      return { body: await response.json(), cookie: cookie ?? response.headers.get('Set-Cookie').split(';', 1)[0] };
    },
    async action(cookie, body) {
      const response = await fetch(`${base}/api/action`, {
        method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: response.status, result: await response.json() };
    },
  };
}

test('a personal paper follow applies one shared target to its own account and survives pause and restart', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'fundroom-shared-follow-'));
  const dbPath = join(folder, 'fundroom.sqlite');
  let app = await start(dbPath);
  try {
    const { cookie } = await app.state();
    const first = await app.action(cookie, { action: 'followShared', strategyId: 'innovation', initialCash: 3_001.27 });
    assert.equal(first.status, 200);
    const original = first.result.sharedFollows.innovation;
    assert.equal(original.portfolio.initialCashCents, 300_127);
    assert.equal(original.status, 'active');

    const core = await app.action(cookie, { action: 'followShared', strategyId: 'core', initialCash: 8_000 });
    assert.equal(core.status, 200);
    assert.notEqual(core.result.sharedFollows.core.id, original.id);

    const order = { action: 'runShared', provider: 'replay', strategyId: 'innovation', requestId: 'shared-personal-first' };
    const applied = await app.action(cookie, order);
    assert.equal(applied.status, 200);
    const { run, sharedFollows, fund } = applied.result;
    const personal = run.followers.find(({ personal }) => personal);
    assert.equal(run.followers.length, 4);
    assert.equal(personal.id, original.id);
    assert.equal(personal.execution.status, 'filled');
    assert.equal(personal.portfolio.positions[0].quantity, 5);
    assert.equal(personal.portfolio.cashCents, 230_112);
    assert.equal(sharedFollows.innovation.history[0].targetWeightPercent, run.decision.targetWeightPercent);
    assert.deepEqual(fund.portfolio.positions, []);
    assert.equal(sharedFollows.core.portfolio.cashCents, 800_000);

    const paused = await app.action(cookie, { action: 'setSharedFollowStatus', strategyId: 'innovation', status: 'paused' });
    assert.equal(paused.result.sharedFollows.innovation.status, 'paused');
    await app.close();
    app = await start(dbPath);
    const newVisitor = await app.state();
    assert.deepEqual(newVisitor.body.sharedFollows, {});
    assert.equal((await app.action(newVisitor.cookie, { action: 'setSharedFollowStatus', strategyId: 'innovation', status: 'active' })).status, 404);

    const retried = await app.action(cookie, order);
    assert.equal(retried.result.run.id, run.id);
    assert.equal(retried.result.sharedFollows.innovation.history.length, 1);
    const exit = { action: 'runShared', provider: 'replay', strategyId: 'innovation', scenarioId: 'de-risk', requestId: 'shared-personal-paused' };
    const skipped = await app.action(cookie, exit);
    assert.equal(skipped.status, 200);
    assert.equal(skipped.result.run.followers.length, 3);
    assert.deepEqual(skipped.result.sharedFollows.innovation.portfolio, personal.portfolio);
    assert.equal(skipped.result.sharedFollows.innovation.history.length, 1);

    const resumed = await app.action(cookie, { action: 'setSharedFollowStatus', strategyId: 'innovation', status: 'active' });
    assert.equal(resumed.result.sharedFollows.innovation.id, original.id);
    assert.deepEqual(resumed.result.sharedFollows.innovation.portfolio, personal.portfolio);
    const next = await app.action(cookie, { ...exit, requestId: 'shared-personal-resumed' });
    assert.equal(next.status, 200);
    assert.equal(next.result.run.followers.find(({ personal }) => personal).execution.side, 'SELL');
    assert.deepEqual(next.result.sharedFollows.innovation.portfolio.positions, []);
    assert.equal(next.result.sharedFollows.innovation.history.length, 2);
  } finally {
    await app.close();
    for (const file of readdirSync(folder)) unlinkSync(join(folder, file));
    rmdirSync(folder);
  }
});

test('starting paper cash must be valid and a second confirmation cannot reset the account', async () => {
  const app = await start();
  try {
    const { cookie } = await app.state();
    const follow = { action: 'followShared', strategyId: 'innovation' };
    for (const initialCash of [99.99, 10_000.001, 1_000_000.01, '1000', null, { toString: null, valueOf: null }]) {
      assert.equal((await app.action(cookie, { ...follow, initialCash })).status, 400);
    }
    const open = await app.action(cookie, { ...follow, initialCash: 100.01 });
    const existing = open.result.sharedFollows.innovation;
    assert.equal(existing.portfolio.initialCashCents, 10_001);
    assert.equal((await app.action(cookie, { ...follow, initialCash: 1_000_000 })).status, 409);
    assert.deepEqual((await app.state(cookie)).body.sharedFollows.innovation, existing);
  } finally {
    await app.close();
  }
});
