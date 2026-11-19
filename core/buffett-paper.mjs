import { createHash } from 'node:crypto';

export const feeBps = 5;
export const initialCash = 10000;
const scale = 1_000_000;
const day = 86_400_000;
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function cents(value) {
  if (!Number.isFinite(value) || value <= 0 || value > 1000000) throw new Error('Invalid price');
  return Math.round(value * 100);
}
const gross = (units, price) => Number(BigInt(units) * BigInt(price) / BigInt(scale));
const fee = amount => amount ? Math.ceil(amount * feeBps / 10000) : 0;
const newBook = () => ({cashCents:initialCash*100, units:0});
function position(book, price) {
  const holding = gross(book.units, cents(price));
  return {cash:book.cashCents/100, shares:book.units/scale, equity:(book.cashCents+holding)/100,
    weightPct: +(100*holding/(book.cashCents+holding)).toFixed(4)};
}

export function historicalPacket(history, snapshot, book, index) {
  const cutoff = Date.parse(snapshot.asOf);
  if (!Number.isFinite(cutoff) || !Number.isFinite(Date.parse(snapshot.closeAt)) || Date.parse(snapshot.closeAt)>cutoff) throw new Error('Invalid decision cutoff');
  const sources = new Map(history.sources.map(s=>[s.id,s]));
  const market = history.bars.filter(b=>Date.parse(b.availableAt??b.closeAt)<=cutoff);
  if (!market.length || Date.parse(market.at(-1).closeAt)!==Date.parse(snapshot.closeAt) || cents(market.at(-1).close)!==cents(snapshot.close)) throw new Error('Missing contemporaneous price');
  const evidence = [], blind = [];
  function add(row, displayed) {
    const available = Date.parse(row.availableAt);
    if (!Number.isFinite(available) || available>cutoff) throw new Error('Evidence after cutoff');
    const id = 'E'+String(evidence.length+1).padStart(2,'0');
    evidence.push({...row,id});
    blind.push({id,...displayed,publishedDaysAgo:Math.floor((cutoff-available)/day)});
  }
  const redact = text => String(text??'').replace(/auto\s*zone|\bAZO\b/giu,'Company A')
    .replace(/\b(?:19|20)\d{2}(?:[-/]\d{1,2}){0,2}\b/gu,'prior period');
  for (const fact of snapshot.evidence) {
    const source = sources.get(fact.sourceId);
    if (!source || !Number.isFinite(fact.value)) throw new Error('Unverified input '+fact.id);
    const sourceIds = [...new Set(fact.sourceIds ?? [fact.sourceId])];
    if (!sourceIds.includes(fact.sourceId)) throw new Error('Missing primary evidence source');
    const refs = sourceIds.map(id => {
      const ref = sources.get(id);
      if (!ref?.url || (ref.availableAt && !(Date.parse(ref.availableAt) <= Date.parse(fact.availableAt)))) throw new Error('Source unavailable at the claimed evidence time');
      return {id, title:ref.title, label:ref.title, url:ref.url, availableAt:ref.availableAt ?? fact.availableAt};
    });
    if (!Number.isFinite(Date.parse(fact.periodEnd)) || Date.parse(fact.periodEnd)>cutoff) throw new Error('Invalid fiscal period');
    const periodAge = Math.floor((cutoff-Date.parse(fact.periodEnd))/day);
    const duration = fact.periodStart ? Math.round((Date.parse(fact.periodEnd)-Date.parse(fact.periodStart))/day)+1 : null;
    if(duration!==null && (!Number.isFinite(duration)||duration<1))throw new Error('Invalid fiscal duration');
    const label = fact.label;
    add({label,availableAt:fact.availableAt,sourceUrl:source.url,sourceId:source.id,sourceIds,sources:refs,formula:fact.formula ?? null,
      details:String(fact.value)+' '+fact.unit+(fact.periodStart?' · '+fact.periodStart+' – ':' · ')+fact.periodEnd,
      originalId:fact.id,value:fact.value,unit:fact.unit,periodEnd:fact.periodEnd,periodStart:fact.periodStart??null},
      {measure:redact(label),value:fact.value,unit:redact(fact.unit),periodEndDaysAgo:periodAge,periodDurationDays:duration});
  }
  const marketSource=history.sources.find(s=>s.id===history.priceSourceId || s.id===history.bars.at(-1)?.sourceId) ??
    history.sources.find(s=>/price|ohlc|historical quotes|wiki|stooq|nasdaq|yahoo|market|daily bars/iu.test(s.id+' '+s.title));
  if (!marketSource) throw new Error('Missing market source');
  add({label:'决策时可见收盘价 / Decision close',availableAt:snapshot.closeAvailableAt??snapshot.closeAt,sourceUrl:marketSource.url,sourceId:marketSource.id,
    sourceIds:[marketSource.id],sources:[{id:marketSource.id,title:marketSource.title,label:marketSource.title,url:marketSource.url,availableAt:snapshot.closeAvailableAt??snapshot.closeAt}],
    details:'USD '+snapshot.close,value:snapshot.close,unit:'USD/share'}, {measure:'Latest unadjusted close',value:snapshot.close,unit:'USD/share'});
  const historicalCloses=market.filter((_,i)=>[1,5,21,63].includes(market.length-i)).map(b=>({sessionsAgo:market.length-1-market.indexOf(b),close:b.close}));
  return {evidence,packet:{issuer:'Company A',review:index+1,asOf:'after period close, before the next session',
    business:'US automotive replacement parts retailer',availableFacts:blind,priorCloses:historicalCloses,
    account:position(book,snapshot.close),policy:{longOnly:true,cashAllowed:true,noLeverage:true,feeBps,
      permittedTargetPercent:'0 through 100, integer',fill:'next session, market price unknown'}}};
}

