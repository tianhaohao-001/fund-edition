import { findCatalog } from './catalog-data.mjs';
import { catalogBacktest } from './catalog-model.mjs';
import { arkHoldingsStudy, ARK_FILING_LINKS } from './replication-cases.mjs';
import { STRATEGY_PROFILES } from './strategy-profiles.mjs';

// Dates on issuer pages refer to reporting periods. The registry records when these facts
// were verified for new decisions; it must never backdate knowledge to a reporting date.
const verifiedAt = '2026-11-18';
const zh = (language) => /^zh/i.test(language);
const pair = (zh,en) => ({ zh,en });
const text = (value,language) => value[zh(language) ? 'zh' : 'en'];

function universe(manager, date, symbols, scope, blocked, task, sources=[]) {
  return { manager, date, symbols, scope, blocked, task, sources };
}
const source = (title,url) => ({title,url});
const jpmSource = source('J.P. Morgan • March 2026 • JEPI/JEPQ equity and option-income sleeves','https://am.jpmorgan.com/content/dam/jpm-am-aem/americas/us/en/literature/jepi-jepq-flyer.pdf');
const vanguardSource = source('SEC • Wellington 2014 prospectus','https://www.sec.gov/Archives/edgar/data/105563/000093247114005019/sp21032014.htm');
const pimcoSource = source('SEC • 2015 StocksPLUS summary prospectus','https://www.sec.gov/Archives/edgar/data/810893/000119312515265584/d933724d497k.htm');
const archive = {
  wellington:universe('Wellington Management / Vanguard','2014-03-25',['VYM','VCIT'],
    pair('两只独立 ETF 分别代表股息股票与信用债。','Two independent ETFs represent dividend equity and credit.'),
    ['single-name-selection','leverage','unobserved-bonds'],
    pair('根据有时标的新证据，在股票授权区间内讨论调仓或维持现状，并与固定中点代理比较。','Decide whether dated evidence warrants moving within the disclosed equity band or holding; compare against the fixed midpoint proxy.'),[vanguardSource]),
  'stocks-plus':universe('PIMCO StocksPLUS team','2015-07-31',['VOO'],
    pair('仅股票贝塔袖套。','Equity-beta sleeve only.'),['bond-alpha','derivatives','collateral-financing'],
    pair('评估保留股票敞口或暂缓的依据，明确融资和主动债券对结论的影响。','Evaluate maintaining the equity sleeve or deferring; identify the financing and active bond evidence that would change the decision.'),[pimcoSource]),
  'ark-innovation':universe('ARK Investment Management','2025-07-31',['TSLA','ROKU','COIN','RBLX','PLTR'],
    pair('三期 N-PORT 中选取的五只历史持仓；最新一期的保守可见日为 2025-09-24。','Five sampled positions across three historical N-PORT filings. Conservative visibility date for the latest sample is 2025-09-24.'),
    ['undisclosed-holdings','unverified-innovation-thesis','shorts'],
    pair('按新证据审查技术采用、商业化与估值。决定是否持有或调整样本标的；过去持仓本身不足以支持交易。','Evaluate adoption, commercialization and valuation using new evidence. Decide whether to hold or adjust sampled names; past ownership alone is insufficient.'),
    Object.entries(ARK_FILING_LINKS).map(([title,url])=>source(title,url))),
  contrafund:universe('Fidelity Contrafund team','2026-09-30',['NVDA','META','AMZN','AAPL','GOOGL','MSFT'],
    pair('富达 2026 年 9 月底披露的大盘持仓子集。','Subset of large-cap stocks in Fidelity’s September 2026 holdings.'),
    ['private-holdings','undisclosed-earnings-estimates','derivatives'],
    pair('用已发布的盈利、估值及变化解释候选股票的选择或观望，避免以净值均线代替选股。','Use published earnings, valuation and changes to select a candidate or wait. A NAV moving average cannot provide a stock thesis.'),
    [source('Fidelity • September 2026 holdings / manager Q&A','https://fundresearch.fidelity.com/mutual-funds/view-all/316071109?documenttype=chm')]),
  'capital-growth':universe('Capital Group • The Capital System','2026-09-30',['NVDA','META','MSFT','AVGO','AMZN','GOOGL','GOOG'],
    pair('Capital Group 季报的七只大盘历史持仓。','Seven publicly reported large-cap names from the Capital Group quarterly portfolio.'),
    ['private-sleeve-weights','unreported-holdings','derivatives'],
    pair('写明候选属于长期成长、周期修复或反转，合并不同席位对同一公司的敞口后再提出选择。','Classify a candidate as durable growth, cyclical recovery or turnaround, then net overlapping company exposure before deciding.'),
    [source('Capital Group • Quarterly holdings • 2026-09-30','https://www.capitalgroup.com/individual/investments/quarterlyholdings/agthx?fundGroupNumber=5')]),
  'premium-income':universe('J.P. Morgan Asset Management • Equity Premium Income','2026-03-31',['VOO'],
    pair('可研究以 VOO 代表美国大盘股的独立敞口。','VOO is an independent US large-cap proxy.'),
    ['ELN','short-calls','option-income','counterparty-notes'],
    pair('评估广义股票袖套的风险预算。缺票据条款时不提出期权指令或估算票息。','Decide the equity risk budget only. Without note terms, withhold option instructions and coupon estimates.'),[jpmSource,source('Vanguard • VOO S&P 500 ETF','https://investor.vanguard.com/investment-products/etfs/profile/voo')]),
  'nasdaq-income':universe('J.P. Morgan Asset Management • Nasdaq Equity Premium Income','2026-03-31',['QQQ'],
    pair('可研究以 QQQ 代表 Nasdaq-100 的独立敞口。','QQQ is an independent Nasdaq-100 proxy.'),
    ['ELN','short-calls','option-income','counterparty-notes'],
    pair('评估成长股集中与跳涨风险，单独决定股票袖套是否值得调整。','Assess growth-stock concentration and upside jumps, then decide whether the equity sleeve warrants adjustment.'),[jpmSource,source('Invesco • QQQ / Nasdaq-100','https://www.invesco.com/qqq-etf/en/about.html')]),
  'active-bond':universe('PIMCO active fixed income team',null,[],
    pair('研究核心债券风险；当前没有可供逐券成交的已核对债券池。','Core-bond risk research; no security-level bond execution universe has been verified.'),
    ['individual-bonds','mortgage-prepayments','swaps'],
    pair('判断久期、信用和凸性风险。待有按券数据与资金成本后再提具体债券。','Assess duration, credit and convexity; defer bond selection until security-level data and financing are available.'),
    [source('PIMCO • Active Bond ETF fund profile','https://www.pimco.com/us/en/documents/59144abed4eff08608a1795abb7f24995835fe75754d94a5b2de52ae747e3e03a0484a00da3a59f799223b6307c30e37?app=dot')]),
  'inflation-curve':universe('Quadratic Capital Management','2025-06-30',[],
    pair('可研究 TIPS 和曲线期权；当前未核验可交易债券或合约。','Research TIPS and curve options. No executable bond lots or contracts have been verified.'),
    ['OTC-options','swaptions','TIPS-lots'],
    pair('分别判断实际利率、曲线斜率和波动率的方向性风险，同时保留无合约证据时的观望选择。','Assess real-rate, curve-slope and volatility scenarios, then defer trading when contract evidence is missing.'),
    [source('Quadratic • Q2 2025 IVOL presentation','https://www.ivoletf.com/wp-content/uploads/2025/04/Q2-2025-IVOL-Presentation.pdf')])
};

