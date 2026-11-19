import { teamSystemText } from './team-copy.mjs';
import { t, setLanguage } from './i18n.mjs';
import { messagesForSeat } from './seat-messages.mjs';

const desks = [
  { id: 'management', name: 'Portfolio management', short: 'Management', mark: 'M', description: 'Owns the final proposal.' },
  { id: 'research', name: 'Research', short: 'Research', mark: 'R', description: 'Tests the investment case.' },
  { id: 'risk', name: 'Portfolio risk', short: 'Risk', mark: 'K', description: 'Challenges sizing and exposure.' },
  { id: 'execution', name: 'Execution', short: 'Execution', mark: 'E', description: 'Checks quotes and order conditions.' },
  { id: 'bench', name: 'Bench', short: 'Bench', mark: '+', description: 'Keep teammates available for a later assignment.' },
];

const roles = {
  manager: { name: 'Portfolio Manager', color: 'forest' },
  research: { name: 'Equity Research', color: 'green' },
  risk: { name: 'Risk Analyst', color: 'lilac' },
  trader: { name: 'Execution Trader', color: 'clay' },
  quant: { name: 'Portfolio Construction', color: 'sand' },
};

export const CANDIDATES = [
  {
    id: 'maya-chen', role: 'manager', name: 'Maya Chen', desk: 'management',
    focus: 'Portfolio construction',
    duty: 'Weigh the specialists’ evidence, set a target weight, and explain what would make you change the decision.',
  },
  {
    id: 'theo-park', role: 'research', name: 'Theo Park', desk: 'research',
    focus: 'Business quality and valuation',
    duty: 'Build an investment thesis from the available evidence. Compare the upside with the valuation and surface conflicting signals.',
  },
  {
    id: 'inez-rao', role: 'risk', name: 'Inez Rao', desk: 'risk',
    focus: 'Exposure and downside',
    duty: 'Review concentration, downside and mandate limits. Flag when the portfolio should cut its exposure or skip a trade.',
  },
  {
    id: 'eli-morgan', role: 'trader', name: 'Eli Morgan', desk: 'execution',
    focus: 'Liquidity and market conditions',
    duty: 'Check the quote age, spread, and trading session. Describe the conditions needed for an eligible paper order.',
  },
  {
    id: 'leah-kim', role: 'quant', name: 'Leah Kim', desk: 'research',
    focus: 'Allocation sizing and scenario checks',
    duty: 'Compare the proposed position with a smaller allocation or waiting. Explain how each choice changes cash and concentration.',
  },
  {
    id: 'jules-bennett', role: 'research', name: 'Jules Bennett', desk: 'research',
    focus: 'Earnings, catalysts and valuation',
    duty: 'Track what could change the thesis and compare the evidence with current valuation assumptions.',
  },
  {
    id: 'avery-khan', role: 'risk', name: 'Avery Khan', desk: 'risk',
    focus: 'Stress scenarios and guardrails',
    duty: 'Stress the position against the replay scenarios and name the limit most likely to block an order.',
  },
  {
    id: 'riley-diaz', role: 'trader', name: 'Riley Diaz', desk: 'execution',
    focus: 'Order quality and rebalancing',
    duty: 'Compare the expected fill with the proposal and flag market conditions that could delay the rebalance.',
  },
  {
    id:'nora-bell', name:'Nora Bell', role:'research', desk:'research', monogram:'NB',
    focus:'Inflation, growth and policy',
    duty:'Compare inflation, growth and central bank data with the fund’s assumptions. Flag the economic release most likely to change the thesis.',
  },
  {
    id:'owen-reed', name:'Owen Reed', role:'quant', desk:'research', monogram:'OR',
    focus:'Yield curves and bond duration',
    duty:'Estimate how yield curve moves affect bond exposure. Separate interest rate sensitivity from issuer credit risk.',
  },
];

