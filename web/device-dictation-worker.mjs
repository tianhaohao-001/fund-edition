import {assetPrefix,deviceDictation,deviceFiles} from './device-dictation-files.mjs';

const network=fetch.bind(self);
const cacheName='fund-edition-on-device-speech-v1';
let pipeline,language;
const hex=buffer=>Array.from(new Uint8Array(buffer),n=>n.toString(16).padStart(2,'0')).join('');

async function readAsset(response,file,onChunk) {
  if(!response.ok||!response.body)throw Error('device-download-unavailable');
  const bytes=new Uint8Array(file.size),reader=response.body.getReader();
  let length=0;
  for(;;){
    const {value,done}=await reader.read();if(done)break;
    if(length+value.length>bytes.length){await reader.cancel();throw Error('asset-length');}
    bytes.set(value,length);length+=value.length;onChunk?.(length);
  }
  if(length!==file.size||hex(await crypto.subtle.digest('SHA-256',bytes))!==file.sha256)throw Error('asset-integrity');
  return bytes;
}

async function prepare(lang) {
  // iOS and other low-memory browsers keep only one recognition worker. Inference never makes network requests.
  if(!WebAssembly.validate(Uint8Array.from([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])))throw Error('device-simd-unavailable');
  const cache=await self.caches?.open(cacheName).catch(()=>null),assets=new Map();
  let loaded=0,lastUpdate=0;
  function progress(bytes,always=false){
    if(!always && performance.now()-lastUpdate<90)return;
    lastUpdate=performance.now();postMessage({type:'progress',loaded:bytes,total:deviceDictation.downloadBytes});
  }
  progress(0,true);
  for(const [name,file] of deviceFiles){
    const path=assetPrefix+name;
    let bytes;
    const cached=await cache?.match(path).catch(()=>null);
    if(cached){try{bytes=await readAsset(cached,file);}catch{await cache.delete(path).catch(()=>{});}}
    if(!bytes){
      bytes=await readAsset(await network(path,{credentials:'omit'}),file,count=>progress(loaded+count));
      if(cache)await cache.put(path,new Response(bytes,{headers:{'Content-Type':file.type}})).catch(()=>{});
    }
    assets.set(path,{bytes,type:file.type});loaded+=file.size;progress(loaded,true);
  }
  // Dynamic import is served from a content-verified same-origin response. No blob: or third-party script origin.
  const library=await import(assetPrefix+'transformers.min.js');
  self.fetch=async(request)=>{
    const url=new URL(typeof request==='string'?request:request.url||request,self.location.href);
    const asset=url.origin===location.origin?assets.get(url.pathname):null;
    return asset?new Response(asset.bytes,{headers:{'Content-Type':asset.type}}):new Response(null,{status:404});
  };
  const env=library.env;
  env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=assetPrefix;env.useBrowserCache=false;
  env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;env.backends.onnx.wasm.wasmPaths=assetPrefix;
  pipeline=await library.pipeline('automatic-speech-recognition','model',{quantized:true});
  language=lang==='zh-CN'?'chinese':'english';
  assets.clear();
}

function hasAudibleFrames(samples) {
  // A silent capture must never be decoded into a plausible-sounding Whisper phrase.
  let audible=0;
  for(let offset=0;offset+320<=samples.length;offset+=320){
    let energy=0;
    for(let i=offset;i<offset+320;i++)energy+=samples[i]*samples[i];
    if(energy/320>0.000004 && ++audible>=3)return true;
  }
  return false;
}

self.onmessage=async({data})=>{
  try{
    if(data.type==='load'){await prepare(data.lang);postMessage({type:'ready'});return;}
    if(data.type!=='transcribe'||!pipeline||!(data.samples instanceof Float32Array)||data.samples.length>480000)throw Error('invalid-recording');
    if(!hasAudibleFrames(data.samples))throw Error('no-speech');
    const result=await pipeline(data.samples,{language,task:'transcribe',max_new_tokens:160});
    const text=String(result.text||'').trim();if(!text)throw Error('no-speech');
    postMessage({type:'transcribed',value:text});
  }catch(error){postMessage({type:'error',error:error?.message||'device-dictation-failed'});}
};
