import { bindBuffettStudy, buffettShell } from './buffett-dossier.mjs';
import { comparativeSeries, performancePanel, tradesPanel, bindComparisons } from './fund-performance.mjs';
import { chartSample, disclosedHoldings, exchangeFunds, meetingRecords, readReviewQuotes, strategyMandate } from './fund-gallery-data.mjs';
import { arkHoldingsStudy, ARK_FILING_LINKS } from './replication-cases.mjs';

const esc = v=>String(v??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const at=(pair,lang)=>pair[lang==='en-US'?1:0];
const local=(lang,zh,en)=>at([zh,en],lang);
const close=(r)=>r.length===5?r[4]:r[1];
const fmt=x=>new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(x);
function svgPlot(sample,lang,large=false) {
  const {rows,kind}=sample;
  const w=large?680:240,h=large?186:70,pad=large?12:5,decimal=v=>v.toFixed(2);
  const values=rows.flatMap(r=>kind==='candles'?[r[2],r[3]]:[r[1]]);
  const min=Math.min(...values),max=Math.max(...values),spread=max-min||1;
  const x=i=>pad+i*(w-2*pad)/Math.max(1,rows.length-1);
  const y=v=>pad+(max-v)*(h-2*pad)/spread;
  let drawing='';
  for(let i=0;i<3;i++) {
    const py=decimal(pad+(h-2*pad)*i/2);
    drawing+='<path class="fg-guide" d="M0 '+py+'H'+w+'"/>';
  }
  if(kind==='candles'){
    const width=Math.max(1.3,(w-2*pad)/rows.length*.54);
    drawing+=rows.map(([,o,hi,lo,c],i)=>{
      const pos=x(i),top=Math.min(y(o),y(c)),height=Math.max(1,Math.abs(y(c)-y(o)));
      return '<g class="'+(c>=o?'fg-rise':'fg-fall')+'"><path d="M'+decimal(pos)+' '+decimal(y(hi))+'V'+decimal(y(lo))+'"/><rect x="'+decimal(pos-width/2)+'" y="'+decimal(top)+'" width="'+decimal(width)+'" height="'+decimal(height)+'" rx=".7"/></g>';
    }).join('');
  } else {
    const path=rows.map((r,i)=>(i?'L':'M')+decimal(x(i))+' '+decimal(y(r[1]))).join(' ');
    drawing+='<path class="fg-fill" d="'+path+' L'+decimal(x(rows.length-1))+' '+h+' L'+pad+' '+h+' Z"/><path class="fg-line" d="'+path+'"/>';
  }
  if(large)drawing+='<line data-fg-cursor class="fg-cursor" x1="'+x(rows.length-1)+'" x2="'+x(rows.length-1)+'" y1="0" y2="'+h+'"/>';
  return '<svg class="fg-plot" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" role="img" aria-label="'+esc(at(sample.basis,lang)+' · '+rows[0][0]+' – '+rows.at(-1)[0])+'">'+drawing+'</svg>';
}
function valueLabel(sample) {return sample.unit==='USD'?'$':'';}
function quoteContent(ticker,lang,quotes,large) {
  const sample=chartSample(ticker,quotes),L=(z,e)=>local(lang,z,e);
  if(!sample) return '<div class="fg-no-chart"><span>'+L('交易所行情','Exchange history')+'</span><p>'+L('暂无获准展示的价格序列','Prices unavailable for display')+'</p></div>';
  const rows=sample.rows,last=rows.at(-1),label=at(sample.basis,lang),amount=valueLabel(sample)+fmt(close(last));
  const header='<div class="fg-quote-head"><span>'+esc(label)+'</span><strong>'+esc(amount)+'</strong></div>';
  const axis='<div class="fg-axis"><time>'+rows[0][0]+'</time><time>'+last[0]+'</time></div>';
  if(!large)return header+svgPlot(sample,lang)+axis;
  const desc=sample.kind==='candles'?L('美元 · IEX 单一交易所样本 · 每根显示开高低收。','USD · IEX venue only · each candle shows open, high, low and close.'):sample.kind==='index'?L('含分配再投资的年度总回报，起点为 100。','Annual total returns with distributions reinvested, indexed to 100.'):L('美元 · 每份基金净值。分配会影响净值走势。','USD · Net asset value per share. Distributions affect the price series.');
  return header+'<div class="fg-inspect">'+svgPlot(sample,lang,true)+'<label class="fg-scrub"><span>'+L('查看观察日','Inspect a date')+'</span><input type="range" min="0" max="'+(rows.length-1)+'" value="'+(rows.length-1)+'" step="1" aria-label="'+L('查看历史数据点','Inspect historical observation')+'"/></label><output data-fg-value></output></div>'+axis+'<figcaption>'+esc(desc)+' <a href="'+esc(sample.url)+'" target="_blank" rel="noopener noreferrer">'+esc(sample.credit)+' ↗</a></figcaption>';
}
export function quoteSlot(item,lang,large=false) {
  return '<figure class="fg-quote '+(large?'fg-large':'fg-mini')+'" data-fg-ticker="'+esc(item.ticker)+'" data-fg-lang="'+esc(lang)+'"'+(large?' data-fg-large':'')+'>'+quoteContent(item.ticker,lang,{},large)+'</figure>';
}
function inspect(node,sample,lang) {
  const slider=node.querySelector('input[type=range]'),svg=node.querySelector('.fg-plot');
  if(!slider||!svg)return;
  const cursor=svg.querySelector('[data-fg-cursor]'),output=node.querySelector('[data-fg-value]');
  const L=(z,e)=>local(lang,z,e);
  const update=()=>{
    const i=Number(slider.value),r=sample.rows[i],pos=12+i*656/(sample.rows.length-1);
    cursor.setAttribute('x1',String(pos));cursor.setAttribute('x2',String(pos));
    const names=sample.kind==='candles'?[L('开','O'),L('高','H'),L('低','L'),L('收','C')]:[sample.kind==='index'?L('指数','Index'):'NAV'];
    output.textContent=r[0]+'   '+r.slice(1).map((v,index)=>names[index]+' '+valueLabel(sample)+fmt(v)).join('   ');
    slider.setAttribute('aria-valuetext',output.textContent);
  };
  const fromPointer=e=>{const b=svg.getBoundingClientRect();if(!b.width)return;slider.value=String(Math.round(Math.max(0,Math.min(1,((e.clientX-b.left)/b.width*680-12)/656))*(sample.rows.length-1)));update()};
  svg.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')fromPointer(e)});
  svg.addEventListener('pointerdown',fromPointer);slider.addEventListener('input',update);update();
}
export async function bindQuoteSlots(root) {
  const slots=Array.from(root.querySelectorAll('[data-fg-ticker]'));
  if(!slots.length)return;
  const needsPrivate=slots.some(n=>exchangeFunds.has(n.dataset.fgTicker));
  const quotes=needsPrivate?await readReviewQuotes():{};
  for(const node of slots) {
    if(!node.isConnected)continue;
    const {fgTicker:ticker,fgLang:lang}=node.dataset,large=node.hasAttribute('data-fg-large'),sample=chartSample(ticker,quotes);
    node.innerHTML=quoteContent(ticker,lang,quotes,large);
    if(sample&&large)inspect(node,sample,lang);
  }
}
export function marketGallery({items,lang,url,names}) {
  const L=(z,e)=>local(lang,z,e);
  const cards=items.map(item=>{
    const etf=exchangeFunds.has(item.ticker);
    return '<a data-salon-link data-catalog-id="'+esc(item.id)+'" class="fg-card" data-kind="'+(etf?'etf':'mutual')+'" href="'+esc(url(item.id))+'"><div class="fg-meta"><span>'+L(etf?'主动 ETF':'共同基金',etf?'Active ETF':'Mutual fund')+'</span><span class="fg-open" aria-hidden="true">↗</span></div><h2>'+esc(item.ticker)+'</h2><p class="fg-name">'+esc(names[item.id]||item.officialName||item.name)+'</p>'+quoteSlot(item,lang)+'</a>';
  }).join('');
  return '<div class="fg-filters" role="group" aria-label="'+L('基金类型','Fund type')+'">'+[['all',L('全部','All')],['etf','ETF'],['mutual',L('共同基金','Mutual funds')]].map(([key,text],i)=>'<button type="button" data-fg-filter="'+key+'" aria-pressed="'+(i===0)+'">'+text+'</button>').join('')+'</div><div class="fg-market-grid">'+cards+'</div>';
}
export function bindMarketFilters(root) {
  const buttons = [...root.querySelectorAll('[data-fg-filter]')];
  if (!buttons.length) return;
  function display(kind) {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.fgFilter === kind));
    for (const card of root.querySelectorAll('.fg-card')) card.hidden = kind !== 'all' && card.dataset.kind !== kind;
  }
  const saved = history.state?.marketFilter;
  if (buttons.some(button => button.dataset.fgFilter === saved)) display(saved);
  for (const button of buttons) button.addEventListener('click', () => {
    const kind = button.dataset.fgFilter;
    history.replaceState({...history.state, marketFilter:kind}, '');
    display(kind);
  });
}
const lastDossierTab = new Map();
export function bindStudyDossier(root) {
  bindBuffettStudy(root);
  bindComparisons(root);
  const dossier=root.querySelector('[data-fg-dossier]');
  if(!dossier)return;
  const tabs=[...dossier.querySelectorAll('[role=tab]')], panels=[...dossier.querySelectorAll('[role=tabpanel]')];
  const storageKey='fund-edition.dossier.tab.'+dossier.dataset.fgDossier;
  function activate(target,focus=false){
    const selected=target.getAttribute('aria-controls');
    lastDossierTab.set(storageKey,selected);
    try {sessionStorage.setItem(storageKey,selected);} catch {}
    for(const tab of tabs){const current=tab===target;tab.setAttribute('aria-selected',String(current));tab.tabIndex=current?0:-1;}
    for(const panel of panels)panel.hidden=panel.id!==target.getAttribute('aria-controls');
    if(focus)target.focus();
  }
  let saved=lastDossierTab.get(storageKey);
  try {saved=sessionStorage.getItem(storageKey)||saved;} catch {}
  const selected=tabs.find(tab=>tab.getAttribute('aria-controls')===saved);
  if(selected)activate(selected);
  for(const [index,tab] of tabs.entries()){
    tab.onclick=()=>activate(tab);
    tab.onkeydown=e=>{
      const move={ArrowRight:(index+1)%tabs.length,ArrowLeft:(index+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1};
      if(Object.hasOwn(move,e.key)){e.preventDefault();activate(tabs[move[e.key]],true);}
    };
  }
}

function holdingsPanel(id,L) {
  const h=disclosedHoldings(id);
  if(!h)return '';
  const upper=Math.ceil(Math.max(...h.holdings.map(row=>row.weight))/5)*5;
  const rows=[...h.holdings].sort((a,b)=>b.weight-a.weight).map(row=>'<div><span>'+esc(row.symbol)+'</span><svg aria-hidden="true" viewBox="0 0 100 6" preserveAspectRatio="none"><rect class="fg-weight-track" width="100" height="6" rx="2"/><rect class="fg-weight-bar" width="'+(100*row.weight/upper).toFixed(2)+'" height="6" rx="2"/></svg><b>'+fmt(row.weight)+'%</b></div>').join('');
  return '<section class="fg-holdings"><h3>'+L('披露持仓','Disclosed holdings')+'</h3><p>'+esc(h.reportDate)+' · '+L('五项样本占原基金净资产的比例','Five sampled positions, each as a percentage of original fund net assets')+'</p><div class="fg-weights">'+rows+'</div><a href="'+esc(h.url)+'" target="_blank" rel="noopener noreferrer">SEC N-PORT ↗</a></section>';
}

function arkEvidencePanel(L) {
  const {decisionAt,training,holdout,modelCovered,rows} = arkHoldingsStudy();
  const filings = [...training,holdout].map((filing,index) => {
    const use = index < training.length ? L('估算依据','Model input') : L('事后核对','Later check');
    return '<li><a href="'+esc(ARK_FILING_LINKS[filing.source])+'" target="_blank" rel="noopener noreferrer">'+
      esc(filing.reportDate)+' · SEC ↗</a> · '+use+' · '+L('可用时点','Available by proxy')+' '+filing.publicAt.slice(0,10)+'</li>';
  });
  const weights = rows.map(row => '<li><strong>'+esc(row.symbol)+'</strong><span>'+
    L('估算','Estimate')+' '+fmt(row.modelWeight)+'%</span><span>'+L('后续披露','Later filing')+' '+fmt(row.disclosedWeight)+'%</span></li>');
  const coverage = [[L('当时估算','Estimated'),modelCovered],[L('后续披露','Later filing'),holdout.covered]]
    .map(([label,weight])=>'<div><span>'+label+'</span><svg aria-hidden="true" viewBox="0 0 100 8" preserveAspectRatio="none">'+
      '<rect class="fg-weight-track" width="100" height="8" rx="2"/><rect class="fg-weight-bar" width="'+weight+'" height="8" rx="2"/></svg>'+
      '<b>'+fmt(weight)+'%</b></div>').join('');
  return '<section class="fd-trades" data-ark-study><p class="fd-kicker">SEC N-PORT · '+L('五项持仓抽样','Five sampled holdings')+'</p>'+
    '<h2>'+L('当时能推算出哪些持仓？','What could two filings tell us?')+'</h2><p>'+
    L('截至 '+decisionAt.slice(0,10)+'，团队能看到两期报告。研究取每只股票已披露权重的均值，再用第三期报告核对。期间买卖和未抽样持仓仍是未知。',
      'By '+decisionAt.slice(0,10)+', two filings were available. The study averaged each stock’s reported weights and checked the estimate against a third filing. Other holdings and intervening trades remain unknown.')+'</p>'+
    '<figure class="fg-coverage"><figcaption>'+L('五只股票合计占原基金净资产','Five holdings as a share of total fund assets')+'</figcaption><div class="fg-weights">'+coverage+'</div></figure>'+
    '<details><summary>'+L('核对五只股票与三份原始报告','Inspect five weights and three SEC filings')+'</summary><ol>'+weights.join('')+
    '</ol><ul>'+filings.join('')+'</ul><p class="fd-foot">'+
    L('本研究把申报次日 12:00 UTC 作为保守的可用时点。7 月报表只用于事后核对。两列都是占原基金净资产的权重，无法据此计算策略回报。',
      'The study treats noon UTC on the day after filing as a conservative availability time. July holdings are reserved for the later check. Both columns are weights in total fund assets. Strategy returns cannot be calculated from this comparison.')+
    '</p></details></section>';
}

export function studyVisual(item,lang,{committeeExtras='',managerAvailable=true}={}) {
  if (item.id === 'buffett') return buffettShell(lang,managerAvailable) + committeeExtras;
  const L=(z,e)=>local(lang,z,e),mandate=strategyMandate(item.id,lang),persona=item.section==='persona';
  const series=comparativeSeries(item);
  const firstLabel=item.id==='ark-innovation'?L('持仓与行情','Holdings & price'):L('走势','Performance');
  const label=[firstLabel,L('投资方法','Strategy'),L('投委会与依据','Committee & sources')];
  const key=['performance','strategy','committee'],prefix='fd-'+item.id+'-';
  const controls=key.map((id,i)=>'<button type="button" role="tab" id="'+prefix+id+'-tab" aria-controls="'+prefix+id+'" aria-selected="'+(i===0)+'" tabindex="'+(i===0?0:-1)+'">'+esc(label[i])+'</button>').join('');
  const pane=(i,content)=>'<div class="fd-panel" id="'+prefix+key[i]+'" role="tabpanel" aria-labelledby="'+prefix+key[i]+'-tab" tabindex="0"'+(i?' hidden':'')+'>'+content+'</div>';
  const chart=series?performancePanel(item,series,lang):'<section class="fg-chart-panel"><p class="fd-kicker">'+L('原基金披露与历史行情','Original fund disclosures and market history')+'</p><h2>'+esc(item.ticker)+' · '+L('原基金价格记录','Original fund price history')+'</h2>'+quoteSlot(item,lang,true)+'<p class="fd-foot">'+esc(mandate.missing)+' '+L('代理与原基金的同期净值对照尚未建立。','An aligned proxy-versus-fund return series has not been established.')+'</p></section>';
  const symbols=mandate.universe.allowedSymbols;
  const universe=symbols.length?'<section class="fg-universe"><h3>'+L('研究范围','Research universe')+'</h3><div>'+symbols.map(s=>'<span>'+esc(s)+'</span>').join('')+'</div><p>'+esc(mandate.universe.scope)+'</p></section>':'';
  const method='<section class="fg-thesis"><p class="fd-kicker">'+esc(mandate.name)+'</p><h2>'+L('投资判断从哪里开始？','What drives a decision?')+'</h2><p class="fd-rule">'+esc(mandate.rule)+'</p></section>'+universe+
    '<section class="fg-method"><h3>'+L('检验这套方法','Testing the method')+'</h3><dl>'+[[L('比较基准','Benchmark'),mandate.benchmark],[L('成本假设','Cost assumptions'),mandate.cost],[L('已知局限','Known limitations'),mandate.missing]].map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl></section>'+
    (persona?tradesPanel(series.study,lang):holdingsPanel(item.id,L))+
    (series&&!persona?'<section class="fg-chart-panel"><h3>'+L('原基金历史序列','Original fund history')+'</h3>'+quoteSlot(item,lang,true)+'</section>':'');
  const roleNames=[L('研究员','Research analyst'),L('独立风控','Independent risk'),L('基金经理','Fund manager')];
  const roles=['research','risk','manager'].map((k,i)=>'<li><span class="fg-seat-mark" aria-hidden="true">'+['R','Δ','M'][i]+'</span><div><h3>'+esc(roleNames[i])+'</h3><p>'+esc(mandate.roles[k])+'</p></div></li>').join('');
  const rec=meetingRecords[item.id];
  const receipt=rec?'<section class="fg-record"><h3>'+L('一次已记录的 AI 会议','A recorded AI committee meeting')+'</h3><p>'+esc(rec.date)+' · '+esc(at(rec.outcome,lang))+'</p>'+rec.receipts.map((id,i)=>'<p><b>'+esc(roleNames[i])+'</b> <code>'+esc(id)+'</code></p>').join('')+'</section>':'';
  const sources=mandate.sources.filter(s=>/^https:\/\//u.test(s.url)).map(s=>'<li><a target="_blank" rel="noopener noreferrer" href="'+esc(s.url)+'">'+esc(s.title)+' ↗</a></li>').join('');
  const referenceDates=(mandate.referenceDate?L('策略参考日期','Strategy reference date')+' '+esc(mandate.referenceDate)+' · ':'')+
    L('来源核对日','Sources checked')+' '+esc(mandate.verifiedAt);
  const committee='<section class="fg-team"><p class="fd-kicker">'+L('3 个 AI 席位','3 AI seats')+'</p><h2>'+L('投委会怎样工作？','How the committee works')+'</h2><p>'+L('研究与风控独立读材料，Maya 收到两份意见后作出判断。','Research and risk independently review the evidence. Maya weighs both opinions.')+'</p><ol>'+roles+'</ol><p class="fg-run-note">'+L('完整会议调用三个席位；打开此档案不会运行模型。','A full review calls three seats. Opening this dossier does not run a model.')+'</p></section>'+receipt+'<section class="fd-sources"><h3>'+L('原始资料','Original sources')+'</h3><p>'+referenceDates+'</p><ul>'+sources+'</ul></section>';
  return '<section class="fg-dossier fd-dossier" data-fg-dossier="'+esc(item.id)+'"><div class="fd-tabs" role="tablist" aria-label="'+L('基金档案栏目','Fund dossier sections')+'">'+controls+'</div>'+pane(0,(item.id==='ark-innovation'?arkEvidencePanel(L):'')+chart)+pane(1,method)+pane(2,committee+committeeExtras)+'</section>';
}