export const DEFAULT_TEAM = CANDIDATES.slice(0, 4).map(({ id, role, name, duty, desk }) => ({
  id, role, name, duty, desk,
}));

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function setStudioLanguage(value) { setLanguage(value); }
export const studioText = t;

export function roleLabel(role) { return studioText(({ manager: '基金经理', research: '研究员', risk: '风险分析师', trader: '交易执行', quant: '组合构建' })[role] ?? '专业成员', roles[role]?.name ?? 'Specialist'); }

export function portrait(member, extraClass = '') {
  const initial=CANDIDATES.find(person=>person.id===member?.id)?.monogram;
  if(initial)return `<span class="person-portrait formation-monogram ${extraClass}" role="img" aria-label="${escape(member.name)}">${initial}</span>`;
  const name = (member?.name || 'Maya Chen').normalize('NFKC').trim().toLowerCase().replace(/[\s._-]+/gu, ' ');
  let index = CANDIDATES.findIndex(person => person.id === member?.id || person.name.toLowerCase() === name);
  if (index < 0) {
    // The permanent seat ID is assigned after hiring. Cast the same fictional portrait on both sides of confirmation.
    let hash = 0;
    for (const character of name) hash = (Math.imul(hash, 31) + character.codePointAt(0)) >>> 0;
    index = 1 + hash % 7;
  }
  const maya = index === 0;
  return `<span class="person-portrait ${maya ? 'person-portrait--maya' : ''} ${extraClass}" style="--portrait-x:${index % 4 * 100 / 3}%;--portrait-y:${index < 4 ? 0 : 100}%" role="img" aria-label="${escape(member?.name ?? 'Maya Chen')}${t('，虚构 AI 成员', ', fictional AI teammate')}"></span>`;
}

const focusZh = { 'maya-chen': '组合构建', 'theo-park': '企业质量与估值', 'inez-rao': '敞口与下行风险', 'eli-morgan': '流动性与市场条件', 'leah-kim': '配置规模与情景检查', 'jules-bennett': '盈利、催化因素与估值', 'avery-khan': '压力情景与风控边界', 'riley-diaz': '订单质量与再平衡' };
focusZh['nora-bell']='通胀、增长与货币政策';
focusZh['owen-reed']='收益率曲线与债券久期';
const deskZh = { management: '管理', research: '研究', risk: '风控', execution: '执行', bench: '候补' };

const stationArt = { management: 'management', research: 'research', risk: 'risk', execution: 'execution' };

export function renderRoom({ team = DEFAULT_TEAM, selectedId, empty = false, compact = false } = {}) {
  const working = team.filter(member => member.desk !== 'bench');
  const selected = working.find(member => member.id === selectedId) ?? working.find(member => member.role === 'manager') ?? working[0];
  return `<section class="desk-floor${compact ? ' desk-floor--compact' : ''}" aria-label="${t('团队工位','Team workstations')}">
    <header class="floor-head"><h2>${t('工作室工位','Studio floor')}</h2><span>${working.length} ${t('席在岗','seats staffed')}</span></header>
    ${selected?`<div class="active-desk"><div class="active-desk-picture desk-art--${stationArt[selected.desk] || 'research'}" aria-hidden="true"></div><div class="active-desk-copy"><span>${t('当前工位','Focused desk')} · ${(selected.title ? escape(selected.title) : roleLabel(selected.role))}</span><strong>${escape(selected.name)}</strong><p>${escape(teamSystemText(selected.duty || ''))}</p></div></div>`:''}
    <div class="desk-grid">${desks.filter(desk=>desk.id!=='bench').map(desk=>{
      const members=working.filter(member=>member.desk===desk.id);
      return `<section class="workstation ${members.some(m=>m.id===selected?.id)?'station-selected':''}" data-desk-drop="${desk.id}">
        <div class="desk-body"><h3>${t(deskZh[desk.id],desk.short)}</h3>
        ${members.length ? members.map(member=>`<button type="button" class="desk-member" id="desk-${escape(member.id)}" aria-label="${escape(member.name)} · ${member.title ? escape(member.title) : roleLabel(member.role)}" data-action="select-member" data-id="${escape(member.id)}" aria-pressed="${member.id===selected?.id}" data-drag-member="${escape(member.id)}" draggable="${!empty}" ${empty?'disabled':''}><span>${escape(member.name)}</span><span aria-hidden="true">${member.id===selected?.id?'●':'↗'}</span></button>`).join('') : `<span class="seat-empty">${t('空缺','Open seat')}</span>`}</div>
      </section>`;}).join('')}</div>
  </section>`;
}

