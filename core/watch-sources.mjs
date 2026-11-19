import {expectedClose,marketDay,quoteSession} from './market-freshness-calendar.mjs';

const assets={
  AAPL:{match:/\bAAPL\b|\bApple\b|苹果/iu},MSFT:{match:/\bMSFT\b|Microsoft|微软/iu},
  NVDA:{match:/\bNVDA\b|NVIDIA|英伟达|半导体|semiconductor/iu},AMZN:{match:/\bAMZN\b|Amazon|亚马逊/iu},
  GOOGL:{match:/\bGOOGL?\b|Google|Alphabet|谷歌/iu},TSLA:{match:/\bTSLA\b|Tesla|特斯拉/iu},
  JPM:{match:/\bJPM\b|JPMorgan|摩根大通/iu},WMT:{match:/\bWMT\b|Walmart|沃尔玛/iu},COST:{match:/\bCOST\b|Costco|好市多/u},
  QQQ:{etf:true,match:/\bQQQ\b|NASDAQ[- ]?100|纳斯达克.?100/iu},
  XLE:{etf:true,match:/\bXLE\b|energy|能源/iu},XLV:{etf:true,match:/\bXLV\b|healthcare|医疗/iu},
  XLF:{etf:true,match:/\bXLF\b|banking|financial sector|银行|金融板块/iu},XLK:{etf:true,match:/\bXLK\b|technology|科技/iu},
  XLP:{etf:true,match:/\bXLP\b|consumer staples|必需消费/iu},GLD:{etf:true,match:/\bGLD\b|gold|黄金/iu},
  TLT:{etf:true,match:/\bTLT\b|treasur(?:y|ies)|美国国债|美债/iu},
  SPY:{etf:true,match:/\bSPY\b|S\s*&\s*P\s*500|标普.?500|宽基/iu},
};
const byteLimit=650_000,dayMs=86_400_000;
export function watchList(fund){
  const choices=new Map(),uncovered=[];
  const add=(raw,basis)=>{const symbol=String(raw||'').toUpperCase();if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol))return;
    if(!Object.hasOwn(assets,symbol)){if(!uncovered.includes(symbol))uncovered.push(symbol);return;}
    if(!choices.has(symbol))choices.set(symbol,basis);};
  fund.portfolio?.positions?.forEach(p=>add(p.symbol,'holding'));
  fund.permissions?.allowedSymbols?.forEach(s=>add(s,'authorized-list'));
  for(const [s,a] of Object.entries(assets))if(a.match.test(fund.mandate||''))add(s,'mandate');
  if(!choices.size)add('SPY','market-benchmark');
  const all=[...choices].map(([symbol,basis])=>({symbol,basis}));
  return {symbols:all.slice(0,4),uncovered:uncovered.concat(all.slice(4).map(p=>p.symbol))};
}

async function documentAt(url,fetchImpl){
  const r=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(6000),headers:{'User-Agent':'Fund Edition (public market research)','Accept':'application/json, application/rss+xml, application/xml, text/xml, */*'}});
  if(!r.ok||!r.body||Number(r.headers.get('content-length'))>byteLimit){await r.body?.cancel();throw Error('source-unavailable');}
  const chunks=[];let n=0;
  for await(const part of r.body){n+=part.length;if(n>byteLimit)throw Error('source-document-too-large');chunks.push(part);}
  return Buffer.concat(chunks).toString('utf8');
}
const entity=s=>s.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/giu,(_,k)=>{
  const named={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};if(Object.hasOwn(named,k))return named[k];
  const point=k.startsWith('#x')?parseInt(k.slice(2),16):Number(k.slice(1));return Number.isInteger(point)&&point>=32&&point<=0x10ffff?String.fromCodePoint(point):'';
});
function textTag(item,tag){
  const raw=item.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','iu'))?.[1]??'';
  return entity(raw.trim().replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/u,'$1').replace(/<[^>]*>/gu,'')).replace(/\s+/gu,' ').trim();
}
export function readHeadlines(xml,{source,symbol,host,now}){
  if(!/<(?:rss|rdf:RDF)\b/iu.test(xml))throw Error('invalid-feed');
  const result=[];
  for(const item of xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/giu)??[]){
    const title=textTag(item,'title'),date=Date.parse(textTag(item,'pubDate'));
    if(!title||!Number.isFinite(date)||date>now||now-date>7*dayMs)continue;
    try{
      const link=new URL(textTag(item,'link'));
      if(link.protocol!=='https:'||link.username||link.password||link.hostname!==host)continue;
      result.push({title:title.slice(0,240),url:link.href,source,symbol,publishedAt:new Date(date).toISOString()});
    }catch{}
  }
  return result.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,4);
}

