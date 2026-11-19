import assert from 'node:assert/strict';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { createBroker } from '../core/broker.mjs';
import { createApp } from '../server.mjs';

const TOKEN = 'test_operator_token_never_for_a_real_account';
const START = Date.parse('2026-11-17T17:45:00Z');
const SESSION = 'local-browser';
const ORDER = { action: 'previewOrder', environment: 'paper', symbol: 'SPY', side: 'buy', quantity: 2, limitPrice: '325.50' };
const ENV = {
  FUNDROOM_BROKER_OPERATOR_TOKEN: TOKEN,
  ALPACA_DATA_KEY_ID: 'data-key', ALPACA_DATA_SECRET_KEY: 'data-secret',
  ALPACA_PAPER_TRADING_ENABLED: 'true',
  ALPACA_PAPER_TRADING_KEY_ID: 'paper-key', ALPACA_PAPER_TRADING_SECRET_KEY: 'paper-secret',
  ALPACA_PAPER_ALLOWED_SYMBOLS: 'SPY, NVDA', ALPACA_PAPER_MAX_ORDER_USD: '1000',
  ALPACA_LIVE_TRADING_ENABLED: 'true',
  ALPACA_LIVE_TRADING_KEY_ID: 'live-key', ALPACA_LIVE_TRADING_SECRET_KEY: 'live-secret',
  ALPACA_LIVE_ALLOWED_SYMBOLS: 'SPY', ALPACA_LIVE_MAX_ORDER_USD: '1000',
};

function json(value, status = 200) {
  return Response.json(value, { status });
}

function stub() {
  const calls = [];
  const state = {
    time: START, marketOpen: true, quoteTimeOffset: 0, bid: 325.15, ask: 325.35,
    cash: '900.045', buyingPower: '1800.00', available: '3.5', quantity: '4', noShorting: true,
    paperAccount: randomUUID(), liveAccount: randomUUID(),
    orders: new Map(), externalOpenOrders: false, ambiguous: null, holdCancellation: false,
  };
  async function fetchImpl(url, request) {
    const { hostname, pathname, searchParams } = url;
    const { method, headers, body } = request;
    calls.push({ host: hostname, pathname, method, headers, payload: body ? JSON.parse(body) : null });
    assert.equal(request.redirect, 'error');
    if (hostname === 'data.alpaca.markets') {
      assert.equal(method, 'GET');
      assert.equal(headers['APCA-API-KEY-ID'], 'data-key');
      assert.equal(headers['APCA-API-SECRET-KEY'], 'data-secret');
      assert.match(pathname, /\/v2\/stocks\/(SPY|NVDA)\/quotes\/latest/u);
      return json({ symbol: pathname.split('/')[3], quote: { t: new Date(state.time + state.quoteTimeOffset).toISOString(), bp: state.bid, ap: state.ask } });
    }
    const name = { 'paper-api.alpaca.markets': 'paper', 'api.alpaca.markets': 'live' }[hostname];
    assert.ok(name);
    assert.equal(headers['APCA-API-KEY-ID'], name + '-key');
    assert.equal(headers['APCA-API-SECRET-KEY'], name + '-secret');
    const account = name === 'paper' ? state.paperAccount : state.liveAccount;
    if (method === 'GET' && pathname === '/v2/account') {
      return json({ id: account, currency: 'USD', status: 'ACTIVE', account_blocked: false,
        trading_blocked: false, cash: state.cash, buying_power: state.buyingPower });
    }
    if (method === 'GET' && pathname === '/v2/account/configurations') {
      return json({ no_shorting: state.noShorting });
    }
    if (method === 'GET' && pathname === '/v2/clock') {
      return json({ is_open: state.marketOpen, timestamp: new Date(state.time).toISOString(), next_close: new Date(state.time + 600_000).toISOString() });
    }
    if (method === 'GET' && pathname.startsWith('/v2/assets/')) {
      return json({ symbol: pathname.split('/').at(-1), class: 'us_equity', status: 'active', tradable: true });
    }
    if (method === 'GET' && pathname.startsWith('/v2/positions/')) {
      return json({ symbol: pathname.split('/').at(-1), side: 'long', qty: state.quantity, qty_available: state.available });
    }
    if (method === 'GET' && pathname === '/v2/orders' && searchParams.get('status') === 'open') {
      return json(state.externalOpenOrders ? [{ id: randomUUID() }] : []);
    }
    if (method === 'GET' && pathname === '/v2/orders:by_client_order_id') {
      const order = state.orders.get(searchParams.get('client_order_id'));
      return order && order.account === account && state.ambiguous !== 'hidden' ? json(order) : json({}, 404);
    }
    if (method === 'POST' && pathname === '/v2/orders') {
      const order = { ...JSON.parse(body), id: randomUUID(), status: 'new', filled_qty: '0', account };
      state.orders.set(order.client_order_id, order);
      if (state.ambiguous) throw new Error('Simulated loss after the broker accepted the order');
      return json(order);
    }
    if (method === 'DELETE' && pathname.startsWith('/v2/orders/')) {
      const order = [...state.orders.values()].find((value) => value.id === pathname.split('/').at(-1) && value.account === account);
      if (!order) return json({}, 404);
      if (!state.holdCancellation) order.status = 'canceled';
      return new Response(null, { status: 204 });
    }
    assert.fail(`Unexpected fetch in stub: ${method} ${pathname}`);
  }
  return { state, calls, fetchImpl, writes: () => calls.filter(({ method }) => method !== 'GET') };
}

