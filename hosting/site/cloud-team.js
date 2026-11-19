import {renderStudioFloor} from '/strategy-salon.mjs';
export function teamDesk({value,t,el,button,displayRole,selection,select,submit,busy,offline,drafts}) {
  const {team,proposals={},threads={}}=value.fund;
  const seat=team.find(m=>m.id===selection.id)||team[0];
  const manager=seat.role==='manager', task=manager?'hire':selection.task==='assign'?'assign':'ask';
  const section=el('section','','formation cloud-team');
  section.append(el('p',t('已成立 · 模拟基金','Open · Paper fund'),'sender'),el('h2',value.fund.name));
  const floor=el('div');
  floor.innerHTML=renderStudioFloor({team,selectedId:seat.id,arrivals:value.fund.arrivals??[],language:t('zh-CN','en-US')});
  for(const pick of floor.querySelectorAll('button[data-id]')){
    pick.disabled=busy;pick.onclick=()=>select(pick.dataset.id,'ask');
    if(value.fund.arrivals?.includes(pick.dataset.id) && pick.matches('.inh-pin'))pick.classList.add('inh-arriving');
  }
  section.append(floor,el('p',t('已确认职责','Confirmed assignment')+' · '+(seat.duty||''),'small-note'));
  if(!manager && !threads[seat.id]?.length){
    const first=button(t('问问第一项任务','Ask about the first task'),()=>submit('ask',seat.id,t('按我们约定的职责，你会先核对什么？','For your assignment, what would you check first?')),'plain');
    first.disabled=busy||offline;section.append(first);
  }
  const open=manager?selection.task==='hire':true;
  if(!manager){
    const list=el('div','','cloud-seat-thread');
    for(const turn of threads[seat.id]||[]){
      const item=el('p');item.append(el('b',turn.role==='user'?t('你','You'):seat.name),document.createTextNode(' · '+turn.text));list.append(item);
    }
    section.append(list);
  }
  if(!busy&&(!manager||!open)){
    const next=manager?'hire':task==='assign'?'ask':'assign';
    const change=button(manager?t('招募员工','Hire teammates'):next==='assign'?t('调整职责','Change responsibility'):t('与这位同事交谈','Talk to teammate'),()=>select(seat.id,next),'plain');
    section.append(change);
  }
  if(open){
    const prompt=manager?t('你希望招几位同事？各负责什么？','How many colleagues do you want, and what should each do?'):task==='assign'?t('这位同事今后负责什么？','What should this teammate take responsibility for?'):t('给','Ask ')+seat.name+t('留言',' a question');
    const label=el('label',prompt,'transcript-caption'),field=el('textarea','','write-field');
    field.maxLength=3000;label.htmlFor=field.id='seat-message';
    const key=seat.id+'|'+task;field.value=drafts.get(key)||'';
    const send=button(t('发送','Send'),()=>submit(task,seat.id,field.value.trim()),'glass');
    const toggle=()=>{send.disabled=busy||offline||!field.value.trim()};
    field.oninput=()=>{drafts.set(key,field.value);toggle()};toggle();field.disabled=busy;
    section.append(label,field,send);
  }
  const proposal=proposals[seat.id];
  if(proposal){
    const preview=el('div','','blueprint'),hiring=Array.isArray(proposal.hires);
    preview.append(el('h3',hiring?t('待确认的员工','Proposed teammates'):t('待确认的职责','Proposed responsibility')));
    for(const m of proposal.hires||[proposal]){
      preview.append(el('strong',m.name+(m.title?' · '+m.title:'')),el('p',m.duty,'small-note'));
    }
    const accept=button(hiring?t('确认雇用','Confirm hire'):t('确认调整职责','Confirm responsibility'),()=>submit('accept',seat.id,'',proposal.id),'glass');
    accept.disabled=busy;preview.append(accept);section.append(preview);
  }
  return section;
}
