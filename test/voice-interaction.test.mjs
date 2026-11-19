import assert from 'node:assert/strict';
import test from 'node:test';
import { bindVoice, createLocalVoiceController, createVoiceController, dictationEngine, prepareNarration, saveNarrationSpeed, speakFundReply, speakOpening, speakReply, stopSpeaking } from '../web/voice.mjs';

test('the bilingual opening plays without a system voice and lets the microphone interrupt it', async()=>{
  const clips=[],states=[];
  const platform={Audio:class{
    constructor(url){this.url=url;clips.push(this)}
    play(){this.onplaying();return Promise.resolve()}
    pause(){this.paused=true}
  }};
  for(const [lang,asset] of [['zh-CN','zh'],['en-US','en']]){
    speakOpening({lang,text:'Welcome',platform,onState:({state})=>states.push(state)});
    const clip=clips.at(-1),lateEvent=clip.onended;
    assert.equal(clip.url,'/assets/maya-opening-'+asset+'.wav');
    stopSpeaking(platform);lateEvent();assert.equal(clip.paused,true);
  }
  assert.deepEqual(states,['speaking','idle','speaking','idle']);
});

test('on-device recognition is selected only for an already installed language',async()=>{
  const Engine=class{get processLocally(){return this.local}set processLocally(value){this.local=value}};
  const platform={fetch:async()=>({ok:true,json:async()=>({local:false})}),SpeechRecognition:Engine};
  for(const status of ['available','downloadable','downloading','unavailable']){
    Engine.available=async options=>{assert.deepEqual(options,{langs:['zh-CN'],processLocally:true});return status};
    const result=await dictationEngine('zh-CN',platform);
    assert.equal(result.create,createVoiceController);assert.equal(result.processLocally,status==='available');
  }
});

test('manager audio requests contain only the receipt and release object URLs after playback',async()=>{
  let audio,post,revoked;
  const states=[],started=Promise.withResolvers();
  const platform={fetch:async(path,options)=>{
    assert.equal(path,'/api/voice/reply');post=JSON.parse(options.body);
    return new Response(new Blob(['recording']),{headers:{'Content-Type':'audio/wav'}});
  },Audio:class{constructor(url){this.url=url;audio=this}play(){this.onplaying();return Promise.resolve()}pause(){}},
  URL:{createObjectURL:()=> 'blob:audio',revokeObjectURL:url=>{revoked=url}}};
  speakFundReply('Private manager reply',{topic:'studio',responseId:'reply-1',lang:'en-US',replyPlayback:true,platform,onState:({state})=>{
    states.push(state);if(state==='speaking')started.resolve();if(state==='error')started.reject(Error('Playback failed'));
  }});
  await started.promise;assert.deepEqual(post,{topic:'studio',responseId:'reply-1'});
  assert.equal(audio.url,'blob:audio');audio.onended();assert.equal(revoked,'blob:audio');assert.ok(states.includes('speaking'));
});

test('neural narration schedules each PCM sample in sequence and drains the last buffer',async()=>{
  const spoke=Promise.withResolvers(),sources=[],states=[];
  let requested;
  class TestContext {
    state='suspended';currentTime=0;
    constructor(){this.destination={};}
    async resume(){this.state='running';}
    async close(){this.state='closed';}
    createBuffer(channels,length,rate){return {duration:length/rate,getChannelData:()=>new Float32Array(length)};}
    createBufferSource(){const item={connect(){},disconnect(){},start(time){this.when=time;}};sources.push(item);return item;}
  }
  const stream=new ReadableStream({start(c){
    c.enqueue(Uint8Array.of(1,0,2));c.enqueue(Uint8Array.of(0,3,0));c.close();
  }});
  const platform={Audio:class{},AudioContext:TestContext,ReadableStream,URL:{createObjectURL:()=>''},setTimeout,
    fetch:async(path,options)=>{requested=options;return new Response(stream,{headers:{'Content-Type':'application/vnd.fundroom.pcm-s16le','X-Audio-Sample-Rate':'24000'}});}};
  speakFundReply('Local private words',{lang:'en-US',topic:'studio',responseId:'saved',replyPlayback:true,platform,onState({state}){
    states.push(state);if(state==='speaking')spoke.resolve();}});
  await spoke.promise;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requested.headers.Accept,'application/vnd.fundroom.pcm-s16le');
  assert.deepEqual(JSON.parse(requested.body),{topic:'studio',responseId:'saved'});
  assert.equal(sources.length,2);
  assert.equal(sources[1].when,sources[0].when+sources[0].buffer.duration);
  assert.ok(Math.abs(sources.reduce((sum,s)=>sum+s.buffer.duration,0)-3/24000)<1e-9);
  sources[0].onended();assert.equal(states.at(-1),'speaking');
  sources[1].onended();assert.equal(states.at(-1),'idle');
});