const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function quoteStamp(s){
  const m=/^([A-Z][a-z]{2}) (\d{1,2}), (20\d{2})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\s*(ET|EST|EDT))?$/u.exec(String(s||'').trim());
  if(!m||!months.includes(m[1]))return null;
  const date=m[3]+'-'+String(months.indexOf(m[1])+1).padStart(2,'0')+'-'+m[2].padStart(2,'0');
  if(new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)return null;
  if(!m[4])return {day:date,at:null};
  if(+m[4]<1||+m[4]>12||+m[5]>=60||+(m[6]??0)>=60)return null;
  const hour=(+m[4]%12)+(m[7]==='PM'?12:0);
  for(const offset of m[8]==='EDT'?[4]:m[8]==='EST'?[5]:[4,5]){
    const epoch=Date.parse(date+'T00:00:00Z')+((hour+offset)*3600+Number(m[5])*60+Number(m[6]||0))*1000;
    const wall=marketDay(epoch);if(wall.date===date&&wall.hour===hour&&wall.minute===Number(m[5]))return {day:date,at:new Date(epoch).toISOString()};
  }return null;
}
export function readWatchQuote(document,symbol,now){
  const {data}=JSON.parse(document),p=data?.primaryData;
  const stamp=quoteStamp(p?.lastTradeTimestamp),price=/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(p?.lastSalePrice)?Number(p.lastSalePrice.replace(/[$,]/g,'')):0;
  if(data?.symbol!==symbol||!stamp||!(price>0)||stamp.day>marketDay(now).date||(stamp.at&&Date.parse(stamp.at)>now))throw Error('invalid-quote');
  const age=stamp.at?now-Date.parse(stamp.at):null;
  const status=stamp.at&&quoteSession(stamp.at)==='regular'&&quoteSession(new Date(now).toISOString())==='regular'&&age<=20*60_000?(p.isRealTime===true?'fresh':'delayed'):stamp.day===expectedClose(now)?'dated':'stale';
  return {symbol,valueUsd:price,provider:'Nasdaq',sourceUrl:'https://www.nasdaq.com/market-activity/'+(assets[symbol].etf?'etf':'stocks')+'/'+symbol.toLowerCase(),asOf:stamp.at||stamp.day,status,kind:stamp.at?'last-sale':'dated-sale',executionEligible:false};
}

export function createWatchSources({fetchImpl=fetch,readReference,now=Date.now,cache}={}){
  const pending=new Map();
  async function reuse(key,ttl,load){
    const hit=cache?.get(key,now());if(hit)return hit;
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{let value;try{value={data:await load(),ok:true};}catch{value={data:null,ok:false};}
      value.checkedAt=new Date(now()).toISOString();cache?.set(key,value,now()+(value.ok?ttl:5*60_000));return value;})();
    pending.set(key,task);try{return await task;}finally{pending.delete(key);}
  }
  const observe=async symbol=>{
    const url='https://api.nasdaq.com/api/quote/'+symbol+'/info?assetclass='+(assets[symbol].etf?'etf':'stocks');
    const primary=await reuse('quote:'+symbol,8*60_000,async()=>readWatchQuote(await documentAt(url,fetchImpl),symbol,now()));
    if(primary.ok&&primary.data.kind==='dated-sale'){
      primary.data={...primary.data,status:primary.data.asOf===expectedClose(now())?'dated':'stale'};
    }
    if(primary.ok&&['fresh','delayed'].includes(primary.data.status)){
      if(now()-Date.parse(primary.data.asOf)<=20*60_000&&quoteSession(new Date(now()).toISOString())==='regular')return {...primary.data,checkedAt:primary.checkedAt};
      primary.data={...primary.data,status:'stale'};
    }
    if(['AAPL','MSFT','NVDA','SPY'].includes(symbol)&&readReference){
      const secondary=await reuse('close:'+symbol+':'+(expectedClose(now())||'unknown'),30*60_000,async()=>{
        const result=await readReference(symbol,{studio:true});const ref=result.observations.find(o=>o.valueUsd>0&&o.asOf);
        if(!ref)throw Error('missing-close');return {symbol,provider:ref.provider,sourceUrl:ref.sourceUrl,kind:'reference-close',asOf:ref.asOf,valueUsd:ref.valueUsd,status:ref.status,executionEligible:false};});
      if(secondary.ok&&(!primary.ok||secondary.data.asOf>=(primary.data.asOf||'').slice(0,10)))return {...secondary.data,checkedAt:secondary.checkedAt};
    }
    return primary.ok?{...primary.data,checkedAt:primary.checkedAt}:{symbol,provider:'Nasdaq',sourceUrl:'https://www.nasdaq.com/market-activity/'+(assets[symbol].etf?'etf':'stocks')+'/'+symbol.toLowerCase(),status:'unavailable',valueUsd:null,asOf:null,kind:'last-sale',executionEligible:false,checkedAt:primary.checkedAt};
  };
  return async fund=>{
    const {symbols,uncovered}=watchList(fund);
    const sources=[{name:'Federal Reserve',symbol:null,url:'https://www.federalreserve.gov/feeds/press_all.xml',host:'www.federalreserve.gov'},
      ...symbols.map(({symbol})=>({name:'Nasdaq',symbol,url:'https://www.nasdaq.com/feed/rssoutbound?symbol='+symbol,host:'www.nasdaq.com'}))];
    const [quotes,checks]=await Promise.all([Promise.all(symbols.map(({symbol})=>observe(symbol))),Promise.all(sources.map(async s=>{
      const row=await reuse('feed:'+(s.symbol||'Fed'),30*60_000,async()=>readHeadlines(await documentAt(s.url,fetchImpl),{source:s.name,symbol:s.symbol,host:s.host,now:now()}));
      return {feed:{name:s.name,url:s.url,symbol:s.symbol,checkedAt:row.checkedAt,status:row.ok?'ok':'unavailable',count:row.data?.length??0},items:row.data||[]};}))]);
    const seen=new Set(),news=checks.flatMap(c=>c.items.slice(0,2)).filter(n=>{if(seen.has(n.url))return false;seen.add(n.url);return true;}).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
    return {symbols,uncovered,quotes,news,feeds:checks.map(c=>c.feed),capturedAt:new Date(now()).toISOString()};
  };
}
