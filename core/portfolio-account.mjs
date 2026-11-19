import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { CATALOG,catalogBacktest } from './catalog.mjs';
import { runReplicaStudy } from './replica.mjs';

const legacyOpeningCash = 1_000_000;
const newOpeningCash = 10_000_000;
const scale = 1_000_000n;
const uuid=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/iu;
export class PortfolioError extends Error {
  constructor(code,message,status=409){super(message);this.code=code;this.status=status;}
}
function integer(big){
  if(big<0n||big>BigInt(Number.MAX_SAFE_INTEGER))throw new PortfolioError('portfolio-limit','Value exceeds the paper ledger limit.');
  return Number(big);
}
const worth=(units,nav)=>integer((BigInt(units)*BigInt(nav)+scale/2n)/scale);
const cents=dollars=>Math.round(dollars*100);
function signedInteger(value){
  return value<0n?-integer(-value):integer(value);
}
const quote=(navCents,asOf,kind,source,sourceEn)=>({navCents,asOf,kind,source,sourceEn});
let catalogProducts;
function getCatalogProducts(){
  if(catalogProducts)return catalogProducts;
  const archive=JSON.parse(readFileSync(new URL('../web/data/buffett-ai-study.json',import.meta.url),'utf8'));
  catalogProducts=CATALOG.map(item=>{
    let mark;
    if(item.id==='buffett'){
      const end=archive.points.at(-1);
      mark=quote(Math.round(10_000*end.aiEquity/archive.method.startingCash),end.date,'historical-ai',
        '2017 年 AZO AI 组合期末净值，以 100 美元起算。','2017 AZO AI portfolio end value, rebased to $100.');
    }else{
      const research=runReplicaStudy(item.id);
      if(research.status==='historical-proxy' && research.points?.length){
        const last=research.points.at(-1);
        mark=quote(cents(last.replica),last.date,'historical-proxy','历史代理组合净值，以 100 美元起算。','Historical proxy portfolio NAV, rebased to $100.');
      }else{
        const study=catalogBacktest(item.id),last=study.points.at(-1);
        const historical=study.kind==='historical';
        mark=quote(Math.round(10_000*last.equity/study.startingCash),last.date,historical?'historical-rule':'synthetic',
          historical?'历史价格规则组合净值，以 100 美元起算。':'合成情景策略净值，以 100 美元起算；不是该基金的市价。',
          historical?'Rule portfolio on historical prices, rebased to $100.':'Synthetic scenario strategy value, rebased to $100; not a market quote.');
      }
    }
    return {productId:'catalog:'+item.id,kind:'catalog',name:item.name,nameEn:item.localized?.['en-US']?.name||item.name,ticker:item.ticker,quote:mark};
  });
  return catalogProducts;
}

function prorate(value,numerator,denominator){
  return integer((BigInt(value)*BigInt(numerator)+BigInt(denominator)/2n)/BigInt(denominator));
}
function studioProduct(fund){
  const p=fund.portfolio,begin=p?.initialCashCents??cents(p?.initialCash),end=p?.equityCents??cents(p?.equity);
  const supply=fund.studioCapital?.unitsMicros;
  let nav=null;
  if(Number.isSafeInteger(end)&&end>=0){
    if(Number.isSafeInteger(supply)&&supply>0)nav=prorate(end,scale,supply);
    else if(supply===0&&end===0)nav=10_000;
    else if(supply===undefined&&Number.isSafeInteger(begin)&&begin>0)nav=prorate(end,10_000,begin);
  }
  const runDate=fund.runs?.[0]?.createdAt || fund.createdAt;
  const asOf=fund.studioBookChangedAt>runDate?fund.studioBookChangedAt:runDate;
  const mark=quote(nav,asOf,'studio-paper','自建基金模拟净值，以 100 美元起算。','Paper fund NAV, starting at $100.');
  if(supply!==undefined)Object.assign(mark,{equityCents:end,outstandingUnitsMicros:supply,fundCashCents:p.cashCents});
  return {productId:'studio:'+fund.id,kind:'studio',name:fund.name,nameEn:fund.name,ticker:null,quote:mark};
}
function studioProducts(data){
  return data.funds.slice(1).filter(fund=>!fund.replica).map(studioProduct);
}
function products(data){
  return [...studioProducts(data),...getCatalogProducts()];
}
function holdingValue(units,mark){
  if(!units)return 0;
  if(mark.navCents===null)return null;
  if(mark.outstandingUnitsMicros>0)return prorate(mark.equityCents,units,mark.outstandingUnitsMicros);
  return worth(units,mark.navCents);
}
export function studioAllocations(data){
  const {positions}=bookFor(data);
  return Object.fromEntries(studioProducts(data).map(product=>{
    const holding=positions[product.productId]??{unitsMicros:0,costBasisCents:0};
    return [product.productId.slice('studio:'.length),{...holding,valueCents:holdingValue(holding.unitsMicros,product.quote)}];
  }));
}
function emptyBook(initialCashCents) {
  return {version:1,initialCashCents,cashCents:initialCashCents,positions:{},totalOrders:0,realizedPnlCents:0};
}

