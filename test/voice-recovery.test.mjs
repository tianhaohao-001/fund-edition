import assert from 'node:assert/strict';
import test from 'node:test';
import {bindVoice,createLocalVoiceController} from '../web/voice.mjs';

function recorderPlatform({requestMicrophone}={}) {
  const processors=[];
  const tracks=[];
  const platform={
    navigator:{mediaDevices:{getUserMedia:async()=>{
      await requestMicrophone?.();
      const track={stopped:false,stop(){this.stopped=true;}};
      tracks.push(track);
      return {getTracks:()=>[track]};
    }}},
    AudioContext:class {
      sampleRate=16000;
      createMediaStreamSource(){return {connect(){}};}
      createGain(){return {gain:{value:1},connect(){}};}
      createScriptProcessor(){
        const processor={connect(){},disconnect(){}};
        processors.push(processor);
        return processor;
      }
      async resume(){}
      async close(){}
    },
    setTimeout:()=>1,clearTimeout(){},
  };
  const capture=(index,values)=>processors[index].onaudioprocess({inputBuffer:{getChannelData:()=>Float32Array.from(values)}});
  return {platform,capture,tracks};
}

test('a microphone can retry after permission denial and an empty recording',async()=>{
  let attempts=0;
  const recorder=recorderPlatform({requestMicrophone(){
    if(++attempts===1)throw Object.assign(new Error('Denied'),{name:'NotAllowedError'});
  }});
  const faults=[],words=[];
  const mic=createLocalVoiceController({platform:recorder.platform,lang:'en-US',
    transcribeDevice:async()=> 'A fresh recording',onError:e=>faults.push(e.code),onTranscript:r=>words.push(r.text)});
  assert.equal(await mic.start(),false);
  assert.equal(mic.state,'error');
  assert.equal(await mic.start(),true);
  await mic.stop();
  assert.equal(mic.state,'error');
  assert.equal(await mic.start(),true);
  recorder.capture(1,[.25,.5]);
  await mic.stop();
  assert.deepEqual(faults,['NotAllowedError','no-speech']);
  assert.deepEqual(words,['A fresh recording']);
  assert.equal(mic.state,'idle');
  assert.ok(recorder.tracks.every(track=>track.stopped));
  mic.destroy();
});

test('a cancelled transcription and stale audio callbacks cannot erase or enter a new recording',async()=>{
  const recorder=recorderPlatform();
  const first=Promise.withResolvers();
  const recorded=[],words=[];
  const mic=createLocalVoiceController({platform:recorder.platform,transcribeDevice:async samples=>{
    recorded.push([...samples]);
    return recorded.length===1?first.promise:'Second recording';
  },onTranscript:r=>words.push(r.text)});
  await mic.start();
  recorder.capture(0,[.25]);
  const stopped=mic.stop();
  mic.cancel();
  await mic.start();
  recorder.capture(1,[.5]);
  recorder.capture(0,[-1]);
  first.resolve('Cancelled recording');
  await stopped;
  recorder.capture(1,[.75]);
  await mic.stop();
  assert.deepEqual(recorded,[[.25],[.5,.75]]);
  assert.deepEqual(words,['Second recording']);
  assert.equal(mic.state,'idle');
  assert.ok(recorder.tracks.every(track=>track.stopped));
  mic.destroy();
});

test('audio from a completed capture cannot enter the next recording',async()=>{
  const recorder=recorderPlatform();
  const recorded=[];
  const mic=createLocalVoiceController({platform:recorder.platform,transcribeDevice:async samples=>{
    recorded.push([...samples]);
    return 'Recorded words';
  }});
  await mic.start();
  recorder.capture(0,[.25]);
  await mic.stop();
  await mic.start();
  recorder.capture(0,[-1]);
  recorder.capture(1,[.5]);
  await mic.stop();
  assert.deepEqual(recorded,[[.25],[.5]]);
  mic.destroy();
});

test('Escape cancels microphone setup before the route check has returned',async()=>{
  const route=Promise.withResolvers(),listeners=new Map();
  const input={value:'My original draft',dispatchEvent(){}};
  const button={dataset:{voiceTarget:'prompt',voiceLang:'en-US'},closest(){return this;},
    setAttribute(){},removeAttribute(){},toggleAttribute(){},querySelector(){},getAttribute(){return 'Speak';}};
  const root={addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),
    contains:value=>value===input||value===button,getElementById:()=>input};
  let started=0;
  const platform={fetch:()=>route.promise,SpeechRecognition:class{
    start(){started++;}abort(){}
  },clearTimeout(){}};
  const unbind=bindVoice(root,{platform});
  const click=listeners.get('click')({target:button,preventDefault(){}});
  assert.equal(button.dataset.voiceState,'starting');
  listeners.get('keydown')({key:'Escape'});
  route.resolve({ok:true,json:async()=>({local:false})});
  await click;
  assert.equal(started,0);
  assert.equal(button.dataset.voiceState,'idle');
  assert.equal(input.value,'My original draft');
  unbind();
});