function setup(t, { env = ENV, database, fixture = stub() } = {}) {
  const broker = createBroker({ env, database, fetchImpl: fixture.fetchImpl, now: () => fixture.state.time });
  t.after(() => broker.close());
  return { ...fixture, broker, perform: (input, token = TOKEN, session = SESSION) => broker.perform(session, input, token) };
}

function confirm(preview) {
  return {
    action: preview.kind === 'order' ? 'confirmOrder' : 'confirmCancel',
    environment: preview.environment, id: preview.id, confirmation: preview.confirmation,
  };
}

test('broker requires explicit permission, independent API keys and private local mode', async (t) => {
  const disabledVariants = [
    {},
    { ...ENV, FUNDROOM_PUBLIC_DEMO: 'true' },
    { ...ENV, ALPACA_PAPER_TRADING_KEY_ID: 'live-key' },
    { ...ENV, ALPACA_DATA_FEED: 'delayed_sip' },
  ];
  for (const env of disabledVariants) {
    const { broker, perform, calls } = setup(t, { env });
    assert.equal(broker.status.enabled, false);
    await assert.rejects(perform(ORDER), { code: 'broker-disabled' });
    assert.equal(calls.length, 0);
  }
  const valid = setup(t);
  await assert.rejects(valid.perform(ORDER, 'another_fake_operator_token_for_this_test'), { code: 'broker-authorization' });
  assert.equal(valid.calls.length, 0);
});

test('paper and live use separate endpoints, ledgers and verified manual receipts', async (t) => {
  const { perform, state, writes } = setup(t);
  const { operation: paper } = await perform(ORDER);
  const { operation: live } = await perform({ ...ORDER, environment: 'live' });
  assert.equal(writes().length, 0);
  assert.equal(paper.confirmation, 'SUBMIT PAPER');
  assert.equal(live.confirmation, 'SUBMIT LIVE');
  assert.doesNotMatch(JSON.stringify(paper), new RegExp(state.paperAccount));
  await assert.rejects(perform({ ...confirm(paper), confirmation: 'SUBMIT LIVE' }), { status: 400 });
  await assert.rejects(perform(confirm(paper), TOKEN, 'different-browser'), { status: 403 });
  await assert.rejects(perform({ ...confirm(paper), environment: 'live' }), { status: 404 });
  const paperReceipt = await perform(confirm(paper));
  const liveReceipt = await perform(confirm(live));
  assert.deepEqual(writes().map(({ host }) => host), ['paper-api.alpaca.markets', 'api.alpaca.markets']);
  assert.deepEqual(writes()[0].payload, { symbol: 'SPY', side: 'buy', qty: '2', client_order_id: paper.id,
    type: 'limit', limit_price: '325.50', time_in_force: 'day', extended_hours: false });
  assert.equal(paperReceipt.operation.order.clientOrderId, paper.id);
  assert.equal(liveReceipt.operation.order.clientOrderId, live.id);
  const history = await perform({ action: 'history', environment: 'paper' });
  assert.deepEqual(history.operations.map(({ id }) => id), [paper.id]);
  assert.deepEqual(await perform(confirm(paper)), paperReceipt);
  assert.equal(writes().length, 2);
});

