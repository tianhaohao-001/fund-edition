const DATA_URL = 'https://data.alpaca.markets/v2/stocks/snapshots';
const PAPER_URL = 'https://paper-api.alpaca.markets/v2/account';
const DATA_FEEDS = new Set(['iex', 'sip', 'delayed_sip']);
const DATA_FIELDS = ['ALPACA_DATA_KEY_ID', 'ALPACA_DATA_SECRET_KEY'];
const PAPER_FIELDS = ['ALPACA_PAPER_KEY_ID', 'ALPACA_PAPER_SECRET_KEY'];
const ACCOUNT_STATUSES = new Set([
  'INACTIVE', 'PAPER_ONLY', 'ONBOARDING', 'SUBMISSION_FAILED', 'SUBMITTED', 'ACCOUNT_UPDATED',
  'APPROVAL_PENDING', 'ACTIVE', 'REJECTED', 'ACCOUNT_CLOSED', 'APPROVED', 'ACCOUNT_CLOSED_PENDING',
  'ACTION_REQUIRED', 'LIMITED',
]);
const MAX_QUOTE_AGE_SECONDS = 300;

export class AlpacaConnectionError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AlpacaConnectionError';
    this.status = status;
  }
}

function credentials(env, [idField, secretField]) {
  const keyId = env[idField]?.trim();
  const secret = env[secretField]?.trim();
  return keyId && secret ? { keyId, secret } : null;
}

function dataFeed(env) {
  const feed = env.ALPACA_DATA_FEED?.trim() || 'iex';
  return DATA_FEEDS.has(feed) ? feed : null;
}

export function connectionStatus(env = process.env) {
  const publicDemo = env.FUNDROOM_PUBLIC_DEMO === 'true';
  const feed = publicDemo ? 'iex' : dataFeed(env);
  const marketConfigured = !publicDemo && credentials(env, DATA_FIELDS) !== null;
  const paperConfigured = !publicDemo && credentials(env, PAPER_FIELDS) !== null;
  return {
    market: { configured: marketConfigured, enabled: marketConfigured && feed !== null, feed, environment: 'market-data' },
    paper: { configured: paperConfigured, enabled: paperConfigured, environment: 'paper' },
  };
}

function requireAuthorizedConnection(env, fields) {
  if (env.FUNDROOM_PUBLIC_DEMO === 'true') {
    throw new AlpacaConnectionError(403, 'Alpaca connections are disabled in the public replay workspace.');
  }
  const keys = credentials(env, fields);
  if (!keys) throw new AlpacaConnectionError(503, 'Set up this Alpaca connection on the server to use it.');
  return keys;
}

async function readAlpaca(url, { keyId, secret }, fetchImpl) {
  const signal = AbortSignal.timeout(7_000);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', signal,
      headers: { 'APCA-API-KEY-ID': keyId, 'APCA-API-SECRET-KEY': secret, Accept: 'application/json' },
    });
  } catch {
    if (signal.aborted) throw new AlpacaConnectionError(504, 'Alpaca took too long to respond.');
    throw new AlpacaConnectionError(502, 'Alpaca is temporarily unreachable.');
  }
  if (!response.ok) {
    if (response.status === 429) throw new AlpacaConnectionError(429, 'Alpaca is limiting requests. Wait before trying again.');
    if ([401, 403].includes(response.status)) throw new AlpacaConnectionError(502, 'Alpaca denied this connection. Check the server credentials and feed access.');
    throw new AlpacaConnectionError(502, 'Alpaca did not return this report.');
  }
  try {
    return await response.json();
  } catch {
    if (signal.aborted) throw new AlpacaConnectionError(504, 'Alpaca took too long to respond.');
    throw new AlpacaConnectionError(502, 'Alpaca returned an unreadable response.');
  }
}

function price(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export async function loadMarketSnapshot(symbol, { env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const normalized = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
  if (!/^[A-Z]{1,6}(?:\.[A-Z])?$/.test(normalized)) {
    throw new AlpacaConnectionError(400, 'Enter a valid US stock ticker.');
  }
  const keys = requireAuthorizedConnection(env, DATA_FIELDS);
  const feed = dataFeed(env);
  if (feed === null) throw new AlpacaConnectionError(503, 'Choose a supported Alpaca feed on the server.');
  const endpoint = new URL(DATA_URL);
  endpoint.searchParams.set('symbols', normalized);
  endpoint.searchParams.set('feed', feed);
  const document = await readAlpaca(endpoint, keys, fetchImpl);
  const snapshot = document?.[normalized];
  if (!snapshot || typeof snapshot !== 'object') throw new AlpacaConnectionError(404, 'Alpaca did not return a snapshot for this ticker.');

  const bid = price(snapshot.latestQuote?.bp);
  const ask = price(snapshot.latestQuote?.ap);
  const quoteAt = timestamp(snapshot.latestQuote?.t);
  const capturedAt = now();
  const ageSeconds = quoteAt ? Math.floor((capturedAt - Date.parse(quoteAt)) / 1_000) : null;
  const validQuote = bid !== null && ask !== null && bid <= ask && quoteAt !== null;
  const freshness = !validQuote ? 'missing' : ageSeconds >= -30 && ageSeconds <= MAX_QUOTE_AGE_SECONDS ? 'fresh' : 'stale';
  return {
    symbol: normalized, source: 'Alpaca Market Data', feed, bid: validQuote ? bid : null, ask: validQuote ? ask : null, quoteAt,
    lastTradePrice: price(snapshot.latestTrade?.p), tradeAt: timestamp(snapshot.latestTrade?.t),
    capturedAt: new Date(capturedAt).toISOString(), ageSeconds, freshness,
  };
}

export async function loadPaperAccount({ env = process.env, fetchImpl = fetch } = {}) {
  const keys = requireAuthorizedConnection(env, PAPER_FIELDS);
  const account = await readAlpaca(PAPER_URL, keys, fetchImpl);
  if (!account || !ACCOUNT_STATUSES.has(account.status)) {
    throw new AlpacaConnectionError(502, 'Alpaca did not return a recognized paper account status.');
  }
  return {
    source: 'Alpaca Paper', environment: 'paper', status: account.status,
    currency: account.currency === 'USD' ? 'USD' : null,
    accountBlocked: typeof account.account_blocked === 'boolean' ? account.account_blocked : null,
    tradingBlocked: typeof account.trading_blocked === 'boolean' ? account.trading_blocked : null,
  };
}