test('fallback prefers an enhanced installed Mandarin voice and skips remote voices',()=>{
  const voices=[{lang:'zh-CN',name:'Online neural',localService:false},{lang:'zh-CN',name:'Legacy local',localService:true},
    {lang:'zh-CN',name:'Tingting Enhanced',localService:true}];
  let spoken=null;
  const platform={SpeechSynthesisUtterance:class{},speechSynthesis:{cancel(){},getVoices:()=>voices,speak:u=>{spoken=u;}}};
  assert.ok(speakReply('你好',{lang:'zh-CN',platform}));
  assert.equal(spoken.voice,voices[2]);voices.splice(1);
  assert.equal(speakReply('你好',{lang:'zh-CN',platform}),false);
});

test('starting a microphone interrupts a reply and ignores delayed playback events', () => {
  const utterances = [];
  const states = [];
  const platform = {
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    speechSynthesis: { cancel() {}, speak(item) { utterances.push(item); }, getVoices: () => [{lang:'en-US',name:'Samantha',localService:true}] },
    SpeechRecognition: class { start() {} abort() {} },
    clearTimeout() {},
  };
  const onState = ({state}) => states.push(state);
  speakReply('First answer.', { platform, onState });
  utterances[0].onstart();
  const microphone = createVoiceController({ platform });
  microphone.start();
  speakReply('Second answer.', { platform, onState });
  utterances[1].onstart();
  utterances[0].onerror({error:'interrupted'});
  utterances[0].onend();
  utterances[1].onend();
  assert.deepEqual(states, ['speaking', 'idle', 'speaking', 'idle']);
  microphone.destroy();
});

test('Escape restores a cancelled partial dictation and preserves subsequent manual edits', async () => {
  const listeners = new Map();
  const input = {value:'Started:', dispatchEvent() {}};
  const button = {
    dataset:{voiceTarget:'prompt', voiceLang:'en-US'}, closest() { return this; },
    setAttribute() {}, getAttribute() { return 'Speak'; }, toggleAttribute() {}, removeAttribute() {}, querySelector() {},
  };
  const root = {
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    contains(target) { return target === input || target === button; },
    getElementById() { return input; },
  };
  let recognizer;
  const platform = {
    fetch:async()=>({ok:true,json:async()=>({local:false})}),
    SpeechRecognition:class {
      constructor() { recognizer=this; }
      start() { this.onstart(); }
      abort() { this.onend(); }
    },
    setTimeout:()=>1, clearTimeout() {},
  };
  const click = ()=>listeners.get('click')({target:button,preventDefault() {}});
  const escape = ()=>listeners.get('keydown')({key:'Escape'});
  const transcript = (text, isFinal)=>recognizer.onresult({results:[Object.assign([{transcript:text}],{isFinal})]});
  const unbind = bindVoice(root, { platform });
  await click();
  transcript('temporary',false);
  assert.equal(input.value,'Started: temporary');
  escape();
  assert.equal(input.value,'Started:');
  await click();
  transcript('ticker',true);
  recognizer.onend();
  input.value='Started: VWELX';
  escape();
  assert.equal(input.value,'Started: VWELX');
  unbind();
});