test('broker revalidates live inputs and fails closed before any submit', async (t) => {
  const { perform, state, writes } = setup(t);
  await assert.rejects(perform({ ...ORDER, symbol: 'UNKN' }), { status: 400 });
  await assert.rejects(perform({ ...ORDER, quantity: 4 }), { status: 400 });
  await assert.rejects(perform({ ...ORDER, limitPrice: '325.555' }), { status: 400 });
  const { operation: changingQuote } = await perform(ORDER);
  state.ask = 325.40;
  await assert.rejects(perform(confirm(changingQuote)), { code: 'broker-preview-changed' });
  const { operation: noCash } = await perform(ORDER);
  state.cash = '600.00';
  await assert.rejects(perform(confirm(noCash)), /available cash/u);
  state.cash = '900.00';
  state.quoteTimeOffset = -16_000;
  await assert.rejects(perform(ORDER), { code: 'stale-broker-quote' });
  state.quoteTimeOffset = 0;
  state.marketOpen = false;
  await assert.rejects(perform(ORDER), /regular market/u);
  state.marketOpen = true;
  state.externalOpenOrders = true;
  await assert.rejects(perform(ORDER), /open orders/u);
  state.externalOpenOrders = false;
  state.noShorting = false;
  await assert.rejects(perform({ ...ORDER, side: 'sell' }), /long-only/u);
  state.noShorting = true;
  const { operation: sell } = await perform({ ...ORDER, side: 'sell' });
  state.available = '1';
  await assert.rejects(perform(confirm(sell)), /available long/u);
  const { operation: expired } = await perform(ORDER);
  state.time += 121_000;
  await assert.rejects(perform(confirm(expired)), /expired/u);
  assert.equal(writes().length, 0);
});

test('concurrent broker confirmations dispatch one order', async (t) => {
  const { perform, writes } = setup(t);
  const { operation } = await perform(ORDER);
  const results = await Promise.allSettled([perform(confirm(operation)), perform(confirm(operation))]);
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(writes().length, 1);
});

test('broker quote age and sell cap are inclusive at their exact decimal boundaries', async (t) => {
  const { perform, state, writes } = setup(t, { env: { ...ENV, ALPACA_PAPER_MAX_ORDER_USD: '128.02' } });
  const sale = { ...ORDER, side: 'sell', quantity: 2, limitPrice: '64.00' };
  state.bid = 64;
  state.ask = 64.01;
  for (const offset of [-15_000, 2_000]) {
    state.quoteTimeOffset = offset;
    assert.equal((await perform(sale)).operation.phase, 'ready');
  }
  for (const offset of [-15_001, 2_001]) {
    state.quoteTimeOffset = offset;
    await assert.rejects(perform(sale), { code: 'stale-broker-quote' });
  }
  state.quoteTimeOffset = 0;
  const preview = (await perform(sale)).operation;
  state.ask = 64.0101;
  await assert.rejects(perform(confirm(preview)), /configured order cap/u);
  await assert.rejects(perform(sale), /configured order cap/u);
  assert.deepEqual(writes(), []);
});

