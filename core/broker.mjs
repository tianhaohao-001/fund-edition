import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SYMBOL = /^[A-Z]{1,6}(?:\.[A-Z])?$/u;
const ORDER_UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const HOSTS = { paper: 'https://paper-api.alpaca.markets', live: 'https://api.alpaca.markets' };
const DATA_HOST = 'https://data.alpaca.markets';
const OPEN_ORDERS = new Set(['new', 'partially_filled', 'accepted', 'pending_new', 'accepted_for_bidding', 'calculated']);
const CLOSED_ORDERS = new Set(['filled', 'done_for_day', 'canceled', 'expired', 'replaced', 'rejected']);
const RECEIPT_STATUSES = new Set([...OPEN_ORDERS, ...CLOSED_ORDERS, 'pending_cancel', 'pending_replace', 'stopped', 'suspended', 'held']);
const PREVIEW_LIFETIME = 120_000;
const MAX_QUOTE_AGE = 15_000;
const REQUEST_TIMEOUT = 4_000;
const MAX_CAP = { paper: 2_500_000, live: 1_000_000 };

export class BrokerError extends Error {
  constructor(status, message, code = 'broker-error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function check(condition, status, message, code) {
  if (!condition) throw new BrokerError(status, message, code);
}

function keyPair(env, prefix) {
  const id = env[prefix + '_KEY_ID']?.trim();
  const secret = env[prefix + '_SECRET_KEY']?.trim();
  return id && secret ? { id, secret } : null;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function priceCents(value, allowExtraPrecision = false) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const maxDecimals = allowExtraPrecision ? 9 : 2;
  const pattern = new RegExp(`^(\\d{1,12})(?:\\.(\\d{1,${maxDecimals}}))?$`, 'u');
  const pieces = String(value).match(pattern);
  if (!pieces) return null;
  return Number(pieces[1]) * 100 + Number((pieces[2] ?? '').padEnd(2, '0').slice(0, 2));
}

function configuration(env, local) {
  const operatorToken = env.FUNDROOM_BROKER_OPERATOR_TOKEN;
  const data = keyPair(env, 'ALPACA_DATA');
  const feed = env.ALPACA_DATA_FEED?.trim() || 'iex';
  const paperKeys = keyPair(env, 'ALPACA_PAPER_TRADING');
  const liveKeys = keyPair(env, 'ALPACA_LIVE_TRADING');
  const readOnlyPaper = keyPair(env, 'ALPACA_PAPER');
  const sameKey = (a, b) => Boolean(a && b && (a.id === b.id || a.secret === b.secret));
  const localOnly = local && env.FUNDROOM_PUBLIC_DEMO !== 'true';
  const operatorTag = typeof operatorToken === 'string' && /^[A-Za-z0-9_-]{32,128}$/u.test(operatorToken) ? digest(operatorToken) : null;
  const mode = (name, keys, other) => {
    const prefix = 'ALPACA_' + name.toUpperCase();
    const cap = priceCents(env[prefix + '_MAX_ORDER_USD']);
    const symbols = [...new Set((env[prefix + '_ALLOWED_SYMBOLS'] ?? '').split(',').map((part) => part.trim().toUpperCase()).filter(Boolean))];
    const configured = localOnly && env[prefix + '_TRADING_ENABLED'] === 'true';
    const valid = keys && data && operatorTag && cap !== null && cap >= 100 && cap <= MAX_CAP[name]
      && symbols.length > 0 && symbols.length <= 30 && symbols.every((symbol) => SYMBOL.test(symbol))
      && ['iex', 'sip'].includes(feed) && !sameKey(keys, other) && !sameKey(keys, data)
      && (name !== 'live' || !sameKey(keys, readOnlyPaper));
    return { configured, enabled: Boolean(configured && valid), keys, cap, symbols };
  };
  return { operatorTag, data, feed, modes: { paper: mode('paper', paperKeys, liveKeys), live: mode('live', liveKeys, paperKeys) } };
}

function remote({ host, path, keys, fetchImpl, method = 'GET', body }) {
  const request = {
    method, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    headers: { Accept: 'application/json', 'APCA-API-KEY-ID': keys.id, 'APCA-API-SECRET-KEY': keys.secret },
  };
  if (body) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(body);
  }
  return fetchImpl(new URL(path, host), request);
}

