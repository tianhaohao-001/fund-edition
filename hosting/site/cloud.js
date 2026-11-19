import { paintLanguagePicker } from '/language-picker.mjs';
import {teamDesk} from '/cloud-team.js';
import {fullAppUrl} from '/full-app-link.mjs';
import { salonDirectory, bindSalonDirectory, salonDetailHead, salonGuide, bindSalonGuide, salonCredits, setupSalonStyle, enableSalonLinks, studyVisual } from '/strategy-salon.mjs';
import {createEditionLobby,editionReviewMode,syncEditionBrand} from '/edition-lobby.mjs';
import {receiver,readingChoice} from '/reception.mjs';
import {createLocalVoiceController,dictationEngine,microphoneRoute,openingQuestion,speakFundReply,speakReply,stopSpeaking} from '/voice.mjs';
const main=document.getElementById('main');
const announce=document.getElementById('announce');
const locale=document.getElementById('locale');
const getStored=(key,temporary=false)=>{try{return (temporary?sessionStorage:localStorage).getItem(key)}catch{return null}};
const setStored=(key,value,temporary=false)=>{try{(temporary?sessionStorage:localStorage).setItem(key,value)}catch{}};
const langOf=()=>new URL(location.href).searchParams.get('lang')||getStored('folio.language')||'zh-CN';
let language=langOf()==='en-US'?'en-US':'zh-CN', generation=0, dispose=()=>{}, scrollReset=()=>{};
const t=(zh,en)=>language==='en-US'?en:zh;
const el=(tag,text='',cls='')=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e};
const marks={mic:'<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8"/>',down:'<path d="m5 9 7 7 7-7"/>',right:'<path d="m9 5 7 7-7 7"/>',back:'<path d="m15 5-7 7 7 7"/>',stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',send:'<path d="M12 20V4m-6 6 6-6 6 6"/>',pen:'<path d="m4 17 12-12 3 3L7 20l-4 1z"/>'};
function icon(name){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('class','ico');s.setAttribute('aria-hidden','true');s.setAttribute('viewBox','0 0 24 24');s.innerHTML=marks[name];return s}
function button(label,fn,cls='',cmd='',symbol=''){const b=el('button',label,cls);b.type='button';if(cmd)b.dataset.command=cmd;if(symbol)b.prepend(icon(symbol));b.onclick=fn;return b}
function a(label,url,cls=''){const n=el('a',label,cls);n.href=url;return n}
function fullAppDoor(room,fundId) {
  const address=()=>fullAppUrl(location.origin,{room,fundId,language,decision:new URL(location.href).searchParams.get('decision')});
  const url=address();
  if(!url)return null;
  const box=el('aside','','full-app-door');
  const title=room==='studio'?t('和实时 Maya 组建基金','Build a fund with live Maya'):
    fundId==='buffett'?t('向经理追问这笔决定','Ask the manager about this decision'):
    fundId?t('在完整应用中打开这只基金','Open this fund in the full app'):t('进入完整基金展馆','Explore funds in the full app');
  const action=a(title+' ↗',url);
  action.target='_blank';action.rel='noopener noreferrer';
  // The archive changes meetings in place, including for keyboard navigation.
  for(const event of ['focus','pointerdown','contextmenu','click'])action.addEventListener(event,()=>{action.href=address();});
  const note=room==='studio'?t('新窗口打开完整应用。你在本设备保存的历史草稿仍可在本页查看。','The full app opens in a new tab. Drafts saved in this browser stay available on this page.'):
    t('新窗口打开完整应用，本页保留当前研究档案。','The full app opens in a new tab. Your research archive stays open here.');
  box.append(action,el('small',note));
  return box;
}
function routeHref(path,id,extra={}){
 const u=new URL(path,location.origin);
 u.searchParams.set('lang',language);
 const lobby=editionReviewMode();
 if(lobby)u.searchParams.set('lobby',lobby);
 if(new URL(location.href).searchParams.get('scene')==='previous')u.searchParams.set('scene','previous');
 if(id)u.searchParams.set('id',id);
 Object.entries(extra).forEach(([k,v])=>u.searchParams.set(k,v));
 return u.pathname+u.search+u.hash;
}
function routeLink(label,path,id,cls=''){const n=a(label,routeHref(path,id),cls);n.dataset.route='';return n}
function go(href,options={}){const scene=options.voice?document.querySelector('.scene-photo'):null;const rect=scene?.getBoundingClientRect();history.pushState({},'',href);render(options);if(rect&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const dest=document.querySelector('.maya-side .aperture');if(dest){const end=dest.getBoundingClientRect();const shade=el('img','','arrival-frame');shade.src='/assets/maya-at-table.jpg';shade.alt='';shade.setAttribute('aria-hidden','true');Object.assign(shade.style,{top:rect.top+'px',left:rect.left+'px',width:rect.width+'px',height:rect.height+'px'});document.body.append(shade);const anim=shade.animate([{opacity:1,transform:'translate(0,0) scale(1)'},{opacity:.15,offset:.72},{opacity:0,transform:'translate('+(end.left-rect.left)+'px,'+(end.top-rect.top)+'px) scale('+end.width/rect.width+','+end.height/rect.height+')'}],{duration:440,easing:'cubic-bezier(.22,.68,.3,1)',fill:'forwards'});anim.finished.catch(()=>{}).finally(()=>shade.remove())}}}
document.addEventListener('click',e=>{const target=e.target.closest('a[data-route]');if(target&&!e.defaultPrevented&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&e.button===0){e.preventDefault();go(target.href)}});
window.addEventListener('popstate',()=>render());
function detail(label){const d=el('details');d.append(el('summary',label));return d}
function notice(message){announce.textContent=message}
function back(label,path){const b=routeLink(label,path,null,'back');b.prepend(icon('back'));return b}
async function api(path,body,method='POST',keepalive=false){const result=await fetch(path,body===undefined?{cache:'no-store'}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',keepalive});let data={};try{data=await result.json()}catch{}if(!result.ok)throw Object.assign(new Error(data.error||'connection'),{status:result.status});return data}
let session,sessionAt=0;
function getSession(force=false){
  if(force||!session||Date.now()-sessionAt>60_000){
    sessionAt=Date.now();
    const request=api('/api/session').catch(e=>{if(session===request)session=null;throw e});
    session=request;
  }
  return session;
}
function errorText(key){return ({
'agent-setup':t('经理尚未接通。请稍后重试。','The manager is connecting. Please try again shortly.'),
'capacity':t('本时段的演示额度已用完。草稿已保留。','The demo has reached its limit for now. Your draft is saved.'),
'stale':t('另一页刚更新了会话。已重新读取，可再发送。','Another tab updated the conversation. Review it and send again.'),
'waiting':t('上一次回答仍在处理，请稍后重试。','Your last answer is still being prepared. Try again shortly.'),
'sign-in':t('访客会话未能恢复。请重新载入。','Could not restore the visitor session. Reload the page.'),
'agent-unavailable':t('经理这次未能回答，草稿已保留，可重试。','The manager could not answer this time. Your draft is saved for retry.')
})[key]||t('暂时没有收到回答。草稿已保留，可重试。','No response came through. Your draft is saved for retry.')}
function portrait(aside=false){const wrap=el('div','',aside?'maya-side':'contact');const photo=el('div','','aperture');photo.setAttribute('role','img');photo.setAttribute('aria-label',t('坐在桌前的虚构基金经理 Maya Chen','Maya Chen, the fictional fund manager at her desk'));const id=el('div','','identity');id.append(el('b','Maya Chen'),el('span',' · ','dot'),document.createTextNode(t('AI 基金经理','AI fund manager')));wrap.append(photo,id);return wrap}
function home(){
 const studioURL=routeHref('/studio'),fundsURL=routeHref('/funds');
 main.append(createEditionLobby({
   t,studioURL,fundsURL,
   onStudio:()=>{go(studioURL,{fromLobby:true});return main.querySelector('.receiver-photo')},
   onFunds:()=>{go(fundsURL);return main.querySelector('h1')}
 }));
}
function wave(){const w=el('span','','listen-wave');w.setAttribute('aria-hidden','true');[10,18,26,36,24,13,21].forEach((n,i)=>{const bar=el('i');bar.style.setProperty('--y',n+'px');bar.style.setProperty('--delay',(-i*.12)+'s');w.append(bar)});return w}
const seatCopy={'maya-chen':['Maya Chen','基金经理','Portfolio manager'],'theo-park':['Theo Park','研究席','Equity research'],'inez-rao':['Inez Rao','风险席','Risk'],'jules-bennett':['Jules Bennett','研究席','Research'],'eli-morgan':['Eli Morgan','执行席','Execution'],'leah-kim':['Leah Kim','组合构建','Portfolio construction'],'avery-khan':['Avery Khan','风险席','Risk'],'riley-diaz':['Riley Diaz','执行席','Execution']};
function seatLabel(id){const item=seatCopy[id];return item?item[0]:String(id||'').split('-').map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' ')}
function readSeat(seat){return typeof seat==='string'?{id:seat}:seat}
function planPanel(value,onConfirm,busy){const established=value.phase==='confirmed'||!!value.fund,plan=value.draft||value.fund;if(!plan)return null;const box=el('section','',established?'formation':'blueprint');box.append(el('p',established?t('已成立 · 模拟基金','Open · Paper fund'):t('待确认 · 模拟基金草案','Review · Paper fund proposal'),'sender'),el('h2',value.fund?.name||plan.name||t('我的基金','My fund')));if(plan.summary)box.append(el('p',plan.summary,'reply-text'));if(plan.authorizationSummary)box.append(el('p',plan.authorizationSummary,'small-note'));
const seats=Array.isArray(plan.roster)?plan.roster:[];if(seats.length){const tray=established?el('div','', 'team-seats'):detail(t('查看成员与职责','See seats and responsibilities'));let selected=0;
const art=el('div','','confirmed-room'), duty=el('p','','small-note'),row=el('div','','seat-list'),controls=[];art.setAttribute('aria-hidden','true');
function select(i){selected=i;const member=readSeat(seats[i]);duty.textContent=member.duty||member.mandate||member.role||'';art.style.backgroundPosition=['0 0','100% 0','0 100%','100% 100%'][i%4];controls.forEach((b,n)=>b.setAttribute('aria-pressed',String(n===i)))}
seats.forEach((s,i)=>{const member=readSeat(s), data=seatCopy[member.id];const b=button('',()=>select(i),'seat');b.append(el('strong',member.name||seatLabel(member.id)),el('span',member.title||(data?t(data[1],data[2]):member.role||'')));controls.push(b);row.append(b)});tray.append(art,row,duty);select(selected);box.append(tray)}
if(!established){const ok=button(t('确认蓝图，让团队入驻','Confirm and seat the team'),onConfirm,'glass','confirm');ok.disabled=busy;box.append(ok)}return box}
function saveBox(account){if(getStored('folio.skipSave',true)==='yes')return null;
const d=detail(t('跨设备保存','Save across devices'));d.className='account';if(!account?.signedIn){d.append(el('p',t('本浏览器已经保留你的基金。连接账户后可在其他设备继续。','Your fund is saved in this browser. Connect an account to continue on another device.'),'small-note'));const login=a(t('连接账户','Connect an account'),'/signin-with-chatgpt?return_to='+encodeURIComponent(location.pathname+location.search),'plain');login.target='_top';d.append(login,button(t('暂时跳过','Skip for now'),()=>{setStored('folio.skipSave','yes',true);d.remove()},'plain'))}
else{d.append(el('p',t('这支基金已关联到当前账户。','This fund is connected to your account.'),'small-note'));d.addEventListener('toggle',async()=>{if(!d.open||d.dataset.loaded)return;try{const v=await api('/api/history');for(const item of v.workspaces||[]){const pick=button((item.active?'✓ ':'')+item.label,async()=>{try{await api('/api/history/select',{id:item.id});for(let i=sessionStorage.length-1;i>=0;i--){const k=sessionStorage.key(i);if(k?.startsWith('folio.draft.'))sessionStorage.removeItem(k)}location.reload()}catch(e){notice(errorText(e.message))}},'plain');pick.disabled=item.active;d.append(pick)}d.dataset.loaded='1'}catch(e){notice(errorText(e.message))}})}return d}
function interview(host,topic,options={}){let state={value:{messages:[]},revision:0,suggestions:[]},account,ready=false,mode='idle',error='',alive=true,busy=false,recognition=null,run=0,pending=null,turnMotion=false;
const key='folio.draft.'+topic, existingDraft=getStored(key,true)||'';let draft=options.message||existingDraft;
const seatSelection={id:'maya-chen',task:'ask'},seatDrafts=new Map();
let teamAttempt;
function selectSeat(id,task){if(busy)return;stopRecognition();stopSpeech();seatSelection.id=id;seatSelection.task=task;teamAttempt=null;error='';paint();}
async function submitSeat(action,seatId,message,proposalId){
  if(busy)return;
  const values={action,seatId,message,...(proposalId?{proposalId}:{}),topic,language,revision:state.revision};
  const signature=JSON.stringify(values);
  if(teamAttempt?.signature!==signature)teamAttempt={signature,body:{...values,id:crypto.randomUUID()}};
  busy=true;error='';paint();
  try{const result=await api('/api/chat',teamAttempt.body);if(!alive)return;
    state=result;teamAttempt=null;seatDrafts.delete(seatId+'|'+action);if(action==='accept')seatSelection.task='ask';
  }catch(e){if(!alive)return;error=errorText(e.message);if(e.status===409){state=await reload();teamAttempt=null}else if(e.status>=500)teamAttempt=null;}
  finally{busy=false;if(alive)paint();}
}
if(draft)mode='writing';
let captureId=0,priorWords='',audioEnabledByVoice=false,audioRoute={},lastHints='';
let deviceEngine=null,deviceRequest=null,preferDevice=false,downloaded=0,downloadTotal=0;
let replyOptionsOpen=false,lastOptionsError='';
const offersDevice=()=>Boolean(audioRoute.deviceDictation?.languages?.includes(language)&&window.isSecureContext&&window.Worker&&window.WebAssembly&&navigator.mediaDevices?.getUserMedia&&(window.AudioContext||window.webkitAudioContext));
const mb=bytes=>Math.ceil(bytes/1_000_000)+' MB';
function progressCopy(){
  if(downloadTotal>0&&downloaded>=downloadTotal)return t('语音模型就绪，正在启动…','Speech model ready. Starting dictation…');
  if(downloaded>0&&downloadTotal>0)return t('已下载 ','Downloaded ')+mb(downloaded)+' / '+mb(downloadTotal);
  if(downloaded>0)return t('已下载 ','Downloaded ')+mb(downloaded);
  return t('正在准备设备听写…','Preparing on-device dictation…');
}
function releaseDevice(){
  deviceRequest?.abort();deviceRequest=null;deviceEngine?.destroy();deviceEngine=null;preferDevice=false;
}
microphoneRoute().then(route=>{audioRoute=route;if(alive&&ready&&offersDevice()&&['idle','writing'].includes(mode))paint();const reply=latest();if(alive&&ready&&mode==='idle'&&reply?.id!=='welcome'&&reply?.text)options.surface?.setAudio(reply.text,language,false,playbackFor(reply))});
const playbackFor=reply=>({topic,responseId:reply?.responseId,replyPlayback:audioRoute.replyPlayback===true});
let draftRev=null,cloudText='',saveTimer=0,saveActive=null,draftConflict=false,savedAfter='',sample=null,sampleOpen=false,sampleError='',sampleBusy=false;
const draftUrl='/api/draft?topic='+encodeURIComponent(topic);
const deliveredKey=key+'.delivered';
async function persist(immediate=false){
  clearTimeout(saveTimer);
  if(saveActive){await saveActive;return persist(immediate)}
  if(draftRev===null||draftConflict||draft===cloudText)return;
  const snapshot=draft;
  saveActive=(async()=>{
    try{
      const v=await api(draftUrl,{message:snapshot,revision:draftRev},'PUT',immediate);
      draftRev=v.revision;cloudText=snapshot;savedAfter=v.updatedAt||'';
    }catch(e){
      if(e.status===409){
        draftConflict=true;
        if(alive)notice(t('另一页保存了新草稿。本页内容仍保留。','Another tab saved a new draft. Your words are still here.'));
      }
    }
  })().finally(()=>{saveActive=null});
  await saveActive;
}
async function loadDraft(){
  try{
    await getSession();const v=await api(draftUrl);if(!alive)return;
    draftRev=v.revision;cloudText=v.message||'';savedAfter=v.updatedAt||'';
    let sent;
    try{sent=JSON.parse(getStored(deliveredKey,true)||'null')}catch{}
    if(!draft&&!touched&&!capturing()&&cloudText){
      if(sent?.revision===draftRev&&sent.message===cloudText.trim()){
        await persist(true);return;
      }
      draft=cloudText;setStored(key,draft,true);mode='writing';paint();
    }else if(draft&&draft!==cloudText){clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist(),500)}
  }catch{}
}
let touched=false;
function storeDraft(value){
  draft=value;touched=true;savedFeedback='';setStored(key,value,true);
  if(value)setStored(deliveredKey,'',true);
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist(),550);
}
async function prepareDraftRevision(message){
  if(draft!==message)storeDraft(message);
  if(draftRev===null)await loadDraft();
  await persist(true);
  return !draftConflict&&cloudText===message ? draftRev : null;
}
async function consumeDraft(attempt){
  if(attempt.action!=='chat')return;
  if(Number.isSafeInteger(attempt.draftRevision)){
    setStored(deliveredKey,JSON.stringify({message:attempt.message,revision:attempt.draftRevision}),true);

  }
  clearTimeout(saveTimer);
  draft='';touched=true;savedFeedback='';setStored(key,'',true);
  if(!Number.isSafeInteger(attempt.draftRevision))return;
  try {
    const copy=await api(draftUrl);
    if(!alive)return;
    draftRev=copy.revision;cloudText=copy.message||'';
    if(cloudText===attempt.message&&draftRev===attempt.draftRevision)await persist(true);
    else if(cloudText)draftConflict=true;
  }catch{draftRev=null;}
}

let savedFeedback='';
const providerOffline=()=>account&&(account.managerAvailability?.state==='temporarily-unavailable'||account.agentReady===false);
async function saveIdea(text){
 if(!text?.trim())return;
 storeDraft(text.trim());mode='writing';error='';paint();
 if(draftRev===null)await loadDraft();
 await persist(true);
 savedFeedback=draftRev!==null&&cloudText===draft&&!draftConflict
   ?t('草稿已保存，下次打开可以继续编辑。','Draft saved. You can keep editing on your next visit.')
   :t('已保留在当前浏览器标签。','Kept in this browser tab.');
 if(alive){paint();notice(savedFeedback)}
}
let recordedTeamTask;
function insertTeamRecord(host,record){
 const mount=el('div','', 'recorded-team-slot');host.append(mount);
 recordedTeamTask??=import('/recorded-team.mjs').then(({renderRecordedTeam})=>renderRecordedTeam({language,record,onDraft:()=>switchToText()})).catch(()=>{recordedTeamTask=null;return null});
 recordedTeamTask.then(node=>{if(node&&mount.isConnected)mount.append(node)});
}
function playback(){
 const area=el('section','','sample-record');const toggle=button(sampleOpen?t('收起已录示例','Close recorded example'):topic==='studio'?t('看 Maya 怎样组队 · 已录示例','See Maya build a team · Recorded'):t('查看研究示例 · PIMCO BOND','See a research example · PIMCO BOND'),async()=>{if(sampleOpen){sampleOpen=false;stopSpeech();paint();return}sampleOpen=true;if(sample){paint();return}sampleBusy=true;paint();try{const resp=await api('/api/example/'+(topic==='studio'?'studio':'research')+'?lang='+language);if(!alive)return;if(!resp.answer||!resp.responseId)throw Error('missing');sample=resp;sampleError=''}catch{sampleError=t('暂时无法读取这段已录示例。','This recording could not be loaded.')}finally{sampleBusy=false;if(alive)paint()}},'plain','recorded-example');toggle.setAttribute('aria-expanded',String(sampleOpen));area.append(toggle);
 if(sampleOpen){const content=el('div','','record-body');if(sampleBusy)content.append(el('p',t('读取记录…','Loading recording…'),'small-note'));else if(sampleError)content.append(el('p',sampleError,'small-note'));else if(sample){
  const studio=topic==='studio';
  const heading=el('h2',studio?t('此前真实生成的示例','Previously generated example'):t('通用研究案例 · PIMCO BOND','Research example · PIMCO BOND'));
  content.append(heading);
  const transcript=studio?detail(t('读 Maya 的完整回答','Read Maya’s full reply')):content;
  if(studio)content.append(transcript);
  transcript.append(el('p',sample.question||'','sample-question'),el('p',sample.answer,'reply-text'));
  if(sample.generatedAt){const d=new Date(sample.generatedAt);if(Number.isFinite(d.valueOf()))transcript.append(el('small',d.toLocaleString(language),'small-note'))}
  transcript.append(el('code','HarnessRouter · '+sample.responseId));
  if(window.speechSynthesis)transcript.append(button(t('朗读示例','Read example aloud'),()=>speak(sample.answer),'plain','read-example'));
  if(studio)insertTeamRecord(content,sample);
 }area.append(content)}return area
}
function stopSpeech(){stopSpeaking()}
function capturing(){return ['installing','requesting','listening','processing'].includes(mode)}
function stopRecognition() {
  captureId++;
  const old=recognition;
  recognition=null;
  old?.destroy();
}
function speak(message){return speakReply(message,{lang:language})}
function switchToText(focus=true){
  stopRecognition();stopSpeech();mode='writing';paint();
  if(focus)host.querySelector('textarea')?.focus();
}
function cancelDictation(){
  if(mode==='installing'||mode==='processing'&&preferDevice)releaseDevice();
  stopRecognition();
  storeDraft(priorWords);
  mode=draft.trim()?'writing':'idle';error='';paint();
  options.surface?.control?.focus({preventScroll:true});
}
async function begin(input){
  const useDevice=input==='device'||preferDevice;
  if(!alive||busy||capturing())return;
  stopSpeech();stopRecognition();priorWords=draft;error='';
  const n=captureId;
  let create,processLocally=false;
  if(useDevice&&offersDevice()){
    if(!deviceEngine){
      mode='installing';downloaded=0;downloadTotal=audioRoute.deviceDictation.downloadBytes||0;paint();notice(t('正在准备设备听写','Preparing on-device dictation'));
      const request=new AbortController();deviceRequest=request;
      try{
        const {openDeviceDictation}=await import('/device-dictation.mjs');
        if(!alive||n!==captureId)return;
        const engine=await openDeviceDictation({lang:language,signal:request.signal,onProgress:progress=>{
          if(!alive||n!==captureId)return;
          downloaded=Number(progress.loaded)||0;downloadTotal=Number(progress.total)||audioRoute.deviceDictation.downloadBytes||0;
          const line=host.querySelector('[data-download-progress]'),copy=progressCopy();if(line&&line.textContent!==copy)line.textContent=copy;
          const bar=host.querySelector('progress');if(bar&&downloadTotal>0){bar.max=downloadTotal;bar.value=Math.min(downloaded,downloadTotal)}
        }});
        if(!alive||n!==captureId){engine.destroy();return}
        deviceEngine=engine;preferDevice=true;
      }catch{
        if(!alive||n!==captureId||request.signal.aborted)return;
        error=t('设备听写暂时未能启动。可以重试、点一句建议，或用键盘回答。','On-device dictation couldn’t start. Try again, choose a suggested reply, or use the keyboard.');
        mode=draft.trim()?'writing':'idle';paint();return;
      }finally{if(deviceRequest===request)deviceRequest=null}
    }
    mode='requesting';paint();create=createLocalVoiceController;
  }else{
    mode='requesting';paint();
    ({create,processLocally}=await dictationEngine(language));
    if(!alive||n!==captureId)return;
  }
  let heard=false,failed=false;
  recognition=create({
    lang:language,processLocally,
    transcribeDevice:preferDevice&&deviceEngine?(samples=>deviceEngine.transcribe(samples)):undefined,
    onTranscript(result){
      if(n!==captureId||!alive)return;
      const text=result.text.trim();
      if(!text)return;
      heard=true;storeDraft(priorWords.trim()+(priorWords.trim()&&language==='en-US'?' ':'')+text);
      const preview=host.querySelector('[data-transcript]');
      if(preview)preview.textContent=draft;
    },
    onState({state}){
      if(n!==captureId||!alive)return;
      if(state==='starting')return;
      if(state==='listening'||state==='processing'){mode=state;paint()}
      if(state==='idle'&&!failed){
        mode=draft.trim()?'writing':'idle';
        if(heard){audioEnabledByVoice=true;notice(providerOffline()?t('转写已就绪，可编辑草稿','Your transcription is ready to edit'):t('核对文字后发送','Review the text, then send'))}
        paint();
        if(heard)host.querySelector('textarea')?.focus({preventScroll:true});
      }
    },
    onError(problem){
      if(n!==captureId||!alive)return;
      failed=true;error=problem.message;mode=draft.trim()?'writing':'idle';paint();
    }
  });
  await recognition.start();
}
function micAction(){
  if(mode==='listening')recognition?.stop();
  else if(capturing())cancelDictation();
  else begin();
}
async function reload(){account=await getSession();return api('/api/thread?topic='+encodeURIComponent(topic)+'&lang='+language)}
async function send(action='chat',input=draft){const message=(input||'').trim();if(action==='chat'&&providerOffline()){await saveIdea(message);return}if(!ready||busy||(!message&&action==='chat'))return;stopRecognition();stopSpeech();
busy=true;
if(options.fromLobby&&state.revision===0&&action==='chat'&&/(研究|回测|比较|research|study|benchmark|look into)/i.test(message)&&!/(创建|成立|build my|create my)/i.test(message)){
const matches=[[/VWELX|惠灵顿|wellington/i,'wellington'],[/ARKK/i,'arkk'],[/巴菲特|buffett/i,'buffett']];const match=matches.find(([r])=>r.test(message));if(match){try{const catalog=await api('/api/catalog?lang='+language);const fund=catalog.find(f=>f.id===match[1]||message.toLowerCase().includes(String(f.ticker||'~').toLowerCase())||message.includes(f.personName||'~'));if(fund&&alive){storeDraft('');go(routeHref('/funds',fund.id),{message});return}}catch{}}}
if(!pending||pending.message!==message||pending.action!==action)pending={id:crypto.randomUUID(),message,action};const attempt=pending;error='';mode='sending';paint();notice(t('等待经理回答','Waiting for the manager.'));
try{
 if(action==='chat'&&!Object.hasOwn(attempt,'draftRevision')){
   const rev=await prepareDraftRevision(message);if(Number.isSafeInteger(rev))attempt.draftRevision=rev;
 }
 const fresh=await api('/api/chat',{...attempt,topic,language,revision:state.revision});if(!alive)return;state=fresh;pending=null;await consumeDraft(attempt);if(!alive)return;mode='idle';turnMotion=true;const reply=action==='chat'?latest()?.text:null;if(reply&&(readingChoice()==='true'||audioEnabledByVoice&&readingChoice()!=='false')){
   try {
     if(options.surface){options.surface.setAudio(reply,language,false,playbackFor(latest()));options.surface.speak()}
     else speakFundReply(reply,{lang:language,...playbackFor(latest())});
   }catch{notice(t('已收到文字答复。音频暂时无法播放。','The reply is ready. Audio is unavailable.'))}
 }audioEnabledByVoice=false;notice(action==='chat'?t('已收到经理回答','The manager has replied'):action==='confirm'?t('团队已入驻','Your team is seated'):t('蓝图已准备好','Your blueprint is ready'))}
catch(e){if(!alive)return;error=account?.managerAvailability?.state==='temporarily-unavailable'?t('实时经理暂未接通。草稿已保留，可稍后重试。','The live manager is temporarily unavailable. Your draft is saved for retry.'):errorText(e.message);if(e.message==='stale'){try{state=await reload()}catch{}pending=null}else if(e.message==='retry-new-request'||e.message==='agent-unavailable')pending=null;mode='writing';storeDraft(message)}
finally{busy=false;if(alive){paint();turnMotion=false}}}
function latest(){return [...(state.value?.messages||[])].reverse().find(m=>m.role==='assistant')}
const opening=()=>topic==='studio'?openingQuestion(t):t('你想先了解它怎么买卖，还是看看策略在哪些时候会失效？','Would you like to explore how it invests, or when its approach might fail?');
function paint(){
 const oldOptions=host.querySelector('.receiver-options');if(oldOptions)replyOptionsOpen=oldOptions.open;
 if(error&&error!==lastOptionsError)replyOptionsOpen=true;lastOptionsError=error;
 const savedFocus=document.activeElement?.id==='message'?[document.activeElement.selectionStart,document.activeElement.selectionEnd]:null;const side=host.closest('.interview')?.querySelector('.maya-side');if(side){side.dataset.state=mode;side.dataset.replied=turnMotion?'yes':'no'}const value=state.value||{},messages=value.messages||[],last=latest();const composed=el('div','','composer'),controls=el('div','','composer-bar'),sender=el('p',topic==='studio'?t('基金工作室','Fund studio'):t('研究经理','Research manager'),'sender');const text=last?.id==='welcome'?opening():last?.text||opening();const question=el(topic==='studio'?'h1':'h2',text,(text.length>(language==='en-US'?165:85)?'reply-long':'question')+(turnMotion?' turn-appear':''));host.replaceChildren(sender,question);if(providerOffline()){const note=el('p',fullAppUrl(location.origin,{room:topic==='studio'?'studio':'funds',language})?t('这个档案页可继续保存想法和查看以往记录。','Use this archive to save ideas and read previous records.'):t('实时经理暂未接通。你可以保存想法，或查看已录示例。','The live manager is unavailable. Save your idea or explore a recorded example.'),'ed-availability');note.setAttribute('role','status');host.append(note)}
const isPlan=topic==='studio'&&(value.phase==='ready'||value.phase==='confirmed'||Boolean(value.fund));
const formed=topic==='studio'&&Boolean(value.fund?.team?.length);
const firstAssignment=formed&&!messages.some(m=>m.memberId==='maya-chen');
if(firstAssignment){
  question.textContent=value.fund.team.length===1?t('Maya 已就位。第一把交椅留给谁？说说你想请谁、负责什么。','Maya is at her desk. Who gets the next seat, and what should they work on?'):t('团队已入驻。想让哪位同事先接手一项研究？','The team is here. Who would you like to give the first assignment to?');
  question.className='question';
}
if(topic==='studio'&&value.fund?.team?.length){
  const panel=teamDesk({value,t,el,button,selection:seatSelection,select:selectSeat,submit:submitSeat,busy,offline:providerOffline(),drafts:seatDrafts,
    displayRole:m=>{const copy=seatCopy[m.id];return copy?t(copy[1],copy[2]):m.role}});
  if(seatSelection.id!=='maya-chen'){
    host.replaceChildren(panel);if(error)host.append(el('p',error,'small-note'));host.closest('.interview')?.classList.add('private-seat');return;
  }
  host.closest('.interview')?.classList.remove('private-seat');
  host.append(panel);
}else if(topic==='studio'&&value.phase==='ready'&&value.draft){
  host.append(planPanel(value,()=>send('confirm',''),busy));
}else if(topic==='studio'&&ready&&!busy){
  host.append(button(t('看看我的团队蓝图','See my team blueprint'),()=>send('prepare',''),'plain'));
}
const field=el('textarea','','write-field');field.id='message';field.maxLength=3000;field.value=draft;field.setAttribute('aria-label',t('给经理的消息，可编辑','Editable message for the manager'));field.placeholder=t('说说你的想法…','Tell me your idea…');field.oninput=()=>{storeDraft(field.value);const submit=controls.querySelector('[data-command=send],[data-command=save-draft]');if(submit)submit.disabled=!field.value.trim()||!ready||busy};field.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();send()}};
if(mode==='installing'){
  controls.append(button(t('取消准备','Cancel setup'),cancelDictation,'glass','talk'));composed.append(controls);
  const line=el('p',progressCopy(),'explain');line.dataset.downloadProgress='';
  const bar=el('progress','','device-progress');bar.setAttribute('aria-label',t('设备听写下载进度','On-device dictation download'));if(downloadTotal>0){bar.max=downloadTotal;bar.value=downloaded}
  composed.append(bar,line);
}else if(capturing()){
  const listening=mode==='listening',processing=mode==='processing';
  controls.append(button(listening?t('结束听写','Finish dictation'):t('取消','Cancel'),micAction,'glass record-control','talk'));
  if(listening)controls.append(button(t('取消','Cancel'),cancelDictation,'plain','cancel-recording'));
  composed.append(controls);
  const live=el('div','','heard');if(listening)live.append(wave());
  const preview=el('p',draft,'reply-text');preview.dataset.transcript='';live.append(preview);composed.append(live);
  const stateNote=el('p',listening?t('在听。说完点一下，核对后再发。','Listening. Finish when you’re ready, then review your words.'):processing?t('正在转写…','Transcribing…'):t('正在开启麦克风…','Opening the microphone…'),'explain');
  stateNote.setAttribute('role','status');composed.append(stateNote);
}
else if(busy){if(pending?.message)composed.append(el('p',pending.message,'pending-words'));const n=el('p',t('Maya 正在想你的问题…','Maya is thinking it through…'),'thinking');n.setAttribute('role','status');composed.append(n)}
else if(mode==='writing'){const review=el('label',providerOffline()?t('编辑你的草稿','Edit your draft'):t('核对你的话，再发给经理','Review your words before sending'),'transcript-caption');review.htmlFor=field.id;composed.append(review,field);const submit=button(providerOffline()?t('保存我的想法','Save my idea'):t('发给经理','Send to manager'),()=>send(),'glass',providerOffline()?'save-draft':'send','send');submit.disabled=!draft.trim()||!ready;controls.append(submit,button(t('语音输入','Dictate'),begin,'plain','talk'));composed.append(controls)}
else{controls.append(button(t('和经理说话','Speak to the manager'),begin,isPlan&&value.phase==='ready'?'plain':'glass','talk','mic'));if(topic!=='studio')controls.append(button(t('用文字回答','Type instead'),()=>switchToText(),'plain','write'));composed.append(controls)}
if(error){const n=el('p',error,'error-note');n.setAttribute('role','status');composed.append(n);if(!ready){composed.append(button(t('重新连接','Reconnect'),load,'plain'))}}
if(savedFeedback){const saved=el('p',savedFeedback,'ed-saved');saved.setAttribute('role','status');composed.append(saved)}host.append(composed);
const hintsToShow=firstAssignment&&!value.fund.proposals?.['maya-chen']?
  [value.fund.team.length===1?t('招一位研究员，帮我读财报。','Hire a researcher to read financial statements.'):t('说说这支团队怎样分工。','Walk me through the team’s assignments.'),
    t('招一位研究员，专门检查现金流。','Hire a researcher who specializes in cash flow.')]:state.suggestions||[];
