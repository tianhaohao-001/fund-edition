import { CATALOG, findCatalog } from './catalog-data.mjs';
import { evaluatePlaybook } from './strategy-playbook.mjs';
import { QUARTERLY_RETURNS } from './catalog-vanguard-returns.mjs';
import { STOCKS_PLUS_ANNUAL, VOO_PROFILE, PROSPECTUS_2015 } from './catalog-stocksplus-returns.mjs';

const mandateDate = '2014-03-25';
const split = '2020-12-31';
const base = 'https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/investment-profiles/';
const sources = [
  { title: '2014 年招募说明书 · SEC', titleEn: '2014 prospectus · SEC', url: 'https://www.sec.gov/Archives/edgar/data/105563/000093247114005019/sp21032014.htm' },
  { title: 'VWELX · 发行人季度总回报', titleEn: 'VWELX quarterly total returns', url: base + '0021.pdf' },
  { title: 'VYM · 股息股票代理季度总回报', titleEn: 'VYM equity sleeve quarterly total returns', url: base + '0923.pdf' },
  { title: 'VCIT · 投资级公司债代理季度总回报', titleEn: 'VCIT credit sleeve quarterly total returns', url: base + '3146.pdf' },
];
const aliases = {
  'ark-innovation': ['ARK innovation', '方舟创新'], contrafund: ['富达逆向','富达反向','富达逆势'],
  'premium-income': ['JPMorgan Equity Premium Income', '摩根权益溢价'], 'active-bond': ['PIMCO Active Bond','品浩主动债券'],
  'inflation-curve': ['Quadratic','抗通胀曲线'], wellington: ['惠灵顿','威灵顿','威靈頓','Vanguard Wellington'],
  'nasdaq-income': ['摩根纳斯达克','纳指收益'], 'capital-growth': ['美国成长基金','美國成長基金','Growth Fund of America'],
  'stocks-plus': ['stocksplus','品浩股票增强','stocks plus bond alpha'],
  buffett: ['巴菲特','Buffett'], lynch: ['彼得林奇','彼得·林奇','Lynch'], dalio: ['达利欧','达里奥','Dalio'],
  'cathie-wood': ['木头姐','凯茜伍德','凱西伍德','Cathie Wood'], 'keith-gill': ['咆哮小猫','散户猫','Roaring Kitty','Keith Gill'],
};
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().trim();

export function resolveResearchTarget(input) {
  const text = normalize(input);
  if (!text || text.length > 4000) return null;
  const matches = CATALOG.filter(item => {
    const terms = [item.id, item.ticker, item.name, item.reference, item.officialName, item.personName, item.personNameZh, ...(aliases[item.id] ?? [])];
    return terms.filter(Boolean).some(term => {
      const word = normalize(term);
      if (text === word) return true;
      if (/[^\x00-\x7F]/u.test(word)) return text.includes(word);
      // Require complete Latin tokens even beside Chinese text. A template ticker
      // such as VALUE or BOND can otherwise capture a sentence about another fund.
      if (['value', 'balance', 'discover', 'bond', 'innovation', 'deepvalue'].includes(word)) {
        return word === String(item.ticker).toLowerCase() && String(input).includes(item.ticker) &&
          new RegExp('(?<![a-z0-9])' + word + '(?![a-z0-9])', 'u').test(text);
      }
      const left = text.indexOf(word);
      if (left < 0) return false;
      const before = left ? text[left - 1] : '';
      return !/[a-z0-9]/u.test(before) && !/[a-z0-9]/u.test(text[left + word.length] || '');
    });
  });
  return matches.length === 1 ? matches[0] : null;
}

export const WELLINGTON_ALLOCATION = Object.freeze([
  Object.freeze({ symbol: 'VYM', weightPct: 65 }), Object.freeze({ symbol: 'VCIT', weightPct: 35 }),
]);

function verifyPolicy(allocation, effectiveDate) {
  if (mandateDate >= effectiveDate || new Set(allocation.map(s => s.symbol)).size !== 2 ||
      allocation.some(s => !['VYM','VCIT'].includes(s.symbol) || !Number.isFinite(s.weightPct) || s.weightPct < 0) ||
      allocation.reduce((sum, s) => sum + s.weightPct, 0) !== 100 ||
      allocation[0].symbol !== 'VYM' || allocation[0].weightPct < 60 || allocation[0].weightPct > 70) {
    throw new Error('Portfolio failed its dated mandate or independent exposure checks.');
  }
}

// Solve for post-trade NAV, since the buys and sells themselves consume cash.
function rebalance(values, cash, allocation, fee) {
  const available = values.reduce((sum,value) => sum + value, cash);
  const traded = nav => allocation.reduce((sum, s, i) => sum + Math.abs(nav * s.weightPct / 100 - values[i]), 0);
  let low = 0, high = available;
  for (let i = 0; i < 48; i++) {
    const mid = (low + high) / 2;
    if (mid + fee * traded(mid) > available) high = mid;
    else low = mid;
  }
  return { holdings: allocation.map(s => low * s.weightPct / 100), cost: fee * traded(low), gross: traded(low) };
}