function execute(book, target, mark, nextBar) {
  const before=position(book,mark), close=cents(mark), price=cents(nextBar.open);
  const equity=book.cashCents+gross(book.units,close);
  const delta=target===null?0:Math.round(equity*target/100)-gross(book.units,close);
  let quantity=0, amount=0, commission=0, side='HOLD';
  if (delta>0) {
    const budget=Math.min(delta,book.cashCents);
    let buyingPower=Math.floor(budget*10000/(10000+feeBps));
    while (buyingPower+fee(buyingPower)>budget) buyingPower--;
    quantity=Math.floor(buyingPower*scale/price);
    amount=gross(quantity,price);
    if(amount>0) {side='BUY';commission=fee(amount);book.cashCents-=amount+commission;book.units+=quantity;}
  } else if(delta<0) {
    quantity=target===0?book.units:Math.min(book.units,Math.floor(-delta*scale/close));
    amount=gross(quantity,price);
    if(amount>0) {side='SELL';commission=fee(amount);book.cashCents+=amount-commission;book.units-=quantity;}
  }
  if(book.cashCents<0||book.units<0)throw new Error('Execution exceeded account authority');
  return {status:side==='HOLD'?'no-trade':'filled',side,date:nextBar.date,at:nextBar.openAt,
    price:side==='HOLD'?null:price/100,quantity:side==='HOLD'?0:quantity/scale,notional:amount/100,
    fee:commission/100,cashAfter:book.cashCents/100,sharesAfter:book.units/scale,
    weightAfterPct:position(book,nextBar.open).weightPct,
    reason:side==='HOLD'?(target===null?'经理决定维持当前持仓':'目标与现有持仓相符或小于最小成交额'):'独立账本按下一交易日开盘成交',
    exposureBeforePct:before.weightPct};
}

function drawdown(points,key) {
  let peak=initialCash, worst=0;
  for(const p of points){peak=Math.max(peak,p[key]);worst=Math.max(worst,1-p[key]/peak);}
  return +(100*worst).toFixed(4);
}

