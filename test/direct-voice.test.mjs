import assert from 'node:assert/strict';
import test from 'node:test';
import {createDirectApp,createHttpAdapter} from '../hosting/site/direct-server.mjs';
import {encodePcmWave} from '../web/voice.mjs';
import {MAX_WAV_BYTES} from '../core/local-voice.mjs';
import {attachCookie,visitorContext} from '../hosting/site/visitors.mjs';

test('direct guest voice requires its own session and origin, limits audio and isolates guest budgets', async(t)=>{
  const origin='https://studio.example';
  const voice={local:true,languages:['en-US','zh-CN'],source:'test recognizer',maxSeconds:30};
  let releaseRecognition;
  let block=false;
  const siteWorker={async fetch(request,env){
    const visitor=await visitorContext(request,env.DB,true);
    if(new URL(request.url).pathname==='/fixture'){
      const messages=[{role:'assistant',text:'A private answer',responseId:'private-receipt'}];
      await env.DB.prepare('INSERT INTO conversations(owner,topic,revision,content) VALUES(?,?,1,?)').bind(visitor.owner,'studio',JSON.stringify({messages})).run();
    }
    return attachCookie(Response.json({guest:true}),visitor);
  }};
  const app=await createDirectApp({
    database:':memory:',origin,credential:'',
    siteWorker,playbackLanguages:async()=>['en-US'],narrate:async(text,language)=>{
      assert.equal(text,'A private answer');assert.equal(language,'en-US');
      return Buffer.from(encodePcmWave([new Float32Array(512)],16000));
    },
    voiceStatus:async()=>voice,
    recognize:async (_wave,language)=>{
      if(block)await new Promise(resolve=>{releaseRecognition=resolve;});
      return {text:'test transcript',language};
    }
  });
  const server=createHttpAdapter(app,origin);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));app.close();});
  const base='http://127.0.0.1:'+server.address().port;
  const audio=Buffer.from(encodePcmWave([new Float32Array(16000)],16000));
  const post=(cookie,overrides={},body=audio)=>fetch(base+'/api/voice/transcribe',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'audio/wav','X-Voice-Language':'zh-CN',...overrides},body});
  const guest=async()=>(await fetch(base+'/api/session')).headers.getSetCookie()[0].split(';')[0];
  assert.deepEqual(await (await fetch(base+'/api/voice/status')).json(),{...voice,replyPlayback:true,replyLanguages:['en-US']});
  const one=await guest(),two=await guest();
  const other=await guest();
  await fetch(base+'/fixture',{headers:{Cookie:other}});
  const playback=(cookie,params,requestOrigin=origin)=>fetch(base+'/api/voice/reply',{method:'POST',headers:{Origin:requestOrigin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(params)});
  const receipt={topic:'studio',responseId:'private-receipt'};
  assert.equal((await playback(other,receipt,'https://other.example')).status,403);
  assert.equal((await playback('',receipt)).status,401);
  assert.equal((await playback(one,receipt)).status,404);
  assert.equal((await playback(other,{...receipt,text:'Please speak a different message'})).status,400);
  const spoken=await playback(other,receipt);
  assert.equal(spoken.headers.get('Content-Type'),'audio/wav');
  assert.equal(spoken.headers.get('Cache-Control'),'private, no-store');
  assert.equal(Buffer.from(await spoken.arrayBuffer()).toString('ascii',0,4),'RIFF');
  assert.equal((await post('')).status,401);
  assert.equal((await post(one,{Origin:'https://another.example'})).status,403);
  assert.equal((await post(one,{'Content-Type':'application/octet-stream'})).status,415);
  assert.equal((await post(one,{'X-Voice-Language':'invalid'})).status,400);
  assert.equal((await post(one,{},Buffer.alloc(47))).status,400);
  assert.equal((await post(one,{},Buffer.alloc(MAX_WAV_BYTES+1))).status,413);
  block=true;
  const first=post(one);
  while(!releaseRecognition)await new Promise(resolve=>setImmediate(resolve));
  try{assert.equal((await post(two)).status,429);}
  finally{block=false;releaseRecognition();}
  assert.equal((await first).status,200);
  for(let used=1;used<24;used++)assert.equal((await post(one)).status,200);
  assert.equal((await post(one)).status,429);
  assert.equal((await (await post(two,{'X-Voice-Language':'en-US'})).json()).language,'en-US');
});