export function renderStudioFloor({team,selectedId,arrivals=[],language}) {
  if(language)setStudioLanguage(language);
  return inhabitedRoom(team,selectedId,arrivals);
}

function officeSeat(member, selectedId, compact = false) {
  const id=escape(member.id), name=escape(member.name), chosen=member.id===selectedId;
  const chatLabel = t('与'+name+'交谈','Talk to '+name);
  return `<span class="office-seat ${compact?'office-seat-compact':'office-seat-pin'}" data-office-member="${id}" data-current-desk="${escape(member.desk)}" data-member-name="${name}" data-seat-role="${escape(member.role)}">
    <button type="button" class="office-seat-handle" data-seat-handle aria-pressed="false" aria-label="${t('移动'+name+'的工位','Move '+name+' to another desk')}" aria-describedby="office-room-instructions">${portrait(member)}</button>
    <button type="button" class="office-seat-name" id="desk-${id}" data-action="select-member" data-id="${id}" aria-pressed="${chosen}" aria-label="${chatLabel}">${compact?name:escape(member.name.split(' ')[0])}</button>
  </span>`;
}

function destination(desk) {
  const label=t(deskZh[desk.id],desk.short);
  return `<button type="button" class="office-seat-destination" data-seat-destination="${desk.id}" aria-label="${t('放到'+label+'工位','Place at '+label)}" hidden>${t('放这里','Place here')}</button>`;
}

