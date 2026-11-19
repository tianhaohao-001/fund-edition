import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.mjs';

async function start(t) {
  let now = Date.UTC(2026, 10, 19, 8, 20, 12, 250);
  t.mock.method(Date, 'now', () => now);
  const origin = 'https://quota.example.test';
  const app = await createApp({
    env: { FUNDROOM_DB_PATH: ':memory:', FUNDROOM_PUBLIC_HOSTED: 'true', FUNDROOM_PUBLIC_ORIGIN: origin,
      FUNDROOM_WATCH_ENABLED: 'false', FUNDROOM_ENABLE_LOCAL_VOICE: 'false' },
    fetchImpl: () => assert.fail('Local application reads must not request an external service.'),
  });
  app.server.listen(0, app.host);
  await once(app.server, 'listening');
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise(resolve => app.server.close(resolve));
  });
  const base = `http://${app.host}:${app.server.address().port}`;
  async function get(path, cookie) {
    return fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
  }
  async function guest() {
    const response = await get('/api/state');
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie').split(';')[0], state: await response.json() };
  }
  async function select({cookie, state}) {
    return fetch(base + '/api/action', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'selectFund', fundId: state.fund.id }) });
  }
  return { get, guest, select, nextMinute() { now = Math.floor(now / 60_000) * 60_000 + 60_000; } };
}

test('a normal multi-panel journey can read state, wallet and voice without using its action allowance', async t => {
  const app = await start(t), user = await app.guest();
  for (let i = 0; i < 45; i++) {
    const path = ['/api/state', '/api/portfolio', '/api/voice/status'][i % 3];
    const response = await app.get(path, user.cookie);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('set-cookie'), null);
    await response.json();
  }
  for (let i = 0; i < 30; i++) {
    const response = await app.select(user);
    assert.equal(response.status, 200);
    await response.json();
  }
  const limited = await app.select(user);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '48');
  assert.equal((await limited.json()).code, 'rate-limit');
  const read = await app.get('/api/portfolio', user.cookie);
  assert.equal(read.status, 200);
  await read.json();
  app.nextMinute();
  assert.equal((await app.select(user)).status, 200);
});

test('local reads keep independent session and shared IP bounds and reset at the reported minute', async t => {
  const app = await start(t), first = await app.guest(), second = await app.guest();
  for (const user of [first, second]) {
    // The rejected 181st first-session request also counts against its network.
    const requests = user === first ? 180 : 179;
    for (let i = 0; i < requests; i++) {
      const response = await app.get('/api/voice/status', user.cookie);
      assert.equal(response.status, 200);
      await response.json();
    }
    if (user === first) {
      const limited = await app.get('/api/voice/status', user.cookie);
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get('retry-after'), '48');
    }
  }
  const ipLimited = await app.get('/api/health');
  assert.equal(ipLimited.status, 429);
  assert.equal(ipLimited.headers.get('retry-after'), '48');
  assert.equal((await app.select(second)).status, 200);
  app.nextMinute();
  assert.equal((await app.get('/api/voice/status', first.cookie)).status, 200);
});

test('new workspaces and external-data routes retain the original request allowance', async t => {
  const app = await start(t), user = await app.guest();
  for (let i = 0; i < 30; i++) {
    const response = await app.get('/api/market/reference?symbol=unsupported', user.cookie);
    assert.equal(response.status, 400);
    await response.json();
  }
  const limited = await app.get('/api/market/reference?symbol=unsupported', user.cookie);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '48');
  assert.equal((await app.get('/api/portfolio', user.cookie)).status, 200);
  app.nextMinute();
  // A first-time state request creates a workspace and stays in the original 120/IP window.
  for (let i = 0; i < 120; i++) {
    const response = await app.get('/api/state');
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('set-cookie'));
    await response.json();
  }
  const creationLimited = await app.get('/api/state');
  assert.equal(creationLimited.status, 429);
  assert.equal(creationLimited.headers.get('retry-after'), '60');
  assert.equal(creationLimited.headers.get('set-cookie'), null);
});
