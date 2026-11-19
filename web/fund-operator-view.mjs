import { bindVoice, renderVoiceButton, speakReply, stopSpeaking } from './voice.mjs';
const params=new URLSearchParams(location.search), id=params.get('fund')||'wellington';
const lang=params.get('lang')==='en-US'?'en-US':'zh-CN', zh=lang==='zh-CN';
const t=(cn,en)=>zh?cn:en;
const page=document.getElementById('operator'), notice=document.getElementById('notice');
document.documentElement.lang=lang;
const brand=t('Fund Edition','Fund Edition');
document.querySelector('.operator-brand').textContent=brand;
document.title=brand+' · '+t('AI 基金运营','AI fund team');
const backLink = document.getElementById('back');
backLink.textContent=t('← 基金详情','← Fund details');
backLink.href='/?'+new URLSearchParams({catalog:id,lang})+'#/lab';
const other=document.getElementById('language');
other.textContent=t('English','中文'); other.href='?'+new URLSearchParams({fund:id,lang:t('en-US','zh-CN')});
const roleNames={research:t('策略研究','Strategy research'),risk:t('独立风控','Independent risk'),manager:t('基金经理 Maya','Manager Maya'),engine:t('模拟执行','Paper engine')};
const stages={started:t('正在审阅','Reviewing'),completed:t('已完成','Completed'),handoff:t('已送达 Maya','Delivered to Maya'),failed:t('失败','Failed'),skipped:t('跳过','Skipped')};
const statuses={sealed:t('已封存，等待确认','Sealed · awaiting approval'),failed:t('会议未完成','Meeting incomplete'),rejected:t('独立风控已拒绝','Independent engine rejected'),
  authorized:t('已授权，等待未来收盘','Authorized · awaiting a future close'),filled:t('模拟账本已记账','Recorded in the paper ledger'),held:t('已确认维持原仓','Hold confirmed'),
  expired:t('本次授权已过期','Authorization expired'),cancelled:t('授权已撤销','Authorization withdrawn')};
const messages={'operator-wait':t('正在等候授权交易日的全部收盘记录，仓位保持原样。','Waiting for all authorized closing observations. Positions are unchanged.'),
  'operator-obsolete':t('决定已过确认期限，请让团队重新开会。','The approval window ended. Ask for a new decision.'),
  'operator-daily':t('本市场日已有封存决定。','This team already sealed its decision for this market day.'),
  'manager-unavailable':t('暂时连不上 HarnessRouter。请稍后重试。','HarnessRouter is unavailable. Please try again later.'),
  'operator-comparison':t('需要起点和终点同日、同口径的原基金与持仓价格，当前条件不足。','Comparable benchmark and sleeve prices are required at both locked observation dates.')};
