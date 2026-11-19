import {getLanguage,t} from './i18n.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>{try{const u=new URL(url);if(u.protocol==='https:'&&!u.username&&!u.password&&['www.nasdaq.com','www.federalreserve.gov','investor.vanguard.com','www.sec.gov','data.sec.gov'].includes(u.hostname))return '<a target="_blank" rel="noopener noreferrer" href="'+esc(u.href)+'">'+esc(label)+' ↗</a>';}catch{}return esc(label);};
const clock=n=>{if(!n)return '—';if(/^\d{4}-\d{2}-\d{2}$/.test(String(n)))return String(n);const date=new Date(n);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat(getLanguage(),{timeZone:'America/New_York',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);};
function words(key){
 const d={
 'migration-file':['已有基金首次观察','First watch for an existing fund'],
 'migration-baseline':['已建立比较起点，本次由规则记录，没有调用模型。','Baseline recorded by rules, without a model call.'],
 'review-change':['资料有新变化，提交模拟复核','New evidence flagged for paper review'],
 unchanged:['今天已核对过相同资料，本次没有重复请求模型。','This evidence was already reviewed today. No repeat model call was made.'],
 'opening-file':['建团首次观察','Founding observation'],news:['晨间新闻','Morning news'],open:['开盘检查','Opening check'],market:['盘中检查','Market check'],
 hold:['维持持仓','Maintain holdings'],MONITOR:['继续观察','Monitor'],MAINTAIN:['维持持仓','Maintain holdings'],REQUEST_PAPER_REVIEW:['提交模拟复核','Request paper review'],
 'reference-review':['核对参考行情，保留现有仓位','Review reference prices and keep existing positions'],
 'dated-reference':['核对注明日期的成交参考，等待更新行情','Review the dated sale and await a newer quote'],
 'news-only':['仅有新闻可供核对，等待有效行情','Review news and await a usable quote'],'awaiting-usable-data':['资料不足，等待可靠行情或新闻','Await reliable market data or news'],
 'watch-budget':['本次使用规则记录，自动研判额度已用完。','Rules recorded this check. The background AI allowance was reached.'],
 'shared-budget':['本次使用规则记录，共享模型额度已用完。','Rules recorded this check. The shared AI allowance was reached.'],
 'membership-paused':['会员权限未激活，本次采用规则记录。','Recorded by rules. AI coverage requires an active trial or membership.'],
 'no-evidence':['没有可引证的资料，本次未请求模型。','No usable evidence was available for a model review.'],
 offline:['模型未接通，本次按规则记录。','The model was offline. Rules recorded this check.'],unavailable:['本次未能取得完整结果。','The check could not be completed.'],running:['正在检查','Checking'],
 missed:['服务器恢复时该时段已过，未用后来的资料补写。','The slot elapsed while the service was unavailable. No later data was used to reconstruct it.'],interrupted:['执行中断，保留记录。','The check was interrupted.'],paused:['基金已暂停盯盘。','The watch was paused.'],
 holding:['持仓','Holding'],mandate:['策略关键词','Mandate match'],'authorized-list':['允许标的','Permitted symbol'],'market-benchmark':['市场参考','Market benchmark'],
 current:['最近完整收盘','Latest completed close'],fresh:['最近成交参考价','Recent sale reference'],delayed:['延时报价','Delayed quote'],dated:['仅有日期','Date only'],stale:['旧报价','Stale'],unverified:['未验证','Unverified'],
 };
 return d[key]?t(...d[key]):t('未取得','Unavailable');
}

function meetingLabel(run) {
  if (!run) return t('等待首次观察', 'Awaiting first check');
  if (run.status === 'complete') return words(run.kind);
  return words(run.kind) + ' · ' + words(run.status);
}

const minutesLabel=value=>t(value+' 分钟',value+' min');
const scheduleLabel=value=>t('交易时段每 '+value+' 分钟','Every '+value+' min in session');
const ny=()=>t('美东时间','New York time');

function evidenceChanges(record) {
  const signals=record.signals;
  if(!signals)return '';
  const label=signals.baseline?t('尚无可比的历史观察。','No earlier comparable observation.'):
    t('本次看到 '+signals.newHeadlines.length+' 条此前近期记录中未见的标题。价格对照最近一次同源有效报价。','Newly observed headlines in recent checks: '+signals.newHeadlines.length+'. Prices are compared with the last usable quote from the same source.');
  const changes=signals.changes.map(item=>'<li><b>'+esc(item.symbol)+'</b> · '+esc((item.percent>0?'+':'')+item.percent.toFixed(2)+'%')+
    '<small>'+esc(clock(item.from))+' · $'+esc(item.previous.toFixed(2))+' → '+esc(clock(item.to))+' · $'+esc(item.value.toFixed(2))+'</small></li>').join('');
  const follow=record.followup?.status==='recorded'?'<p>'+t('已记入模拟复核事项。','A paper review was recorded for follow-up.')+'</p>':'';
  return '<div class="sw-changes"><h4>'+t('本次变化','What changed')+'</h4><p>'+esc(label)+'</p>'+(changes?'<ul>'+changes+'</ul>':'')+follow+'</div>';
}

function packetSummary(run) {
  const p=run?.record?.packet;
  if(!p) return '';
  const symbols=p.symbols.map(item=>item.symbol).join(' · ');
  const stories=t(p.news.length+' 条新闻',p.news.length+' '+(p.news.length===1?'headline':'headlines'));
  return [symbols,stories].filter(Boolean).join(' / ');
}

function details(run) {
  const rec=run.record;
  if(run.status==='missed')return '<p>'+esc(words(run.status))+'</p><small>'+t('原定于','Scheduled for')+' '+esc(clock(run.slot))+' · '+t('恢复于','Resumed at')+' '+esc(clock(run.started))+' · '+ny()+'</small>';
  if(!rec?.packet)return '<p>'+esc(words(run.status))+'</p>';
  const {packet,ai,rule}=rec;
  const usableQuotes=packet.quotes.filter(q=>q.valueUsd>0);
  const quotes=packet.quotes.map(q=>{
    const seq=usableQuotes.indexOf(q);
    const price=q.valueUsd>0?'$'+Number(q.valueUsd).toFixed(2):'—';
    return '<li><div><b>'+(seq<0?'':'Q'+(seq+1)+' · ')+esc(q.symbol)+'</b> <strong>'+esc(price)+'</strong></div><small>'+esc(words(q.status))+' · '+esc(clock(q.asOf))+' · '+link(q.sourceUrl,q.provider)+'</small></li>';
  }).join('');
  const newURLs=new Set(rec.signals?.newHeadlines??[]);
  const news=packet.news.map((n,i)=>'<li><small>'+(newURLs.has(n.url)?t('新标题 · ','New · '):'')+(i<5?'N'+(i+1)+' · ':'')+esc(n.symbol||t('宏观','Macro'))+' · '+esc(n.source)+' · '+esc(clock(n.publishedAt))+'</small>'+link(n.url,n.title)+'</li>').join('');
  const emptyNews=packet.feeds.some(f=>f.status==='ok')?t('已查来源中没有近七天可用的标题。','The checked feeds returned no usable headline from the past seven days.'):t('新闻来源暂不可用。','News sources were unavailable.');
  const feeds=packet.feeds.map(f=>'<li>'+link(f.url,f.name+(f.symbol?' · '+f.symbol:''))+'<small>'+esc(f.status==='ok'?t('已查阅','Checked'):words('unavailable'))+' · '+esc(clock(f.checkedAt))+'</small></li>').join('');
  const explanation=ai.status==='complete'?(getLanguage().startsWith('zh')?ai.zh:ai.en):words(ai.status);
  const receipt=ai.status==='complete'?'<small>'+esc(ai.model)+' · '+esc(ai.refs.join(', '))+'</small><small>'+t('回执','Receipt')+' <code>'+esc(ai.responseId)+'</code></small>':'';
  const source=ai.status==='complete'?t('Maya 的研判','Maya’s review'):t('策略规则记录','Strategy rules');
  return '<div class="sw-decision"><span class="sw-label">'+source+'</span><h4>'+esc(ai.status==='complete'?words(ai.decision):words(rule))+'</h4><p>'+esc(explanation)+'</p>'+receipt+'</div>'+
    '<p class="sw-execution">'+t('本次未下单。以下报价仅供观察。','No order was placed. These quotes are for observation.')+'</p>'+evidenceChanges(rec)+
    '<h4>'+t('行情依据','Quote evidence')+'</h4><p>'+packet.symbols.map(s=>esc(s.symbol)+' · '+esc(words(s.basis))).join(' / ')+(packet.uncovered?.length?' / '+t('未覆盖','Not covered')+' '+esc(packet.uncovered.join(', ')):'')+'</p><ul class="sw-quotes">'+quotes+'</ul>'+
    '<h4>'+t('新闻与原文','Headlines and originals')+'</h4><ul class="sw-news">'+(news||'<li>'+emptyNews+'</li>')+'</ul>'+
    '<details data-sw-key="sources-'+esc(run.slot)+'"><summary>'+t('来源与查询时间','Sources and retrieval times')+'</summary><ul>'+feeds+'</ul><small>'+t('完成于','Completed')+' '+esc(clock(rec.finishedAt))+' · '+ny()+'</small></details>';
}

function schedule(v) {
  const mandate=String(v.mandate??'');
  const split=mandate.indexOf('\nHorizon: ');
  const goal=split>0?mandate.slice(0,split):mandate;
  const limits=[];
  if(Number.isFinite(v.maxWeightPercent))limits.push(t('单项仓位上限 '+v.maxWeightPercent+'%','Position cap '+v.maxWeightPercent+'%'));
  if(typeof v.permissions?.allowBuy==='boolean')limits.push(v.permissions.allowBuy?t('允许模拟买入','Paper buys permitted'):t('禁止模拟买入','Paper buys blocked'));
  if(typeof v.permissions?.allowSell==='boolean')limits.push(v.permissions.allowSell?t('允许模拟卖出','Paper sales permitted'):t('禁止模拟卖出','Paper sales blocked'));
  const original=split>0?'<details class="sw-mandate" data-sw-key="mandate"><summary>'+t('查看建团时的完整策略原文','Read the original fund mandate')+'</summary><p>'+esc(mandate)+'</p></details>':'';
  const chooser=v.available&&v.eligible?'<label class="sw-cadence">'+t('盘中观察间隔','Intraday interval')+'<select data-watch-interval>'+[30,60,120].map(n=>'<option value="'+n+'"'+(v.intervalMinutes===n?' selected':'')+'>'+minutesLabel(n)+'</option>').join('')+'</select></label>':'';
  const action=v.available&&v.eligible?'<button type="button" class="sw-control" data-watch-toggle>'+ (v.enabled?t('暂停盯盘','Pause watch'):t('恢复盯盘','Resume watch'))+'</button>':'';
  return '<div class="sw-policy"><h3>'+t('盯盘策略','Watch strategy')+'</h3><p>'+esc(goal)+'</p>'+(limits.length?'<p>'+esc(limits.join(' · '))+'</p>':'')+original+
   '<p>'+t('每天 08:30 查新闻。交易日 09:30 首查，自开盘起按所选间隔观察，收盘后停止盘中检查。','News is checked daily at 08:30. Trading-day checks start at 09:30 and follow your interval until the close.')+' '+ny()+'</p>'+
   (v.enabled&&v.nextMarket?'<p>'+t('下次交易时段观察','Next in-session check')+' · '+esc(clock(v.nextMarket))+'</p>':'')+
   '<div class="sw-controls">'+chooser+action+'</div></div>';
}

function renderRun(run) {
  return '<details class="sw-history" data-sw-key="run-'+esc(run.slot)+'"><summary><span>'+esc(meetingLabel(run))+'</span><small>'+esc(clock(run.slot))+'</small></summary>'+details(run)+'</details>';
}

export function renderWatch(v) {
  const last=v.history[0];
  const status=!v.available?t('服务未启用','Service offline'):!v.eligible?t('未排入日程','Unscheduled'):!v.enabled?t('已暂停','Paused'):t('云端已开启','Cloud watch on');
  const market=v.marketSession==='regular'?t('美股交易中','US market open'):v.marketSession==='closed'?t('美股休市','US market closed'):t('交易时段待核实','Market hours unverified');
  const next=v.nextAt?esc(clock(v.nextAt)):'—';
  const lastTime=last?esc(clock(last.started)):'';
  const history=v.history.map(renderRun).join('');
  return '<header class="sw-head"><h2>'+t('自动盯盘','Market watch')+'</h2><span class="sw-state" data-sw-state="'+(v.available&&v.enabled?'enabled':'off')+'">'+status+'</span></header>'+
   '<dl class="sw-stats"><div><dt>'+t('最近一次','Latest check')+'</dt><dd>'+esc(meetingLabel(last))+'</dd><small>'+[lastTime,esc(packetSummary(last))].filter(Boolean).join(' / ')+'</small></div>'+
   '<div><dt>'+t('下一次','Next check')+'</dt><dd>'+next+'</dd><small>'+esc(v.nextKind?words(v.nextKind):v.enabled?t('等待可用日程','Awaiting schedule'):status)+'</small></div></dl>'+
   '<div class="sw-context"><span>'+esc(scheduleLabel(v.intervalMinutes))+'</span><span>'+market+'</span><span>'+ny()+'</span></div>'+
   '<details class="sw-drawer" data-sw-key="drawer"><summary>'+t('策略与盯盘记录','Strategy and watch history')+'</summary>'+schedule(v)+
   '<h3>'+t('检查记录','Watch history')+'</h3><div class="sw-entries">'+(history||'<p>'+ (v.enabled?t('首条记录将在服务器实际开始观察时出现。','The first record appears when the server starts observing.'):t('尚无记录。','No observations recorded.'))+'</p>')+'</div>'+
   (v.older?'<button class="sw-control sw-older" type="button" data-watch-older>'+t('查看更早记录','Load earlier checks')+'</button>':'')+'</details><p class="sw-feedback" role="status"></p>';
}

export function watchMount(compact=false) {
  return '<section class="studio-watch" data-studio-watch="'+(compact?'compact':'full')+'" aria-label="'+t('自动盯盘','Market watch')+'"><p>'+t('正在读取盯盘记录…','Loading market watch…')+'</p></section>';
}

let disconnect=null;
export function bindWatch(root,fund) {
  disconnect?.();disconnect=null;
  const node=root.querySelector('[data-studio-watch]');
  if(!node||!fund||fund.replica)return;
  let snapshot,timer,sequence=0;
  let pageCursor,loadingPage=false;
  const extraRuns=new Map();
  let initial=true,watchingUntil=Date.now()+100_000;
  const endpoint='/api/studio-watch?fund='+encodeURIComponent(fund.id);
  async function refresh(change) {
    const request=++sequence;
    clearTimeout(timer);
    const controls=node.querySelectorAll('button,select');
    const originalFocus=node.contains(document.activeElement)?document.activeElement:null;
    if(change)controls.forEach(c=>c.disabled=true);
    try {
      const response=await fetch(change?'/api/studio-watch':endpoint,change?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fundId:fund.id,...change})}:{cache:'no-store'});
      if(request!==sequence||!node.isConnected)return;
      if(response.status===404){node.remove();return;}
      if(!response.ok)throw Error('watch-unavailable');
      const view=await response.json();
      if(request!==sequence||!node.isConnected||view.fundId!==fund.id)return;
      const open=new Set([...node.querySelectorAll('details[open]')].map(el=>el.dataset.swKey));
      const focus=change?originalFocus:document.activeElement;
      const selector=focus?.matches('[data-watch-toggle]')?'[data-watch-toggle]':focus?.matches('[data-watch-interval]')?'[data-watch-interval]':null;
      const focusSummary=focus?.matches('summary')?focus.parentElement?.dataset.swKey:null;
      // Keep keyboard focus, expanded sources and text selection across silent refreshes.
      if(JSON.stringify(view)!==JSON.stringify(snapshot)||change) {
        if(extraRuns.size)for(const run of snapshot?.history??[])extraRuns.set(run.slot,run);
        const all=new Map(extraRuns);for(const run of view.history)all.set(run.slot,run);
        node.innerHTML=renderWatch({...view,history:[...all.values()].sort((a,b)=>b.slot-a.slot).slice(0,view.retainedChecks??210),older:pageCursor===undefined?view.older:pageCursor});
        for(const detail of node.querySelectorAll('details'))detail.open=open.has(detail.dataset.swKey);
        if(initial&&new URLSearchParams(location.hash.split('?')[1]).get('view')==='watch'){node.querySelector('.sw-drawer').open=true;node.scrollIntoView({block:'start'});}
        if(selector)node.querySelector(selector)?.focus({preventScroll:true});
        else if(focusSummary)for(const detail of node.querySelectorAll('details'))if(detail.dataset.swKey===focusSummary)detail.querySelector('summary').focus({preventScroll:true});
      }
      snapshot=view;initial=false;
      if(change)node.querySelector('.sw-feedback').textContent=t('已保存。','Saved.');
      const busy=view.enabled&&(!view.history.length||view.history[0].status==='running');
      const dueMs=view.nextAt?view.nextAt-Date.now():Infinity;
      if(view.enabled&&view.available&&(busy||Number.isFinite(dueMs))){
        const delay=busy&&Date.now()<watchingUntil?3500:Math.min(10*60_000,Math.max(12000,dueMs+1500));
        timer=setTimeout(()=>{if(node.isConnected&&document.visibilityState==='visible')void refresh();},delay);
      }
    } catch {
      if(request!==sequence||!node.isConnected)return;
      if(snapshot) {
        node.querySelector('.sw-feedback').textContent=change?t('未能保存。请重试。','Could not save. Please try again.'):t('暂时无法刷新，显示上次读取的记录。','Could not refresh. Showing the last records received.');
        controls.forEach(c=>c.disabled=false);
        const select=node.querySelector('[data-watch-interval]');if(select)select.value=String(snapshot.intervalMinutes);
      } else node.innerHTML='<p>'+t('暂时无法读取盯盘记录。','Watch records are temporarily unavailable.')+'</p><button class="sw-control" type="button" data-watch-retry>'+t('重试','Retry')+'</button>';
    }
  }
  async function loadEarlier(button) {
    if(loadingPage||!snapshot)return;
    const cursor=pageCursor===undefined?snapshot.older:pageCursor;
    if(!cursor)return;
    loadingPage=true;button.disabled=true;
    try{
      const response=await fetch(endpoint+'&before='+encodeURIComponent(cursor),{cache:'no-store'});
      if(!response.ok)throw Error('history');
      const page=await response.json();if(!node.isConnected||page.fundId!==fund.id)return;
      const existing=new Set([...node.querySelectorAll('.sw-history')].map(detail=>detail.dataset.swKey));
      const rows=page.history.filter(run=>!existing.has('run-'+run.slot));
      for(const run of rows)extraRuns.set(run.slot,run);
      const holder=document.createElement('template');holder.innerHTML=rows.map(renderRun).join('');
      const entries=node.querySelector('.sw-entries');
      const newEntries=[...holder.content.children];entries.append(...newEntries);
      pageCursor=page.older;
      if(!pageCursor)node.querySelector('[data-watch-older]')?.remove();
      newEntries[0]?.querySelector('summary')?.focus({preventScroll:true});
      node.querySelector('.sw-feedback').textContent=t('已载入 '+rows.length+' 条历史记录。',rows.length+' earlier checks loaded.');
    }catch{if(node.isConnected)node.querySelector('.sw-feedback').textContent=t('暂时无法读取更早记录，可以重试。','Earlier checks could not be loaded. Please try again.');}
    finally{loadingPage=false;const next=node.querySelector('[data-watch-older]');if(next)next.disabled=false;}
  }
  node.addEventListener('click',e=>{
    if(e.target.closest('[data-watch-retry]'))void refresh();
    if(e.target.closest('[data-watch-toggle]')&&snapshot)void refresh({enabled:!snapshot.enabled});
    const older=e.target.closest('[data-watch-older]');if(older)void loadEarlier(older);
  });
  node.addEventListener('change',e=>{if(e.target.matches('[data-watch-interval]'))void refresh({intervalMinutes:Number(e.target.value)});});
  const visible=()=>{if(!node.isConnected)document.removeEventListener('visibilitychange',visible);else if(document.visibilityState==='visible'){watchingUntil=Date.now()+100_000;void refresh();}};
  document.addEventListener('visibilitychange',visible);
  disconnect=()=>{clearTimeout(timer);sequence++;document.removeEventListener('visibilitychange',visible);};
  void refresh();
}
