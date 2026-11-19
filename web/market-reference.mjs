import { getLanguage, t } from './i18n.mjs';

export function marketReferenceSlot(ticker) {
  const symbol = ticker === 'VWELX' ? 'VWELX' : ticker === 'PSTKX' ? 'VOO' : null;
  if (!symbol) return '';
  const title = ticker === symbol
    ? t('原基金的日终参考值','Original fund end-of-day reference')
    : t('股票代理 VOO 的日终参考值','VOO equity proxy end-of-day reference');
  return '<div data-market-reference="'+symbol+'"><strong>'+title+'</strong><div role="status"></div></div>';
}

function show(report, container) {
  const dateTime = new Intl.DateTimeFormat(getLanguage(), { timeZone:'America/New_York',
    dateStyle:'medium', timeStyle:'short' });
  const usd = new Intl.NumberFormat(getLanguage(), { style:'currency', currency:'USD' });
  const kinds = {
    'issuer-nav':t('发行方净值','Issuer NAV'), 'fund-end-of-day':t('基金日终值','Fund end-of-day value'),
    'etf-close':t('交易所收盘价','Exchange close'),
  };
  const statuses = {
    current:t('已覆盖最近收盘日','Latest completed session'), stale:t('尚未覆盖最近收盘日','Behind last close'),
    unknown:t('交易日历待核验','Calendar unverified'), unavailable:t('暂无可核验数据','Unavailable'),
    unverified:t('保留上次取得的记录','Last successful observation'),
  };
  const list = document.createElement('ul');
  for (const row of report.observations) {
    const item = document.createElement('li');
    const source = document.createElement('a');
    source.href = row.sourceUrl;
    source.target = '_blank';
    source.rel = 'noreferrer';
    source.textContent = row.provider+' ↗';
    item.append(source,' · '+kinds[row.kind]+' · '+statuses[row.status]);
    if (row.asOf && Number.isFinite(row.valueUsd)) item.append(' · '+row.asOf+' · '+usd.format(row.valueUsd));
    if (row.error) item.append(' · '+t('刷新失败','Refresh failed'));
    if (row.retrievedAt) {
      item.append(document.createElement('br'),t('取数时间 ','Retrieved ')+dateTime.format(new Date(row.retrievedAt))+' ET');
    }
    list.append(item);
  }
  const note = document.createElement('p');
  note.textContent = t('按纽约市场交易日核验。日终数据仅供研究。','Checked against New York market sessions. End-of-day data is for research.');
  container.replaceChildren(list,note);
}

export function bindMarketReference(root) {
  for (const panel of root.querySelectorAll('[data-market-reference]')) {
    const details = panel.closest('details');
    const container = panel.querySelector('[role="status"]');
    let inFlight = false;
    let nextRead = 0;
    const update = async () => {
      if (!details.open || inFlight || Date.now() < nextRead) return;
      inFlight = true;
      if (!container.childElementCount) container.textContent = t('正在核对日终资料…','Checking end-of-day sources…');
      try {
        const result = await fetch('/api/market/reference?symbol='+panel.dataset.marketReference);
        if (!result.ok) throw new Error();
        const report = await result.json();
        show(report,container);
        nextRead = Math.min(...report.observations.map(row => Date.parse(row.cacheExpiresAt)));
      } catch {
        if (!container.childElementCount) container.textContent = t('暂时无法连接日终资料，可重新展开刷新。','Unable to reach end-of-day sources. Reopen to retry.');
        else {
          const note = container.querySelector('p');
          if (note) note.textContent = t('刷新失败。上方保留上次核对的日期及数值。','Refresh failed. The last verified dates and values are shown above.');
        }
      } finally { inFlight = false; }
    };
    details.addEventListener('toggle',update);
    if (details.open) void update();
  }
}