function inhabitedRoom(team,selectedId,arrivals=[],officeView=false) {
  const active=team.filter(member=>member.desk!=='bench');
  const picked=team.find(member=>member.id===selectedId);
  const selected=picked?.desk==='bench'?null:picked??active.find(member=>member.role==='manager')??active[0];
  const stationPoints=officeView
    ? {management:[63,28],research:[47,70],risk:[16,52],execution:[86,68]}
    : {management:[71,23],research:[51,72],risk:[19,55],execution:[83,56]};
  const managerPoint=stationPoints[active.find(member=>member.role==='manager')?.desk];
  const selectedPoint=stationPoints[selected?.desk];
  const relay=managerPoint && selectedPoint && managerPoint!==selectedPoint
    ? '<svg class="crew-handoff-line" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><path pathLength="100" d="M'+managerPoint.join(' ')+' Q44 38 '+selectedPoint.join(' ')+'"/></svg>' : '';
  function seat(member,compact=false) {
    if (officeView) return officeSeat(member,picked?.id,compact);
    const id=escape(member.id),name=escape(member.name);
    return `<button type="button" class="${compact?'crew-extra-seat':'crew-person inh-pin'}" id="desk-${id}" data-action="select-member" data-id="${id}" aria-pressed="${member.id===selected?.id}" aria-label="${name} · ${escape(member.title||roleLabel(member.role))}" data-drag-member="${id}" draggable="true">${portrait(member)}<span>${compact?name:escape(member.name.split(' ')[0])}</span></button>`;
  }
  const extra=[];
  const stations=desks.filter(station=>station.id!=='bench').map(station=>{
    const members=active.filter(member=>member.desk===station.id);
    const shown=members.slice(0,officeView?1:2);
    if (selected?.desk===station.id && !shown.includes(selected)) shown[shown.length-1]=selected;
    const other=members.filter(member=>!shown.includes(member));
    const title=escape(t(deskZh[station.id],station.short)), [x,y]=stationPoints[station.id];
    if(other.length) extra.push(`<div class="office-overflow-group"><strong>${title}</strong>${other.map(member=>seat(member,true)).join('')}</div>`);
    const activeDrop=officeView ? ` data-office-desk="${station.id}" data-desk-label="${title}" role="group" aria-label="${title}"` : '';
    const occupancy=members.length ? (officeView && other.length ? ' +'+other.length : '') : ' · '+t('空岗','Open');
    return `<div class="crew-station${members.length?'':' crew-vacant'}" data-station="${station.id}" data-desk-drop="${station.id}"${activeDrop} style="--crew-x:${x}%;--crew-y:${y}%">
      <span class="crew-station-tag">${title}${occupancy}</span>
      ${shown.length?'<div class="crew-station-seats">'+shown.map(member=>seat(member)).join('')+'</div>':'<span class="crew-empty-chair" aria-hidden="true"></span>'}
      ${officeView?destination(station):''}</div>`;
  }).join('');
  const scene='<div class="inh-scene crew-scene"><div class="inh-interior" aria-hidden="true"></div>'+relay+stations+'</div>';
  const added=team.filter(member=>arrivals.includes(member.id));
  const admission=added.length ? '<p class="inh-admission" role="status">'+t('最近入职','Latest arrival')+' · '+added.map(m=>escape(m.name)).join(t('、',', '))+'</p>' : '';
  const othersLabel=t('同桌的其他同事','More teammates at these desks');
  if (!officeView) {
    const additional=extra.length?'<details class="crew-extra"><summary>'+othersLabel+'</summary>'+extra.join('')+'</details>':'';
    return '<section class="inh-room crew-room" id="studio-floor" tabindex="-1" aria-label="'+t('团队工位','Team workstations')+'"><header><h2>'+t('团队工位','Team desks')+'</h2><span>'+active.length+' '+t('席在岗','staffed seats')+'</span></header>'+scene+additional+admission+'</section>';
  }
  const bench=desks.find(desk=>desk.id==='bench'), reserved=team.filter(member=>member.desk===bench.id);
  const benchTitle=t('候补','Bench');
  return `<div class="inh-room crew-room office-floor-gallery" id="studio-floor" tabindex="-1" aria-label="${t('团队工位','Team workstations')}" role="group">
    ${scene}<div class="office-room-extras">
      ${extra.length?`<div class="crew-extra office-room-overflow" aria-label="${othersLabel}" role="group"><h3>${othersLabel}</h3>${extra.join('')}</div>`:''}
      <div class="office-room-bench studio-bench" data-office-desk="bench" data-desk-drop="bench" data-desk-label="${benchTitle}" role="group" aria-label="${benchTitle}">
        <span class="crew-station-tag">${benchTitle}</span>
        ${reserved.length?reserved.map(member=>seat(member,true)).join(''):`<span class="office-bench-note">${t('候补成员暂停例行审议。','Reserved teammates sit out routine reviews.')}</span>`}
        ${destination(bench)}
      </div>
    </div>${admission}</div>`;
}

function returnToManager(manager) {
  if (!manager) return '';
  return '<button type="button" class="office-colleague" data-action="return-manager"><span aria-hidden="true">←</span> '+t('回到基金经理','Back to fund manager')+'</button>';
}

function managerIntroduction(member) {
  const name=escape(member.name), role=roleLabel('manager');
  const welcome=t('我负责这只基金。你可以问我当前的持仓、团队分工，以及模拟决策的依据。','I manage this fund. Ask me about its holdings, team responsibilities, or the reasoning behind a paper decision.');
  const status=member.desk === 'bench' ? '<p class="office-manager-status">'+t('经理仍可联系，尚未分配在岗工位。','You can message your manager. No desk is currently assigned.')+'</p>' : '';
  return '<div class="office-manager-summary"><header class="conversation-person crew-subject">'+portrait(member)+
    '<div><span>'+role+'</span><h2>'+name+'</h2></div></header>'+
    '<p class="crew-duty">'+welcome+'</p>'+status+'</div>';
}

