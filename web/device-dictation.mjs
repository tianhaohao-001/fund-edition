export async function openDeviceDictation({lang,onProgress=()=>{},signal}={}) {
  if(!['zh-CN','en-US'].includes(lang))throw Error('unsupported-language');
  signal?.throwIfAborted();
  const worker=new Worker('/device-dictation-worker.mjs',{type:'module'});
  let pending,closed=false;
  function destroy() {
    if(closed)return;
    closed=true;worker.terminate();signal?.removeEventListener('abort',destroy);
    pending?.reject(new DOMException('Dictation cancelled','AbortError'));pending=null;
  }
  signal?.addEventListener('abort',destroy,{once:true});
  function command(payload,transfer=[]) {
    if(closed)return Promise.reject(new DOMException('Dictation closed','AbortError'));
    if(pending)return Promise.reject(Error('busy'));
    return new Promise((resolve,reject)=>{
      pending={resolve,reject};
      try{worker.postMessage(payload,transfer);}catch(err){pending=null;reject(err);}
    });
  }
  worker.onmessage=({data})=>{
    if(data.type==='progress'){onProgress(data);return;}
    const operation=pending;pending=null;
    if(data.error)operation?.reject(Error(data.error));else operation?.resolve(data.value);
  };
  worker.onerror=()=>{const operation=pending;pending=null;destroy();operation?.reject(Error('device-runtime-unavailable'));};
  try{await command({type:'load',lang});}catch(err){destroy();throw err;}
  return {destroy,transcribe(samples){
    if(!(samples instanceof Float32Array)||samples.length<1||samples.length>480000)return Promise.reject(Error('invalid-recording'));
    const copy=samples.slice();return command({type:'transcribe',samples:copy},[copy.buffer]);
  }};
}
