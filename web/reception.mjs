import {openingQuestion,prepareNarration,speakOpening,speakFundReply,stopSpeaking,voiceCapabilities} from './voice.mjs';

export function readingChoice() {
  try { return localStorage.getItem('morrowfolio.read-aloud'); } catch { return null; }
}

// The same compact portrait and voice button are used by the hosted and local interviews.
const style=document.createElement('link');
style.rel='stylesheet';
style.href=new URL('reception.css?v=formation-4',import.meta.url).href;
document.head.append(style);

function make(tag, cls) {
  const node=document.createElement(tag);
  node.className=cls;
  return node;
}

function mic() {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  svg.innerHTML='<rect x="8.5" y="2.5" width="7" height="12.5" rx="3.5"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3.8m-3.5 0h7"/>';
  return svg;
}

export function receiver({t,onTalk,mini=false}) {
  const frame=make('div',mini?'receiver receiver-mini':'receiver');
  const art=make('div','receiver-art');
  const photo=make('div','receiver-photo');
  photo.setAttribute('role','img');
  photo.setAttribute('aria-label',t('Maya Chen，你的 AI 基金经理。','Maya Chen, your AI fund manager.'));
  const identity=make('p','receiver-identity');
  identity.textContent=t('Maya Chen · AI 基金经理','Maya Chen · AI fund manager');
  const control=make('button','receiver-lens');
  const text=make('span','receiver-label');
  control.type='button';
  control.append(mic(),text);
  const badge=make('div','receiver-byline');
  const listen=make('button','receiver-audio');
  listen.type='button';
  listen.dataset.command='room-audio';
  const speaker=document.createElementNS('http://www.w3.org/2000/svg','svg');
  speaker.setAttribute('viewBox','0 0 24 24');
  speaker.setAttribute('aria-hidden','true');
  speaker.innerHTML='<path d="M3 9h4l5-4v14l-5-4H3zM16 9a4 4 0 0 1 0 6m2.6-8.7a8 8 0 0 1 0 11.4"/>';
  listen.append(speaker);
  const feedback=make('span','receiver-audio-feedback');
  feedback.setAttribute('role','status');
  badge.append(identity,listen);
  art.append(photo,badge,feedback,control);
  frame.append(art);
  frame.control=control;
  let words='',speechLang='',speaking=false,playback={};
  function updateAudio() {
    const label=speaking?t('停止朗读','Stop reading'):words===openingQuestion(t)?t('听 Maya 提问','Hear Maya’s question'):t('听 Maya 的回答','Hear Maya’s reply');
    listen.title=label;
    listen.setAttribute('aria-label',label);
    listen.setAttribute('aria-pressed',String(speaking));
  }
  frame.setAudio=(text,lang,disabled=false,reply={})=>{
    words=text;speechLang=lang;playback=reply;
    if(text)prepareNarration(lang,{opening:text===openingQuestion(t)});
    listen.hidden=!voiceCapabilities().speech&&!(window.Audio&&(words===openingQuestion(t)||reply.replyPlayback&&reply.responseId));
    listen.disabled=disabled||!text;
    updateAudio();
  };
  frame.speak=(text=words)=>{
    if(!text||listen.hidden||listen.disabled)return false;
    const options={...playback,text,lang:speechLang,onState:({state})=>{
      speaking=state==='speaking'||state==='loading';
      updateAudio();
      feedback.textContent=state==='unavailable'?t('这台设备没有可用的本地朗读音色。','This device has no installed narration voice.'):state==='error'?t('未能播放语音，可点扬声器再听。','Audio did not play. Use the speaker to listen again.'):'';
    }};
    return text===openingQuestion(t)?speakOpening(options):speakFundReply(text,options);
  };
  listen.onclick=()=>{
    try {localStorage.setItem('morrowfolio.read-aloud',String(!speaking))} catch {}
    if(speaking)stopSpeaking();else frame.speak();
  };
  frame.setStatus=(state,label,fn)=>{
    frame.dataset.status=state;
    text.textContent=label;
    control.setAttribute('aria-label',label);
    control.disabled=state==='sending';
    control.onclick=fn;
    control.dataset.command=state==='listening'?'stop':'talk';
  };
  frame.setStatus('idle',t('和 Maya 说话','Talk to Maya'),onTalk);
  frame.dispose=()=>stopSpeaking();
  return frame;
}