async function readRemote(options, { missing = false } = {}) {
  try {
    const result = await remote(options);
    if (result.status === 404 && missing) {
      await result.body?.cancel();
      return null;
    }
    if (!result.ok) {
      await result.body?.cancel();
      throw new Error('Broker read rejected');
    }
    return await result.json();
  } catch {
    throw new BrokerError(502, 'Alpaca could not verify this request. Check the account, permissions and data feed.', 'broker-read-failed');
  }
}

function orderIntent(input, config) {
  const symbol = typeof input.symbol === 'string' ? input.symbol.trim().toUpperCase() : '';
  const side = input.side;
  const quantity = typeof input.quantity === 'string' && /^\d{1,5}$/u.test(input.quantity) ? Number(input.quantity) : input.quantity;
  const limitCents = priceCents(input.limitPrice);
  check(SYMBOL.test(symbol) && config.symbols.includes(symbol), 400, 'Choose a ticker on the server’s allowed list.');
  check(side === 'buy' || side === 'sell', 400, 'Choose a buy or sell order.');
  check(Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 10_000, 400, 'Use a positive whole number of shares.');
  check(limitCents !== null && limitCents >= 100, 400, 'Enter a limit price of at least $1.00 with at most two decimal places.');
  check(quantity * limitCents <= config.cap, 400, 'This order exceeds the account’s configured order limit.');
  return { symbol, side, quantity, limitPrice: (limitCents / 100).toFixed(2), maxNotional: quantity * limitCents / 100 };
}

function minimumShares(value) {
  return typeof value === 'string' && /^\d{1,12}(?:\.\d{1,9})?$/u.test(value) ? Number(value.split('.')[0]) : null;
}

function contextFor(environment, config, fetchImpl) {
  const options = { host: HOSTS[environment], keys: config.keys, fetchImpl };
  return {
    get: (path, flags) => readRemote({ ...options, path }, flags),
    write: (method, path, body) => remote({ ...options, path, method, body }),
  };
}

function validateQuote(document, symbol, now) {
  const { t, bp, ap } = document?.quote ?? {};
  const timestamp = typeof t === 'string' ? Date.parse(t) : NaN;
  const age = now - timestamp;
  check(document?.symbol === symbol && Number.isFinite(bp) && Number.isFinite(ap) && bp > 0 && ap >= bp
    && Number.isFinite(age) && age >= -2_000 && age <= MAX_QUOTE_AGE, 409,
  'A fresh, valid Alpaca bid and ask are required to proceed.', 'stale-broker-quote');
  return { bid: bp, ask: ap, quotedAt: t };
}

function checkAccount(account, { symbol, side, quantity, limitPrice }, position, activeOrders) {
  check(ORDER_UUID.test(account?.id ?? '') && account?.status === 'ACTIVE' && account.currency === 'USD'
    && account.trading_blocked === false && account.account_blocked === false, 409,
  'The broker account is not available for USD trading.');
  check(Array.isArray(activeOrders) && activeOrders.length === 0, 409,
    'Resolve the broker account’s open orders before submitting another one.');
  if (side === 'buy') {
    const cash = priceCents(account.cash, true);
    const buyingPower = priceCents(account.buying_power, true);
    check(cash !== null && buyingPower !== null && quantity * priceCents(limitPrice) <= Math.min(cash, buyingPower), 409,
      'This order exceeds the verified available cash or buying power.');
  } else {
    const available = minimumShares(position?.qty_available);
    const held = minimumShares(position?.qty);
    check(position?.symbol === symbol && position?.side === 'long' && available !== null && held !== null
      && quantity <= Math.min(available, held), 409, 'The account does not have enough available long shares.');
  }
}

