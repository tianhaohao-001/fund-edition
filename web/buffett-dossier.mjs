import { priceFigure, bindComparisons } from './fund-performance.mjs';
import { meetingCopy } from './buffett-desk-copy.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = n => (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%';
const usd = n => typeof n==='number' ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n) : '—';
const pick = lang => (zh,en) => lang === 'en-US' ? en : zh;
const side=(value,L)=>({BUY:L('买入','Buy'),SELL:L('卖出','Sell'),HOLD:L('维持','Hold')}[value]??value);
const role=(value,L)=>({research:L('企业研究','Business analyst'),risk:L('估值与独立风控','Valuation & risk'),manager:L('基金经理','Fund manager')}[value]??value);
function nyTime(timestamp,lang) {
  const date=new Date(timestamp);
  return Number.isFinite(+date)?new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'}).format(date)+' ET':String(timestamp);
}
const mainPath='/data/buffett-ai-study.json';
export function archiveRequestId(random=globalThis.crypto) {
  if(typeof random.randomUUID==='function')return random.randomUUID();
  const bytes=random.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
function safeLink(name,href) {
  return typeof href==='string' && /^https:\/\//i.test(href) ? '<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(name)+' ↗</a>' : esc(name);
}
function fieldList(rows) { return '<dl>'+rows.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>'; }
function original(value) {
  if(typeof value === 'string')return esc(value);
  return Object.entries(value??{}).map(([key,v])=>esc(key)+' · '+esc(typeof v==='object'?JSON.stringify(v):v)).join('<br>');
}
export function buffettShell(lang,managerAvailable=true) {
  const L=pick(lang);
  return '<section class="fd-dossier bf-study" data-buffett-study data-manager-available="'+String(managerAvailable)+'" data-lang="'+esc(lang)+'"><p class="fd-kicker">'+L('巴菲特风格 AI 团队 · 历史模拟','Buffett-inspired AI team · Historical simulation')+'</p><h2>'+L('AZO 单股历史实验','The AZO historical study')+'</h2><p role="status" data-bf-loading>'+L('正在读取历史研究档案…','Opening the historical record…')+'</p></section>';
}
function deskView(run,lang) {
  const L=pick(lang), m=run.metrics;
  const points=run.points.map(p=>({date:p.date,a:p.aiEquity/run.method.startingCash*100,b:p.benchmarkEquity/run.method.startingCash*100}));
  const firstDate = run.points[0].date, lastDate = run.points.at(-1).date;
  return '<div class="bf-ident"><h2>'+L('AutoZone 投资档案','AutoZone investment file')+'</h2><span>AZO · 2017 · '+L('单股模拟','One-stock simulation')+'</span></div>'+
    '<p class="fd-foot" data-bf-scope>'+L('这是一项事后选定的单股实验。'+run.decisions.length+' 场会议分别锁定当时的公开证据。'+firstDate+' 至 '+lastDate+'，同一笔起始资金分别按团队决定和买入持有 AZO 计价。',
      'One company was selected retrospectively. Each of the '+run.decisions.length+' meetings used its own dated evidence. From '+firstDate+' to '+lastDate+', the team and the buy-and-hold AZO benchmark started with the same cash.')+'</p>'+
    '<section class="bf-ledger" aria-label="'+L('投资决议','Investment decisions')+'"><div data-bf-decisions class="bf-decisions" role="group" aria-label="'+L('按会议日期切换决定','Select a decision by meeting date')+'"></div><div data-bf-entry></div></section>'+
    '<details class="bf-annual" data-bf-curve><summary><span>'+L('全年净值对照','Full-year performance')+'</span><span>'+L('团队','Team')+' <b>'+pct(m.returnPct)+'</b> <i>/</i> '+L('买入持有','Buy &amp; hold')+' <b>'+pct(m.benchmarkReturnPct)+'</b></span></summary>'+
      priceFigure({points},[L('AI 团队','AI team'),L('买入并持有 AZO','Buy and hold AZO')],L)+
      '<p>'+L('双方初始资金均为','Both books started with')+' '+usd(run.method.startingCash)+' · '+L('单边费用','Cost per side')+' '+esc(run.method.feeBps)+' bp · '+L('团队 / 买入持有最大回撤','Max drawdown, team / buy and hold')+' '+Number(m.maxDrawdownPct).toFixed(2)+'% / '+Number(m.benchmarkDrawdownPct).toFixed(2)+'%.</p>'+
      '<p>'+esc((run.method.priceGaps||[]).join(', '))+' '+L('缺少收盘行情；曲线和回撤采用有记录的收盘。','has no recorded close. Valuations and drawdown use the available closing observations.')+'</p></details>'+
    '<details class="bf-disclosure"><summary>'+L('研究范围、方法与公开来源','Study design and public sources')+'</summary><p>'+L('独立 AI 团队参考巴菲特 1986 年和 1992 年公开股东信。三席每期收到 12 项当时可得的财务摘要和已知价格，投资范围只有 AutoZone 与现金。','This independent AI team drew on Buffett’s 1986 and 1992 shareholder letters. At each review, three seats received 12 contemporaneous financial measures and prices. Their universe comprised AutoZone and cash.')+'</p>'+
    '<p>'+original(lang==='en-US'?'Both books began in cash. The benchmark invests at the first available open and holds. The simulator permits fractional shares and uses the next session’s open.':run.method.benchmark+' '+run.method.policy)+'</p>'+
    '<ul>'+((lang==='en-US'?run.method.limitationsEn:run.method.limitations)??[]).map(s=>'<li>'+original(s)+'</li>').join('')+'</ul><ul>'+(run.method.sources??[]).map(s=>'<li>'+safeLink(s.label,s.url)+'</li>').join('')+'</ul></details>';
}
function sourcesFor(e) {
  return Array.isArray(e.sources) && e.sources.length ? e.sources : [{label:e.label,url:e.sourceUrl,availableAt:e.availableAt}];
}
function evidenceLinks(refs,records) {
  const links=new Map();
  for(const id of refs??[])for(const e of records.filter(row=>row.id===id))
    for(const s of sourcesFor(e))links.set(s.url,s.label??s.title??e.label);
  return [...links].map(([url,label])=>safeLink(label,url)).join(' · ');
}
const factNames=[
  '52 周营业收入','营业利润率','52 周净利润','加权平均稀释股数','稀释每股盈利','经营现金流',
  '资本支出，含成长性投入','自由现金流代理','期末非流动长期债务','期末现金及等价物','本期累计销售同比增长','最近已审计年度稀释每股盈利','决策收盘价',
];
const finalFactNames=[...factNames.slice(0,5),'资本支出，含成长性投入','期末总债务','期末现金及等价物','全年净销售额同比增长','国内同店销售同比增长','每股盈利中的税务收益','上季披露的 52 周自由现金流代理','决策收盘价'];
function decisionView(d,L,lang,managerAvailable) {
  const english=lang==='en-US', archived=(o,k)=>english && o[k+'En'] || o[k];
  const x=d.execution, filled=x.status==='filled', copy=meetingCopy(d.id,lang);
  const title=filled?side(x.side,L)+' '+usd(x.notional):L('持有现金','Hold cash');
  const latest=d.evidence.filter(e=>e.periodEnd).sort((a,b)=>Date.parse(b.availableAt)-Date.parse(a.availableAt))[0];
  const timeRows=fieldList([[L('最新财报可得','Latest filing available'),latest?nyTime(latest.availableAt,lang):'—'],[L('会议截止','Meeting cutoff'),nyTime(d.asOf,lang)],[L('下一开盘','Next open'),nyTime(x.at,lang)]]);
  const auditNotes=(d.corrections??[]).map(c=>'<li><p>'+esc(archived(c,'text'))+'</p><small>'+evidenceLinks(c.evidenceRefs,d.evidence)+(c.sourceUrl?' · '+safeLink(L('原始出处','Original source'),c.sourceUrl):'')+'</small></li>').join('');
  const notes=auditNotes?'<aside class="bf-review-note"><b>'+L('会计复核','Accounting review')+'</b><span>'+esc(copy?.caution??archived(d.corrections[0],'text'))+'</span><details><summary>'+L('查看全部校注','Read all annotations')+' ('+d.corrections.length+')</summary><ul>'+auditNotes+'</ul></details></aside>':'';
  const evidence=d.evidence.map((e,i)=>{
    const name=english?(e.periodEnd?e.label:'Decision close'):(d.id==='buffett-review-4'?finalFactNames:factNames)[i]??e.label;
    const value=new Intl.NumberFormat(lang,{maximumFractionDigits:6}).format(e.value)+' '+esc(e.unit);
    return '<li><div><b>'+esc(e.id)+'</b><strong>'+esc(name)+'</strong><span>'+value+'</span></div>'+
      '<small>'+L('可得','Available')+' '+esc(nyTime(e.availableAt,lang))+(e.periodEnd?' · '+L('期间','Period')+' '+esc((e.periodStart?e.periodStart+' – ':'')+e.periodEnd):'')+'</small>'+
      (e.formula?'<small>'+esc(e.formula)+'</small>':'')+sourcesFor(e).map(s=>'<small>'+safeLink(s.label??s.title??e.label,s.url)+' · '+esc(nyTime(s.availableAt??e.availableAt,lang))+'</small>').join('')+'</li>';
  }).join('');
  const seats=d.seats.map(s=>'<li><div class="bf-role"><span aria-hidden="true"></span><strong>'+esc(role(s.role,L))+'</strong></div><p>'+esc(copy?.[s.role]??archived(s,'text'))+'</p><details><summary>'+L('当时原话','Original brief')+'</summary><p>'+esc(archived(s,'text'))+'</p><small>'+evidenceLinks(s.evidenceRefs,d.evidence)+'</small><code>'+esc(s.model)+' · '+esc(s.responseId)+'</code></details></li>').join('');
  const actual=x.weightAfterPct;
  const execRows=filled?[[L('开盘成交价','Opening fill price'),usd(x.price)],[L('成交数量','Shares filled'),String(x.quantity)],[L('费用','Trading fee'),usd(x.fee)],[L('成交后现金','Remaining cash'),usd(x.cashAfter)]]:
    [[L('持有股数','Shares held'),String(x.sharesAfter)],[L('模拟成交','Simulated fills'),'0'],[L('费用','Trading fee'),usd(x.fee)],[L('可用现金','Cash'),usd(x.cashAfter)]];
  const qs=filled?[L('为什么只投两成？','Why allocate only 20%?'),L('什么会让经理减仓？','What would lead the manager to cut the position?')]:
    [L('为什么这一期持现？','Why hold cash at this review?'),L('团队的分歧是什么？','Where did the team disagree?')];
  const offlineHelp=managerAvailable ? '' : '<div class="bf-availability" data-bf-offline><p>'+L('实时经理暂未接通。你可以读到当时封存的判断，也可以先写下问题。','The live manager is offline. Read the decision as it was recorded, or keep a question here for later.')+'</p><div class="bf-prompts"><button type="button" data-bf-open="manager">'+L('读经理原话','Read the manager’s original record')+'</button><button type="button" data-bf-open="records">'+L('核对当时证据','Inspect contemporary evidence')+'</button></div></div>';
  const heading=filled?x.date+' · '+L('独立模拟成交额','Simulated fill value'):d.decisionDate+' · '+L('基金经理决议','Fund manager decision');
  const allocation=filled?L('目标仓位','Target')+' '+d.targetPct+'% · '+L('成交后','After fill'):L('实际股票仓位','Actual equity allocation');
  return '<article class="bf-entry"><div class="bf-exhibit"><div class="bf-decision-story"><p class="bf-kicker">'+esc(heading)+'</p><h3>'+esc(title)+'</h3><p class="bf-reason">'+esc(copy?.thesis??archived(d.manager,'text'))+'</p><div class="bf-allocation"><span><i></i>'+esc(allocation)+' <b>'+Number(actual).toFixed(2)+'%</b></span><div aria-hidden="true"><i style="width:'+Math.max(0,Math.min(100,Number(actual)))+'%"></i></div></div></div>'+
    '<section class="bf-ticket"><div class="bf-ticket-title"><b>'+L('独立模拟执行','Independent paper execution')+'</b><time>'+esc(x.date)+'</time></div><p class="bf-ticket-decision">'+(filled?L('开盘成交','Filled at the open'):L('维持现有持仓','No change to holdings'))+'</p>'+fieldList(execRows)+'</section></div>'+
    '<nav class="bf-shortcuts" aria-label="'+L('档案速查','File shortcuts')+'"><button type="button" data-bf-open="records">'+L('当时的证据','Contemporary evidence')+' ↓</button><button type="button" data-bf-open="curve">'+L('全年净值对照','Performance comparison')+' ↓</button></nav>'+
    '<div class="bf-editorial"><section class="bf-committee"><h4>'+L('三席如何判断','Inside the committee')+'</h4><ol class="bf-seats">'+seats+'</ol></section>'+
    '<section class="bf-ask"><h4>'+(managerAvailable?L('问经理这笔决定','Ask about this decision'):L('经理当时如何决定','The manager’s decision record'))+'</h4>'+offlineHelp+'<form data-bf-question><label><span class="bf-sr">'+L('关于本次决策的问题','Question about this decision')+'</span><textarea name="question" rows="2" maxlength="560" required placeholder="'+(managerAvailable?L('当时的哪项证据最关键？','Which evidence mattered most at the time?'):L('记下问题，留待经理上线','Keep a question for the manager'))+'"></textarea></label><button type="submit" '+(managerAvailable?'':'hidden disabled')+'>'+L('问基金经理','Ask the manager')+' <span aria-hidden="true">↗</span></button></form><div class="bf-prompts">'+(managerAvailable?qs:[]).map(q=>'<button type="button" data-bf-prompt>'+esc(q)+'</button>').join('')+'</div><div data-bf-reply role="status" aria-live="polite"></div></section></div>'+
    notes+'<details class="bf-disclosure" data-bf-manager><summary>'+L('完整经理记录与改判条件','Full manager record and reversal conditions')+'</summary><p>'+esc(archived(d.manager,'text'))+'</p><h5>'+L('反方意见','Counterargument')+'</h5><p>'+esc(archived(d.manager,'counterargument'))+'</p><h5>'+L('何时重估','When to revisit')+'</h5><p>'+esc(archived(d.manager,'reconsider'))+'</p></details>'+
    '<details class="bf-disclosure" data-bf-records><summary>'+L('核对当时数据与财报','Inspect contemporary evidence')+' <small>'+L('12 项财务指标 + 收盘价','12 financial measures + close')+'</small></summary>'+timeRows+'<ul class="bf-evidence">'+evidence+'</ul></details></article>';
}
const cachedRuns=new Map();
function fetchStudy(path) {
  if(!cachedRuns.has(path))cachedRuns.set(path,fetch(path,{credentials:'same-origin',cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('missing');return r.json()}).catch(error=>{cachedRuns.delete(path);throw error}));
  return cachedRuns.get(path);
}
const answers=new Map();
const questionDrafts=new Map();
const pendingQuestions=new Map();
export async function bindBuffettStudy(root) {
  const el=root.querySelector('[data-buffett-study]');
  if(!el || el.dataset.bound)return;
  el.dataset.bound='yes';
  if(!document.querySelector('link[data-bf-desk-style]')){
    const style=document.createElement('link');style.rel='stylesheet';style.href='/buffett-dossier.css';style.dataset.bfDeskStyle='';
    document.head.append(style);
  }
  const lang=el.dataset.lang,L=pick(lang);
  if(['localhost','127.0.0.1'].includes(location.hostname) && ['3386','3394'].includes(location.port)){
    const u=new URL(location.href);u.hostname='localhost';u.port='3395';u.searchParams.set('catalog','buffett');u.searchParams.set('lang',lang);u.hash='/lab';
    const msg=el.querySelector('[data-bf-loading]');
    const link=document.createElement('a');link.href=u.href;link.className='bf-review-link';
    link.textContent=L('进入巴菲特 AI 投委会 ↗','Open the Buffett AI committee ↗');
    msg.textContent=L('历史研究与逐笔问答在本机新版审阅区。','The historical study and per-decision manager are in the new local preview.');
    msg.after(link);return;
  }
  try {
    const run=await fetchStudy(mainPath);
    if(!el.isConnected)return;
    el.innerHTML=deskView(run,lang);bindComparisons(el);
    const entry=el.querySelector('[data-bf-entry]'), rail=el.querySelector('[data-bf-decisions]');
    const url=new URL(location.href);
    const chosen=run.decisions.find(d=>d.id===url.searchParams.get('decision'))??run.decisions.find(d=>d.execution.status==='filled')??run.decisions[0];
    const buttons=new Map();
    for(const [index,d] of run.decisions.entries()){
      const button=document.createElement('button');
      button.type='button';button.dataset.decision=d.id;
      const date=d.decisionDate??d.asOf.slice(0,10);
      const action=d.execution.status==='filled'?side(d.action,L):L('持现','Cash');
      button.setAttribute('aria-label',date+' · '+action);
      button.innerHTML='<time datetime="'+esc(date)+'">'+esc(date)+'</time><b>'+esc(action)+'</b>';
      rail.append(button);buttons.set(d.id,button);button.onclick=()=>open(d,true);
      button.onkeydown=event=>{
        const n=run.decisions.length;
        const dest={ArrowLeft:(index+n-1)%n,ArrowRight:(index+1)%n,Home:0,End:n-1};
        if(!Object.hasOwn(dest,event.key))return;
        event.preventDefault();const next=run.decisions[dest[event.key]];
        open(next,true);buttons.get(next.id).focus();
      };
    }
    function open(d,update) {
      if(!d)return;
      if(update){const u=new URL(location.href);u.searchParams.set('decision',d.id);history.replaceState(history.state,'',u)}
      for(const [id,b] of buttons){b.setAttribute('aria-pressed',String(id===d.id));b.tabIndex=id===d.id?0:-1}
      const managerAvailable=el.dataset.managerAvailable!=='false';
      entry.innerHTML=decisionView(d,L,lang,managerAvailable);
      for(const shortcut of entry.querySelectorAll('[data-bf-open]'))shortcut.onclick=()=>{
        const section=el.querySelector('[data-bf-'+shortcut.dataset.bfOpen+']');
        section.open=true;section.scrollIntoView({block:'start'});section.querySelector('summary').focus({preventScroll:true});
      };
      const form=entry.querySelector('form'), reply=entry.querySelector('[data-bf-reply]');
      const key=[run.id,d.id,lang].join('/');
      const storageKey='fundroom.history-question.'+key;
      let savedDraft='';
      try{savedDraft=sessionStorage.getItem(storageKey) || ''}catch{}
      form.elements.question.value=questionDrafts.get(key)??savedDraft;
      const keepDraft=text=>{
        if(text)questionDrafts.set(key,text);else questionDrafts.delete(key);
        try{if(text)sessionStorage.setItem(storageKey,text);else sessionStorage.removeItem(storageKey)}catch{}
      };
      form.elements.question.oninput=()=>keepDraft(form.elements.question.value);
      const prompts=entry.querySelectorAll('[data-bf-prompt]');
      const lock=sending=>{form.querySelector('button[type=submit]').disabled=sending || !managerAvailable;for(const prompt of prompts)prompt.disabled=sending;};
      for(const prompt of prompts)prompt.onclick=()=>{
        form.elements.question.value=prompt.textContent;keepDraft(prompt.textContent);form.requestSubmit();
      };
      function show(result){
        reply.innerHTML='<strong>'+(result.mode==='archive'?L('经理选取的当时原话','Selected original record'):L('经理现在查阅了本期档案','Manager’s live archive review'))+'</strong>'+(result.answer?'<p>'+esc(result.answer)+'</p>':'')+(
          result.excerpts.length?'<details '+(result.mode==='archive'?'open':'')+'><summary>'+L('核对当时原话与来源','Read the cited record and sources')+'</summary>'+result.excerpts.map(s=>'<p>'+esc(s.text)+'</p><small>'+evidenceLinks(s.evidenceRefs,d.evidence)+'</small>').join('')+'</details>':'<p>'+L('这期记录没有足够证据回答这个问题。','This decision’s archive does not contain enough evidence to answer that question.')+'</p>')+
          '<small>'+esc(result.model)+' · '+esc(result.responseId)+'</small>';
      }
      if(answers.has(key))show(answers.get(key));
      if(pendingQuestions.has(key)){
        lock(true);reply.textContent=L('经理正在核对本期记录…','The manager is reviewing this meeting…');
        pendingQuestions.get(key).then(result=>{if(form.isConnected){show(result);form.elements.question.value=''}})
          .catch(()=>{if(form.isConnected)reply.textContent=L('实时回答暂不可用，请重试。','The live reply is unavailable. Please retry.');}).finally(()=>lock(false));
      }
      form.onsubmit=async event=>{
        event.preventDefault();if(!managerAvailable)return;const message=form.elements.question.value.trim();if(!message)return;
        if(pendingQuestions.has(key))return;lock(true);
        reply.textContent=L('经理正在核对这一期的原始记录…','The manager is checking this decision’s original record…');
        try {
          const request={runId:run.id,decisionId:d.id,message,language:lang,requestId:archiveRequestId()};
          const requestTask=fetch('/api/buffett/ask',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}).then(async response=>{
            if(!response.ok)throw Error(String(response.status));
            const result=await response.json();
            if(result.decisionId!==d.id || !Array.isArray(result.excerpts)||!result.responseId)throw Error('invalid');
            return result;
          });
          pendingQuestions.set(key,requestTask);const result=await requestTask;
          answers.set(key,result);keepDraft('');if(form.isConnected){show(result);form.elements.question.value='';}
        } catch(error) {if(form.isConnected)reply.textContent=error.message==='429'?L('经理当前繁忙。问题已保留，可以稍后重试。','The manager is busy. Your question is here to retry.'):L('实时经理暂未接通。上方可读到当时归档的判断，问题已保留。','The live manager is unavailable. The original rationale is above and your question is retained.');}
        finally {pendingQuestions.delete(key);lock(false);}
      };
    }
    open(chosen,false);

  }catch{const msg=el.querySelector('[data-bf-loading]');if(msg)msg.textContent=L('历史团队档案尚未载入。','The historical committee record is currently unavailable.');}
}