export function newPortfolioAccount() {
  return emptyBook(newOpeningCash);
}

export function bookFor(data) {
  // A workspace created before wallets were persisted still owns its original balance.
  return data.portfolioAccount ?? emptyBook(legacyOpeningCash);
}

const claimAmountCents = 10_000_000;

export function validateCashClaim(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.requestId !== 'string' || !uuid.test(body.requestId) ||
      typeof body.workspaceRef !== 'string' || !uuid.test(body.workspaceRef) ||
      Object.keys(body).some(key => !['requestId','workspaceRef'].includes(key))) {
    throw new PortfolioError('portfolio-input','A paper cash claim requires a workspace and a unique request ID.',400);
  }
  return JSON.stringify(['paper-cash-claim-v1',body.workspaceRef]);
}

export function claimPaperCash(data,body) {
  const book = bookFor(data);
  const cashBeforeCents = book.cashCents;
  const cashAfterCents = integer(BigInt(cashBeforeCents) + BigInt(claimAmountCents));
  book.claimedCashCents = integer(BigInt(book.claimedCashCents ?? 0) + BigInt(claimAmountCents));
  // Keep the total contributed capital representable independently of the current NAV.
  integer(BigInt(book.initialCashCents ?? legacyOpeningCash) + BigInt(book.claimedCashCents));
  book.cashCents = cashAfterCents;
  data.portfolioAccount = book;
  return {id:randomUUID(),requestId:body.requestId,side:'claim',kind:'paper-cash',
    amountCents:claimAmountCents,cashBeforeCents,cashAfterCents,createdAt:new Date().toISOString()};
}

function legacySourceEn(source){
  return ({'合成情景 · 方法实验':'Synthetic scenario · method experiment',
    'Fidelity 官方月末净值 · 价格实验':'Fidelity published month-end NAV · price experiment',
    '用户导入价格 · 本地计算':'User-imported prices · local calculation'})[source]??source??null;
}

function legacyPositions(data){
  return Object.entries(data.catalogAccounts??{}).flatMap(([id,account])=>{
    if(!account || (!account.unitsMicros && !account.history?.length))return [];
    const item=getCatalogProducts().find(p=>p.productId==='catalog:'+id);
    const history=account.history??[],mark=account.quote??{},last=history[0];
    const source=mark.source??last?.source??null, navCents=mark.priceCents??account.priceCents??null;
    // The previous edition rounded market value down. Preserve its recorded
    // result and timestamp, including when the current product uses a new NAV.
    const valueCents=Number.isFinite(account.marketValue)?cents(account.marketValue):
      Number.isSafeInteger(navCents)?integer(BigInt(account.unitsMicros)*BigInt(navCents)/scale):null;
    return [{productId:'catalog:'+id,catalogId:id,name:item?.name??id,nameEn:item?.nameEn??id,ticker:item?.ticker??null,
      cashCents:account.cashCents,unitsMicros:account.unitsMicros,navCents,valueCents,
      equityCents:valueCents===null?null:integer(BigInt(account.cashCents)+BigInt(valueCents)),
      asOf:mark.date??last?.quoteDate??null,source,sourceEn:legacySourceEn(source),quoteKind:mark.kind??null,receiptCount:history.length,
      receipts:history.map(row=>({side:row.side,unitsMicros:Math.round(row.units*Number(scale)),priceCents:cents(row.price),
        amountCents:cents(row.value),asOf:row.quoteDate,source:row.source,sourceEn:legacySourceEn(row.source)}))}];
  });
}

