export {renderStudioFloor} from './team.mjs';
import {marketGallery,bindMarketFilters,bindQuoteSlots,studyVisual,bindStudyDossier} from './fund-gallery.mjs';
export {studyVisual};
import { recordedBuffett } from './salon-recordings.mjs';

const people = {
  buffett:{name:['沃伦·巴菲特','Warren Buffett'],short:['巴菲特','Buffett'],theme:['价值投资','Value investing'],initial:'WB',image:'/assets/buffett-selectusa-2015.jpg',credit:'ITA / SelectUSA · 2015',license:'https://commons.wikimedia.org/wiki/File:Warren_Buffett_at_the_2015_SelectUSA_Investment_Summit_(cropped).jpg',
    line:['好生意，也要有好价格。','What makes a great business worth its price?']},
  lynch:{name:['彼得·林奇','Peter Lynch'],short:['林奇','Lynch'],theme:['从身边发现企业','Everyday discoveries'],initial:'PL',line:['从一间排长队的店，开始一次研究。','A busy shop can be the start of a research question.'],
    qa:[['常去的店，值得买吗？','Does a busy store make a good investment?','常客体验给你一条研究线索。接下来还要看是哪家公司赚钱、这门生意占它多少收入，以及盈利与价格能否支持这个想法。','Familiarity gives you a lead. Trace the product to the business that earns the money, see how much it contributes, and compare earnings with the price.'],['什么会推翻这个想法？','What would challenge the idea?','客流上涨，利润却没有跟上，就要重新检查成本、负债和估值。林奇在访谈中强调要理解自己持有的企业，包括它的资产负债表。','If earnings lag traffic, revisit costs, debt and valuation. Lynch also emphasized understanding what the company does and what its balance sheet looks like.']]},
  dalio:{name:['瑞·达利欧','Ray Dalio'],short:['达利欧','Dalio'],theme:['宏观风险平衡','Risk balance'],initial:'RD',line:['如果增长和通胀同时转向呢？','What if growth and inflation both change direction?'],
    qa:[['持有更多资产就分散了吗？','Does holding more assets diversify risk?','不同资产可能都在押注增长加速。全天候方法从增长和通胀相对预期的变化出发，检查组合里究竟有哪些共同风险。','Different assets can all depend on stronger growth. All Weather starts by examining how unexpected changes in growth and inflation affect those exposures.'],['通胀意外上升时呢？','What if inflation surprises to the upside?','研究组会检查名义债券与对通胀更敏感资产的不同反应，并重新估算风险贡献。公开框架不足以推断桥水今天的持仓。','Examine how nominal bonds and inflation-sensitive assets respond, then reassess their risk contributions. The public framework does not reveal Bridgewater’s current positions.']]},
  'cathie-wood':{name:['凯茜·伍德','Cathie Wood'],short:['伍德','Wood'],theme:['颠覆式创新','Disruptive innovation'],initial:'CW',line:['一项新技术，何时能变成一门生意？','When does a breakthrough become a business?'],
    qa:[['如何验证新技术会被采用？','How do you test adoption?','ARK 将自上而下的技术研究与自下而上的公司研究结合。可以先拆开成本、潜在用户和竞争，再检验哪些公司能从采用率上升中获得收入。','ARK combines top-down technology research with bottom-up company analysis. Examine costs, potential users and competition, then identify how adoption might become revenue.'],['技术成功，股票也会成功吗？','Does a successful technology guarantee a winning stock?','公司仍要有持续经营的资金、竞争优势与合理估值。对同一项创新，用不同的采用速度和利润率假设，会得到很不同的结果。','A business still needs financing, competitive advantages and a defensible valuation. Changing adoption and margin assumptions can produce very different outcomes.']]},
  'keith-gill':{name:['基思·吉尔','Keith Gill'],short:['吉尔','Gill'],theme:['逆向价值研究','Contrarian research'],initial:'KG',line:['当市场看空时，先寻找能反驳自己的证据。','Start a contrarian idea by trying to disprove it.'],
    qa:[['悲观情绪就是便宜吗？','Does pessimism make a stock cheap?','吉尔在 2021 年国会证词中陈述了自己对 GameStop 的研究。这个研究席把它当作个案，分别检查市场悲观的理由、企业资产和扭转经营的可能。','Gill described his GameStop research in his 2021 testimony. Use that case to separate market pessimism from evidence about assets and the potential for a business turnaround.'],['这个个案能推广吗？','Can one case be generalized?','一次案例不能证明持续超额收益。检查现金消耗、融资需求和反方解释；公开证词无法提供另一家企业的合理价值。','One case cannot establish repeatable returns. Check cash burn, financing needs and opposing explanations. The testimony does not supply a valuation for a different business.']]}
};
Object.assign(people.dalio,{image:'/assets/ray-dalio-salon.webp',credit:'Harry Murphy / Web Summit via Sportsfile · CC BY 2.0',license:'https://www.flickr.com/photos/websummit/44858045925/',cc:true});
Object.assign(people['cathie-wood'],{image:'/assets/cathie-wood-salon.webp',credit:'Steve Jurvetson · CC BY 2.0',license:'https://www.flickr.com/photos/jurvetson/52065327043/',cc:true});
Object.assign(people.lynch,{image:'/assets/lynch-research-study.jpg'});
Object.assign(people['keith-gill'],{image:'/assets/gill-research-study.jpg'});
const marketOrder=['wellington','ark-innovation','premium-income','contrafund','active-bond','inflation-curve','stocks-plus','nasdaq-income','capital-growth'];
const safe=value=>String(value??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pick=(pair,lang)=>pair[lang==='en-US'?1:0];
const label=(zh,en,lang)=>lang==='en-US'?en:zh;
const arrow='<span class="sx-arr" aria-hidden="true">↗</span>';
const https=value=>{try{return new URL(value).protocol==='https:'?value:null}catch{return null}};
export function setupSalonStyle() {
  if(document.querySelector('link[data-strategy-salon]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./strategy-salon.css',import.meta.url).href;
  link.dataset.strategySalon='';document.head.append(link);
}
function medallion(id,small=false) {
  const person=people[id];
  if(!person)return '';
  const size=small?' sx-mini':'';
  const visual=person.image?'<img src="'+safe(person.image)+'" width="160" height="160" alt="" decoding="async">':'<span aria-hidden="true">'+safe(person.initial)+'</span>';
  return '<span class="sx-medallion sx-p-'+safe(id)+size+'">'+visual+'</span>';
}
const fundLabels={
  wellington:'Vanguard Wellington', 'ark-innovation':'ARK Innovation ETF', 'premium-income':'JPMorgan Equity Premium Income',
  contrafund:'Fidelity Contrafund','active-bond':'PIMCO Active Bond ETF','inflation-curve':'Quadratic IVOL',
  'stocks-plus':'PIMCO Stocks PLUS Bond Alpha','nasdaq-income':'JPMorgan Nasdaq Equity Premium Income',
  'capital-growth':'American Funds Growth Fund of America'
};

export function galleryUrl(url,group) {
  const next=new URL(url(),globalThis.location?.origin||'http://localhost');
  for(const key of ['guest','research','group','id','catalog'])next.searchParams.delete(key);
  if(group)next.searchParams.set('group',group);
  return next.pathname+next.search+next.hash;
}
function groupLink(href,title,description,art,kind) {
  return '<a class="sx-entry sx-'+kind+'" data-salon-link href="'+safe(href)+'"><div class="sx-entry-stage '+(kind==='people'?'sx-warm':'sx-cool')+'">'+art+'</div><div class="sx-entry-caption"><div><h2>'+safe(title)+'</h2><p>'+safe(description)+'</p></div>'+arrow+'</div></a>';
}
export function salonDirectory({items,lang,url,backUrl,extra='',query=new URLSearchParams(globalThis.location?.search||'')}) {
  const roster=['buffett','dalio','cathie-wood','lynch','keith-gill'].filter(id=>items.some(x=>x.id===id));
  const markets=marketOrder.map(id=>items.find(x=>x.id===id)).filter(Boolean);
  const from=query.get('group');
  const group=['people','markets'].includes(from)?from:roster.includes(query.get('guest'))?'people':markets.some(x=>x.id===query.get('research'))?'markets':'';
  const L=(zh,en)=>label(zh,en,lang);
  const title=group==='people'?L('名家风格基金','Investor-inspired funds'):group==='markets'?L('热门主动基金','Popular active funds'):L('挑选 AI 基金','Explore AI funds');
  const back=group?galleryUrl(url,''):backUrl;
  const intro=group==='people'?L('选择一位投资人，看看 AI 团队怎样把公开理念变成研究方法。','Choose an investor and see how an AI team studies their published approach.'):group==='markets'?L('选择基金代码，查看历史行情、研究方法和 AI 团队。','Choose a ticker to see its history, research method and AI team.'):L('和名家风格 AI 聊投资，研究用公开资料重建的基金。','Meet the investment minds. Study funds rebuilt from public sources.');
  const start='<section class="sx fg-directory" data-salon-directory data-fg-group="'+group+'"><a class="sx-back" data-salon-link href="'+safe(back)+'">‹ '+(group?L('挑选 AI 基金','Explore AI funds'):L('大厅','Home'))+'</a><h1 class="sx-title">'+title+'</h1><p class="sx-intro">'+intro+'</p>';
  if(group==='markets')return start+marketGallery({items:markets,lang,url,names:fundLabels})+'</section>';
  if(group==='people')return start+'<div class="fg-people-grid">'+roster.map(id=>{
    const p=people[id];
    return '<a class="fg-person-card" data-catalog-id="'+id+'" data-salon-link href="'+safe(url(id))+'"><span class="fg-person-theme">'+safe(pick(p.theme,lang))+'</span>'+medallion(id)+'<h2>'+safe(pick(p.name,lang))+'</h2><p>'+safe(pick(p.line,lang))+'</p><span class="fg-person-open">'+L('进入风格基金','Explore this fund')+' ↗</span></a>';
  }).join('')+'</div></section>';
  const peopleArt='<div class="fg-ensemble">'+roster.slice(0,3).map(id=>medallion(id)).join('')+'</div>';
  const fundArt='<div class="fg-symbols" aria-hidden="true"><span>ARKK</span><b>VWELX</b><span>JEPI</span></div>';
  return start+extra+'<div class="sx-pair">'+groupLink(galleryUrl(url,'people'),L('名家风格基金','Investor-inspired funds'),L('巴菲特 AI 投委会与四种投资风格研究。','The Buffett AI committee and four investor-style studies.'),peopleArt,'people')+groupLink(galleryUrl(url,'markets'),L('热门主动基金','Popular active funds'),L('九只主动基金的行情与 AI 研究档案。','Market history and AI dossiers for nine active funds.'),fundArt,'markets')+'</div></section>';
}
export function bindSalonDirectory(root) {
  bindMarketFilters(root);
  bindStudyDossier(root);
  void bindQuoteSlots(root);
  const jump=root.querySelector('[data-fg-jump]');
  if(jump)jump.onclick=()=>{
    const preview=root.querySelector('.bf-review-link');
    if(preview){preview.click();return;}
    const archived=root.querySelector('[data-bf-offline] [data-bf-open="manager"]');
    if(archived){archived.click();return;}
    const decision=root.querySelector('[data-bf-question] textarea');
    if(decision){decision.scrollIntoView({block:'center'});decision.focus({preventScroll:true});return;}
    const start=root.querySelector('[data-fg-live-start]');
    if(start&&!start.hidden)start.click();
    const target=jump.dataset.fgLive==='yes' ? root.querySelector('[data-fg-live-host] textarea, .sx-live textarea, [data-fg-live-host] h2')||root.querySelector('[data-fg-live-host]') : root.querySelector('[data-salon-guide] button');
    if(target){target.scrollIntoView({block:'center',behavior:'instant'});target.focus({preventScroll:true})}
  };
}
export function salonDetailHead(item,lang,backUrl,live=false) {
  const p=people[item.id],f=fundLabels[item.id];
  if(!p&&!f)return '';
  const what=p?label('名家风格基金','Investor-inspired funds',lang):label('热门主动基金','Popular active funds',lang);
  const visual=p?medallion(item.id):'<span class="sx-detail-disc" aria-hidden="true"><span class="sx-disc"></span><b>'+safe(item.ticker)+'</b></span>';
  const jump=p?'<button class="fg-detail-talk" data-fg-jump data-fg-live="'+(live?'yes':'no')+'" type="button">'+(item.id==='buffett'?(live?label('向经理追问一笔决定','Ask about a decision',lang):label('读经理当时的判断','Read the manager’s record',lang)):live?label('和研究经理聊聊','Talk to the AI researcher',lang):label('与研究席一起读策略','Explore the guided discussion',lang))+' ↗</button>':'';
  return '<header class="sx-detail-head '+(p?'sx-human':'sx-financial')+'"><a href="'+safe(backUrl)+'" class="sx-back" data-salon-link>‹ '+what+'</a><div class="sx-subject">'+visual+'<div><span class="sx-eyebrow">'+what+' · '+safe(p?pick(p.theme,lang):item.category)+'</span><h1>'+safe(p?pick(p.name,lang):item.ticker)+'</h1><p>'+safe(p?item.id==='buffett'?label('研究、风控与基金经理共同管理的巴菲特风格实验','A Buffett-style study run by research, risk and a fund manager',lang):label('根据公开方法设计的独立 AI 研究席','Independent AI researcher inspired by published methods',lang):item.officialName||item.name)+'</p>'+jump+'</div></div></header>';
}
export function salonGuide(item,lang) {
  const p=people[item.id];if(!p)return '';
  const recorded=item.id==='buffett';
  const records=recorded?recordedBuffett[lang]:p.qa.map(row=>({question:label(row[0],row[1],lang),answer:label(row[2],row[3],lang)}));
  const first=records[0];
  return '<section class="sx-guide" data-salon-guide="'+item.id+'" data-salon-lang="'+lang+'"><span class="sx-eyebrow">'+(recorded?label('可互动的已录 AI 对谈','Interactive recorded AI conversation',lang):label('有出处的方法导读','Source-based field notes',lang))+'</span><h2>'+safe(pick(p.line,lang))+'</h2><div class="sx-guide-thread" aria-live="polite"></div><button class="sx-guide-question" type="button" data-step="0">'+safe(first.question)+' <span aria-hidden="true">↗</span></button>'+'</section>';
}
export function bindSalonGuide(root) {
  const view=root.querySelector('[data-salon-guide]');if(!view)return;
  const id=view.dataset.salonGuide,lang=view.dataset.salonLang;
  const rows=id==='buffett'?recordedBuffett[lang]:people[id].qa.map(r=>({question:label(r[0],r[1],lang),answer:label(r[2],r[3],lang)}));
  const button=view.querySelector('.sx-guide-question'),thread=view.querySelector('.sx-guide-thread');
  let step=0;
  const summaries={
    'zh-CN':['好生意也会太贵。先估算它能长期留下多少现金，再看出价是否还留有判断出错的余地。','扣除维持生意所需的投资，以保守假设估算价值区间。团队要求报价低于估值，为判断偏差留出空间。','若护城河减弱、维持性投入增加，原估值就需要重做。团队要能用当时的财报和可重复的假设说明原因。'],
    'en-US':['A strong business can still be overpriced. Compare its durable cash flows with the price and leave room for an error in the estimate.','Estimate a conservative value range after maintenance investment. Require a discount so an error in those assumptions can be absorbed.','Evidence of an eroding moat or greater maintenance needs would challenge the valuation. The team wants dated financials and reproducible assumptions.']
  };
  button.addEventListener('click',()=>{
    if(step===rows.length){step=0;thread.replaceChildren();button.textContent=rows[0].question+' ↗';return}
    for(const old of thread.querySelectorAll('details.sx-exchange'))old.open=false;
    const record=rows[step],entry=document.createElement('article');entry.className='sx-turn';
    const exchange=document.createElement('details');exchange.className='sx-exchange';exchange.open=true;
    const question=document.createElement('summary');question.className='sx-q';question.textContent=record.question;
    const author=document.createElement('small');author.className='sx-respondent';
    author.textContent=record.responseId?label('风格 AI 研究员 · 回答要点','AI style researcher · Edited summary',lang):label('研究席 · 资料导读','Research desk · Field note',lang);
    const answer=document.createElement('p');answer.className='sx-answer';answer.tabIndex=-1;
    answer.textContent=record.responseId?summaries[lang][step]:record.answer;
    exchange.append(question,author,answer);
    if(record.responseId){
      const more=document.createElement('details'),summary=document.createElement('summary');more.className='sx-sources';summary.textContent=label('完整回答与模型回执','Full reply and model receipt',lang);
      const original=document.createElement('p');original.textContent=record.answer;
      const receipt=document.createElement('code');receipt.textContent='HarnessRouter · '+record.recordedAt.slice(0,10)+' · '+record.responseId;
      more.append(summary,original,receipt);exchange.append(more);
    }
    entry.append(exchange);thread.append(entry);step++;button.textContent=step<rows.length?rows[step].question+' ↗':label('从第一问再看一次','Replay from the first question',lang);
    answer.focus({preventScroll:true});
  });
}

export function salonCredits(item,lang) {
  const p=people[item.id];if(!p?.image||!p.license)return '';
  if(!p.cc)return '<p class="sx-market-note">'+label('档案摄影','Portrait credit',lang)+' · <a href="'+safe(p.license)+'" rel="noopener noreferrer" target="_blank">'+safe(p.credit)+'</a></p>';
  return '<p class="sx-market-note">'+label('档案摄影，裁切使用。','Archival photograph, cropped. ',lang)+' <a href="'+safe(p.license)+'" target="_blank" rel="noopener noreferrer">'+safe(p.credit.split(' · ')[0])+'</a> · <a href="https://creativecommons.org/licenses/by/2.0/" target="_blank" rel="noopener noreferrer">CC BY 2.0</a></p>';
}
export function enableSalonLinks(root) {
  root.addEventListener('click',event=>{const link=event.target.closest('a[data-salon-link]');if(link)link.dataset.route=''});
}
