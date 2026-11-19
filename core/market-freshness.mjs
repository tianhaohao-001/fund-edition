import { daysBefore, expectedClose, isSession, marketDay, quoteSession, timeZone } from './market-freshness-calendar.mjs';

const symbols = new Set(['VWELX', 'VYM', 'VCIT', 'VOO']);
const studioAssets = new Set(['NVDA', 'MSFT', 'AAPL', 'SPY']);
const providers = ['Nasdaq', 'Vanguard'];
const cacheTtl = 10 * 60_000;
const retryAfter = 60_000;

export function describeIntraday(snapshot) {
  const delayed = snapshot.feed === 'delayed_sip';
  const freshness = delayed && snapshot.freshness === 'fresh' ? 'delayed' : snapshot.freshness;
  const reason = freshness === 'missing' ? 'invalid-quote' : delayed ? 'delayed-feed'
    : freshness === 'stale' ? 'quote-age-out-of-range' : 'within-snapshot-age-limit';
  return { ...snapshot, freshness, kind:'intraday-quote', provider:snapshot.source, asOf:snapshot.quoteAt,
    retrievedAt:snapshot.capturedAt, marketSession:quoteSession(snapshot.quoteAt), timeZone, reason,
    delayStatus:delayed ? 'delayed' : 'direct-feed', executionEligible:false };
}

export function referenceSymbol(input) {
  const symbol = typeof input === 'string' ? input.trim().toUpperCase() : '';
  return symbols.has(symbol) ? symbol : null;
}

function dateOf(raw) {
  const match = typeof raw === 'string' && /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (!match) return null;
  const date = [match[3], match[1], match[2]].join('-');
  const epoch = Date.parse(date+'T12:00:00Z');
  return Number.isFinite(epoch) && new Date(epoch).toISOString().startsWith(date) && isSession(date) ? date : null;
}