if(ready&&!busy&&mode==='idle'&&hintsToShow.length&&(firstAssignment||value.phase!=='confirmed')){
  const hints=el('section','','reply-hints');
  const key=JSON.stringify([state.revision,hintsToShow.slice(0,2)]);hints.toggleAttribute('data-settled',key===lastHints);lastHints=key;
  hints.setAttribute('aria-label',t('推荐回答','Suggested replies'));
  hints.append(el('p',providerOffline()?t('选一句作为草稿','Choose a draft starter'):t('或选一句，直接回答 Maya','Or tap a reply to send it')));
  for(const hint of hintsToShow.slice(0,2)){
    const words=typeof hint==='string'?hint:hint.text||hint.label;
    if(words)hints.append(button(words,()=>{if(busy||mode!=='idle')return;storeDraft(words);return send('chat',words)},'hint','suggestion'));
  }
  host.append(hints);
}
if(topic==='studio'&&!busy&&(mode==='idle'||mode==='writing'&&offersDevice())){
  const more=detail(t('更多回答方式','More ways to reply'));
  more.className='receiver-options';more.open=replyOptionsOpen;
  if(mode==='idle')more.append(button(t('用键盘回答','Use the keyboard'),()=>switchToText(),'plain','write'));
  if(offersDevice()){
    const size=mb(audioRoute.deviceDictation.downloadBytes);
    const label=preferDevice?t('使用浏览器听写','Use browser dictation'):t('在设备上听写','Dictate on this device');
    more.append(button(label,()=>{if(preferDevice){releaseDevice();begin()}else begin('device')},'plain','device-voice'));
    if(!preferDevice)more.append(el('p',t('首次约下载 '+size+'。录音在你的设备上转写。','About '+size+' on first use. Audio is transcribed on this device.'),'explain'));
  }
  if(providerOffline())more.append(button(t('重新连接经理','Reconnect to the manager'),()=>{session=null;load()},'plain','reconnect'));
  host.append(more);
}
if(providerOffline()&&!busy&&!options.suppressExample)host.append(playback());if(last&&last.id!=='welcome'&&messages.length){const historyBox=detail(t('查看对话记录','Conversation record'));historyBox.className='thread-archive';const thread=el('ol');for(const m of messages){const item=el('li');item.append(el('small',m.role==='user'?t('你','You'):t('经理','Manager'),'small'),el('p',m.id==='welcome'?opening():m.text));if(m.responseId)item.append(el('code','HarnessRouter · '+m.responseId));thread.append(item)}historyBox.append(thread);host.append(historyBox);if(!options.surface&&(window.speechSynthesis||audioRoute.replyPlayback))host.append(button(t('朗读回答','Read reply aloud'),()=>speakFundReply(last.text,{lang:language,...playbackFor(last.id==='welcome'?null:last)}),'plain','read'))}
if(value.phase==='confirmed'||value.fund){const save=saveBox(account);if(save)host.append(save)}if(options.surface){const original=host.querySelector('[data-command=talk]');if(original)original.replaceWith(options.surface.control);
 const label=busy?t('等待经理回复','Waiting for a reply'):mode==='installing'?t('取消准备','Cancel setup'):mode==='listening'?t('结束听写','Finish dictation'):mode==='requesting'?t('取消开启麦克风','Cancel microphone request'):mode==='processing'?t('取消转写','Cancel transcription'):mode==='writing'?t('继续口述','Dictate more'):providerOffline()?t('口述我的想法','Dictate my idea'):t('和 Maya 说话','Talk to Maya');
 options.surface.setStatus(busy?'sending':mode,label,micAction);
 options.surface.setAudio(question.textContent,language,busy||capturing(),playbackFor(firstAssignment?null:last));
}
 if(savedFocus&&mode==='writing'){field.focus({preventScroll:true});field.setSelectionRange(...savedFocus)}}