function average(x) { return x.reduce((a,b) => a+b, 0) / x.length; }
function sampleCov(x,y) {
  const mx = average(x), my = average(y);
  return x.reduce((sum,v,i) => sum + (v-mx)*(y[i]-my), 0) / (x.length-1);
}

function equityBaseline(baseReport) {
  const allocation = [{symbol:'VOO',weightPct:100}];
  const published = '2015-07-31';
  const all = STOCKS_PLUS_ANNUAL.map(([date,fund,etf])=>[date,fund,etf]);
  const holdout = all.filter(([end]) => end > split);
  const start = '2015-12-31';
  if (published >= start || allocation[0].symbol === baseReport.ticker) throw new Error('Exposure baseline failed its independence check.');
  return {
    ...baseReport, status:'historical-proxy', frequency:'annual', sourceCutoff:published, dataAsOf:all.at(-1)[0], allocation,
    holdout:{start:split,firstPeriodEnd:holdout[0][0],end:holdout.at(-1)[0],periods:holdout.length},
    reference:{start,end:split,periods:5,metrics:evaluateRows(all.slice(0,5),start,5,allocation,1).metrics},
    fullSample:{start,end:all.at(-1)[0],periods:all.length,metrics:evaluateRows(all,start,5,allocation,1).metrics},
    ...evaluateRows(holdout,split,5,allocation,1),
    seats:[
      {id:'disclosure',kind:'source',evidence:'样本前的PIMCO招募书说明，通常维持约等于净资产的标普500多头敞口。',evidenceEn:'The pre-sample PIMCO prospectus describes long S&P 500 exposure normally near fund NAV.'},
      {id:'allocation',kind:'rule',evidence:'持有100%独立标普500 ETF VOO，未买入PSTKX。',evidenceEn:'Hold only the independent Vanguard S&P 500 ETF (VOO). The target fund never enters the portfolio.'},
      {id:'risk',kind:'rule',evidence:'初始单笔成交扣5基点。单袖套不再平衡；没有杠杆、衍生品、抵押品或主动债券超额模型。',evidenceEn:'Deduct five basis points on the initial fill. No later turnover, leverage, derivatives, collateral or active bond alpha.'},
      {id:'evaluation',kind:'rule',evidence:'逐年取SEC文件机构份额税前一年总回报，对照VOO发行人年度净值总回报。后五年单列，只有五个观测。',evidenceEn:'Match each SEC institutional one-year pre-tax total return to VOO annual NAV total return. Only five observations are held out.'},
    ],
    sources:[
      {title:'2015年授权与标普敞口',titleEn:'2015 mandate and index exposure',url:PROSPECTUS_2015},
      {title:'VOO发行人净值总回报',titleEn:'VOO issuer NAV total returns',url:VOO_PROFILE},
      ...STOCKS_PLUS_ANNUAL.map(([date,,,url])=>({title:date.slice(0,4)+'年机构份额税前总回报',titleEn:date.slice(0,4)+' Institutional pre-tax total return',url})),
    ],
  };
}

export function evaluateWellington(rows, { anchor = split, feeBps = 5 } = {}) {
  verifyPolicy(WELLINGTON_ALLOCATION, anchor);
  return evaluateRows(rows, anchor, feeBps, WELLINGTON_ALLOCATION, 4);
}