function handoffCard(member,manager,thread,busy,aiReady) {
  const name=escape(member.name), desk=desks.find(s=>s.id===member.desk);
  return '<div class="crew-card-intro">'+returnToManager(manager)+'<div class="crew-letterhead">'+
    escape(t(deskZh[desk?.id]||'专业工位',desk?.name||'Specialist desk'))+'</div>'+
    '<header class="conversation-person crew-subject">'+portrait(member)+'<div><h2>'+name+'</h2><span>'+escape(member.title||roleLabel(member.role))+'</span></div></header>'+
    '<p class="crew-duty">'+escape(teamSystemText(member.duty||member.focus||''))+'</p>'+
    '<div class="crew-card-actions">'+(!thread.length && aiReady?'<button type="button" class="crew-first" data-action="ask-first-duty" '+(busy?'disabled':'')+'>'+t('听听你的第一步','What would you do first?')+' <span aria-hidden="true">↗</span></button>':'')+
    '<button type="button" class="crew-ask" data-action="open-crew-chat">'+(thread.length?t('继续对话','Continue conversation'):t('自由提问','Ask a question'))+'</button></div></div>';
}
function deskWelcome(member) {
  const duty=teamSystemText(member.duty||member.focus||'');
  const name=escape(member.name.split(' ')[0]),role=escape(member.title||roleLabel(member.role));
  return '<article class="conversation-message inh-welcome"><small>'+t('成员介绍 · 已确认职责','Desk introduction · Confirmed assignment')+'</small><p>'+t('我是 '+name+'，负责'+role+'。','I’m '+name+', your '+role+'.')+'</p><p>'+escape(duty)+'</p></article>';
}

function recruiter(team,manager) {
  const hired = new Set(team.map(({ id }) => id));
  const names=new Set(team.map(m=>m.name.toLowerCase()));
  const candidates = CANDIDATES.filter(({ id,name }) => !hired.has(id) && !names.has(name.toLowerCase()));
  return `<section class="studio-recruit" id="studio-recruit" tabindex="-1"><div class="section-title"><h2>${studioText('招募新成员', 'Recruit a teammate')}</h2><button class="icon-button" data-action="toggle-recruit" type="button" aria-label="${t('关闭招募', 'Close recruiting')}">×</button></div>
    <p class="recruit-instructions">${t('直接雇用，或拖一位应聘者到目标工位。','Choose Hire or drag a candidate onto a desk.')}</p>
    ${manager ? '<button type="button" class="button button--primary" data-action="describe-hires">'+t('和经理商量人选','Discuss hiring with your manager')+' ↗</button>' : ''}<div class="recruit-grid">${candidates.map((member) => `<article class="recruit-person" draggable="true" data-drag-candidate="${member.id}">
      ${portrait(member)}<div><span>${roleLabel(member.role)}</span><h3>${escape(member.name)}</h3><p>${escape(t(focusZh[member.id], member.focus))}</p></div>
      <button class="button button--outline" type="button" data-action="hire" data-id="${member.id}" aria-label="${t('雇用', 'Hire')} ${escape(member.name)}">${studioText('雇用', 'Hire')} <span aria-hidden="true">+</span></button>
    </article>`).join('') || `<p class="muted">${t('所有可用成员都已加入你的团队。', 'All available teammates have joined your fund.')}</p>`}</div>
  </section>`;
}