async function checkIntent(context, configuration, intent, { now, fetchImpl }) {
  const symbol = encodeURIComponent(intent.symbol);
  const quoteOptions = {
    host: DATA_HOST, path: `/v2/stocks/${symbol}/quotes/latest?feed=${configuration.feed}`,
    keys: configuration.data, fetchImpl,
  };
  const [account, clock, asset, orders, position, tradingPolicy, market] = await Promise.all([
    context.get('/v2/account'), context.get('/v2/clock'), context.get('/v2/assets/' + symbol),
    context.get('/v2/orders?status=open&limit=1'),
    intent.side === 'sell' ? context.get('/v2/positions/' + symbol, { missing: true }) : null,
    intent.side === 'sell' ? context.get('/v2/account/configurations') : null,
    readRemote(quoteOptions),
  ]);
  const currentTime = now();
  const clockAt = Date.parse(clock?.timestamp);
  const closeAt = Date.parse(clock?.next_close);
  check(clock?.is_open === true && Math.abs(currentTime - clockAt) <= 60_000 && closeAt - currentTime >= 30_000, 409,
    'Broker clock does not confirm a current regular market session.');
  check(asset?.symbol === intent.symbol && asset?.class === 'us_equity' && asset?.status === 'active' && asset?.tradable === true, 409,
    'Alpaca did not verify an active, tradable U.S. equity.');
  check(intent.side !== 'sell' || tradingPolicy?.no_shorting === true, 409,
    'The Alpaca account must have long-only mode enabled for sell orders.');
  checkAccount(account, intent, position, orders);
  const quote = validateQuote(market, intent.symbol, currentTime);
  // Compare the decimal quote to a whole-cent ceiling derived from the integer budget.
  const maxQuotePerShare = Math.floor(configuration.cap / intent.quantity) / 100;
  check(intent.side !== 'sell' || quote.ask <= maxQuotePerShare, 409,
    'This sale exceeds the configured order cap at the current quote.');
  return { accountTag: digest(account.id), ...quote, feed: configuration.feed };
}

function parseReceipt(result, expectedClientId, intent) {
  if (!result || !ORDER_UUID.test(result.id ?? '') || result.client_order_id !== expectedClientId
    || !RECEIPT_STATUSES.has(result.status) || result.symbol !== intent.symbol || result.side !== intent.side
    || !/^\d+(?:\.0+)?$/u.test(result.qty ?? '') || Number(result.qty) !== intent.quantity
    || priceCents(result.limit_price, true) === null || Number(result.limit_price) !== Number(intent.limitPrice)
    || (result.type ?? result.order_type) !== 'limit' || result.time_in_force !== 'day' || result.extended_hours !== false) return null;
  return {
    brokerOrderId: result.id,
    clientOrderId: result.client_order_id,
    brokerStatus: result.status,
    filledQuantity: typeof result.filled_qty === 'string' && /^\d{1,8}(?:\.\d{1,9})?$/u.test(result.filled_qty) ? result.filled_qty : null,
    averageFillPrice: typeof result.filled_avg_price === 'string' && /^\d{1,8}(?:\.\d{1,9})?$/u.test(result.filled_avg_price) ? result.filled_avg_price : null,
  };
}

