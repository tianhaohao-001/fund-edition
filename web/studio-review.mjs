import { getLanguage, t } from './i18n.mjs';

const safe = value => String(value ?? '').replace(/[&<>"']/gu, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (cents, signed = false) => Number.isSafeInteger(cents) ? new Intl.NumberFormat(getLanguage(), {
  style:'currency', currency:'USD', signDisplay:signed ? 'exceptZero' : 'auto',
}).format(cents / 100) : '—';
const nyDay = value => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)) : '';

function lastEvent(run) {
  if (!run) return t('团队尚未开始第一次审议','Your team has yet to meet');
  const {execution} = run;
  if (execution.status === 'filled') return (execution.side === 'BUY' ? t('买入','Bought') : t('卖出','Sold')) +
    ' ' + execution.quantity + ' ' + execution.symbol;
  return execution.status === 'blocked' ? t('规则拦截，未成交','Blocked by policy · no fill') : t('维持持仓，未下单','Held positions · no order');
}

export function studioBriefing(fund, membership, busy) {
  if (!fund || fund.replica) return '';
  const run = fund.runs?.[0];
  const datedMarks = [...new Set((fund.portfolio?.positions ?? []).map(position => nyDay(position.markAsOf)))].sort();
  const replayDates = datedMarks.length && datedMarks.every(Boolean)
    ? datedMarks.length === 1 ? datedMarks[0] : datedMarks.at(0)+' – '+datedMarks.at(-1) : '';
  const saved = run && fund.chat?.findLast(m => m.role === 'assistant' && m.runId === run.id)?.text;
  const archived = saved || run?.decision?.summary;
  const action = run ? membership?.status === 'expired'
    ? '<details><summary>'+t('查看已存说明','Read the recorded explanation')+'</summary><p>'+safe(archived || lastEvent(run))+'</p></details>'
    : '<button type="button" class="sr-question" data-action="ask-studio-recap" data-id="'+safe(run.id)+'" '+(busy?'disabled':'')+'>'+t('问 Maya 为什么','Ask Maya why')+' ↗</button>' : '';
  return '<section class="studio-recap" aria-label="'+t('基金近况','Fund briefing')+'">'+
    '<div class="sr-summary"><div><small>'+t('模拟累计盈亏','Paper gain / loss')+'</small><strong>'+money(fund.portfolio?.totalPnlCents,true)+'</strong>'+
    '<span>'+t('模拟现金','Paper cash')+' '+money(fund.portfolio?.cashCents)+'</span>'+
    (replayDates ? '<span>'+t('合成估值日期','Replay marks dated')+' '+safe(replayDates)+'</span>' : '')+'</div>'+
    '<div><small>'+t('最近一次团队决定','Latest team decision')+'</small><strong>'+safe(lastEvent(run))+'</strong>'+
    (run ? '<span>'+safe(nyDay(run.createdAt))+' · '+t('账户记录（美东）','Recorded in New York time')+'</span>' : '')+'</div></div>'+
    '<div data-studio-close role="status">'+t('正在核对收盘观察…','Checking closing observations…')+'</div>'+action+'</section>';
}

function describe(report) {
  switch (report.status) {
    case 'gain': case 'loss': case 'flat':
      return money(report.changeCents,true)+(report.percent === null?'':' ('+new Intl.NumberFormat(getLanguage(),{maximumFractionDigits:2,signDisplay:'exceptZero'}).format(report.percent)+'%)');
    case 'waiting-first-close': return t('等待当前持仓的首次收盘','Awaiting the first close for this allocation');
    case 'waiting-second-close': case 'changed-book': return t('等待同一持仓的第二个相邻收盘','Awaiting a second consecutive close with the same holdings');
    case 'coverage': return t('组合缺少完整、同口径的相邻收盘价','Comparable closing quotes are missing for the full portfolio');
    default: return t('暂时无法核对市场收盘','Market close unavailable');
  }
}

function paint(node, report) {
  const links = (report.current ?? report.previous)?.positions.filter(({sourceUrl}) =>
    /^https:\/\/www\.nasdaq\.com\/market-activity\//u.test(sourceUrl)) ?? [];
  node.innerHTML = '<small>'+t('收盘观察 · 美东','Closing observation · New York')+'</small><b>'+safe(describe(report))+'</b>'+
    '<details><summary>'+t('口径与日期','Dates and methodology')+'</summary><p>'+
    (report.asOf ? safe(report.previousDay)+' → '+safe(report.asOf)+' · ' : '')+
    (report.current ? t('收盘参考估值 ','Indicative closing value ')+money(report.current.valueCents)+' · ' : '')+
    (report.status === 'waiting-first-close' || report.status === 'waiting-second-close'
      ? t('维持相同持仓与现金，经过两个相邻美股收盘日后可查看变动。','Keep shares and cash unchanged through two consecutive US market closes to see a change.')+' ' : '')+
    t('只比较完整两个交易日的相同股数和现金。持仓按 Nasdaq 美元收盘价观察，仅持现金时取账本余额。价格变动不含股息或拆股调整，独立于上方合成回放盈亏。',
      'Compares unchanged shares and cash across two consecutive closes. Holdings use Nasdaq USD closes; a cash portfolio uses its ledger balance. Price change excludes dividends and split adjustments and is separate from replay P&L above.')+
    (links.length ? ' '+links.map(({symbol,sourceUrl}) => '<a href="'+safe(sourceUrl)+'" target="_blank" rel="noopener noreferrer">Nasdaq · '+safe(symbol)+'</a>').join(' / ') : '')+
    '</p></details>';
}

// One in-flight read per fund and ledger revision. The caller clears this on identity changes.
const readings = new Map();
export function clearBriefings() { readings.clear(); }
export function bindBriefing(root, fund) {
  const node = root.querySelector('[data-studio-close]');
  if (!node || !fund) return;
  const key = fund.id;
  const signature = fund.runs?.[0]?.id ?? 'opened';
  let cached = readings.get(key);
  if (!cached || cached.signature !== signature || Date.now() >= cached.until) {
    const promise = fetch('/api/studio-review?fund='+encodeURIComponent(key),{cache:'no-store'})
      .then(response => { if (!response.ok) throw Error('close'); return response.json(); });
    cached = {signature, until:Date.now()+60_000, promise};
    readings.set(key,cached);
  }
  cached.promise.then(report => { if (node.isConnected) paint(node,report); }).catch(() => {
    if (node.isConnected) node.textContent=t('收盘观察暂未更新，账户记录仍可查看。','The closing observation is unavailable. Your recorded ledger is shown above.');
  });
}