function responsibilities(member) {
  const assignable=member.role==='manager'?desks.filter(desk=>desk.id!=='bench'):desks;
  const heading=member.role==='manager'?t('调整基金经理的职责','Edit manager responsibilities'):t('调整这位同事的职责','Edit this teammate’s assignment');
  return `<details class="person-details"><summary>${heading}</summary>
    <form data-form="duty" class="studio-duty-form"><input type="hidden" name="memberId" value="${escape(member.id)}">
      <label for="studio-duty">${t(`${escape(member.name.split(' ')[0])} 应该关注什么？`, `What should ${escape(member.name.split(' ')[0])} focus on?`)}</label>
      <span class="duty-voice" data-voice-for="studio-duty"></span><textarea id="studio-duty" name="duty" rows="3" maxlength="500" required>${escape(teamSystemText(member.duty))}</textarea>
      <button class="button button--outline" type="submit">${t('保存职责', 'Save responsibilities')}</button>
    </form>
    <div class="studio-assign-options" role="group" aria-label="${t(`任命 ${escape(member.name)} 的工作台`, `Assign ${escape(member.name)} to a desk`)}">${assignable.map((desk) => `<button type="button" data-action="assign" data-id="${member.id}" data-desk="${desk.id}" aria-pressed="${desk.id === member.desk}" ${desk.id === member.desk ? 'disabled' : ''}>${t(deskZh[desk.id], desk.short)}</button>`).join('')}</div>
    ${member.role !== 'manager' ? `<button class="text-button studio-dismiss" type="button" data-action="dismiss" data-id="${member.id}">${t('移出团队', 'Remove teammate')}</button>` : ''}
  </details>`;
}

export function renderSeatLog({chat = [], member, busy = false, atDesk = true} = {}) {
  if (!member || (atDesk && member.desk === 'bench' && member.role !== 'manager')) return '';
  const thread=messagesForSeat(chat,member);
  return `<div class="studio-messages" role="log" aria-label="${t('团队对话', 'Team conversation')}" aria-busy="${busy}">
      ${thread.length ? thread.map((message) => `<article class="conversation-message${message.role === 'user' ? ' conversation-message--user' : ''}"><span>${escape(message.role === 'user' ? studioText('你', 'You') : message.name || member.name)}</span><p>${escape(message.text)}</p>${message.role !== 'user' ? `<button class="read-reply" type="button" data-action="speak-message" data-voice-manager="${member.role==='manager'}" data-voice-receipt="${member.role==='manager'?escape(message.responseId||''):''}" data-voice-lang="${escape(message.language||'')}" data-text="${escape(message.text)}">${studioText('读给我听', 'Read aloud')} ♫</button>` : ''}${message.source ? `<small>${escape(message.source)}</small>` : ''}</article>`).join('') : (atDesk?'':deskWelcome(member))}
      ${busy ? `<p class="thinking" role="status"><i></i><i></i><i></i> ${t('正在思考…', 'Thinking it through…')}</p>` : ''}
    </div>`;
}