function openJournal(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA busy_timeout = 4000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS broker_operations (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, environment TEXT NOT NULL, credential_tag TEXT NOT NULL,
      kind TEXT NOT NULL, phase TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      detail TEXT NOT NULL, receipt TEXT
    );
    CREATE INDEX IF NOT EXISTS broker_account_operations ON broker_operations(environment, credential_tag, phase);
  `);
  const insert = db.prepare(`INSERT INTO broker_operations VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, NULL)`);
  const get = db.prepare('SELECT * FROM broker_operations WHERE id = ? AND environment = ? AND credential_tag = ?');
  const pendingCancel = db.prepare(`SELECT id FROM broker_operations WHERE environment = ? AND credential_tag = ?
    AND kind = 'cancel' AND phase IN ('checking', 'sending', 'unknown', 'cancelRequested')
    AND json_extract(detail, '$.previous.brokerOrderId') = ? LIMIT 1`);
  const history = db.prepare(`SELECT * FROM broker_operations WHERE environment = ? AND credential_tag = ?
      AND phase IN ('sending', 'unknown', 'recorded', 'rejected', 'cancelRequested')
      ORDER BY (phase IN ('sending', 'unknown', 'cancelRequested')) DESC, created_at DESC LIMIT 30`);
  const ageOut = db.prepare(`UPDATE broker_operations SET phase = 'invalid' WHERE phase IN ('ready', 'checking') AND expires_at <= ?`);
  const cleanExpired = db.prepare(`DELETE FROM broker_operations WHERE phase = 'invalid' AND expires_at < ?`);
  const claim = db.prepare(`UPDATE broker_operations AS current SET phase = 'checking' WHERE current.id = ?
      AND current.phase = 'ready' AND current.expires_at > ?
      AND NOT EXISTS (SELECT 1 FROM broker_operations AS pending
        WHERE pending.environment = current.environment AND pending.credential_tag = current.credential_tag
        AND (pending.phase IN ('checking', 'sending', 'unknown') OR
          (pending.phase = 'cancelRequested' AND current.kind = 'cancel'
            AND json_extract(current.detail, '$.previous.brokerOrderId') = json_extract(pending.detail, '$.previous.brokerOrderId'))))`);
  const dispatch = db.prepare(`UPDATE broker_operations SET phase = 'sending'
      WHERE id = ? AND phase = 'checking' AND expires_at > ?`);
  const update = db.prepare('UPDATE broker_operations SET phase = ?, receipt = ? WHERE id = ? AND phase = ?');
  return {
    ageOut(time) { ageOut.run(time); cleanExpired.run(time - 86_400_000); },
    add({ id, sessionId, environment, tag, kind, time, detail }) {
      insert.run(id, sessionId, environment, tag, kind, time, time + PREVIEW_LIFETIME, JSON.stringify(detail));
    },
    get, history, pendingCancel, claim, dispatch, update, close: () => db.close(),
  };
}

function presentation(row) {
  const details = JSON.parse(row.detail);
  const { accountTag, ...market } = details.market ?? {};
  return {
    id: row.id, environment: row.environment, kind: row.kind, phase: row.phase,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    intent: details.intent, market: details.market ? market : null,
    clientOrderId: row.kind === 'order' ? row.id : details.previous.clientOrderId,
    order: row.receipt ? JSON.parse(row.receipt) : details.previous ?? null,
    confirmation: row.phase === 'ready' ? (row.kind === 'order' ? 'SUBMIT ' : 'CANCEL ') + row.environment.toUpperCase() : null,
  };
}

export function createBroker({ env = process.env, local = true, database = ':memory:', fetchImpl = fetch, now = Date.now } = {}) {
  const config = configuration(env, local);
  const modes = Object.fromEntries(Object.entries(config.modes).map(([name, entry]) => [name, {
    enabled: entry.enabled, configured: entry.configured, allowedSymbols: entry.enabled ? entry.symbols : [],
    maxOrderUsd: entry.enabled ? entry.cap / 100 : null,
  }]));
  const status = { enabled: Object.values(modes).some(({ enabled }) => enabled), modes, feed: config.feed };
  const journal = status.enabled ? openJournal(database) : null;

  function authorize(token, environment) {
    check(status.enabled && journal, 403, 'Broker trading is disabled on this instance.', 'broker-disabled');
    check(typeof token === 'string' && token.length >= 32 && token.length <= 128
      && timingSafeEqual(Buffer.from(digest(token)), Buffer.from(config.operatorTag)), 401,
    'Enter the configured local broker operator token.', 'broker-authorization');
    check(typeof environment === 'string' && Object.hasOwn(config.modes, environment) && config.modes[environment].enabled, 403,
      'This broker environment is disabled.', 'broker-disabled');
    return config.modes[environment];
  }

  function verifiedRow(id, environment, tag, kind) {
    check(typeof id === 'string' && ORDER_UUID.test(id), 400, 'Enter a valid operation identifier.');
    const row = journal.get.get(id, environment, tag);
    check(row && (!kind || row.kind === kind), 404, 'That operation was not found in this broker environment.');
    return row;
  }

  async function reconcile(context, row, detail, { missing = true } = {}) {
    try {
      const key = row.kind === 'order' ? row.id : detail.previous.clientOrderId;
      const order = await context.get('/v2/orders:by_client_order_id?client_order_id=' + encodeURIComponent(key), { missing });
      const result = parseReceipt(order, key, detail.intent);
      if (row.kind === 'cancel' && result?.brokerOrderId !== detail.previous.brokerOrderId) return null;
      return result;
    } catch {
      return null;
    }
  }

  async function submitOrder(context, row, detail) {
    let rejected = false;
    try {
      const response = await context.write('POST', '/v2/orders', {
        symbol: detail.intent.symbol, side: detail.intent.side, qty: String(detail.intent.quantity),
        client_order_id: row.id, type: 'limit', limit_price: detail.intent.limitPrice,
        time_in_force: 'day', extended_hours: false,
        ...(detail.intent.side === 'sell' ? { position_intent: 'sell_to_close' } : {}),
      });
      if (response.ok) {
        const result = parseReceipt(await response.json(), row.id, detail.intent);
        if (result) return { phase: 'recorded', result };
      } else {
        rejected = [400, 401, 403, 429].includes(response.status);
        await response.body?.cancel();
      }
    } catch {
      // A timeout can occur after Alpaca accepted the POST.
    }
    const result = await reconcile(context, row, detail);
    return { phase: result ? 'recorded' : rejected ? 'rejected' : 'unknown', result };
  }

  async function cancelOrder(context, row, detail) {
    let accepted = false;
    let rejected = false;
    try {
      const response = await context.write('DELETE', '/v2/orders/' + detail.previous.brokerOrderId);
      accepted = response.status === 204;
      rejected = [400, 401, 403, 422, 429].includes(response.status);
      await response.body?.cancel();
    } catch {
      // Do not reissue this cancellation on ambiguous network failure.
    }
    const result = await reconcile(context, row, detail);
    if (CLOSED_ORDERS.has(result?.brokerStatus)) return { phase: 'recorded', result };
    if (accepted || result?.brokerStatus === 'pending_cancel') return { phase: 'cancelRequested', result: result ?? detail.previous };
    return { phase: rejected ? 'rejected' : 'unknown', result };
  }

  async function verifyAgain(context, row, detail) {
    if (row.kind === 'order') {
      const selected = config.modes[row.environment];
      const intent = orderIntent(detail.intent, selected);
      const fresh = await checkIntent(context, { ...config, cap: selected.cap }, intent, { now, fetchImpl });
      check(fresh.accountTag === detail.market.accountTag && fresh.bid === detail.market.bid && fresh.ask === detail.market.ask
        && fresh.feed === detail.market.feed && Date.parse(fresh.quotedAt) >= Date.parse(detail.market.quotedAt), 409,
      'Account or bid and ask changed. Review a new preview.', 'broker-preview-changed');
    } else {
      const current = await reconcile(context, row, detail);
      check(current && OPEN_ORDERS.has(current.brokerStatus) && current.brokerStatus === detail.previous.brokerStatus
        && current.filledQuantity !== null && current.filledQuantity === detail.previous.filledQuantity, 409,
      'The order state changed. Review the latest broker receipt.', 'broker-preview-changed');
    }
  }

  async function perform(sessionId, body, token) {
    const { action, environment } = body;
    const selected = authorize(token, environment);
    const tag = digest(selected.keys.id);
    const context = contextFor(environment, selected, fetchImpl);
    journal.ageOut(now());
    if (action === 'history') return { operations: journal.history.all(environment, tag).map(presentation) };
    if (action === 'previewOrder') {
      const intent = orderIntent(body, selected);
      const market = await checkIntent(context, { ...config, cap: selected.cap }, intent, { now, fetchImpl });
      const id = randomUUID();
      journal.add({ id, sessionId, environment, tag, kind: 'order', time: now(), detail: { intent, market } });
      return { operation: presentation(verifiedRow(id, environment, tag, 'order')) };
    }
    if (action === 'previewCancel') {
      const origin = verifiedRow(body.id, environment, tag, 'order');
      check(['sending', 'unknown', 'recorded'].includes(origin.phase), 409, 'Only orders previously sent from this workspace can be canceled.');
      const { intent } = JSON.parse(origin.detail);
      const previous = await reconcile(context, origin, { intent });
      check(previous && OPEN_ORDERS.has(previous.brokerStatus) && previous.filledQuantity !== null, 409,
        'Alpaca did not verify an open, cancelable order from this workspace.');
      check(!journal.pendingCancel.get(environment, tag, previous.brokerOrderId), 409,
        'A cancellation for this order is already open. Check its latest receipt.');
      const id = randomUUID();
      journal.add({ id, sessionId, environment, tag, kind: 'cancel', time: now(), detail: { intent, previous } });
      return { operation: presentation(verifiedRow(id, environment, tag, 'cancel')) };
    }
    if (action === 'lookup') {
      const row = verifiedRow(body.id, environment, tag);
      check(['sending', 'unknown', 'recorded', 'rejected', 'cancelRequested'].includes(row.phase), 409,
        'This preview does not have a broker receipt to look up.');
      const result = await reconcile(context, row, JSON.parse(row.detail));
      if (result) {
        let phase = row.phase;
        if (row.kind === 'order' || CLOSED_ORDERS.has(result.brokerStatus)) phase = 'recorded';
        else if (result.brokerStatus === 'pending_cancel') phase = 'cancelRequested';
        journal.update.run(phase, JSON.stringify(result), row.id, row.phase);
      }
      return { operation: presentation(verifiedRow(row.id, environment, tag)), found: Boolean(result) };
    }
    if (action === 'confirmOrder' || action === 'confirmCancel') {
      check(Object.keys(body).every((field) => ['action', 'id', 'environment', 'confirmation'].includes(field)), 400,
        'Review a new preview to change order details.');
      const kind = action === 'confirmOrder' ? 'order' : 'cancel';
      const row = verifiedRow(body.id, environment, tag, kind);
      check(row.session_id === sessionId, 403, 'Return to the browser that requested this preview.');
      const phrase = (kind === 'order' ? 'SUBMIT ' : 'CANCEL ') + environment.toUpperCase();
      check(body.confirmation === phrase, 400, 'Type the exact confirmation phrase shown on the preview.');
      if (['sending', 'unknown', 'recorded', 'rejected', 'cancelRequested'].includes(row.phase)) return { operation: presentation(row) };
      check(row.phase === 'ready' && row.expires_at > now(), 409, 'This preview expired or is already being checked. Review the current broker status.');
      check(journal.claim.run(row.id, now()).changes === 1, 409,
        'A broker operation is already in progress or needs reconciliation. Check the receipt before submitting another.', 'broker-operation-in-flight');
      const detail = JSON.parse(row.detail);
      try {
        await verifyAgain(context, row, detail);
        check(journal.dispatch.run(row.id, now()).changes === 1, 409, 'This preview expired during validation.');
      } catch (error) {
        journal.update.run('invalid', null, row.id, 'checking');
        throw error;
      }
      const outcome = await (kind === 'order' ? submitOrder : cancelOrder)(context, row, detail);
      journal.update.run(outcome.phase, outcome.result ? JSON.stringify(outcome.result) : null, row.id, 'sending');
      return { operation: presentation(verifiedRow(row.id, environment, tag)) };
    }
    throw new BrokerError(400, 'Choose a supported broker operation.');
  }

  return { status, perform, close: () => journal?.close() };
}
