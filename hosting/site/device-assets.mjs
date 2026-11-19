import {assetPrefix,deviceFiles} from '../../web/device-dictation-files.mjs';

// The only outbound requests here are public GETs for these exact release artifacts.
// No browser headers, voice data, credentials, or caller-supplied upstream URLs are forwarded.
export async function serveDeviceAsset(request,reserveBytes){
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const url=new URL(request.url),file=deviceFiles.get(url.pathname.slice(assetPrefix.length));
  if(!file||url.search)return new Response(null,{status:404});
  const headers={'Content-Type':file.type,'Content-Length':String(file.size),'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'};
  if(request.method==='HEAD')return new Response(null,{headers});
  if(reserveBytes && !reserveBytes(file.size))return Response.json({error:'device-download-capacity'},{status:429,headers:{'Cache-Control':'no-store'}});
  try{
    const upstream=await fetch(file.url,{method:'GET',credentials:'omit',referrerPolicy:'no-referrer',signal:request.signal,cf:{cacheEverything:true,cacheTtl:86400}});
    if(!upstream.ok || !upstream.body)throw Error('release-unavailable');
    if(file.type==='text/javascript'){
      const source=await upstream.arrayBuffer();
      if(source.byteLength!==file.size)throw Error('release-size');
      const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',source)),b=>b.toString(16).padStart(2,'0')).join('');
      if(sha!==file.sha256)throw Error('release-integrity');
      return new Response(source,{headers});
    }
    // The recognizer validates body size and SHA-256 before WASM or model bytes can execute.
    return new Response(upstream.body,{headers});
  }catch{return new Response(null,{status:502,headers:{'Cache-Control':'no-store'}});}
}