export function renderChat({ team = DEFAULT_TEAM, chat = [], selectedId, busy = false, hostedChat = false, voiceMarkup = '', aiReady = false, atDesk = false } = {}) {
  const manager=teamManager(team);
  const benched=atDesk && team.find(member=>member.id===selectedId && member.desk==='bench' && member.role!=='manager');
  if(benched){
    const stations=desks.filter(desk=>desk.id!=='bench');
    return '<aside class="conversation-panel crew-card crew-bench-card" id="studio-chat" tabindex="-1" data-paired-seat="'+escape(benched.id)+'" data-seat-role="'+escape(benched.role)+'">'+returnToManager(manager)+'<p class="crew-letterhead">'+t('候补成员','On the bench')+'</p><header class="conversation-person crew-subject">'+portrait(benched)+'<div><h2>'+escape(benched.name)+'</h2><span>'+escape(benched.title||roleLabel(benched.role))+'</span></div></header><p class="crew-duty">'+escape(teamSystemText(benched.duty||''))+'</p><p>'+t('为这位成员分配工位，即可开始对话。','Assign a desk to start a conversation with this teammate.')+'</p><div class="crew-reassign">'+stations.map(desk=>'<button type="button" class="crew-ask" data-action="assign" data-id="'+escape(benched.id)+'" data-desk="'+desk.id+'">'+escape(t(deskZh[desk.id],desk.name))+'</button>').join('')+'</div></aside>';
  }
  const reachable = team.filter(member => member.desk !== 'bench' || (atDesk && member.role === 'manager'));
  const selected = reachable.find(member => member.id === selectedId) ?? reachable.find(member => member.role === 'manager') ?? reachable[0];
  if (!selected) return `<aside class="conversation-panel"><h2>${t('成员目前都在候补席。', 'Your team is on the bench.')}</h2><p>${t('任命一位成员到岗后即可对话。', 'Assign a teammate to a desk to talk.')}</p></aside>`;
  const thread = messagesForSeat(chat, selected);
  const managerDesk=atDesk && selected.role==='manager';
  const profile=managerDesk ? managerIntroduction(selected) : atDesk ? handoffCard(selected,manager,thread,busy,aiReady) : `<header class="conversation-person">${portrait(selected)}<div><h2>${escape(selected.name)}</h2><span>${(selected.title ? escape(selected.title) : roleLabel(selected.role))} <i aria-hidden="true"></i> ${studioText('在岗', 'At the desk')}</span></div></header>`;
  const messages=renderSeatLog({chat,member:selected,busy,atDesk});
  const composer=`<form class="studio-chat-form conversation-composer voice-first" data-form="chat" ${atDesk && !managerDesk && !thread.length ? 'hidden':''}>
      <input type="hidden" name="memberId" value="${escape(selected.id)}">
      <label class="sr-only" for="studio-chat-message">${t('向 '+escape(selected.name)+' 发送消息', 'Message '+escape(selected.name))}</label>
      <div class="voice-start">${voiceMarkup}<span class="voice-invitation">${managerDesk ? t('和基金经理对话','Talk with your fund manager') : t('与当前成员对话','Speak with this teammate')}</span><button class="text-button" type="button" data-action="toggle-typing">${studioText('改用文字', 'Use the keyboard')}</button></div>
      <label class="transcript-label" for="studio-chat-message">${studioText('你的话，可修改后发送', 'Your words. Edit before sending.')}</label>
      <textarea id="studio-chat-message" name="message" rows="2" maxlength="800" placeholder="${studioText('说说你的想法…', `Ask ${escape(selected.name.split(' ')[0])} a question…`)}" required ${busy ? 'disabled' : ''}></textarea>
      <div class="transcript-actions"><button class="text-button" type="button" data-action="clear-transcript">${studioText('重新说', 'Try again')}</button><button class="button button--primary" type="submit" ${busy || !aiReady ? 'disabled' : ''}>${studioText('发送', 'Send message')} ↑</button></div>
    </form>`;
  const suggested=managerDesk && aiReady ? `<button type="button" class="office-manager-prompt" data-action="ask-manager-update" ${busy?'disabled':''}>${t('我的基金现在怎么样？','How is my fund doing?')} <span aria-hidden="true">↗</span></button>` : '';
  return `<aside class="conversation-panel${atDesk?' crew-card':''}" id="studio-chat" data-paired-seat="${escape(selected.id)}" data-seat-role="${escape(selected.role)}" tabindex="-1">
    ${profile}${managerDesk ? composer + suggested + messages : messages + composer}
    <p class="conversation-footnote" ${atDesk?'hidden':''}>${studioText('讨论只形成建议，账户设置由你确认。', 'Suggestions stay in the conversation. You approve fund settings.')}</p>
    ${!aiReady ? `<p class="ai-connection-note">${studioText('连接 AI 经理后，即可开始真实对话。', 'Connect the AI manager to start a real conversation.')} <a href="#/connections">${studioText('连接设置', 'Connection settings')} ↗</a></p>` : ''}
    ${selected.assignmentDraft ? `<section class="hire-preview"><div><small>${t('待确认的新职责','Proposed assignment')}</small><h3>${escape(selected.assignmentDraft.title || selected.name)}</h3><p>${escape(selected.assignmentDraft.duty)}</p></div><button type="button" class="button button--primary" data-action="confirm-assignment" data-id="${escape(selected.assignmentDraft.id)}" data-member="${escape(selected.id)}">${t('确认新职责','Save assignment')}</button></section>` : ''}
    ${!atDesk && !thread.length && selected.role!=='manager' && aiReady?'<button class="inh-first-task" type="button" data-action="ask-first-duty">'+t('问问第一项任务','Ask about the first task')+' ↗</button>':''}
    ${responsibilities(selected)}
  </aside>`;
}

