import { FCNTX_MONTHLY } from './catalog-data.mjs';
import { publicEtfNav } from './fund-public-nav.mjs';
import { strategyMandate } from './strategy-playbook.mjs';
import { STOCKS_PLUS_ANNUAL } from './catalog-stocksplus-returns.mjs';
import { ARK_DISCLOSURES, ARK_FILING_LINKS } from './replication-cases.mjs';

export { strategyMandate };
export const exchangeFunds = new Set(['ARKK','JEPI','JEPQ','IVOL','BOND']);
const usdSeries = (rows,basis,url,credit) => ({kind:'nav',unit:'USD',basis,url,credit,rows});
const annualNav = (yearEnd,values) => values.map(([year,nav])=>[year+'-'+yearEnd,nav]);
const base = 'https://www.sec.gov/Archives/edgar/data/';

const priceHistory = {
  FCNTX:usdSeries(FCNTX_MONTHLY.map(x=>[x.date,x.close]),['月末每份净值','Month-end NAV per share'],'https://fundresearch.fidelity.com/mutual-funds/view-all/316071109','Fidelity'),
  VWELX:usdSeries(annualNav('11-30',[[2020,46.10],[2021,50.15],[2022,42.19],[2023,41.61],[2024,47.61]]),['财年末每份净值','Fiscal year-end NAV per share'],base+'105563/000168386325002774/f41248d1.htm','Vanguard · SEC'),
  AGTHX:usdSeries(annualNav('08-31',[[2022,55.10],[2023,62.30],[2024,75.37],[2025,85.28],[2026,88.21]]),['财年末每份净值','Fiscal year-end NAV per share'],base+'44201/000005193126001095/ck0000044201-20261030.htm','Capital Group · SEC'),
};
let value = 100;
priceHistory.PSTKX = {kind:'index',unit:'index',basis:['年末总回报指数 · 起点 100','Year-end total return · base 100'],credit:'PIMCO · SEC',url:STOCKS_PLUS_ANNUAL.at(-1)[3],
  rows:[['2015-12-31',100],...STOCKS_PLUS_ANNUAL.map(([date,rate])=>[date,value*=1+rate/100])]};
let reviewQuotes;
export async function readReviewQuotes() {
  if (!['127.0.0.1','localhost','[::1]'].includes(globalThis.location?.hostname)) return {};
  if (!reviewQuotes) {
    reviewQuotes = fetch('/api/review/fund-bars',{credentials:'same-origin',cache:'no-store'}).then(async response=>{
      if(!response.ok)return {};
      const archive=await response.json();
      if(archive.feed!=='IEX'||archive.timeframe!=='1Day'||archive.currency!=='USD')return {};
      return Object.fromEntries(Object.entries(archive.series||{}).filter(([symbol,rows])=>exchangeFunds.has(symbol)&&Array.isArray(rows)&&rows.length>1&&
        rows.every((r,i)=>Array.isArray(r)&&r.length===5&&/^\d{4}-\d{2}-\d{2}$/u.test(r[0])&&(!i||r[0]>rows[i-1][0])&&r.slice(1).every(v=>Number.isFinite(v)&&v>0)&&r[2]>=Math.max(r[1],r[4])&&r[3]<=Math.min(r[1],r[4]))));
    }).catch(()=>({}));
  }
  return reviewQuotes;
}
export function chartSample(ticker,quotes={}) {
  if(quotes[ticker])return {kind:'candles',unit:'USD',basis:['IEX 历史日 K','IEX daily candles'],url:'https://docs.alpaca.markets/us/docs/historical-stock-data-1',credit:'Alpaca · IEX',rows:quotes[ticker]};
  return priceHistory[ticker]||publicEtfNav[ticker]||null;
}
export function disclosedHoldings(id) {
  if(id!=='ark-innovation')return null;
  const source=ARK_DISCLOSURES.snapshots.at(-1);
  return {...source, url:ARK_FILING_LINKS[source.source]};
}
// Public product-owned review receipts. Links to the corresponding entries and dates
// in docs/replication-methods.md and release/review-web/forward-hosted.json.
export const meetingRecords={
  wellington:{ date:'2026-11-18', receipts:['resp_6cd9b5dbeceb48eca9d79550bfd1d1b3','resp_a47fdc5b1c68466ba002edbd463ce372','resp_aa93cfddee534877936283a6c5eec082'],
    outcome:['经理提出 60% VYM、40% VCIT。模拟授权已记录，当时正等待下一次收盘。','The manager proposed 60% VYM and 40% VCIT. Paper authorization was recorded pending the next close.']},
  'inflation-curve':{date:'2026-11-18',receipts:['resp_80287e2870eb44caa27da2156973fe5f','resp_7de2e2d9a2a4490aafada025e4209f1e','resp_812d3de80926498ea60a735e5dfefdc1'],
    outcome:['历史场外期权条款和估值输入不足。经理保留研究结论，账户未变动。','Historical OTC terms and valuation inputs were missing. The manager kept this as research and the account was unchanged.']}
};