export function strategyMandate(catalogId,language='en-US') {
  const item=findCatalog(catalogId);
  const profile=STRATEGY_PROFILES[catalogId];
  if(!item || !profile) throw new RangeError('Unknown strategy mandate.');
  const record=archive[catalogId];
  const scope=record ? text(record.scope,language) : text(pair('独立方法角色；缺少可审计的历史组合。','Independent style character. No auditable portfolio history supplied.'),language);
  const sources=item.sources.map((s,i)=>source(zh(language) ? s.title : item.localized['en-US'].sourceTitles[i],s.url));
  for(const s of record?.sources ?? []) if(!sources.some(x=>x.url===s.url)) sources.push(s);
  return {version:1,catalogId,ticker:item.ticker,name:text(profile.name,language),
    manager:record?.manager ?? (zh(language) ? '独立 AI 风格研究组' : 'Independent AI style research team'),
    referenceDate:record?.date ?? null,verifiedAt, sources,
    universe:{allowedSymbols:[...(record?.symbols ?? [])],blockedExposures:[...(record?.blocked ?? ['personal-holdings','unverified-securities'])],scope},
    roles:{research:text(profile.seats.research,language),risk:text(profile.seats.risk,language),manager:text(record?.task ?? profile.seats.manager,language)},
    rule:text(profile.rule,language),cost:text(profile.cost,language),benchmark:text(profile.benchmark,language),missing:text(profile.missing,language)};
}

