const bindings = new WeakMap();
let currentSpeech = null;
const microphoneRoutes=new WeakMap();
const preparedOpenings=new WeakMap();
const speeds=[0.9,1,1.12];

export function narrationSpeed(platform=globalThis) {
  try {
    const saved=Number(platform.localStorage?.getItem('fundroom.narration-speed'));
    if(speeds.includes(saved))return saved;
  } catch {}
  return 1.12;
}

export function saveNarrationSpeed(value,platform=globalThis) {
  const speed=Number(value);
  if(!speeds.includes(speed))return;
  try{platform.localStorage?.setItem('fundroom.narration-speed',String(speed))}catch{}
}

function openingAudioURL(lang) {
  return '/assets/maya-opening-'+(chinese(lang)?'zh':'en')+'.wav';
}

export function prepareNarration(lang,{opening=false,platform=globalThis}={}) {
  // Voice lists often populate asynchronously on the first enumeration.
  platform.speechSynthesis?.getVoices?.();
  if(!opening || !platform.Audio || platform.navigator?.connection?.saveData)return;
  try{if(platform.localStorage?.getItem('morrowfolio.read-aloud')==='false')return}catch{}
  let clips=preparedOpenings.get(platform);
  if(!clips){clips=new Map();preparedOpenings.set(platform,clips)}
  const url=openingAudioURL(lang);
  if(clips.has(url))return;
  const audio=new platform.Audio();
  audio.preload='auto';audio.src=url;clips.set(url,audio);
  audio.load?.();
}

export const openingQuestion = t => t('你想让自己的基金投资什么？','What would you like your fund to invest in?');

const escape = (value) => String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const chinese = (language) => /^zh\b/iu.test(language);
const noSpeechMessage = lang => chinese(lang) ? '没有听清。可以再说一次，或用键盘回答。' : 'I didn’t catch that. Try speaking again or use the keyboard.';

export function voiceCapabilities(platform = globalThis) {
  return {
    recognition: Boolean(platform.SpeechRecognition || platform.webkitSpeechRecognition),
    speech: Boolean(platform.speechSynthesis && platform.SpeechSynthesisUtterance),
    secure: platform.isSecureContext !== false,
  };
}