export async function runBuffettStudy(history, committee) {
  if (!history.snapshots?.length || !history.bars?.length) throw new Error('Missing history');
  for(let i=0;i<history.bars.length;i++){
    const b=history.bars[i];
    if(!Number.isFinite(Date.parse(b.openAt))||!(Date.parse(b.closeAt)>Date.parse(b.openAt))||
       (b.availableAt && !(Date.parse(b.availableAt)>=Date.parse(b.closeAt)))||
       (i && !(Date.parse(b.openAt)>Date.parse(history.bars[i-1].closeAt))))throw new Error('Unordered market sessions');
    cents(b.open);cents(b.close);
  }
  const book=newBook(),baseline=newBook(),decisions=[],fills=new Map();
  let previousExecution=-Infinity,benchmarkBuy;
  for(const [i,snapshot] of history.snapshots.entries()){
    if (!(Date.parse(snapshot.asOf)>previousExecution)) throw new Error('Decision predates prior execution');
    const nextBar=history.bars.find(b=>Date.parse(b.openAt)>Date.parse(snapshot.asOf));
    if(!nextBar)throw new Error('No subsequent market session');
    const {packet,evidence}=historicalPacket(history,snapshot,book,i);
    const seats=await committee(packet);
    const roles=seats.map(seat=>seat.role);
    if(roles.join('|')!=='research|risk|manager'||new Set(seats.map(s=>s.responseId)).size!==3||
      seats.some(s=>!s.responseId||!s.model||!s.text||!s.evidenceRefs?.length||s.evidenceRefs.some(id=>!evidence.some(e=>e.id===id))))throw new Error('Incomplete committee');
    const manager=seats[2];
    const target=manager.intent==='HOLD'?null:manager.targetPct;
    if(!['HOLD','SET_TARGET'].includes(manager.intent)||(manager.intent==='SET_TARGET'&&(!Number.isInteger(target)||target<0||target>100))||
       !manager.counterargument||!manager.reconsider)throw new Error('Invalid instruction');
    if(i===0)benchmarkBuy=execute(baseline,100,snapshot.close,nextBar);
    const execution=execute(book,target,snapshot.close,nextBar);
    decisions.push({id:'buffett-review-'+(i+1),asOf:snapshot.asOf,decisionDate:snapshot.closeAt.slice(0,10),symbol:history.security.ticker,
      action:execution.side,targetPct:target,bookBefore:packet.account,seats,evidence,
      manager:{text:manager.text,textEn:manager.textEn,counterargument:manager.counterargument,counterargumentEn:manager.counterargumentEn,
        reconsider:manager.reconsider,reconsiderEn:manager.reconsiderEn},
      execution,packetHash:fingerprint(packet),modelPacket:packet});
    fills.set(nextBar.date,{...book});previousExecution=Date.parse(nextBar.openAt);
  }
  const start=history.snapshots[0].closeAt.slice(0,10);
  let running=newBook();
  const points=history.bars.filter(b=>b.date>=start).map(b=>{
    if(fills.has(b.date))running=fills.get(b.date);
    return {date:b.date,aiEquity:position(running,b.close).equity,
      benchmarkEquity:b.date<benchmarkBuy.date?initialCash:position(baseline,b.close).equity};
  });
  if(new Set(decisions.flatMap(d=>d.seats.map(s=>s.responseId))).size!==decisions.length*3)throw new Error('Repeated receipt');
  const end=points.at(-1);
  const priceGaps=history.design?.missingMarketDates ?? [];
  const trades=decisions.filter(d=>d.execution.status==='filled');
  return {version:1,id:'buffett-azo-2017-v1',symbol:history.security.ticker,model:decisions[0].seats[2].model,
    method:{universe:[history.security.ticker],startingCash:initialCash,feeBps,
      benchmark:'首期同一开盘价投入现金，此后持有至期末；与团队使用同一交易费。',
      policy:'仅持公司股票或现金，允许零股，无杠杆、卖空或利息。买入金额或卖出股数在会议结束时决定，下一交易日开盘执行。',
      sources:[...history.methodSources,...history.sources].map(s=>({label:s.title,url:s.url})),
      priceGaps,
      limitations:['事后选取单一公司和一年样本。','给模型的材料仅含当时可得证据，通用模型的训练记忆无法排除。','按历史开盘价模拟，未计税及额外滑点。',
        ...(priceGaps.length ? [priceGaps.join(', ')+' 缺少收盘行情，曲线跳过缺值，最大回撤按有记录的收盘估算。'] : [])],
      limitationsEn:['One retrospectively selected company and one year.','Inputs were time-gated; information in the model’s pretraining cannot be ruled out.','Market-open fills omit taxes and extra slippage.',
        ...(priceGaps.length ? ['Missing closing prices on '+priceGaps.join(', ')+'. Valuations skip missing sessions; drawdown is estimated from available closes.'] : [])]},
    benchmarkExecution:benchmarkBuy,points,decisions,
    metrics:{decisionCount:decisions.length,fillCount:trades.length,buyCount:trades.filter(d=>d.action==='BUY').length,sellCount:trades.filter(d=>d.action==='SELL').length,
      returnPct:+((end.aiEquity/initialCash-1)*100).toFixed(4),
      benchmarkReturnPct:+((end.benchmarkEquity/initialCash-1)*100).toFixed(4),
      maxDrawdownPct:drawdown(points,'aiEquity'),benchmarkDrawdownPct:drawdown(points,'benchmarkEquity')}};
}
