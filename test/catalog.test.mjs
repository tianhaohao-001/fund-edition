import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, catalogBacktest, catalogBuy, catalogSell, catalogQuote } from '../core/catalog.mjs';
import { renderCatalog } from '../web/catalog-view.mjs';
import { getLanguage, setLanguage } from '../web/i18n.mjs';
import { localizedCatalogEntry } from '../web/catalog-copy.mjs';

test('catalog gives each researched fund sources, scope and independently reproducible price experiments', () => {
  assert.equal(CATALOG.filter(item => item.section === 'market').length, 9);
  assert.equal(CATALOG.filter(item => item.section === 'persona').length, 5);
  assert.equal(new Set(CATALOG.map(item => item.id)).size, CATALOG.length);
  for (const item of CATALOG) {
    assert.ok(item.sources.every(source => new URL(source.url).protocol === 'https:'));
    assert.ok(item.team.length >= 4);
    assert.ok(item.limitations);
    const study = catalogBacktest(item.id);
    assert.deepEqual(study, catalogBacktest(item.id));
    assert.ok(study.points.every(point => point.equity >= 0));
    assert.ok(study.trades.every(trade => trade.signalDate < trade.date && trade.cash >= 0));
    assert.ok(Number.isFinite(study.metrics.returnPercent));
  }
  assert.equal(catalogBacktest('contrafund').kind, 'historical');
  assert.equal(catalogBacktest('contrafund').points.length, 12);
  assert.equal(catalogQuote('contrafund').priceCents, 2685);
  assert.equal(catalogQuote('ark-innovation').kind, 'synthetic');
});

test('catalog sandbox debits once, prevents overdraft and closes only its own held units', () => {
  const first = catalogBuy(null, { catalogId: 'contrafund', amount: 1000.01, requestId: 'one' });
  assert.equal(first.cashCents, 899999);
  assert.ok(first.unitsMicros > 0);
  assert.equal(first.environment, 'catalog-paper');
  assert.deepEqual(catalogBuy(first, { catalogId: 'contrafund', amount: 1000.01, requestId: 'one' }), first);
  assert.throws(() => catalogBuy(first, { catalogId: 'contrafund', amount: 10000, requestId: 'overdraft' }), /现金不足/);
  assert.throws(() => catalogSell(first, { catalogId: 'buffett', requestId: 'wrong' }), /不匹配/);
  const closed = catalogSell(first, { catalogId: 'contrafund', requestId: 'close' });
  assert.equal(closed.unitsMicros, 0);
  assert.ok(closed.cashCents < closed.initialCashCents);
  assert.equal(first.history.length, 1);
  assert.equal(closed.history.length, 2);
  assert.deepEqual(catalogSell(closed, { catalogId: 'contrafund', requestId: 'close' }), closed);
  assert.throws(() => catalogSell(closed, { catalogId: 'contrafund', requestId: 'again' }), /没有可卖出/);
});

test('imported prices use prior observations and reject invalid dates or unlabeled data', () => {
  const prices = [
    { date: '2026-01-01', close: 10 }, { date: '2026-02-01', close: 11 },
    { date: '2026-03-01', close: 12 }, { date: '2026-04-01', close: 13 },
    { date: '2026-05-01', close: 14 },
  ];
  const study = catalogBacktest('contrafund', { source: 'Test fixture', prices });
  assert.equal(study.kind, 'imported');
  assert.equal(study.trades[0].signalDate, '2026-03-01');
  assert.equal(study.trades[0].date, '2026-04-01');
  assert.equal(study.trades[0].price, 13.01);
  assert.throws(() => catalogBacktest('contrafund', { prices }), /source/);
  assert.throws(() => catalogBacktest('contrafund', { source: 'Fixture', prices: prices.toReversed() }), /日期/);
  assert.throws(() => catalogBacktest('contrafund', { source: 'Fixture', prices: prices.map((point, index) => index === 1 ? { ...point, date: '2026-02-31' } : point) }), /日期/);
  assert.throws(() => catalogBuy(null, { catalogId: 'buffett', amount: -1, requestId: 'negative' }), /金额/);
  assert.throws(() => catalogBuy(null, { catalogId: 'buffett', amount: 12.345, requestId: 'fraction' }), /金额/);
});

test('ordinary catalog chat shows its real connection state and keeps the hosted path explicit', () => {
  const unavailable = renderCatalog({ catalogId: 'lynch', provider: { chatEnabled: false } });
  assert.match(unavailable, /AI 尚未连接/u);
  assert.match(unavailable, /name="provider" value="harnessrouter"/u);
  assert.match(unavailable, /href="#\/connections"/u);
  assert.match(unavailable, /type="submit"[^>]* disabled>发送问题/u);
  assert.doesNotMatch(unavailable, /本地示范回复|name="provider" value="replay"/u);
  assert.match(unavailable, /<textarea id="catalog-message"[^>]* required><\/textarea>/u);
  const connected = renderCatalog({ catalogId: 'lynch', provider: { chatEnabled: true } });
  assert.match(connected, /Agent 已连接/u);
  assert.doesNotMatch(connected, /type="submit"[^>]* disabled>发送问题/u);
});

test('catalog locale changes first-party research copy without rewriting sources, chat or ledger', () => {
  const previous = getLanguage();
  const account = catalogBuy(null, { catalogId:'contrafund', amount:1000, requestId:'locale-once' });
  const original = structuredClone(account);
  try {
    setLanguage('en-US');
    for (const item of CATALOG) {
      const localized = localizedCatalogEntry(item, 'en-US');
      assert.deepEqual(localized.sources.map(source => source.url), item.sources.map(source => source.url));
      assert.equal(localized.team.length, item.team.length);
      assert.doesNotMatch(renderCatalog({ catalogId:item.id }), /\p{Script=Han}/u);
    }
    const historical = '历史客户原话：保留中文，不要翻译';
    const english = renderCatalog({ catalogId:'contrafund', catalogAccounts:{contrafund:account}, catalogChats:{contrafund:[{role:'user',text:historical}]} });
    assert.match(english, /Invest paper cash/u);
    assert.match(english, /#\/portfolio\?product=catalog%3Acontrafund/u);
    assert.doesNotMatch(english, /data-form="catalog-buy"/u);
    assert.match(english, /Archived strategy sandbox/u);
    assert.doesNotMatch(english, /data-action="catalog-sell"/u);
    assert.ok(english.includes(historical));
    assert.ok(english.includes('Fidelity official month-end NAV'));
    assert.deepEqual(account, original);
    setLanguage('zh-CN');
    assert.match(renderCatalog({catalogId:'contrafund'}), /公开净值，重新计算。/u);
    const directory = renderCatalog();
    assert.match(directory, /名家风格基金/u);
    assert.match(directory, /热门主动基金/u);
    assert.match(directory, /挑选 AI 基金/u);
  } finally { setLanguage(previous); }
});