const safe=s=>String(s??'').replace(/[<>&"'\x60]/gu,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;','\x60':'&#96;'}[c]));
const money=c=>new Intl.NumberFormat(lang,{style:'currency',currency:'USD'}).format(c/100);
const when=s=>s?new Date(s).toLocaleString(lang,{dateStyle:'medium',timeStyle:'medium'}):'–';
const day=s=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
let state, busy=false, events=[], timer, pendingRequest, pollVersion=0;
let questionOpen=false,draft='',dictated=false,speaking=false;
bindVoice(page,{onTranscript:({final})=>{if(final)dictated=true;},onError:({message})=>{notice.textContent=message;}});
function account(value){return '<div class="holdings"><p><small>'+t('模拟现金','Paper cash')+'</small><strong>'+money(value.cashCents)+'</strong></p>'+Object.entries(value.unitsMicros).map(([s,q])=>'<p><small>'+safe(s)+'</small><strong>'+safe((q/1e6).toLocaleString(lang,{maximumFractionDigits:6}))+'</strong></p>').join('')+'</div>';}
function button(action,label,secondary=false){return '<button data-action="'+action+'" '+(busy?'disabled ':'')+(secondary?'class="secondary"':'')+'>'+label+'</button>';}
function eventList(){return events.length?'<ol>'+events.map(e=>'<li class="event">'+safe(roleNames[e.actor]??e.actor)+' · '+safe(stages[e.stage]??e.stage)+'<br><small>'+safe(e.text)+'</small></li>').join('')+'</ol>':'';}
function questionView(book,decision) {
  if(decision?.status!=='sealed')return '';
  const replies=(book.questions??[]).filter(q=>q.decisionId===decision.id);
  const reply=replies.at(-1);
  return '<details class="panel" id="questions" '+(questionOpen?'open':'')+'><summary>'+t('向 Maya 追问这次决定','Ask Maya about this decision')+'</summary>'+
    '<label for="question">'+t('你想核对什么？','What would you like to check?')+'</label><textarea id="question" maxlength="800" rows="2" placeholder="'+
    t('为什么这样分配？我的模拟账户已经买入了吗？','Why this allocation? Has the paper account bought anything yet?')+'">'+safe(draft)+'</textarea>'+
    '<div class="ask-actions">'+renderVoiceButton({targetId:'question',label:t('语音输入','Dictate'),lang})+button('ask',t('问经理','Ask Maya'))+'</div>'+
    (reply?'<h3>'+safe(reply.question)+'</h3><p>'+safe(reply.text)+'</p><p class="meta">'+safe(when(reply.timestamp))+' · '+safe(reply.responseId)+' · '+safe(statuses[reply.executionStatus]??t('待授权','Awaiting approval'))+'</p>'+button('read',t('朗读 / 停止','Read aloud / stop'),true):'')+'</details>';
}
function decisionView(d,order) {
  const r=d.record,p=r.proposal;
  const seats=r.seats.map(s=>'<div class="role"><span>'+safe(roleNames[s.role])+'</span><div><p>'+safe(s.text)+'</p><small>'+safe(s.model||s.source)+(s.responseId?' · '+safe(s.responseId):'')+'</small></div></div>').join('');
  const targets=p?.action==='REBALANCE'?p.targets.map(x=>safe(x.symbol)+' '+safe(x.bps/100)+'%').join(' · '):p?.action==='HOLD'?t('维持当前仓位','Hold current positions'):'';
  return '<section class="panel" data-decision="'+safe(d.id)+'"><p class="eyebrow">'+safe(statuses[order?.status??d.status])+'</p><h2>'+t('本期决定','Team decision')+'</h2><p class="meta">'+t('证据截至 ','Evidence cutoff ')+safe(when(r.cutoff))+' · '+t('封存于 ','Sealed at ')+safe(when(d.sealedAt))+'</p><p class="allocation">'+targets+'</p><p>'+safe(r.seats.at(-1).text)+'</p>'+
    (p?'<h3>'+t('团队分歧','How dissent was resolved')+'</h3><p>'+safe(p.dissent)+'</p><h3>'+t('何时重新评估','When to reconsider')+'</h3><p>'+safe(p.reconsider)+'</p>':'')+
    (d.refusal?'<p>'+t('拒绝原因','Refusal')+' · '+safe(d.refusal)+'</p>':'')+
    (order?.pricingDate?'<p>'+t('锁定美东交易日 ','Locked US market date ')+safe(order.pricingDate)+' · Nasdaq · '+t('ETF 每股收盘价，模拟费率 0.05%。','ETF close per share, 0.05% paper fee.')+'</p>':'')+
    (order?.status==='filled'?'<h3>'+t('独立模拟成交','Independent paper fills')+'</h3><ul>'+order.fills.map(f=>'<li>'+safe(f.symbol)+' · '+safe(f.side)+' '+safe(f.quantityMicros/1e6)+' × '+money(f.priceCents)+' · '+t('费用 ','fee ')+money(f.feeCents)+'</li>').join('')+'</ul>'+account(order.before)+account(order.after):'')+
    (order?.evaluation?'<p>'+safe(order.evaluation.startDate)+' → '+safe(order.evaluation.endDate)+' · '+t('收盘价变动（不含分配）','Closing price change (excluding distributions)')+' · '+t('模拟盘 ','Paper ')+safe(order.evaluation.paperPriceChangePct.toFixed(2))+'% · VWELX '+safe(order.evaluation.benchmarkPriceChangePct.toFixed(2))+'%</p>':
      order?.benchmarkStart?'<p>'+t('待对照日 ','Comparison date ')+safe(order.comparisonDate)+'</p>'+button('compare',t('核对未来观察值','Check matched observations'),true):'')+
    '<details><summary>'+t('查看三席发言与回执','Read the three seat receipts')+'</summary>'+seats+'<p class="meta seal">SHA-256 · '+safe(d.seal)+'</p></details></section>';
}
function render(){
  const {mandate:m,book:b}=state, d=b.decisions.at(-1), order=d&&b.orders.findLast(o=>o.decisionId===d.id);
  const sameDay=d && day(d.sealedAt)===day(Date.now());
  const primary=busy?button('meet',t('团队工作中…','Team is working…')):order?.status==='authorized'?
    button('settle',t('查看收盘与结算','Check close and settle'))+button('withdraw',t('撤销这次授权','Withdraw authorization'),true):
    d?.status==='sealed' && sameDay && !order?button('approve',d.record.proposal?.action==='HOLD'?t('确认维持仓位','Confirm hold'):t('授权下一交易日模拟调仓','Approve next-session paper rebalance')):
    !sameDay || d?.status!=='sealed'?button('meet',t('让团队决定下一步','Ask the team to decide')):'';
  document.title=m.ticker+' · '+t('AI 基金运营','AI fund team')+' · '+brand;
  page.innerHTML='<div class="operator-intro"><p class="eyebrow">'+t('前向模拟基金','Forward paper fund')+'</p><h1>'+safe(m.ticker)+'</h1><p class="operator-name">'+safe(m.name)+'</p><p class="lede">'+safe(m.universe.scope)+'</p>'+
    '<p>'+t('研究员和风控先分别陈述，Maya 再决定仓位。每笔调仓都需要你的授权。','Research and risk report independently before Maya chooses a position. Each rebalance needs your approval.')+'</p>'+
    '<div class="actions">'+primary+'</div></div>'+(busy?'<div class="meeting" aria-live="polite">'+eventList()+'</div>':'')+
    (d?decisionView(d,order)+questionView(b,d):'')+
    '<section class="panel operator-account"><h2>'+t('我的模拟账户','My paper account')+'</h2>'+account(b)+'<p class="meta">'+t('按选定交易日的独立收盘记录模拟成交。分红、利息和个人税费暂未计入。','Simulated fills use the authorized session’s closing records. Dividends, interest and personal taxes are excluded.')+'</p><p class="meta">'+t('前向表现等待未来同口径数据。历史回测成绩单独展示。','Forward performance awaits comparable future observations. Historical studies are shown separately.')+'</p></section>'+
    '<details class="panel"><summary>'+t('谁在管理这只基金？','Who runs this fund?')+'</summary><p>'+safe(m.manager)+' · '+t('公开方法研究','Public-method study')+'</p>'+Object.entries(m.roles).map(([k,v])=>'<div class="role"><span>'+safe(roleNames[k])+'</span><p>'+safe(v)+'</p></div>').join('')+'<p>'+safe(m.missing)+'</p><p class="meta">'+t('资料核对 ','Sources checked ')+safe(m.verifiedAt)+'</p><ul>'+m.sources.filter(s=>s.url.startsWith('https://')).map(s=>'<li><a href="'+safe(s.url)+'" target="_blank" rel="noopener">'+safe(s.title)+'</a></li>').join('')+'</ul></details>'+
    (b.decisions.length>1?'<details class="panel"><summary>'+t('以往的会议和执行','Previous decisions and execution')+'</summary>'+b.decisions.slice(0,-1).reverse().map(old=>decisionView(old,b.orders.findLast(o=>o.decisionId===old.id))).join('')+'</details>':'');
  page.setAttribute('aria-busy',String(busy));
}
async function load(){const res=await fetch('/api/fund-operator?'+new URLSearchParams({fund:id,lang}));if(!res.ok)throw Error(t('基金资料暂未取回。','Fund records are unavailable.'));state=await res.json();render();}
async function poll(requestId,version){
  try{const res=await fetch('/api/team/activity?requestId='+encodeURIComponent(requestId));if(res.ok && busy && pollVersion===version){const value=await res.json();if(busy && pollVersion===version){events=value.activity?.events??[];render();}}}catch{}
  if(busy && pollVersion===version)timer=setTimeout(()=>poll(requestId,version),1800);
}
page.addEventListener('input',e=>{if(e.target.id==='question')draft=e.target.value;});
page.addEventListener('toggle',e=>{if(e.target.id==='questions')questionOpen=e.target.open;},true);
function readAnswer(text){const result=speakReply(text,{lang,onState:({state})=>{speaking=state==='speaking';}});if(!result)notice.textContent=t('未找到朗读语音。','No speech voice is available.');}
page.addEventListener('click',async e=>{
  const a=e.target.closest('button[data-action]');if(!a||busy)return;
  const action=a.dataset.action,decisionId=a.closest('[data-decision]')?.dataset.decision??state.book.decisions.at(-1)?.id;
  if(action==='read'){if(speaking){stopSpeaking();speaking=false;}else readAnswer(state.book.questions.at(-1).text);return;}
  if(action==='ask'&&!draft.trim()){notice.textContent=t('先说出或输入你的问题。','Speak or type a question first.');return;}
  const signature=[id,action,decisionId??'',action==='ask'?draft.trim():''].join('/');
  if(!pendingRequest || pendingRequest.signature!==signature)pendingRequest={signature,requestId:crypto.randomUUID()};
  const {requestId}=pendingRequest; const body={action,catalogId:id,language:lang,requestId,...(action==='meet'?{}:{decisionId}),...(action==='ask'?{question:draft.trim()}:{})};
  busy=true;events=[];notice.textContent='';render(); if(action==='meet')void poll(requestId,++pollVersion);
  try{
    const res=await fetch('/api/fund-operator',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const value=await res.json();
    if(!res.ok)throw Error(messages[value.code]??value.messages?.[lang]??value.error);
    state=value;pendingRequest=null;
    if(action==='ask'){draft='';questionOpen=true;if(dictated)readAnswer(state.book.questions.at(-1).text);dictated=false;}
  }catch(error){notice.textContent=error.message;try{await load();}catch{}}
  finally{clearTimeout(timer);pollVersion++;busy=false;render();}
});
load().catch(e=>{page.textContent=e.message;page.setAttribute('aria-busy','false');});