function priceOf(value) {
  if (typeof value !== 'string' || !/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value.replace(/[$,]/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function metadata(provider, symbol) {
  const fund = symbol === 'VWELX';
  const stock = studioAssets.has(symbol) && symbol !== 'SPY';
  const kind = provider === 'Vanguard' ? 'issuer-nav' : fund ? 'fund-end-of-day' : stock ? 'stock-close' : 'etf-close';
  const ticker = symbol.toLowerCase();
  const sourceUrl = provider === 'Vanguard'
    ? 'https://investor.vanguard.com/investment-products/'+(fund ? 'mutual-funds' : 'etfs')+'/profile/'+ticker
    : 'https://www.nasdaq.com/market-activity/'+(fund ? 'mutual-fund' : stock ? 'stocks' : 'etf')+'/'+ticker+'/historical';
  return { symbol, provider, kind, sourceUrl, currency:'USD', marketSession:'regular-close', timeZone,
    delayStatus:'end-of-day', executionEligible:false };
}

async function readJson(url, fetchImpl) {
  const response = await fetchImpl(url, { method:'GET', redirect:'error', signal:AbortSignal.timeout(8000),
    headers:{ Accept:'application/json', 'User-Agent':'Fundroom/1.0 (public fund research)' } });
  if (!response.ok) throw new Error('provider-http-'+response.status);
  const limit = 1_000_000;
  if (!response.body || Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('invalid-document');
  }
  const parts = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > limit) throw new Error('invalid-document');
    parts.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new Error('invalid-document'); }
}

async function fetchObservation(provider, symbol, through, fetchImpl) {
  if (provider === 'Vanguard') {
    const doc = await readJson('https://investor.vanguard.com/irr/funds/profile/'+symbol, fetchImpl);
    if (doc?.dashboard?.ticker !== symbol) throw new Error('invalid-document');
    const asOf = dateOf(doc.dashboard.navPriceAsOfDate);
    const valueUsd = priceOf(doc.dashboard.navPrice);
    if (asOf && asOf <= through && valueUsd !== null) return { asOf, valueUsd };
  } else {
    const url = new URL('https://api.nasdaq.com/api/quote/'+symbol+'/historical');
    url.searchParams.set('assetclass',symbol === 'VWELX' ? 'mutualfunds' : studioAssets.has(symbol) && symbol !== 'SPY' ? 'stocks' : 'etf');
    url.searchParams.set('fromdate',daysBefore(through,14));
    url.searchParams.set('todate',through);
    const doc = await readJson(url.toString(), fetchImpl);
    const table = doc?.data?.tradesTable;
    if (doc?.data?.symbol !== symbol || table?.headers?.close !== 'Close/Last' || !Array.isArray(table.rows)) throw new Error('invalid-document');
    const values = table.rows.map(row => ({ asOf:dateOf(row?.date), valueUsd:priceOf(row?.close) }))
      .filter(row => row.asOf && row.asOf <= through && row.valueUsd !== null)
      .sort((a,b) => b.asOf.localeCompare(a.asOf));
    if (values.length && !values.some(row => row.asOf === values[0].asOf && row.valueUsd !== values[0].valueUsd)) {
      // Conflicting past observations are omitted from the research tape.
      const history = new Map();
      for (const row of values) {
        if (!history.has(row.asOf)) history.set(row.asOf,row.valueUsd);
        else if (history.get(row.asOf)!==row.valueUsd) history.set(row.asOf,null);
      }
      const recentCloses=[...history].filter(([,value])=>value!==null).slice(0,6).reverse()
        .map(([asOf,valueUsd])=>({asOf,valueUsd}));
      return {...values[0],recentCloses};
    }
  }
  throw new Error('invalid-observation');
}

function describe(slot, expected) {
  const { expiresAt, through, ...observation } = slot;
  const status = !slot.asOf ? 'unavailable' : !expected ? 'unknown'
    : slot.asOf < expected ? 'stale' : slot.error ? 'unverified' : 'current';
  const reason = status === 'unavailable' || status === 'unverified' ? slot.error
    : status === 'unknown' ? 'unreviewed-calendar' : status === 'stale' ? 'older-than-last-close' : 'matches-last-close';
  return { ...observation, status, reason, expectedAsOf:expected, cacheExpiresAt:new Date(expiresAt).toISOString() };
}

export function createMarketReference({ fetchImpl = fetch, now = Date.now } = {}) {
  const slots = new Map();
  const inFlight = new Map();
  async function observation(provider, symbol, through) {
    const key = provider+'/'+symbol;
    const old = slots.get(key);
    const started = now();
    if (old && old.expiresAt > started && old.through === through) return old;
    if (inFlight.has(key)) return inFlight.get(key);
    const work = (async () => {
      let entry;
      try {
        const value = await fetchObservation(provider,symbol,through,fetchImpl);
        if (old?.asOf && value.asOf < old.asOf) throw new Error('publication-regressed');
        entry = { ...value, retrievedAt:new Date(now()).toISOString(), error:null };
      } catch (error) {
        const reason = /^(invalid-document|invalid-observation|publication-regressed|provider-http-\d{3})$/.test(error.message)
          ? error.message : error.name === 'TimeoutError' ? 'provider-timeout' : 'provider-unavailable';
        entry = { asOf:old?.asOf ?? null, valueUsd:old?.valueUsd ?? null, retrievedAt:old?.retrievedAt ?? null, error:reason };
      }
      const stamp = now();
      const result = { ...metadata(provider,symbol), ...entry, through, attemptedAt:new Date(stamp).toISOString(),
        expiresAt:stamp + (entry.error ? retryAfter : cacheTtl) };
      slots.set(key,result);
      return result;
    })();
    inFlight.set(key,work);
    try { return await work; } finally { inFlight.delete(key); }
  }
  return async function read(symbol, {studio = false} = {}) {
    symbol = studio && studioAssets.has(symbol) ? symbol : referenceSymbol(symbol);
    if (!symbol) throw new RangeError('Unsupported reference symbol');
    const started = now();
    const through = expectedClose(started) ?? marketDay(started).date;
    const sources = studioAssets.has(symbol) ? ['Nasdaq'] : providers;
    const slots = await Promise.all(sources.map(provider => observation(provider,symbol,through)));
    const finished = now();
    const expected = expectedClose(finished);
    const observations = slots.map(slot => describe(slot,expected));
    const ranked = observations.filter(item => item.asOf).sort((a,b) =>
      b.asOf.localeCompare(a.asOf) || Number(Boolean(a.error))-Number(Boolean(b.error))
      || (symbol === 'VWELX' ? Number(b.provider === 'Vanguard')-Number(a.provider === 'Vanguard') : 0));
    const best = ranked[0] ?? observations[0];
    return { ...best, observations, checkedAt:new Date(finished).toISOString() };
  };
}