async function load(){const n=++run;try{const fresh=await reload();if(!alive||n!==run)return;state=fresh;ready=true;error='';paint();if(options.fromLobby&&state.value?.messages?.every(m=>m.id==='welcome')&&!draft&&mode==='idle'&&readingChoice()!=='false'){options.surface?.speak();}if(options.message){const first=options.message;options.message=null;storeDraft(first);send('chat',first)}}catch(e){if(!alive||n!==run)return;error=errorText(e.message);paint()}}
function onKey(event){if(event.key==='Escape'&&capturing())cancelDictation()}
host.addEventListener('keydown',onKey);paint();load();loadDraft();if(options.voice)begin();return ()=>{alive=false;host.removeEventListener('keydown',onKey);persist(true);releaseDevice();stopRecognition();stopSpeech()}}
function studio(options){
 const root=el('div','','workspace');root.append(back(t('大厅','Home'),'/'));
 const door=fullAppDoor('studio');if(door)root.append(door);
 const scene=el('section','','interview reception-interview'),host=el('article'),s=options.traveling||receiver({t,mini:true,onTalk:()=>{}});s.classList.add('receiver-mini');scene.append(s,host);root.append(scene);main.append(root);options.surface=s;
 if(options.prior&&!matchMedia('(prefers-reduced-motion: reduce)').matches){host.classList.add('seat-arrival-copy');const pre=options.prior,after=s.getBoundingClientRect();s.animate([{transform:'translate('+(pre.left-after.left)+'px,'+(pre.top-after.top)+'px) scale('+pre.width/after.width+','+pre.height/after.height+')'},{transform:'none'}],{duration:525,easing:'cubic-bezier(.23,.73,.22,1)',fill:'none'})}
 root.append(a(t('探索高级会员','Explore premium'),'/membership.html?lang='+language,'host-premium-link'));
 const stop=interview(host,'studio',options);dispose=()=>{stop();s.dispose()}
 }