export function createVoiceController({
  onTranscript = () => {}, onState = () => {}, onError = () => {}, lang = 'zh-CN',
  maxDurationMs = 60_000, platform = globalThis, processLocally=false,
} = {}) {
  const Recognition = platform.SpeechRecognition || platform.webkitSpeechRecognition;
  let recognition;
  let state = Recognition ? 'idle' : 'unavailable';
  let timer;
  let cancelled = false;
  let disposed = false;
  let finalText = '';

  function change(next, detail = '') {
    state = next;
    onState({ state: next, detail, finalText });
  }

  function fail(code) {
    const descriptions = chinese(lang) ? {
      'not-allowed': '麦克风权限未开启。请允许此网站使用麦克风，再试一次。',
      'service-not-allowed': '浏览器未开放语音识别。可换支持的浏览器，或输入文字。',
      'audio-capture': '没有可用的麦克风。请检查设备连接和系统麦克风权限。',
      'no-speech': noSpeechMessage(lang),
      network: '浏览器语音服务暂时无法连接。请稍后重试，或输入文字。',
      'language-not-supported': '当前语音服务不支持这个语言。可改用英文或文字。',
      unsupported: '当前浏览器不支持语音识别。可尝试 Edge、Chrome 或 Safari，文字输入仍可用。',
    } : {
      'not-allowed': 'Allow microphone access for this site, then try again.',
      'service-not-allowed': 'This browser has not enabled speech recognition. Try a supported browser or type your message.',
      'audio-capture': 'No microphone is available. Check the device and system microphone permissions.',
      'no-speech': noSpeechMessage(lang),
      network: 'The browser speech service is unavailable. Try again later or type your message.',
      'language-not-supported': 'This speech service does not support the selected language. Try English or type your message.',
      unsupported: 'This browser does not support speech recognition. Try Edge, Chrome or Safari, or type your message.',
    };
    const message = descriptions[code] || (chinese(lang) ? '语音暂时不可用，请重试或输入文字。' : 'Speech is unavailable. Please retry or type your message.');
    change(code === 'unsupported' ? 'unavailable' : 'error', message);
    onError({ code, message });
  }

  function clearTimer() {
    if (timer) platform.clearTimeout(timer);
    timer = null;
  }

  function start() {
    if (disposed || state === 'starting' || state === 'listening' || state === 'processing') return false;
    if (!Recognition) { fail('unsupported'); return false; }
    stopSpeaking(platform);
    cancelled = false;
    finalText = '';
    const capture=recognition=new Recognition();
    let heardWords=false;
    if(processLocally)recognition.processLocally=true;
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (disposed||cancelled||recognition!==capture) { capture.abort(); return; }
      change('listening');
      timer = platform.setTimeout(stop, maxDurationMs);
    };
    recognition.onresult = (event) => {
      if (cancelled || disposed || recognition!==capture) return;
      const finals = [];
      const interims = [];
      for (const result of Array.from(event.results)) {
        const text = result[0]?.transcript?.trim();
        if (text) (result.isFinal ? finals : interims).push(text);
      }
      if(!finals.length&&!interims.length)return;
      heardWords=true;
      finalText = finals.join(chinese(lang) ? '' : ' ');
      onTranscript({ text: [...finals, ...interims].join(chinese(lang) ? '' : ' '), final: interims.length === 0 && finals.length > 0, source: 'browser-speech', lang });
    };
    recognition.onspeechend = () => {
      if(disposed||cancelled||recognition!==capture)return;
      if (state === 'listening') change('processing');
    };
    recognition.onerror = (event) => {
      if(recognition!==capture)return;
      clearTimer();
      if (cancelled || disposed || event.error === 'aborted') return;
      fail(event.error);
    };
    recognition.onend = () => {
      if(recognition!==capture||disposed||cancelled)return;
      clearTimer();
      if(['error','unavailable'].includes(state))return;
      if(heardWords)change('idle');else fail('no-speech');
    };
    change('starting');
    try { recognition.start(); } catch { fail('audio-capture'); return false; }
    return true;
  }

  function stop() {
    clearTimer();
    if (!recognition || !['starting', 'listening', 'processing'].includes(state)) return;
    change('processing');
    try { recognition.stop(); } catch { change('idle'); }
  }

  function cancel() {
    cancelled = true;
    clearTimer();
    try { recognition?.abort(); } catch { /* A completed browser session needs no cancellation. */ }
    if (!disposed) change(Recognition ? 'idle' : 'unavailable');
  }

  return {
    supported: Boolean(Recognition), start, stop, cancel,
    get state() { return state; },
    destroy() { cancel(); disposed = true; recognition = null; },
  };
}

function samples16k(chunks, inputRate) {
  const count = chunks.reduce((length, chunk) => length + chunk.length, 0);
  const input = new Float32Array(count);
  let offset = 0;
  for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length; }
  const rate = 16000;
  const length = Math.min(rate * 30, Math.floor(count * rate / inputRate));
  const samples=new Float32Array(length);
  for(let index=0;index<length;index++){
    const start=Math.floor(index*inputRate/rate);
    const end=Math.min(count,Math.max(start+1,Math.floor((index+1)*inputRate/rate)));
    let sum=0;
    for(let sample=start;sample<end;sample++)sum+=input[sample];
    samples[index]=Math.max(-1,Math.min(1,sum/(end-start)));
  }
  return samples;
}