export function catalogAccountViews(data){
  const visible={...data.catalogAccounts,...data.catalogPortfolioViews};
  if(!Object.keys(data.catalogPortfolioViews??{}).length)return visible;
  const portfolio=viewPortfolio(data);
  for(const [id,projection] of Object.entries(data.catalogPortfolioViews)){
    const p=portfolio.positions.find(item=>item.productId==='catalog:'+id);
    const product=p??portfolio.products.find(item=>item.productId==='catalog:'+id);
    if(!product)continue;
    visible[id]={...projection,cashCents:portfolio.cashCents,cash:portfolio.cashCents/100,
      unitsMicros:p?.unitsMicros??0,units:(p?.unitsMicros??0)/portfolio.unitScale,priceCents:product.quote.navCents,
      marketValue:p?.valueCents===null?null:(p?.valueCents??0)/100,equity:portfolio.equityCents===null?null:portfolio.equityCents/100};
  }
  return visible;
}
export function viewPortfolio(data,orders=[]){
  const book=bookFor(data),available=products(data);
  const positions=available.filter(p=>book.positions[p.productId]).map(p=>{
    const holding=book.positions[p.productId];
    const valueCents=holdingValue(holding.unitsMicros,p.quote);
    return {...p,...holding,valueCents,pnlCents:valueCents===null?null:valueCents-holding.costBasisCents};
  });
  const investedValueCents=positions.some(p=>p.valueCents===null)?null:integer(positions.reduce((sum,p)=>sum+BigInt(p.valueCents),0n));
  const equityCents=investedValueCents===null?null:integer(BigInt(book.cashCents)+BigInt(investedValueCents));
  const initialCashCents = book.initialCashCents ?? legacyOpeningCash;
  const claimedCashCents = book.claimedCashCents ?? 0;
  const contributedCashCents = integer(BigInt(initialCashCents) + BigInt(claimedCashCents));
  return {version:1,environment:'portfolio-paper',currency:'USD',unitScale:Number(scale),initialCashCents,claimedCashCents,contributedCashCents,
    cashCents:book.cashCents,investedValueCents,equityCents,pnlCents:equityCents===null?null:equityCents-contributedCashCents,
    realizedPnlCents:book.realizedPnlCents,products:available,positions,orders,totalOrders:book.totalOrders,
    legacy:{catalogAccounts:Object.keys(data.catalogAccounts??{}).length,standaloneFunds:data.funds.length,
      catalogPositions:legacyPositions(data)},live:{available:false}};
}

export function validatePortfolioOrder(body,{legacy=false}={}){
  const idPattern=legacy?/^[A-Za-z0-9][A-Za-z0-9_:.\-]{0,99}$/u:uuid;
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.requestId!=='string'||!idPattern.test(body.requestId)||!['buy','sell'].includes(body.side)||
    typeof body.productId!=='string'||body.productId.length>100) throw new PortfolioError('portfolio-input','Invalid paper fund order.',400);
  const fullRedemption=legacy&&body.side==='sell', qty=body.side==='buy'?'amountCents':'unitsMicros';
  if(Object.keys(body).some(k=>!['side','requestId','productId',qty,'expectedNavCents','expectedAsOf'].includes(k))||
      (fullRedemption?body[qty]!==undefined:!Number.isSafeInteger(body[qty])||body[qty]<1)||
      (body.expectedNavCents!==undefined&&(!Number.isSafeInteger(body.expectedNavCents)||body.expectedNavCents<0))||
      (body.expectedAsOf!==undefined&&(typeof body.expectedAsOf!=='string'||body.expectedAsOf.length>40)))
    throw new PortfolioError('portfolio-input','Use integer cents or millionths of a fund unit.',400);
  return JSON.stringify(['portfolio-order-v1',body.side,body.productId,fullRedemption?'all':body[qty],body.expectedNavCents??null,body.expectedAsOf??null]);
}