async function funds(selected,options,n) {
  setupSalonStyle();
  const root=el('section','',selected?'sx-detail':'sx-directory-host');
  main.append(root);
  try {
    if(!selected) {
      const items=await api('/api/catalog?lang='+language);
      if(n!==generation)return;
      const config={items,lang:language,url:id=>routeHref('/funds',id),backUrl:routeHref('/')};
      root.innerHTML=salonDirectory(config);
      bindSalonDirectory(root,config);enableSalonLinks(root);
      const door=fullAppDoor('funds');if(door)root.prepend(door);
      return;
    }
    const item=await api('/api/study?id='+encodeURIComponent(selected)+'&lang='+language);
    if(n!==generation)return;
    const persona=item.section==='persona';
    const availability=item.id==='buffett'?await getSession().catch(()=>null):null;
    if(n!==generation)return;
    const managerAvailable=availability?.agentReady===true && availability.managerAvailability?.state!=='temporarily-unavailable';
    root.dataset.studyId=item.id;
    root.innerHTML=salonDetailHead(item,language,routeHref('/funds',null,{group:persona?'people':'markets'}),managerAvailable);
    enableSalonLinks(root);
    const body=el('div','','sx-body');root.append(body);
    const credit=salonCredits(item,language);
    const committeeExtras=credit?'<section class="fd-actions">'+credit+'</section>':'';
    body.innerHTML=studyVisual(item,language,{committeeExtras,managerAvailable});bindSalonDirectory(root);
    const door=fullAppDoor('funds',item.id);if(door)body.prepend(door);
    if(persona) {
      if(item.id!=='buffett'){const box=el('div');box.innerHTML=salonGuide(item,language);body.append(box);bindSalonGuide(box);}
      const session=await getSession().catch(()=>null);
      if(n!==generation)return;
      if(session?.agentReady===true && session?.managerAvailability?.state!=='temporarily-unavailable'){
        const live=el('article','','research-ask'), start=button(item.id==='buffett'?t('讨论巴菲特的公开投资方法','Discuss Buffett’s public methods'):t('直接提问','Ask your own question'),()=>{
          start.hidden=true;dispose=interview(live,item.id,{message:options.message});live.focus({preventScroll:true});
        },'sx-live-start');
        const jump=root.querySelector('[data-fg-jump]');
        if(item.id!=='buffett'){jump.dataset.fgLive='yes';jump.textContent=t('和研究经理聊聊','Talk to the AI researcher')+' ↗';}
        live.dataset.fgLiveHost='';start.dataset.fgLiveStart='';live.tabIndex=-1;body.append(start,live);if(options.message||new URL(location.href).searchParams.has('talk'))start.click();
      }
    } else {
      const askHost=el('article','','research-ask');
      const ask=button(t('向研究团队提问','Ask the fund research team'),()=>open(false),'sx-live-start','research-chat');
      body.append(ask,askHost);
      function open(auto){ask.hidden=true;dispose=interview(askHost,item.id,{message:options.message,suppressExample:true});if(!auto){const head=askHost.querySelector('h2');if(head){head.tabIndex=-1;head.focus({preventScroll:true});askHost.scrollIntoView({block:'nearest',behavior:'instant'})}}}
      if(options.message||new URL(location.href).searchParams.has('talk'))open(true);
    }
  } catch(e) {if(n===generation)root.append(el('p',errorText(e.message),'error-note'),button(t('重试','Try again'),()=>render(options),'plain'));}
}

