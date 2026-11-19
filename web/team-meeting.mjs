import { stopSpeaking } from './voice.mjs';
import { known, executionReason } from './decision-copy.mjs';
import { teamSystemText } from './team-copy.mjs';
import { getLanguage, t } from './i18n.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);
const zh = () => getLanguage() === 'zh-CN';
function label(actor) {
  const roles = {research:t('研究席','Research'),risk:t('独立风险席','Independent risk'),manager:'Maya Chen',engine:t('执行引擎','Execution engine'),coordinator:t('协调服务','Coordinator')};
  return roles[actor] || actor;
}
function status(key) {
  return ({running:t('进行中','In session'),complete:t('已完成','Complete'),partial:t('部分完成','Partial'),failed:t('失败','Failed'),started:t('工作中','Working'),completed:t('已回复','Reported'),skipped:t('未参与','Skipped'),handoff:t('已交接','Handed off')})[key] || key;
}
function sourceName(value) {
  return ({'Simulation engine':t('独立模拟执行','Independent simulation'),'Historical simulation engine':t('历史模拟执行','Historical simulation'),'Previous HarnessRouter receipt':t('沿用前次 HarnessRouter 回执','Previous HarnessRouter receipt'),'Coordinator':t('协调服务','Coordinator')})[value] || value;
}
function time(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString(getLanguage(),{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '';
}
function evidence(ref, context) {
  const line=context.run?.evidence?.find(line=>line.id===ref);
  if(line) return `${known(line.label)} · ${known(line.value)} (${known(line.source)}${line.asOf?' · '+line.asOf:''})`;
  const s=context.study;
  if(!s)return ref;
  if(ref==='mandate')return `${t('公开授权','Public mandate')} · ${s.sourceCutoff} · ${s.allocation?.map(a=>a.symbol+' '+a.weightPct+'%').join(' / ')}`;
  if(ref==='holdout')return `${t('留出期','Holdout')} · ${s.holdout?.start} — ${s.holdout?.end}`;
  if(ref==='deviations' && s.points?.length>1) {
    const gaps=s.points.slice(1).map((q,i)=>({date:q.date,delta:100*(q.replica/s.points[i].replica-q.target/s.points[i].target)}));
    const q=gaps.reduce((a,b)=>Math.abs(a.delta)>Math.abs(b.delta)?a:b);
    return `${t('单期最大偏离','Largest period gap')} · ${q.date} · ${q.delta.toFixed(2)} pp`;
  }
  if(ref==='research-method')return t('组合构建、费用及比较基准，详见研究说明。','Portfolio rule, cost and comparison benchmark in the study notes.');
  if(ref==='coverage')return (s.playbook?.checks||[]).map(c=>zh()?c.detail.zh:c.detail.en).join(' ') || t('详见研究数据覆盖。','See study coverage.');
  if(ref==='sources')return (s.sources||[]).map(source=>zh()?source.title:source.titleEn||source.title).join(' · ');
  return ref;
}
function eventText(event, context) {
  if (!event) return '';
  const execution = context.run?.execution;
  if (event.actor === 'engine' && event.stage === 'completed' && execution?.reason === event.text) {
    return executionReason(execution);
  }
  if (event.stage === 'started' || ['failed', 'skipped'].includes(event.stage)) return teamSystemText(event.text);
  return event.text;
}
export function researchReviewButton(study, review, disabled) {
  if(!study || !['historical-proxy','method-only'].includes(study.status))return '';
  const retry=['partial','failed'].includes(review?.status);
  return `<button type="button" class="mt-launch" data-action="review-research" data-id="${escape(study.catalogId)}" data-retry="${retry}" ${disabled?'disabled':''}>${retry?t('重试未完成的席位','Retry unfinished seats'):review?t('重新召开研究会议','Open a new research meeting'):t('召开 AI 研究会议','Convene AI research team')} ↗</button>`;
}
export function meetingSlot(type, id) {
  return `<div class="meeting-slot" data-meeting-type="${escape(type)}" data-meeting-id="${escape(id)}"></div>`;
}
export function meetingMarkup(activity, context, selectedSeq) {
  const events=activity?.events||[];
  if(!events.length) return activity?.status==='running' ? `<section class="mt-wait" role="status">${t('等待第一条后端工作记录…','Waiting for the first recorded event…')}</section>` : '';
  const picked=events.find(e=>e.seq===selectedSeq) || events.at(-1);
  const position=events.indexOf(picked);
  const source=sourceName(picked.source);
  const role=label(picked.actor);
  const recipient=picked.recipient ? label(picked.recipient) : '';
  const duty=events.find(e=>e.actor===picked.actor && e.stage==='started')?.text || context.review?.seats?.find(seat=>seat.role===picked.actor)?.task;
  const refs=picked.evidenceRefs || [];
  const observed=context.run?.reviews?.find(r=>r.name===picked.actor);
  const subject=context.study?.ticker || context.run?.decision?.symbol || context.title || '';
  const outcome=activity.kind==='reviewResearch'?t('研究会议 · 未下单','Research meeting · No order placed'):context.run?.execution?executionReason(context.run.execution):events.findLast(e=>e.actor==='engine'&&e.stage==='completed')?.text || t('等待执行回执','Awaiting an execution receipt');
  const title=activity.kind==='reviewResearch'?t('复刻研究会议','Strategy research meeting'):t('工作室投委会','Studio investment committee');
  const step=(ix,text)=>ix<0||ix>=events.length?'':`<button class="session-step" type="button" data-meeting-seq="${Number(events[ix].seq)}">${text}</button>`;
  return `<section class="mt-view live-session" tabindex="-1" aria-label="${t('团队会议','Team meeting')}">
    <header class="session-heading"><div><span>${escape(subject)} · ${escape(status(activity.status))}</span><h2>${title}</h2></div><span class="session-counter">${position+1} / ${events.length}</span></header>
    <div class="session-focus"><div class="session-byline"><span>${escape(role)}</span>${recipient?`<i aria-hidden="true">→</i><span>${escape(recipient)}</span>`:''}</div>
      <article class="mt-detail"><small>${escape(status(picked.stage))} · <time>${escape(time(picked.at))}</time> · ${escape(source)}</small>
      <p class="statement-text">${escape(eventText(picked,context))}</p>
      ${duty&&duty!==picked.text?`<p class="mt-duty"><b>${t('职责','Assignment')}</b> ${escape(teamSystemText(duty))}</p>`:''}
      ${observed?.sentiment?`<p class="mt-duty"><b>${t('立场','Position')}</b> ${escape(known(observed.sentiment))}${observed.reconsider?' · '+escape(observed.reconsider):''}</p>`:''}
      ${refs.length||picked.responseId?`<details><summary>${t('依据与回执','Evidence and receipt')}</summary>${refs.length?`<ul>${refs.map(r=>`<li>${escape(evidence(r,context))}</li>`).join('')}</ul>`:''}${picked.responseId?`<code>${escape(picked.responseId)}</code>`:''}</details>`:''}
      ${picked.stage!=='started'&&picked.text?`<button class="mt-read" type="button" data-action="speak-message" data-text="${escape(eventText(picked,context))}">${t('朗读发言','Read statement aloud')}</button>`:''}
      </article></div>
    <nav class="session-nav" aria-label="${t('浏览会议记录','Browse meeting records')}">${step(position-1,t('← 上一条','← Previous'))}${step(position+1,t('下一条 →','Next →'))}</nav>
    <details class="mt-expand"><summary>${t('全部发言与交接','All statements and handoffs')} · ${events.length}</summary>
      <div class="mt-steps">${events.map(e=>`<button type="button" class="mt-step" data-meeting-seq="${Number(e.seq)}" aria-pressed="${e.seq===picked.seq}"><time>${escape(time(e.at))}</time><span>${escape(label(e.actor))}${e.recipient?' → '+escape(label(e.recipient)):''}</span><small>${escape(status(e.stage))}</small></button>`).join('')}</div></details>
    <div class="mt-outcome"><strong>${t('独立模拟执行','Independent paper execution')}</strong><span>${escape(outcome)}</span></div></section>`;
}

export function createMeetingController({getContext, getActivity}) {
  const current=new Map(),focus=new Map(),shown=new WeakMap();
  function paint(){
    for(const el of document.querySelectorAll('.meeting-slot')) {
      const key=el.dataset.meetingType+':'+el.dataset.meetingId;
      const context=getContext(el.dataset.meetingType,el.dataset.meetingId);
      const tracked=current.get(key);
      const act=tracked?.activity || context.activity;
      const seq=act && focus.get(act.requestId);
      const fingerprint=[act?.requestId, act?.status, act?.events?.length,seq,getLanguage(),Boolean(context.run),Boolean(context.review)].join('|');
      if(shown.get(el)===fingerprint)continue;
      const active=el.contains(document.activeElement)?document.activeElement.closest('[data-meeting-seq]')?.dataset.meetingSeq:null;
      const open=el.querySelector('.mt-expand')?.open;
      const evidenceOpen=el.querySelector('.mt-detail details')?.open;
      const listScroll=el.querySelector('.mt-steps')?.scrollTop||0;
      shown.set(el,fingerprint);
      el.innerHTML=meetingMarkup(act,context,seq);
      if(active)el.querySelector(`[data-meeting-seq="${Number(active)}"]`)?.focus({preventScroll:true});
      if(open && el.querySelector('.mt-expand'))el.querySelector('.mt-expand').open=true;
      if(evidenceOpen && el.querySelector('.mt-detail details'))el.querySelector('.mt-detail details').open=true;
      const list=el.querySelector('.mt-steps');if(list)list.scrollTop=seq?listScroll:list.scrollHeight;
    }
  }
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-meeting-seq]');if(!button||!button.dataset.meetingSeq)return;
    const slot=button.closest('.meeting-slot');if(!slot)return;
    const key=slot.dataset.meetingType+':'+slot.dataset.meetingId;
    const act=current.get(key)?.activity || getContext(slot.dataset.meetingType,slot.dataset.meetingId).activity;
    if(act){stopSpeaking();focus.set(act.requestId,Number(button.dataset.meetingSeq));paint();}
  });
  function begin(type,id,requestId) {
    const key=type+':'+id, entry={activity:{requestId,kind:type,status:'running',events:[]},timer:null,done:false};
    clearTimeout(current.get(key)?.timer);current.set(key,entry);
    async function check(){
      if(current.get(key)!==entry || entry.done)return;
      try {const a=await getActivity(requestId);if(a && current.get(key)===entry && !entry.done){entry.activity=a;paint();}}
      catch { }
      if(current.get(key)===entry&&!entry.done&&entry.activity.status==='running')entry.timer=setTimeout(check,850);
    }
    entry.timer=setTimeout(check,120);paint();
    return async success=>{
      clearTimeout(entry.timer);entry.done=true;
      if(current.get(key)!==entry)return;
      if(success){current.delete(key);paint();return;}
      try{const a=await getActivity(requestId);if(current.get(key)===entry){if(a)entry.activity=a;else current.delete(key);}}catch{current.delete(key);}
      paint();
    };
  }
  function clear(){for(const e of current.values()){e.done=true;clearTimeout(e.timer);}current.clear();focus.clear();}
  return {begin,paint,clear};
}
