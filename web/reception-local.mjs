import {prepareNarration} from './voice.mjs';
import {createEditionLobby} from './edition-lobby.mjs';
import {receiver,readingChoice} from './reception.mjs';
import {openingQuestion} from './voice.mjs';
import {t} from './i18n.mjs';

const make = (tag, cls, text='') => {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  return node;
};
let currentFrame, previous, observer, inFlight = false;
function frameFor(language) {
  if (currentFrame && currentFrame.dataset.language !== language) {
    currentFrame.dispose();
    currentFrame = null;
  }
  if (!currentFrame) {
    currentFrame = receiver({t,onTalk:()=>{}});
    currentFrame.dataset.language = language;
  }
  observer?.disconnect();
  return currentFrame;
}
function insertHome(root, language, openStudio) {
 const old=root.querySelector('.ge-home');
 if(!old||root.querySelector('#entry-sheet'))return;
 const header=root.querySelector('.ge-rail'),options=old.querySelector('.ge-settings');
 if(options&&header){options.classList.add('receiver-settings');header.append(options)}
 const lobby=createEditionLobby({
   t,studioURL:'#/fund',fundsURL:'#/lab',
   onStudio:()=>{
     openStudio('fund');
     if(readingChoice()!=='false'&&root.querySelector('.receiver-opening'))currentFrame?.speak();
     return root.querySelector('.receiver-photo');
   },
   onFunds:()=>{openStudio('lab');return root.querySelector('.funds-page h1,.salon h1,main h1')}
 });
 const studio=lobby.querySelector('[data-edition="studio"]');
 for(const event of ['pointerenter','pointerdown','focus'])studio?.addEventListener(event,()=>prepareNarration(language,{opening:true}),{once:true});
 old.replaceWith(lobby);
}
function insertStudio(root, language, voice) {
  const form=root.querySelector('form[data-form="studio-onboard"]');
  const target=form?.querySelector('button[data-voice-target]'), seat=root.querySelector('.guide-setting');
  if(!target||!seat)return;
  const frame=frameFor(language), lens=frame.control;
  const label=lens.querySelector('.receiver-label'), old=target.parentElement;
  const status=old.querySelector('[data-voice-status]'),privacy=old.querySelector('.voice-privacy');
  const currentNote=make('p','receiver-note');
  frame.classList.add('receiver-mini');
  frame.setStatus('idle',t('和 Maya 说话','Talk to Maya'),null);
  lens.dataset.voiceTarget=target.dataset.voiceTarget;
  lens.dataset.voiceLang=language;
  delete lens.dataset.voiceOriginalLabel;
  lens.setAttribute('aria-pressed','false');
  lens.dataset.voiceState='idle';
  label.dataset.voiceLabel='';
  old.replaceChildren(lens);
  if(status)old.append(status);
  if(privacy)old.append(privacy);
  const cancel=make('button','receiver-cancel',t('取消','Cancel'));
  cancel.type='button';cancel.dataset.voiceCancel='';cancel.hidden=true;old.append(cancel);
  form.querySelector('.voice-start')?.after(...form.querySelectorAll('.guide-answers'));
  const person=seat.querySelector('.guide-person-copy');
  seat.querySelector('.guide-manager-seat')?.remove();
  seat.querySelectorAll('.receiver-note').forEach(item=>item.remove());
  seat.prepend(frame,currentNote);
  if(person)person.querySelector('p').textContent=t('AI 基金经理','AI fund manager');
  seat.classList.add('receiver-local-guide');
  root.querySelector('.my-studio')?.classList.add('receiver-local-studio');
  root.querySelector('[data-formation-host]')?.append(seat);
  const receipt=root.querySelector('.guide-conversation');
  const tools = make('details','receiver-options');
  tools.append(make('summary','',t('更多回答方式','More ways to reply')));
  const keyboard=form.querySelector('[data-action="toggle-typing"]');
  if(keyboard){keyboard.setAttribute('form','maya-conversation');form.id='maya-conversation';tools.append(keyboard)}
  seat.querySelector('.speech-switch')?.remove();
  for(const extra of seat.querySelectorAll('.studio-example-trigger'))tools.append(extra);
  if(tools.childElementCount > 1)(receipt.querySelector('.revise-blueprint') || receipt).append(tools);
  const messages = receipt.querySelector('.guide-messages');
  const thread = [...(messages?.querySelectorAll('.guide-message') || [])];
  if(thread.length === 1 && !thread[0].classList.contains('guide-message--user')) {
    const question = thread[0].querySelector('p,h2');
    if(question && question.textContent===openingQuestion(t)) {
      thread[0].classList.add('receiver-opening');
    }
  }
  const latest=[...thread].reverse().find(row=>!row.classList.contains('guide-message--user'));
  const question=latest?.querySelector('p,h2')?.textContent;
  const read=latest?.querySelector('[data-voice-receipt]')?.dataset;
  const answers=form.querySelector('.guide-answers');
  if(answers){
    const fingerprint=question+' '+answers.textContent;
    answers.toggleAttribute('data-settled',fingerprint===frame.dataset.answerKey);
    frame.dataset.answerKey=fingerprint;
  }
  frame.setAudio(question,read?.voiceLang||language,Boolean(receipt.querySelector('.thinking')),{topic:'studio',responseId:read?.voiceReceipt,replyPlayback:voice?.replyPlayback});
  if(receipt.querySelector('.thinking')){lens.disabled=true;lens.setAttribute('aria-disabled','true')}
  else lens.removeAttribute('aria-disabled');
  if(thread.length > 1 && !receipt.querySelector('.thinking') && !receipt.querySelector('.formation-transcript')){
    const record=make('details','receiver-history');record.append(make('summary','',t('查看此前对话','Previous conversation')));
    thread.slice(0,-1).forEach(row=>record.append(row));receipt.append(record);
  }
  if(previous&&!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const dest=frame.getBoundingClientRect(),orig=previous;
    frame.animate([{transform:'translate('+(orig.left-dest.left)+'px,'+(orig.top-dest.top)+'px) scale('+orig.width/dest.width+','+orig.height/dest.height+')'},{transform:'none'}],{duration:525,easing:'cubic-bezier(.23,.73,.22,1)'});
    receipt?.classList.add('seat-arrival-copy');
  }
  previous=null;
  const reflect=()=>{
    frame.dataset.status=lens.dataset.voiceState||'idle';
    currentNote.textContent=status?.textContent||'';
    if(frame.dataset.status==='unavailable'||frame.dataset.status==='error')tools.open=true;
    const active=['listening','starting','processing'].includes(frame.dataset.status);
    cancel.hidden=frame.dataset.status!=='listening';
    form.classList.toggle('recording-words',active);
    frame.querySelector('.receiver-audio').disabled=active||lens.disabled;
  };
  observer=new MutationObserver(reflect);
  observer.observe(lens,{attributes:true,attributeFilter:['data-voice-state','data-listening']});
  if(status)observer.observe(status,{childList:true,subtree:true,characterData:true});
  reflect();
  if(inFlight){inFlight=false;lens.click()}
}
export function attachReception(root, page, language, openStudio, voice) {
  if(page==='home'){
    observer?.disconnect();currentFrame?.dispose();currentFrame=null;
    insertHome(root,language,openStudio);
  }
  else if(page==='fund')insertStudio(root,language,voice);
  else {
    observer?.disconnect();currentFrame?.dispose();currentFrame=null;previous=null;inFlight=false;
  }
}

