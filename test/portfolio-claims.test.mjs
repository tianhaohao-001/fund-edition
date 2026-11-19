import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import * as portfolioService from '../core/portfolio-account.mjs';
import { openStore } from '../core/store.mjs';

const grant = 10_000_000;
const origin = 'https://portfolio-claims.example';
const walletPath = '/api/portfolio';
const claimPath = '/api/portfolio/claim';
const buy = (requestId, amountCents) => ({ requestId, side: 'buy', productId: 'catalog:ark-innovation', amountCents });

async function launch(dbPath, children) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, FUNDROOM_DB_PATH: dbPath,
      FUNDROOM_HOST: '127.0.0.1', FUNDROOM_PORT: '0', FUNDROOM_PUBLIC_HOSTED: 'true',
      FUNDROOM_PUBLIC_ORIGIN: origin, FUNDROOM_ENABLE_LOCAL_VOICE: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  children.push(child);
  const lines = createInterface({ input: child.stdout });
  try {
    const [line] = await Promise.race([
      once(lines, 'line'),
      once(child, 'exit').then(([code]) => { throw new Error('Local test app exited with code ' + code); })
    ]);
    assert.match(line, /http:\/\/127\.0\.0\.1:\d+/);
    return line.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  } finally { lines.close(); }
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit');
  child.kill();
  await done;
}

async function call(url, path, cookie, body) {
  const response = await fetch(url + path, {
    method: body ? 'POST' : 'GET',
    headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] ?? cookie };
}

test('cash claims keep a single receipt across concurrent processes, signup and restart, and fund real paper orders', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'fund-edition-claim-test-'));
  const database = join(folder, 'test.sqlite');
  const children = [];
  try {
    const a = await launch(database, children);
    const b = await launch(database, children);
    const guest = await call(a, '/api/state');
    const other = await call(b, '/api/state');
    const claim = { requestId: randomUUID(), workspaceRef: guest.body.funds[0].id };
    const start = (await call(a, walletPath, guest.cookie)).body;
    assert.equal((await call(b, claimPath, other.cookie, claim)).status, 409);
    assert.equal((await call(a, claimPath, guest.cookie, { ...claim, amountCents: grant + 1 })).status, 400);
    assert.equal((await call(a, claimPath, guest.cookie, { workspaceRef: claim.workspaceRef })).status, 400);

    const first = await Promise.all([call(a, claimPath, guest.cookie, claim), call(b, claimPath, guest.cookie, claim)]);
    assert.deepEqual(first.map(result => result.status), [200, 200]);
    const funded = first[0].body;
    assert.deepEqual(first[1].body.receipt, funded.receipt);
    assert.equal(funded.receipt.side, 'claim');
    assert.equal(funded.receipt.amountCents, grant);
    assert.equal(funded.receipt.cashBeforeCents, start.cashCents);
    assert.equal(funded.receipt.cashAfterCents, start.cashCents + grant);
    assert.equal(funded.cashCents, start.cashCents + grant);
    assert.equal(funded.pnlCents, start.pnlCents);
    assert.equal(funded.totalOrders, start.totalOrders);
    assert.equal(funded.orders.length, 1);

    const order = buy(randomUUID(), grant);
    assert.equal((await call(b, walletPath, guest.cookie, { ...order, requestId: claim.requestId })).status, 409);
    const bought = await call(b, walletPath, guest.cookie, order);
    assert.equal(bought.status, 200);
    assert.ok(bought.body.receipt.unitsMicros > 0);
    assert.equal(bought.body.cashCents, funded.cashCents - bought.body.receipt.amountCents);
    assert.equal((await call(a, claimPath, guest.cookie, { ...claim, requestId: order.requestId })).status, 409);

    const secondClaim = { ...claim, requestId: randomUUID() };
    const second = await call(a, claimPath, guest.cookie, secondClaim);
    assert.equal(second.status, 200);
    assert.equal(second.body.claimedCashCents, 2 * grant);
    assert.equal(second.body.contributedCashCents, start.initialCashCents + 2 * grant);
    assert.equal(second.body.cashCents, bought.body.cashCents + grant);
    assert.equal(second.body.equityCents, bought.body.equityCents + grant);
    assert.equal(second.body.pnlCents, bought.body.pnlCents);
    assert.deepEqual(second.body.orders.map(entry => entry.requestId), [secondClaim.requestId, order.requestId, claim.requestId]);

    const account = await call(a, '/api/auth/register', guest.cookie, { email: randomUUID() + '@example.test', password: randomUUID() });
    assert.equal(account.status, 200);
    assert.equal((await call(a, walletPath, guest.cookie)).body.orders.length, 0);
    assert.equal((await call(b, walletPath, other.cookie)).body.claimedCashCents, 0);
    await Promise.all(children.map(stop));
    const reopened = await launch(database, children);
    const recovered = (await call(reopened, walletPath, account.cookie)).body;
    assert.equal(recovered.claimedCashCents, second.body.claimedCashCents);
    assert.deepEqual(recovered.orders, second.body.orders);
    assert.deepEqual(recovered.positions, second.body.positions);
    const retry = await call(reopened, claimPath, account.cookie, claim);
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.body.receipt, funded.receipt);
    assert.equal(retry.body.cashCents, recovered.cashCents);
  } finally {
    await Promise.all(children.map(stop));
    await rm(folder, { recursive: true, force: true });
  }
});

test('older wallets preserve their opening principal and page mixed trades and deposits without duplicates', () => {
  const store = openStore(':memory:', portfolioService);
  const workspaceRef = randomUUID();
  try {
    const legacyOpening = 1_000_000;
    store.create('legacy-claim-wallet', { funds: [{ id: workspaceRef }], portfolioAccount: {
      version: 1, cashCents: legacyOpening, realizedPnlCents: 0, positions: {}, totalOrders: 0
    } });
    store.create('separate-wallet', { funds: [{ id: randomUUID() }] });
    const ids = [];
    for (let i = 0; i < 102; i++) {
      const requestId = randomUUID();
      const result = i % 2 === 0
        ? store.orderPortfolio('legacy-claim-wallet', { workspaceRef, requestId }, { claim: true })
        : store.orderPortfolio('legacy-claim-wallet', buy(requestId, 200));
      ids.push(result.receipt.id);
    }
    const page = store.readPortfolio('legacy-claim-wallet');
    const older = store.readPortfolio('legacy-claim-wallet', page.olderOrdersCursor);
    assert.equal(page.initialCashCents, legacyOpening);
    assert.equal(page.claimedCashCents, 51 * grant);
    assert.equal(page.totalOrders, 51);
    assert.equal(page.pnlCents, 0);
    assert.equal(page.orders.length, 100);
    assert.equal(older.orders.length, 2);
    assert.deepEqual([...page.orders, ...older.orders].map(entry => entry.id), ids.reverse());
    assert.equal(older.olderOrdersCursor, null);
    assert.deepEqual(store.readPortfolio('separate-wallet', page.olderOrdersCursor).orders, []);
  } finally { store.close(); }
});