export function encodePcmWave(chunks, inputRate) {
  const samples=samples16k(chunks,inputRate),length=samples.length,rate=16000;
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const write = (index, value) => { for (let i = 0; i < value.length; i += 1) view.setUint8(index + i, value.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, length * 2, true);
  for (let index = 0; index < length; index += 1) {
    const value = samples[index];
    view.setInt16(44 + index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

export function createLocalVoiceController({ onTranscript = () => {}, onState = () => {}, onError = () => {}, lang = 'zh-CN', platform = globalThis, transcribeDevice } = {}) {
  let state = 'idle';
  let stream;
  let context;
  let node;
  let timer;
  let disposed = false;
  let chunks = [];
  let samples = 0;
  let request;
  let captureNumber = 0;
  const supported = Boolean(platform.navigator?.mediaDevices?.getUserMedia && (platform.AudioContext || platform.webkitAudioContext));
  const change = (next, detail = '') => { state = next; if (!disposed) onState({ state: next, detail }); };
  function release() {
    platform.clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
    node?.disconnect();
    context?.close().catch(() => {});
    stream = null;
    node = null;
    context = null;
  }
  async function start() {
    if (disposed || ['starting', 'listening', 'processing'].includes(state)) return false;
    if (!supported) {
      const message = chinese(lang) ? '当前页面无法使用安全麦克风，可直接输入文字。' : 'A secure microphone is unavailable here. You can type your message.';
      change('unavailable', message); onError({ code: 'unsupported', message });
      return false;
    }
    stopSpeaking(platform);
    const captureId = ++captureNumber;
    change('starting');
    try {
      const acquired = await platform.navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (captureId !== captureNumber) { acquired.getTracks().forEach(track => track.stop()); return false; }
      stream = acquired;
      context = new (platform.AudioContext || platform.webkitAudioContext)();
      const source = context.createMediaStreamSource(stream);
      chunks = [];
      samples = 0;
      const capture = (data) => {
        if (captureId !== captureNumber || state !== 'listening') return;
        chunks.push(new Float32Array(data));
        samples += data.length;
        if (samples >= context.sampleRate * 30) stop();
      };
      if (context.audioWorklet && platform.AudioWorkletNode) {
        await context.audioWorklet.addModule('/voice-worklet.js');
        if (captureId !== captureNumber) return false;
        node = new platform.AudioWorkletNode(context, 'morrowfolio-recorder');
        node.port.onmessage = ({ data }) => capture(data);
      } else {
        node = context.createScriptProcessor(4096, 1, 1);
        node.onaudioprocess = (event) => capture(event.inputBuffer.getChannelData(0));
      }
      const muted = context.createGain();
      muted.gain.value = 0;
      source.connect(node); node.connect(muted); muted.connect(context.destination);
      await context.resume();
      if (captureId !== captureNumber) return false;
      change('listening');
      timer = platform.setTimeout(stop, 30_000);
      return true;
    } catch (error) {
      if (captureId !== captureNumber) return false;
      release();
      const message = chinese(lang) ? (error.name === 'NotAllowedError' ? '请允许此网站使用麦克风，再试一次。' : '未能打开麦克风。请检查设备或输入文字。') : (error.name === 'NotAllowedError' ? 'Allow microphone access for this site, then try again.' : 'The microphone could not open. Check the device or type your message.');
      change('error', message); onError({ code: error.name, message });
      return false;
    }
  }
  async function stop() {
    if (!['starting', 'listening'].includes(state)) return;
    if (state === 'starting') { cancel(); return; }
    const rate = context.sampleRate;
    const recording = chunks;
    chunks = [];
    release();
    change('processing', chinese(lang) ? '正在转写录音…' : 'Transcribing your recording…');
    const pending = new AbortController();
    request = pending;
    try {
      let result;
      if(transcribeDevice){
        const samples=samples16k(recording,rate);
        const audible=samples.some(value=>Math.abs(value)>.0001);
        const text=audible?await transcribeDevice(samples):'';
        result={text:typeof text==='string'?text:text?.text,source:'device-recognition'};
      }else{
        const response=await platform.fetch('/api/voice/transcribe',{method:'POST',cache:'no-store',signal:pending.signal,
          headers:{'Content-Type':'audio/wav','X-Voice-Language':lang},body:encodePcmWave(recording,rate)});
        result=await response.json();
        if(!response.ok)throw new Error(result.messages?.[lang]||(chinese(lang)?result.error||'语音识别未完成。请重试或输入文字。':'Transcription could not finish. Please retry or type your message.'));
      }
      if (disposed || pending.signal.aborted) return;
      const words=typeof result.text==='string'?result.text.trim():'';
      if(!words){
        const message=noSpeechMessage(lang);
        change('error',message);onError({code:'no-speech',message});return;
      }
      onTranscript({ text: words, final: true, lang, confidence: result.confidence, needsReview: result.confidence < 0.65, source: result.source || 'workspace-recognition' });
      change('idle', chinese(lang) ? '转写已填入，请检查后发送。' : 'Transcript is ready. Review it before sending.');
    } catch (error) {
      if (disposed || pending.signal.aborted) return;
      const empty=error.message==='no-speech';
      const message=empty?noSpeechMessage(lang):transcribeDevice
        ?(chinese(lang)?'设备听写未完成。可以重试，或用键盘继续。':'On-device dictation could not finish. Try again or use the keyboard.')
        :error.message;
      change('error',message);onError({code:empty?'no-speech':'local-recognition',message});
    } finally { if (request === pending) request = null; }
  }
  function cancel() { captureNumber += 1; request?.abort(); request = null; release(); chunks = []; change('idle'); }
  return { supported, start, stop, cancel, get state() { return state; }, destroy() { cancel(); disposed = true; } };
}

export function microphoneRoute(platform=globalThis) {
  if(!microphoneRoutes.has(platform)){
    const route=platform.fetch('/api/voice/status',{cache:'no-store',signal:globalThis.AbortSignal?.timeout?.(2500)})
      .then(response=>response.ok?response.json():{}).catch(()=>{microphoneRoutes.delete(platform);return {}});
    microphoneRoutes.set(platform,route);
  }
  return microphoneRoutes.get(platform);
}

export async function dictationEngine(lang,platform=globalThis) {
  const route=await microphoneRoute(platform);
  const workspace=Boolean(route.local&&route.languages?.includes(lang)&&platform.navigator?.mediaDevices?.getUserMedia&&(platform.AudioContext||platform.webkitAudioContext));
  if(workspace)return {create:createLocalVoiceController,workspace,processLocally:false};
  const Engine=platform.SpeechRecognition||platform.webkitSpeechRecognition;
  let processLocally=false;
  if(Engine?.available&&Engine.prototype&&'processLocally' in Engine.prototype){
    try{processLocally=(await Engine.available({langs:[lang],processLocally:true}))==='available'}catch{}
  }
  return {create:createVoiceController,workspace,processLocally};
}

export function stopSpeaking(platform = globalThis) {
  const previous = currentSpeech;
  currentSpeech = null;
  previous?.request?.abort();
  previous?.cancelVoiceWait?.();
  if(previous?.context)void previous.context.close().catch(()=>{});
  if(previous?.audio){previous.audio.onplaying=previous.audio.onended=previous.audio.onerror=null;previous.audio.pause()}
  if(previous?.blobUrl)platform.URL.revokeObjectURL(previous.blobUrl);
  if(previous?.utterance)platform.speechSynthesis?.cancel();
  previous?.onState({ state: 'idle' });
}

export function speakOpening({lang,text,onState=()=>{},platform=globalThis}) {
  if(!platform.Audio)return speakReply(text,{lang,onState,platform});
  stopSpeaking(platform);
  const url=openingAudioURL(lang),prepared=preparedOpenings.get(platform);
  const audio=prepared?.get(url)??new platform.Audio(url);
  if(prepared?.has(url))prepared.set(url,null);
  audio.preservesPitch=true;
  audio.playbackRate=narrationSpeed(platform);
  const fallback=()=>{
    if(currentSpeech?.audio!==audio)return;
    stopSpeaking(platform);
    if(!speakReply(text,{lang,onState,platform}))onState({state:'error'});
  };
  audio.onplaying=()=>{if(currentSpeech?.audio===audio)onState({state:'speaking'})};
  audio.onended=()=>{if(currentSpeech?.audio===audio){currentSpeech=null;onState({state:'idle'})}};
  audio.onerror=fallback;
  currentSpeech={audio,onState};
  try {audio.play()?.catch(fallback)} catch {fallback()}
  return true;
}

async function playPcm(response,pending,onState,onFinish) {
  const context=pending.context, reader=response.body.getReader(), rate=Number(response.headers.get('x-audio-sample-rate'));
  if(rate!==24000)throw Error('Unexpected sampling rate');
  let cursor=0,leftover=null,started=false,last=null,drained=false;
  for (;;) {
    const {done,value}=await reader.read();
    if(done)break;
    if(currentSpeech!==pending)return;
    let bytes=value;
    if(leftover!==null){bytes=new Uint8Array(value.length+1);bytes[0]=leftover;bytes.set(value,1);leftover=null;}
    if(bytes.length%2){leftover=bytes[bytes.length-1];bytes=bytes.subarray(0,-1);}
    if(!bytes.length)continue;
    const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const buffer=context.createBuffer(1,bytes.length/2,rate), samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=data.getInt16(2*i,true)/32768;
    const source=context.createBufferSource();
    source.buffer=buffer;source.connect(context.destination);
    const start=Math.max(cursor,context.currentTime+0.035);
    cursor=start+buffer.duration;
    last=source;
    source.onended=()=>{source.disconnect();if(drained&&last===source&&currentSpeech===pending)onFinish('idle');};
    source.start(start);
    if(!started){started=true;onState({state:'speaking'});}
  }
  if(currentSpeech!==pending)return;
  if(!started||leftover!==null)throw Error('Incomplete speech');
  drained=true;
  if(context.currentTime>=cursor)onFinish('idle');
}

export function speakFundReply(text,{lang,topic,responseId,replyPlayback=false,onState=()=>{},platform=globalThis}={}) {
  const backend=Boolean(replyPlayback&&responseId&&topic&&platform.Audio&&platform.URL?.createObjectURL);
  if(!backend)return speakReply(text,{lang,onState,platform});
  function useRecording(){
    stopSpeaking(platform);
    const pending={request:new AbortController(),onState};
    currentSpeech=pending;
    onState({state:'loading'});
    const finish=state=>{
      if(currentSpeech!==pending)return;
      stopSpeaking(platform);onState({state});
    };
    const Context=platform.AudioContext||platform.webkitAudioContext;
    let ready=Promise.resolve();
    try {
      if(Context && platform.ReadableStream){
        pending.context=new Context();
        ready=Promise.race([pending.context.resume(), new Promise(resolve=>platform.setTimeout(resolve,350))]).catch(()=>{});
      }
    } catch {}
    ready.then(()=>{
      if(currentSpeech!==pending)return;
      const accept=pending.context?.state==='running'?'application/vnd.fundroom.pcm-s16le':'audio/wav';
      const headers={'Content-Type':'application/json',Accept:accept};
      if(accept==='application/vnd.fundroom.pcm-s16le')headers['X-Fundroom-Reading-Rate']=String(narrationSpeed(platform));
      return platform.fetch('/api/voice/reply',{method:'POST',headers,cache:'no-store',signal:pending.request.signal,
      body:JSON.stringify({topic,responseId})});}).then(async response=>{
      if(currentSpeech!==pending)return;
      if(!response.ok)throw Error('voice');
      if(response.headers.get('content-type')?.startsWith('application/vnd.fundroom.pcm-s16le')) {
        return playPcm(response,pending,onState,finish);
      }
      if(!response.headers.get('content-type')?.startsWith('audio/wav'))throw Error('voice');
      const audio=await response.blob();
      if(currentSpeech!==pending)return;
      pending.blobUrl=platform.URL.createObjectURL(audio);
      pending.audio=new platform.Audio(pending.blobUrl);
      pending.audio.preservesPitch=true;
      pending.audio.playbackRate=narrationSpeed(platform);
      pending.audio.onplaying=()=>{if(currentSpeech===pending)onState({state:'speaking'})};
      pending.audio.onended=()=>finish('idle');
      pending.audio.onerror=()=>finish('error');
      await pending.audio.play();
    }).catch(()=>{
      if(currentSpeech!==pending)return;
      stopSpeaking(platform);
      if(!speakReply(text,{lang,onState,platform}))onState({state:'error'});
    });
    return true;
  }
  return useRecording();
}

export function speakReply(text, { lang, onState = () => {}, platform = globalThis } = {}) {
  const language = lang || (/[\u3400-\u9fff]/u.test(text) ? 'zh-CN' : 'en-US');
  if (!voiceCapabilities(platform).speech || !String(text).trim()) {
    onState({ state: 'unavailable' });
    return false;
  }
  stopSpeaking(platform);
  const synth=platform.speechSynthesis;
  const voices=synth.getVoices();
  if(!voices.length && synth.addEventListener && platform.setTimeout){
    const waiting={onState};
    let timeout;
    const cleanup=()=>{synth.removeEventListener('voiceschanged',ready);platform.clearTimeout(timeout)};
    const ready=()=>{
      if(currentSpeech!==waiting || !synth.getVoices().length)return;
      cleanup();currentSpeech=null;
      speakReply(text,{lang:language,onState,platform});
    };
    waiting.cancelVoiceWait=cleanup;
    currentSpeech=waiting;
    synth.addEventListener('voiceschanged',ready);
    timeout=platform.setTimeout(()=>{
      if(currentSpeech!==waiting)return;
      cleanup();currentSpeech=null;onState({state:'unavailable'});
    },800);
    onState({state:'loading'});return true;
  }
  const base=language.split('-')[0].toLowerCase();
  const local=voices.filter(v=>v.localService===true&&v.lang?.split('-')[0].toLowerCase()===base);
  // Tighten the fallback to installed voices so a browser never forwards a private reply.
  const preferences=base==='zh'?['tingting','ting-ting','婷婷','meijia','美佳','huihui','hui hui']:
    ['ava','samantha','jenny','aria','zira','karen'];
  const rank=v=>{
    const name=v.name.toLowerCase(), preference=preferences.findIndex(known=>name.includes(known));
    return (v.lang.toLowerCase()===language.toLowerCase()?50:0)+(/premium|enhanced|natural|优质|增强/u.test(name)?30:0)+(preference<0?0:20-preference);
  };
  const voice=local.sort((a,b)=>rank(b)-rank(a))[0];
  if(!voice){onState({state:'unavailable'});return false;}
  const words=String(text).slice(0,2000);
  let first=words;
  if(words.length>120 && typeof Intl.Segmenter==='function'){
    const [opening]=new Intl.Segmenter(language,{granularity:'sentence'}).segment(words);
    if(opening?.segment.length>=5)first=opening.segment;
  }
  const makePhrase=phrase=>{
    const u=new platform.SpeechSynthesisUtterance(phrase);
    u.lang=language;u.voice=voice;u.rate=narrationSpeed(platform);
    return u;
  };
  const lead=makePhrase(first),tail=words.slice(first.length).trim();
  const speech={utterance:lead,onState};
  const finish=event=>{
    if(currentSpeech!==speech)return;
    currentSpeech=null;onState(event);
  };
  lead.onstart=()=>{
    if(currentSpeech!==speech)return;
    onState({state:'speaking',voice:voice.name,lang:language});
    if(currentSpeech===speech && speech.remaining && !speech.tailQueued){speech.tailQueued=true;synth.speak(speech.remaining);}
  };
  lead.onerror=e=>finish({state:'error',code:e.error});
  if(tail){
    speech.remaining=makePhrase(tail);
    speech.remaining.onerror=lead.onerror;
    speech.remaining.onend=()=>finish({state:'idle'});
  }else lead.onend=()=>finish({state:'idle'});
  currentSpeech=speech;
  synth.speak(lead);
  return true;
}

export function renderVoiceButton({ targetId, label = '开口说', lang = 'zh-CN' } = {}) {
  return `<span class="voice-control"><button type="button" class="voice-button" data-voice-target="${escape(targetId)}" data-voice-lang="${escape(lang)}" aria-label="${escape(label)}" aria-pressed="false"><span aria-hidden="true">◉</span><span data-voice-label>${escape(label)}</span></button><span class="voice-status" data-voice-status role="status" aria-live="polite"></span><span class="voice-privacy">${chinese(lang) ? '点击麦克风开始，转写可在发送前校对。' : 'Tap the microphone to start. Review your words before sending.'}</span></span>`;
}

export function bindVoice(root, { onTranscript, onError, platform = globalThis } = {}) {
  bindings.get(root)?.();
  let controller;
  let activeButton;
  let originalText = '';
  let activeTarget;
  let generation = 0;
  microphoneRoute(platform);

  function resetButton() {
    if (!activeButton) return;
    activeButton.setAttribute('aria-pressed', 'false');
    activeButton.removeAttribute('data-listening');
    const label = activeButton.querySelector('[data-voice-label]');
    const original = activeButton.dataset.voiceOriginalLabel || '开口说';
    activeButton.setAttribute('aria-label', original);
    if (label) label.textContent = original;
  }

  async function handleClick(event) {
    if(event.target.closest?.('[data-voice-cancel]')?.dataset.voiceCancel!==undefined){
      cancelCapture();return;
    }
    const button = event.target.closest?.('[data-voice-target]');
    if (!button || !root.contains(button)) return;
    event.preventDefault();
    if (button === activeButton && (button.dataset.voiceState==='starting'||['starting', 'listening', 'processing'].includes(controller?.state))) {
      if (controller?.state === 'listening') controller.stop();
      else cancelCapture();
      return;
    }
    stopSpeaking(platform);
    controller?.destroy();
    resetButton();
    const target = root.ownerDocument?.getElementById(button.dataset.voiceTarget) || root.getElementById?.(button.dataset.voiceTarget);
    if (!target || !('value' in target)) return;
    activeButton = button;
    activeTarget = target;
    const lang = button.dataset.voiceLang || 'zh-CN';
    const label = button.querySelector('[data-voice-label]');
    button.dataset.voiceOriginalLabel ||= label?.textContent || button.getAttribute('aria-label') || '开口说';
    const status = button.parentElement?.querySelector('[data-voice-status]');
    const initial = target.value.trim();
    originalText = target.value;
    const current = ++generation;
    button.dataset.voiceState='starting';button.setAttribute('aria-pressed','true');
    const {create,workspace:local,processLocally} = await dictationEngine(lang,platform);
    if (current !== generation || !root.contains(button)) return;
    const privacy = button.parentElement?.querySelector('.voice-privacy');
    if (privacy) privacy.textContent = local ? (chinese(lang) ? '工作区识别，原音用完即删。你可以先校对，再发送给 AI。' : 'Your workspace transcribes and deletes the recording. Review the words before sending them to AI.') : processLocally ? (chinese(lang)?'在你的设备上转写。':'Transcribed on your device.') : (chinese(lang) ? '语音由浏览器的识别服务处理。发送后才交给 AI。' : 'Your browser’s speech service processes audio. Review the transcript before sending it to AI.');
    controller = create({ lang, platform,processLocally,
      onState({ state, detail }) {
        button.dataset.voiceState = state;
        const active = ['starting', 'listening', 'processing'].includes(state);
        button.setAttribute('aria-pressed', String(active));
        button.toggleAttribute('data-listening', state === 'listening');
        const labels = {
          starting: chinese(lang) ? '取消录音' : 'Cancel recording',
          listening: chinese(lang) ? '停止聆听' : 'Stop listening',
          processing: chinese(lang) ? '取消识别' : 'Cancel transcription',
        };
        const name = labels[state] || button.dataset.voiceOriginalLabel;
        if (label) label.textContent = name;
        button.setAttribute('aria-label', name);
        if (status) status.textContent = detail || ({ starting: chinese(lang) ? '正在请求麦克风…' : 'Requesting microphone…', listening: chinese(lang) ? '在听，说完再按一次即可停止。' : 'Listening. Tap again to stop.', processing: chinese(lang) ? '正在辨认…' : 'Recognizing…' })[state] || '';
      },
      onTranscript(result) {
        target.value = initial ? `${initial}${chinese(lang) ? '' : ' '}${result.text}` : result.text;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        if (result.final) target.dispatchEvent(new Event('change', { bubbles: true }));
        onTranscript?.({ ...result, target, button });
      },
      onError(error) { onError?.(error); },
    });
    controller.start();
  }

  function cancelCapture() {
    generation += 1;
    controller?.cancel();
    if(activeButton){activeButton.dataset.voiceState='idle';resetButton()}
    if (activeTarget && root.contains(activeTarget)) {
      activeTarget.value = originalText;
      activeTarget.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function handleKey(event) {
    if (event.key === 'Escape' && (activeButton?.dataset.voiceState === 'starting' || ['starting', 'listening', 'processing'].includes(controller?.state))) cancelCapture();
  }

  root.addEventListener('click', handleClick);
  root.addEventListener('keydown', handleKey);
  const teardown = () => {
    generation += 1;
    root.removeEventListener('click', handleClick);
    root.removeEventListener('keydown', handleKey);
    controller?.destroy();
    resetButton();
    bindings.delete(root);
  };
  bindings.set(root, teardown);
  return teardown;
}