test('empty recognition ends expose a retry or keyboard choice without changing a draft',()=>{
  let rec;
  const platform={SpeechRecognition:class{
    constructor(){rec=this}
    start(){this.onstart()} stop(){this.onend()} abort(){this.onend()}
  },setTimeout:()=>1,clearTimeout(){}};
  for(const lang of ['zh-CN','en-US']){
    const errors=[],updates=[];
    let draft='Existing draft';
    const mic=createVoiceController({platform,lang,onError:problem=>errors.push(problem),onTranscript:({text})=>{draft=text;updates.push(text)}});
    const result=text=>rec.onresult({results:[Object.assign([{transcript:text,confidence:1}],{isFinal:true})]});
    mic.start();rec.onend();
    mic.start();result('  ');mic.stop();
    assert.equal(mic.state,'error');assert.equal(draft,'Existing draft');assert.deepEqual(updates,[]);
    assert.deepEqual(errors.map(e=>e.code),['no-speech','no-speech']);
    assert.ok(errors.every(e=>lang==='zh-CN'?/再说一次.*键盘/u.test(e.message):/speaking again.*keyboard/u.test(e.message)));
    mic.start();const cancelled=rec;mic.cancel();
    mic.start();cancelled.onend();result('actual words');result('');rec.onend();
    assert.equal(mic.state,'idle');assert.equal(errors.length,2);assert.deepEqual(updates,['actual words']);
    mic.destroy();
  }
});

test('microphone fallback exposes an actionable error for insecure or unsupported capture', async () => {
  const faults = [];
  const microphone = createLocalVoiceController({platform:{},lang:'en-US',onError:e=>faults.push(e)});
  assert.equal(await microphone.start(),false);
  assert.equal(microphone.state,'unavailable');
  assert.deepEqual(faults.map(e=>e.code),['unsupported']);
  assert.match(faults[0].message,/type your message/);
});

test('on-device dictation passes 16 kHz samples to its local engine and never uploads the recording',async()=>{
  const seen=[],drafts=[],faults=[];
  let processor;
  const platform={
    navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},
    AudioContext:class{
      sampleRate=48000;
      createMediaStreamSource(){return {connect(){}}}createGain(){return {gain:{value:1},connect(){}}}
      createScriptProcessor(){processor={connect(){},disconnect(){}};return processor}
      async resume(){}async close(){}
    },setTimeout:()=>1,clearTimeout(){},fetch(){throw Error('Unexpected audio upload')}
  };
  const mic=createLocalVoiceController({platform,lang:'en-US',transcribeDevice:async samples=>{
    assert.ok(samples instanceof Float32Array);seen.push(...samples);return '  a steadier approach  ';
  },onTranscript:r=>drafts.push(r),onError:e=>faults.push(e)});
  await mic.start();processor.onaudioprocess({inputBuffer:{getChannelData:()=>Float32Array.of(.25,.5,.75,-1,0,1)}});
  await mic.stop();
  assert.deepEqual(seen,[.5,0]);assert.equal(drafts[0].text,'a steadier approach');assert.equal(drafts[0].source,'device-recognition');
  await mic.start();processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(192)}});
  await mic.stop();assert.deepEqual(seen,[.5,0]);assert.equal(drafts.length,1);assert.equal(faults[0].code,'no-speech');
  mic.destroy();
});