function render(options={}){syncEditionBrand();dispose();dispose=()=>{};scrollReset();scrollReset=()=>{};generation++;const n=generation;const url=new URL(location.href);document.body.dataset.room=url.pathname.replace(/\//g,'')||'home';language=langOf()==='en-US'?'en-US':'zh-CN';document.documentElement.lang=language;document.querySelector('link[rel=manifest]').href=language==='en-US'?'/manifest-en.webmanifest':'/manifest.webmanifest';const brand='Fund Edition';document.querySelector('[data-brand-kind]').textContent=t('你的 AI 投资团队','Your AI investment team');document.querySelector('[data-brand]').textContent=brand;document.title=brand+' · '+(url.pathname==='/funds'?t('挑选 AI 基金','Explore AI funds'):url.pathname==='/studio'?t('自建 AI 基金','Build an AI fund'):t('你的 AI 投资团队','Your AI investment team'));paintLanguagePicker(locale,language,changeHeaderLanguage);const member=document.querySelector('#membership-link');member.textContent=t('我的会员资格','My membership');member.href='/membership.html?view=account&lang='+language;member.parentElement.querySelector('summary').setAttribute('aria-label',t('设置','Settings'));main.replaceChildren();scrollTo({top:0,behavior:'instant'});const path=url.pathname.replace(/\/$/,'');if(path==='/studio')studio(options);else if(path==='/funds')funds(url.searchParams.get('id'),options,n);else home();if(url.hash==='#paths')requestAnimationFrame(()=>document.getElementById('paths')?.scrollIntoView());}
function changeHeaderLanguage(next){const url=new URL(location.href);url.searchParams.set('lang',next);setStored('folio.language',next);history.replaceState(history.state,'',url);render();locale.querySelector('button[lang="'+next+'"]')?.focus({preventScroll:true})}
window.addEventListener('pagehide',()=>{dispose();scrollReset()});render();