const check = (id,status,zh,en,observed={})=>({id,status,detail:pair(zh,en),observed});
function reportCheck(study) {
  const {points,holdout}=study;
  const isDay = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  if(!holdout || !isDay(study.sourceCutoff) || !isDay(holdout.start) || !isDay(holdout.end) ||
    !Number.isFinite(study.metrics?.trackingErrorPct) || !Number.isFinite(study.metrics?.feeBps) ||
    !Array.isArray(points) || points.length < 2 || points.length!==holdout.periods+1 ||
    study.sourceCutoff>=holdout.start || points[0].date!==holdout.start || points.at(-1).date!==holdout.end ||
    points.some((p,i)=> !isDay(p.date) || !Number.isFinite(p.replica) || !Number.isFinite(p.target) || p.replica <= 0 || p.target <= 0 || (i && p.date<=points[i-1].date))) {
    return check('matched-returns','blocked','同期净值或样本外日期未通过校验。','Aligned NAV or holdout dates failed validation.');
  }
  return check('matched-returns','passed',`同口径历史总回报有 ${holdout.periods} 个留出观测。`,`${holdout.periods} held-out observations have aligned total returns.`,
    {observations:holdout.periods,start:holdout.start,end:holdout.end,feeBps:study.metrics.feeBps,trackingErrorPct:study.metrics.trackingErrorPct});
}

function filingCheck() {
  const result=arkHoldingsStudy();
  if(!result.comparison || result.training.length!==2 || result.holdout.publicAt<=result.decisionAt)
    return check('sampled-holdings','blocked','缺可见的训练披露或独立留出披露。','Available training filings or independent holdout filing missing.');
  return check('sampled-holdings','passed','使用两期已公开披露估算五只样本权重，再用第三期核验。','Estimated five weights from two available filings and compared them with the third.',
    {decisionAt:result.decisionAt,knownFilings:result.training.map(s=>({reportDate:s.reportDate,publicAt:s.publicAt,source:s.source})),
    holdoutPublicAt:result.holdout.publicAt,holdoutReportDate:result.holdout.reportDate,sampledNames:result.rows.length,
    modelCoveragePct:result.modelCovered,holdoutCoveragePct:result.holdout.covered,
    weightsPctOfFundNAV:result.rows.map(({symbol,modelWeight,disclosedWeight})=>({symbol,estimated:modelWeight,laterDisclosed:disclosedWeight})),
    sampleOverlapPct:result.comparison.knownOverlap,bucketedDistancePct:result.comparison.bucketedDistance});
}
function navCheck() {
  const {kind,points,trades,startDate,endDate}=catalogBacktest('contrafund');
  if(kind!=='historical' || points.length<4 || trades.some(t=>!t.signalDate || t.signalDate>=t.date))
    return check('nav-price','blocked','净值来源或信号时间未通过校验。','NAV source or signal timing failed validation.');
  return check('nav-price','passed',`已以 ${points.length} 个真实月末净值重跑价格实验；未计分配。`,`Replayed a price diagnostic on ${points.length} actual month-end NAVs, excluding distributions.`,
    {observations:points.length,trades:trades.length,start:startDate,end:endDate});
}

export function evaluatePlaybook(item,study) {
  if(item.id!==study.catalogId) throw new RangeError('Strategy and study targets differ.');
  const profile=STRATEGY_PROFILES[item.id];
  const checks=[];
  if(study.status==='historical-proxy') checks.push(reportCheck(study));
  if(item.id==='ark-innovation') checks.push(filingCheck());
  if(item.id==='contrafund') checks.push(navCheck());
  const scope=checks.some(c=>c.status==='passed') ? checks[0].id : 'documents';
  const archive=strategyMandate(item.id);
  const datedSources=archive.sources.filter(s=> /^https:\/\//u.test(s.url));
  checks.push(check('source-inventory',datedSources.length?'passed':'blocked',
    `核对资料登记表中的 ${datedSources.length} 条来源。`, `Checked ${datedSources.length} references in the registered source inventory.`,
    {sources:datedSources.length,referenceDate:archive.referenceDate,verifiedAt:archive.verifiedAt}));
  checks.push({id:'full-replication',status:'blocked',detail:profile.missing});
  return {version:1,catalogId:item.id,scope,checks,modelCalls:0};
}

export function researchBrief(study,language) {
  const mandate=strategyMandate(study.catalogId,language);
  const pb=study.playbook ?? evaluatePlaybook(findCatalog(study.catalogId),study);
  const checks = pb.checks.map(({id,status,detail,observed}) => {
    if (id==='sampled-holdings' && status==='passed' && !observed?.weightsPctOfFundNAV && study.catalogId==='ark-innovation') {
      const archived=filingCheck().observed;
      if (observed?.decisionAt===archived.decisionAt && observed?.holdoutPublicAt===archived.holdoutPublicAt) observed={...observed,...archived};
    }
    return {id,status,detail:text(detail,language),observed};
  });
  return {...mandate,scope:pb.scope,checks,modelCalls:0};
}