test('ambiguous submit remains isolated across restart and only looks up client order ID', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'fundroom-broker-test-'));
  const database = join(directory, 'broker.sqlite');
  const fixture = stub();
  let broker = createBroker({ env: ENV, database, fetchImpl: fixture.fetchImpl, now: () => fixture.state.time });
  t.after(async () => {
    broker.close();
    await rm(database, { force: true });
    await rmdir(directory);
  });
  const invoke = (input) => broker.perform(SESSION, input, TOKEN);
  const { operation: first } = await invoke(ORDER);
  fixture.state.ambiguous = 'hidden';
  const uncertain = await invoke(confirm(first));
  assert.equal(uncertain.operation.phase, 'unknown');
  assert.equal(uncertain.operation.clientOrderId, first.id);
  broker.close();
  broker = createBroker({ env: ENV, database, fetchImpl: fixture.fetchImpl, now: () => fixture.state.time });
  const { operation: second } = await invoke(ORDER);
  await assert.rejects(invoke(confirm(second)), { code: 'broker-operation-in-flight' });
  assert.deepEqual(await invoke(confirm(first)), uncertain);
  fixture.state.ambiguous = null;
  const resolved = await invoke({ action: 'lookup', environment: 'paper', id: first.id });
  assert.equal(resolved.found, true);
  assert.equal(resolved.operation.phase, 'recorded');
  assert.equal(resolved.operation.order.clientOrderId, first.id);
  assert.equal(fixture.writes().length, 1);
  broker.close();
  const loweredCap = { ...ENV, ALPACA_PAPER_MAX_ORDER_USD: '100' };
  broker = createBroker({ env: loweredCap, database, fetchImpl: fixture.fetchImpl, now: () => fixture.state.time });
  await assert.rejects(invoke(confirm(second)), /configured order limit/u);
  assert.equal(fixture.writes().length, 1);
});

test('cancellation requires its own confirmation and checks for partial fills and pending cancellation', async (t) => {
  const { perform, state, writes } = setup(t);
  const { operation: order } = await perform(ORDER);
  await perform(confirm(order));
  const cancelIntent = { action: 'previewCancel', environment: 'paper', id: order.id };
  const { operation: staleCancel } = await perform(cancelIntent);
  assert.equal(staleCancel.confirmation, 'CANCEL PAPER');
  const record = state.orders.get(order.id);
  record.status = 'partially_filled';
  record.filled_qty = '1';
  await assert.rejects(perform(confirm(staleCancel)), { code: 'broker-preview-changed' });
  assert.equal(writes().length, 1);
  state.holdCancellation = true;
  const { operation: freshCancel } = await perform(cancelIntent);
  const receipt = await perform(confirm(freshCancel));
  assert.equal(receipt.operation.phase, 'cancelRequested');
  await assert.rejects(perform(cancelIntent), /already open/u);
  assert.deepEqual(await perform(confirm(freshCancel)), receipt);
  record.status = 'canceled';
  const { operation: canceled } = await perform({ action: 'lookup', environment: 'paper', id: freshCancel.id });
  assert.equal(canceled.phase, 'recorded');
  assert.equal(canceled.order.brokerStatus, 'canceled');
  assert.deepEqual(writes().map(({ method }) => method), ['POST', 'DELETE']);
});

test('broker HTTP routes require same origin and do not use the replay session', async (t) => {
  const fixture = stub();
  const { server, host } = await createApp({ env: { ...ENV, FUNDROOM_DB_PATH: ':memory:', FUNDROOM_PORT: '0' }, fetchImpl: fixture.fetchImpl });
  server.listen(0, host);
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const settings = await fetch(origin + '/api/broker/status');
  assert.equal(settings.status, 200);
  const cookie = settings.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^fundroom_broker_operator_v1=/u);
  const consolePage = await fetch(origin + '/broker.html');
  assert.equal(consolePage.status, 200);
  assert.match(await consolePage.text(), /\/broker-view\.mjs/u);
  const execute = (headers = {}) => fetch(origin + '/api/broker/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fundroom-broker-token': TOKEN, ...headers }, body: JSON.stringify(ORDER),
  });
  assert.equal((await execute({ cookie })).status, 403);
  assert.equal((await execute({ origin })).status, 401);
  assert.equal((await execute({ cookie, origin, 'x-forwarded-for': '192.0.2.10' })).status, 403);
  assert.equal(fixture.calls.length, 0);
  fixture.state.time = Date.now();
  const valid = await execute({ cookie, origin });
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).operation.phase, 'ready');
  assert.equal(fixture.writes().length, 0);
});