function evaluateRows(rows, anchor, feeBps, allocation, observationsPerYear) {
  if (!Array.isArray(rows) || rows.length < 2 || !Number.isFinite(feeBps) || feeBps < 0 || feeBps > 100) throw new RangeError('Invalid return sample or cost.');
  const points = [{ date: anchor, replica: 100, target: 100, ...Object.fromEntries(allocation.map(s => [s.symbol,100])) }];
  const replicaReturns = [], targetReturns = [], excess = [];
  let values = allocation.map(() => 0), cash = 100, costs = 0, turnover = 0, peak = 100, drawdown = 0;
  for (const [date, targetReturn, ...sleeveReturns] of rows) {
    const last = points.at(-1);
    const lastDate = new Date(last.date + 'T00:00:00Z');
    const nextDate = new Date(Date.UTC(lastDate.getUTCFullYear(),lastDate.getUTCMonth()+1+12/observationsPerYear,0)).toISOString().slice(0,10);
    if (date !== nextDate || sleeveReturns.length !== allocation.length || [targetReturn,...sleeveReturns].some(r => !Number.isFinite(r) || r <= -100)) throw new RangeError('Observations must be consecutive and finite.');
    const fill = rebalance(values, cash, allocation, feeBps / 10000);
    cash = 0;
    costs += fill.cost;
    turnover += fill.gross / last.replica;
    // Only independently held sleeves contribute to the proxy. The target is joined
    // as an evaluation label after the proxy allocation has been set.
    values = fill.holdings.map((v,i) => v * (1 + sleeveReturns[i] / 100));
    const replica = values.reduce((sum,value) => sum + value, 0);
    const r = replica/last.replica - 1, t = targetReturn/100;
    replicaReturns.push(r); targetReturns.push(t); excess.push(r - t);
    peak = Math.max(peak, replica); drawdown = Math.max(drawdown, 1 - replica/peak);
    const indices = Object.fromEntries(allocation.map((s,i) => [s.symbol,last[s.symbol]*(1+sleeveReturns[i]/100)]));
    points.push({date, replica, target: last.target*(1+t), ...indices});
  }
  const end = points.at(-1);
  const sdR = Math.sqrt(sampleCov(replicaReturns,replicaReturns));
  const sdT = Math.sqrt(sampleCov(targetReturns,targetReturns));
  return { points, metrics: {
    replicaReturnPct:end.replica-100, targetReturnPct:end.target-100, gapPct:end.replica-end.target,
    trackingErrorPct:Math.sqrt(sampleCov(excess,excess)*observationsPerYear)*100, correlation:sdR*sdT ? sampleCov(replicaReturns,targetReturns)/(sdR*sdT) : null,
    maxDrawdownPct:drawdown*100, ...Object.fromEntries(allocation.map(s=>[s.symbol.toLowerCase()+'ReturnPct',end[s.symbol]-100])),
    feeBps, feesPer100:costs, grossTurnoverPct:turnover*100,
  }};
}

export function runReplicaStudy(catalogId) {
  const item = findCatalog(catalogId);
  if (!item) throw new RangeError('Unknown catalog research target.');
  const study = computeStudy(item);
  return { ...study, playbook:evaluatePlaybook(item,study) };
}

function computeStudy(item) {
  const baseReport = { schemaVersion:1, catalogId:item.id, ticker:item.ticker, modelCalls:0, paperFundSupported:item.id === 'wellington', engine:'deterministic-research-v1' };
  if (item.id === 'stocks-plus') return equityBaseline(baseReport);
  if (item.id !== 'wellington') {
    return { ...baseReport, status:'method-only', sourceCutoff:item.researchedAt, holdout:null, allocation:[], metrics:null, points:[],
      seats:[{id:'disclosure',kind:'source',evidence:item.limitations,evidenceEn:item.localized['en-US'].limitations}],
      sources:item.sources.map((s,i) => ({...s,titleEn:item.localized['en-US'].sourceTitles[i]})) };
  }
  const rows = QUARTERLY_RETURNS.filter(([end]) => end > split);
  const result = evaluateWellington(rows);
  return { ...baseReport, status:'historical-proxy', frequency:'quarterly', sourceCutoff:mandateDate, dataAsOf:QUARTERLY_RETURNS.at(-1)[0],
    holdout:{start:split,firstPeriodEnd:rows[0][0],end:rows.at(-1)[0],periods:rows.length}, allocation:WELLINGTON_ALLOCATION,
    reference:{start:'2015-12-31',end:split,periods:QUARTERLY_RETURNS.length-rows.length,metrics:evaluateWellington(QUARTERLY_RETURNS.filter(([end]) => end<=split),{anchor:'2015-12-31'}).metrics},
    ...result, seats:[
      {id:'disclosure',kind:'source',evidence:'2014年公开文件列出股票60%–70%，余下由债券等承担。',evidenceEn:'The 2014 prospectus sets a stock range of 60–70%, with the remainder mainly in fixed income.'},
      {id:'allocation',kind:'rule',evidence:'取区间中点，股息股票 VYM 65%，中期投资级公司债 VCIT 35%，每季恢复目标。',evidenceEn:'Reset to 65% VYM dividend stocks and 35% VCIT intermediate investment-grade credit at each quarter boundary.'},
      {id:'risk',kind:'rule',evidence:'日期、授权区间、总权重及两个独立成分通过校验。禁止买入目标基金、杠杆、卖空。',evidenceEn:'Date, mandate, total weight and independent sleeves checked. No target fund, leverage or short sales.'},
      {id:'execution',kind:'rule',evidence:'各季度初按买卖金额双向各5基点计成本，费用后持仓非负，每季按已实现净值总回报盯市。',evidenceEn:'Charge five basis points on traded notional, allocate the remainder, then mark using realized quarterly NAV total returns.'},
      {id:'evaluation',kind:'rule',evidence:'使用同日同币种含分配再投资净值比较。2021年起23季度单列，目标回报仅用于盲评比较。',evidenceEn:'Compare same-date USD reinvested NAV returns for the 23 held-out quarters beginning in 2021. Target returns enter only the score.'},
    ], sources:sources.map(s=>({...s})) };
}