test('late microphone permission never opens or closes another capture after cancellation', async () => {
  const grants = [];
  const tracks = [];
  const platform = {
    navigator:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>grants.push(resolve))}},
    AudioContext:class {
      createMediaStreamSource() { return {connect() {}}; }
      createGain() { return {gain:{value:1},connect() {}}; }
      createScriptProcessor() { return {connect() {},disconnect() {}}; }
      async resume() {} async close() {}
    },
    setTimeout:()=>1, clearTimeout() {},
  };
  function grant(index) {
    const track = {stopped:false,stop() { this.stopped=true; }};
    tracks[index]=track;
    grants[index]({getTracks:()=>[track]});
  }
  const mic = createLocalVoiceController({platform});
  const first = mic.start();
  mic.cancel();
  const second = mic.start();
  grant(1);
  assert.equal(await second,true);
  grant(0);
  assert.equal(await first,false);
  assert.equal(tracks[0].stopped,true);
  assert.equal(tracks[1].stopped,false);
  assert.equal(mic.state,'listening');
  mic.destroy();
  assert.equal(tracks[1].stopped,true);
});


test('opening preloads silently, preserves pitch, and honors the saved speed without touching a stopped clip',()=>{
  const seen=[],values=new Map(),spoken=[];
  const platform={Audio:class {
    constructor(src){this.src=src;seen.push(this);}
    load(){this.loaded=true}
    play(){spoken.push(this);this.onplaying?.();}
    pause(){this.stopped=true;}
  },localStorage:{setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)}};
  prepareNarration('zh-CN',{opening:true,platform});
  prepareNarration('zh-CN',{opening:true,platform});
  assert.equal(seen.length,1);assert.equal(seen[0].loaded,true);assert.equal(spoken.length,0);
  saveNarrationSpeed(.9,platform);
  speakOpening({lang:'zh-CN',text:'开场',platform});
  assert.equal(spoken[0],seen[0]);assert.equal(seen[0].playbackRate,.9);assert.equal(seen[0].preservesPitch,true);
  const late=seen[0].onended;
  stopSpeaking(platform);late();
  values.set('morrowfolio.read-aloud','false');
  prepareNarration('en-US',{opening:true,platform});
  assert.equal(seen.length,1);
});

test('a short leading sentence can start first and neither interrupting nor duplicate start events queue a stale remainder',()=>{
  const spoken=[],platform={SpeechSynthesisUtterance:class{constructor(text){this.text=text}},
    speechSynthesis:{getVoices:()=>[{name:'Samantha',lang:'en-US',localService:true}],cancel(){},speak:u=>spoken.push(u)}};
  const first='I will check cash flows. ';
  const rest='I will compare several quarters of receipts with corresponding reported earnings, inventory movements and working capital. ';
  const text=first+rest;
  speakReply(text,{lang:'en-US',platform});
  assert.equal(spoken.length,1);assert.equal(spoken[0].text.trim(),first.trim());assert.equal(spoken[0].rate,1.12);
  const stale=spoken[0].onstart;stopSpeaking(platform);stale();assert.equal(spoken.length,1);
  speakReply(text,{lang:'en-US',platform});const lead=spoken[1];lead.onstart();lead.onstart();
  assert.equal(spoken.length,3);assert.equal(spoken[2].text.trim(),rest.trim());
  spoken[2].onend();
});

test('a device that loads its local voices late speaks once, and a stopped wait cannot restart narration',()=>{
  const events=new EventTarget(),spoken=[],available=[];
  const platform={setTimeout,clearTimeout,SpeechSynthesisUtterance:class{constructor(text){this.text=text}},speechSynthesis:{
    getVoices:()=>available,speak:u=>spoken.push(u),cancel(){},
    addEventListener:(...args)=>events.addEventListener(...args),removeEventListener:(...args)=>events.removeEventListener(...args)
  }};
  const states=[];
  speakReply('先听一句。',{lang:'zh-CN',platform,onState:e=>states.push(e.state)});
  stopSpeaking(platform);events.dispatchEvent(new Event('voiceschanged'));
  assert.equal(spoken.length,0);
  speakReply('继续。',{lang:'zh-CN',platform,onState:e=>states.push(e.state)});
  available.push({name:'Tingting',lang:'zh-CN',localService:true});
  events.dispatchEvent(new Event('voiceschanged'));events.dispatchEvent(new Event('voiceschanged'));
  assert.equal(spoken.length,1);assert.equal(spoken[0].text,'继续。');stopSpeaking(platform);
});