function teamManager(team) {
  return team.find(member=>member.role==='manager' && member.desk!=='bench') ?? team.find(member=>member.role==='manager');
}

export function renderOfficeRoom({ team = DEFAULT_TEAM, fundId = '', fundName = '', selectedId, arrivals = [], showRecruit = false } = {}) {
  const manager = teamManager(team);
  return `<section class="office-team-floor" data-office-room data-fund-id="${escape(fundId)}" aria-labelledby="office-floor-name">
      <header class="office-room-heading"><div><span class="office-floor-count">${t(team.length+' 位成员',team.length+' '+(team.length===1?'teammate':'teammates'))}</span>
        <h2 class="office-doorplate" id="office-floor-name">${fundName?escape(fundName)+' · '+t('办公室','Office'):t('团队办公室','Team office')}</h2></div>
        <button class="button button--outline" type="button" data-action="toggle-recruit" aria-expanded="${showRecruit}">${showRecruit?t('收起招募','Close recruiting'):t('招募同事','Recruit a teammate')}</button></header>
      <div class="office-room-controls"><p class="office-room-instruction" id="office-room-instructions">${t('拖动头像安排审议分工，也可先点头像再点工位。点姓名交谈。','Drag a portrait to assign a review desk, or select a portrait and then a desk. Select a name to talk.')}</p>
        <button type="button" class="office-seat-cancel" data-seat-cancel hidden>${t('取消移动','Cancel move')}</button></div>
      <p class="office-room-status" data-seat-announcement role="status" aria-live="polite" aria-atomic="true"></p>
      ${inhabitedRoom(team,selectedId??manager?.id,arrivals,true)}
      ${showRecruit ? recruiter(team,manager) : ''}
    </section>`;
}

export function renderTeam({ team = DEFAULT_TEAM, selectedId, chat = [], busy = false, hostedChat = false, recipientId, showRecruit = false, fundId = '', voiceMarkup = '', aiReady = false, arrivals = [], fundName = '', balanceMarkup = '', watchMarkup = '' } = {}) {
  const manager=teamManager(team);
  const occupant=team.find(member=>member.id===(selectedId ?? recipientId)) ?? manager;
  const selected=occupant?.id;
  const conversation=occupant ? renderChat({team,chat,selectedId:selected,busy,hostedChat,voiceMarkup,aiReady,atDesk:true}) :
    '<section id="studio-chat" tabindex="-1" class="conversation-panel crew-card"><h2>'+t('基金经理席空缺','Fund manager seat is open')+'</h2><p>'+t('可以在团队工位中找同事对话，或招募一位基金经理。','Visit your team desks to talk to a colleague or recruit a fund manager.')+'</p></section>';
  return `<div class="team-studio crew-studio crew-office-view"><a class="inside-back" href="#/fund">← ${t('我的工作室','My Studio')}</a>
    <header class="studio-page-head office-heading"><div><span class="eyebrow">${t('基金办公室','Fund office')}</span><h1>${escape(fundName)||studioText('团队成员', 'Your team')}</h1></div>${balanceMarkup}</header>
    <div class="office-manager-desk">${conversation}</div>
    ${renderOfficeRoom({team,fundId,fundName,selectedId:selected,arrivals,showRecruit})}${watchMarkup}
  </div>`;
}