export function crossEntryRetry(body,previous,{legacy=false}={}){
  if(!previous || previous.fromLegacy===legacy || previous.productId!==body.productId || previous.side!==body.side)return false;
  if(body.expectedNavCents!==undefined && body.expectedNavCents!==previous.navCents)return false;
  if(body.expectedAsOf!==undefined && body.expectedAsOf!==previous.asOf)return false;
  if(body.side==='buy')return body.amountCents===previous.requestedCents;
  return legacy?previous.unitsMicros===previous.positionBeforeUnitsMicros:body.unitsMicros===previous.unitsMicros;
}

// Each Studio product is owned by this workspace. A subscription or redemption
// changes the fund's cash and its owner's units in a single ledger transaction.
function applyStudioFlow(fund,cashDelta,afterUnits,remainingBasis,now){
  const old=fund.portfolio;
  if((cashDelta<0 && -cashDelta>old.cashCents) || (!afterUnits && old.positions.some(p=>p.quantity>0)))
    throw new PortfolioError('portfolio-fund-cash','The fund must hold sufficient paper cash to redeem these units.');
  const cash=integer(BigInt(old.cashCents)+BigInt(cashDelta));
  const equity=integer(BigInt(old.equityCents)+BigInt(cashDelta));
  const net=signedInteger(BigInt(fund.studioCapital.netContributionsCents)+BigInt(cashDelta));
  const pnl=equity-remainingBasis, unrealized=old.unrealizedPnlCents??0;
  const realized=pnl-unrealized;
  fund.portfolio={...old,cashCents:cash,cash:cash/100,equityCents:equity,equity:equity/100,
    initialCashCents:remainingBasis,initialCash:remainingBasis/100,totalPnlCents:pnl,totalPnl:pnl/100,
    realizedPnlCents:realized,realizedPnl:realized/100,returnPercent:remainingBasis?pnl/remainingBasis*100:0,
    positions:old.positions.map(p=>({...p,weightPercent:equity?p.marketValueCents/equity*100:0}))};
  fund.studioCapital={...fund.studioCapital,unitsMicros:afterUnits,netContributionsCents:net};
  const lastMark=Date.parse(fund.studioBookChangedAt??fund.createdAt);
  fund.studioBookChangedAt=Number.isFinite(lastMark)&&lastMark>=Date.parse(now)?new Date(lastMark+1).toISOString():now;
}
export function placePortfolioOrder(data,body,{legacy=false}={}){
  validatePortfolioOrder(body,{legacy});
  const book=bookFor(data),product=products(data).find(p=>p.productId===body.productId);
  if(!product)throw new PortfolioError('portfolio-product','This fund is not available in this portfolio.',404);
  const {navCents,asOf,source,sourceEn,kind:quoteKind}=product.quote;
  if(!Number.isSafeInteger(navCents)||navCents<0)throw new PortfolioError('portfolio-unpriced','No eligible paper NAV is available.');
  if((body.expectedNavCents!==undefined&&body.expectedNavCents!==navCents)||(body.expectedAsOf!==undefined&&body.expectedAsOf!==asOf))
    throw new PortfolioError('portfolio-quote-changed','The paper NAV changed. Review the new quote and confirm again.');
  const holding=book.positions[product.productId]??{unitsMicros:0,costBasisCents:0};
  const studio=product.kind==='studio'?data.funds.find(f=>f.id===product.productId.slice(7)&&f.studioCapital):null;
  if(studio && studio.studioCapital.unitsMicros!==holding.unitsMicros)
    throw new PortfolioError('portfolio-fund-units','The simulated fund units cannot be reconciled.');
  const mark=product.quote;
  let amountCents,unitsMicros,afterUnits,costBasisCents;
  let realized=book.realizedPnlCents;
  if(body.side==='buy'){
    if(body.amountCents>book.cashCents)throw new PortfolioError('portfolio-cash','Insufficient cash in this portfolio.');
    if(!(mark.outstandingUnitsMicros?mark.equityCents:navCents))throw new PortfolioError('portfolio-unpriced','Subscriptions require a positive paper NAV.');
    unitsMicros=mark.outstandingUnitsMicros>0?
      integer(BigInt(body.amountCents)*BigInt(mark.outstandingUnitsMicros)/BigInt(mark.equityCents)):
      integer(BigInt(body.amountCents)*scale/BigInt(navCents));
    afterUnits=integer(BigInt(holding.unitsMicros)+BigInt(unitsMicros));
    amountCents=holdingValue(afterUnits,mark)-holdingValue(holding.unitsMicros,mark);
    if(!unitsMicros||amountCents<1)throw new PortfolioError('portfolio-quantity','That amount cannot form a priced fund unit.');
    if(amountCents>body.amountCents)throw new PortfolioError('portfolio-quantity','The allocation exceeds the confirmed amount.');
    costBasisCents=integer(BigInt(holding.costBasisCents)+BigInt(amountCents));
  }else{
    unitsMicros=legacy?holding.unitsMicros:body.unitsMicros;
    if(!unitsMicros||unitsMicros>holding.unitsMicros)throw new PortfolioError('portfolio-units','Insufficient fund units in this portfolio.');
    afterUnits=holding.unitsMicros-unitsMicros;
    amountCents=holdingValue(holding.unitsMicros,mark)-holdingValue(afterUnits,mark);
    if(amountCents===0 && afterUnits>0)throw new PortfolioError('portfolio-quantity','This partial redemption is smaller than one cent.');
    const released=integer(BigInt(holding.costBasisCents)*BigInt(unitsMicros)/BigInt(holding.unitsMicros));
    costBasisCents=holding.costBasisCents-released;
    realized=signedInteger(BigInt(realized)+BigInt(amountCents)-BigInt(released));
  }
  const before=book.cashCents;
  const afterCash=body.side==='buy'?before-amountCents:integer(BigInt(before)+BigInt(amountCents));
  const createdAt=new Date().toISOString();
  if(studio)applyStudioFlow(studio,before-afterCash,afterUnits,costBasisCents,createdAt);
  book.cashCents=afterCash;
  book.realizedPnlCents=realized;
  if(afterUnits)book.positions[product.productId]={unitsMicros:afterUnits,costBasisCents};else delete book.positions[product.productId];
  book.totalOrders++;data.portfolioAccount=book;
  const entry={id:randomUUID(),requestId:body.requestId,productId:product.productId,name:product.name,nameEn:product.nameEn,
    ticker:product.ticker,kind:product.kind,quoteKind,side:body.side,amountCents,unitsMicros,navCents,asOf,source,sourceEn,
    createdAt,cashBeforeCents:before,cashAfterCents:book.cashCents,feeCents:0,
    fromLegacy:legacy,requestedCents:body.amountCents??null,positionBeforeUnitsMicros:holding.unitsMicros};
  // Older tabs display this compact per-fund history. Its valuation is read
  // from the shared ledger even if an order came from the portfolio page.
  if(product.kind==='catalog'){
    const id=product.productId.slice('catalog:'.length);
    data.catalogPortfolioViews??={};
    const prior=data.catalogPortfolioViews[id]?.history??[];
    data.catalogPortfolioViews[id]={environment:'portfolio-paper',catalogId:id,
      quote:{catalogId:id,date:asOf,priceCents:navCents,source,kind:quoteKind,currency:'USD',environment:'portfolio-paper'},
      history:[{side:body.side.toUpperCase(),units:unitsMicros/Number(scale),value:amountCents/100,
        quoteDate:asOf,price:navCents/100,source,requestId:body.requestId},...prior].slice(0,50)};
  }
  return entry;
}
