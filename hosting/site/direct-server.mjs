import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {openStore} from '../../core/store.mjs';
import {localVoiceStatus, MAX_WAV_BYTES, replyVoiceLanguages, synthesizeManagerReply, transcribeLocalWave, validateWave, VoiceUnavailable} from '../../core/local-voice.mjs';
import {visitorContext} from './visitors.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),accountCookie='__Host-fundteams-account';
const json=(val,status=200)=>Response.json(val,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function safeReturn(value,origin) {
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//'))return '/studio';
  try{const target=new URL(value,origin);return target.origin===origin && ['/','/studio','/funds','/membership.html'].includes(target.pathname)?target.pathname+target.search:'/studio';}catch{return '/studio';}
}
const escaped=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function accountPage(ret,out=false,message='') {
 const title=out?'退出账户 · Sign out':'跨设备保存 · Save across devices';
 const form=out?'<button name="mode" value="logout">退出 · Sign out</button>':'<label>邮箱 · Email <input name="email" type="email" autocomplete="email" maxlength="254" required></label><label>密码（至少 12 个字符） · Password<input type="password" name="password" autocomplete="current-password" minlength="12" maxlength="128" required></label><button name="mode" value="login">登录 · Sign in</button><button name="mode" value="register">注册 · Register</button>';
 return new Response('<!doctype html><html lang="zh-CN" data-identity="signature"><meta charset="utf-8"><link rel="stylesheet" href="/brand.css"><link rel="icon" href="/assets/signature-mark.svg" type="image/svg+xml"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>body{max-width:430px;margin:9vh auto;padding:20px;color:#282828;font:16px/1.6 system-ui;background:#fff}h1{font-weight:500}label,input{display:block}input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #aaa;border-radius:12px;font:inherit}label,button{margin:12px 0}button,a{font:inherit;color:inherit}button{padding:9px 18px;margin-right:8px;border-radius:24px;border:1px solid #999;background:#fff}</style><main><a href="'+escaped(ret)+'">‹ 返回 · Back</a><h1>'+title+'</h1><p><img src="/assets/signature-mark.svg" width="22" height="22" alt=""> Fund Edition</p>'+(message?'<p role="alert">'+escaped(message)+'</p>':'')+'<form method="post" action="/account/session"><input type="hidden" name="return_to" value="'+escaped(ret)+'">'+form+'</form></main></html>',
 {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'same-origin'}});
}
function redirect(path,cookie) {const headers={'Location':path,'Cache-Control':'no-store'};if(cookie)headers['Set-Cookie']=cookie;return new Response(null,{status:303,headers});}
const accountToken=req=>req.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(accountCookie+'='))?.slice(accountCookie.length+1);
function bindings(db) {
 class Statement{
  constructor(sql,params=[]){this.sql=sql;this.params=params;}
  bind(...params){return new Statement(this.sql,params);}
  async first(){return db.prepare(this.sql).get(...this.params);}
  async all(){return {results:db.prepare(this.sql).all(...this.params)};}
  perform(){return {meta:{changes:db.prepare(this.sql).run(...this.params).changes}};}
  async run(){return this.perform();}
 }
 return {prepare:sql=>new Statement(sql),batch:async commands=>{
  // No await while the synchronous SQLite transaction is open.
  db.exec('BEGIN IMMEDIATE');try{const rows=commands.map(s=>s.perform());db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}
 }};
}
export async function createDirectApp({database,origin,credential,monthlyTasks,monthlyDeviceMiB=4096,build=resolve(root,'.fundroom/direct-app/dist/server/index.js'),siteWorker,voiceStatus=localVoiceStatus,recognize=transcribeLocalWave,playbackLanguages=replyVoiceLanguages,narrate=synthesizeManagerReply}) {
 const site=new URL(origin);if(site.protocol!=='https:'||site.origin!==origin)throw Error('Set the exact public HTTPS origin.');
 if(!/^\d{1,7}$/.test(String(monthlyDeviceMiB)))throw Error('Set a nonnegative monthly device download allowance in MiB.');
 const monthlyDeviceBytes=Number(monthlyDeviceMiB)*1024*1024;
 const worker=siteWorker || (await import(pathToFileURL(build))).default;
 if(database!==':memory:')mkdirSync(dirname(database),{recursive:true});
 const accounts=openStore(database===':memory:'?':memory:':database+'.accounts.sqlite');
 const sqlite=new DatabaseSync(database);sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS applied_direct_migrations(tag TEXT PRIMARY KEY)');
 const migrations=new URL('./drizzle/',import.meta.url),journal=JSON.parse(readFileSync(new URL('meta/_journal.json',migrations)));
 for(const {tag} of journal.entries){
  if(sqlite.prepare('SELECT 1 FROM applied_direct_migrations WHERE tag=?').get(tag))continue;
  sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(readFileSync(new URL(tag+'.sql',migrations),'utf8'));sqlite.prepare('INSERT INTO applied_direct_migrations VALUES(?)').run(tag);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
 }
 const env={DB:bindings(sqlite),FUNDROOM_HR_KEY:credential,FUNDROOM_DIRECT_APPLICATION_SERVER:true,FUNDROOM_MODEL_30D_LIMIT:monthlyTasks};
 sqlite.exec('CREATE TABLE IF NOT EXISTS device_transfer_budget(month TEXT PRIMARY KEY, reserved INTEGER NOT NULL)');
 const reserveDownload=sqlite.prepare(`INSERT INTO device_transfer_budget(month,reserved)
   SELECT ?,? WHERE ?<=? ON CONFLICT(month) DO UPDATE SET reserved=reserved+excluded.reserved
   WHERE reserved+excluded.reserved<=?`);
 env.reserveDeviceBytes=size=>reserveDownload.run(new Date().toISOString().slice(0,7),size,size,monthlyDeviceBytes,monthlyDeviceBytes).changes===1;
 sqlite.exec('CREATE TABLE IF NOT EXISTS direct_voice_usage(hour INTEGER NOT NULL, owner TEXT NOT NULL, turns INTEGER NOT NULL, PRIMARY KEY(hour,owner))');
 const [recognitionStatus,availableVoices]=await Promise.all([voiceStatus(),playbackLanguages()]);
 const voice={...recognitionStatus,replyPlayback:availableVoices.length>0,replyLanguages:availableVoices};
 let recognizing = false;
 let speaking = false;
 function reserveVoiceTurn(owner) {
   const hour=Math.floor(Date.now()/3600000);
   sqlite.prepare('DELETE FROM direct_voice_usage WHERE hour < ?').run(hour);
   const reserved=sqlite.prepare(`INSERT INTO direct_voice_usage(hour,owner,turns)
      SELECT ?,?,1 WHERE (SELECT COALESCE(SUM(turns),0) FROM direct_voice_usage WHERE hour=?)<120
        AND COALESCE((SELECT turns FROM direct_voice_usage WHERE hour=? AND owner=?),0)<24
      ON CONFLICT(hour,owner) DO UPDATE SET turns=turns+1`).run(hour,owner,hour,hour,owner);
   return reserved.changes===1;
 }
 async function readReplyAloud(request) {
   if(request.headers.get('Origin')!==origin)return json({error:'origin'},403);
   if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return json({error:'json-required'},415);
   const visitor=await visitorContext(request,env.DB,false);
   if(!visitor)return json({error:'reload-session'},401);
   const body=await request.json().catch(()=>null);
   if(!body || typeof body.topic!=='string' || body.topic.length>100 || typeof body.responseId!=='string' || body.responseId.length>180 || Object.keys(body).some(k=>!['topic','responseId'].includes(k)))return json({error:'invalid-reply'},400);
   const record=sqlite.prepare('SELECT content FROM conversations WHERE owner=? AND topic=?').get(visitor.owner,body.topic);
   const reply=record && JSON.parse(record.content).messages.find(message=>message.role==='assistant' && message.responseId===body.responseId);
   if(!reply?.text)return json({error:'reply-not-found'},404);
   const language=['zh-CN','en-US'].includes(reply.language)?reply.language:/[\u3400-\u9fff]/u.test(reply.text)?'zh-CN':'en-US';
   if(!availableVoices.includes(language))return json({error:'voice-unavailable'},503);
   if(reply.text.length>2400)return json({error:'reply-too-long'},422);
   if(speaking || !reserveVoiceTurn(visitor.owner))return json({error:'voice-capacity'},429);
   speaking=true;
   try {
     const audio=await narrate(reply.text,language);
     return new Response(audio,{headers:{'Content-Type':'audio/wav','Content-Length':String(audio.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
   } catch(error) {
     if(error instanceof VoiceUnavailable)return json({error:error.message},error.status);
     throw error;
   } finally { speaking=false; }
 }
 async function transcribe(request) {
   if(request.headers.get('Origin')!==origin)return json({error:'origin'},403);
   if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='audio/wav')return json({error:'audio/wav required'},415);
   const language=request.headers.get('X-Voice-Language');
   if(!['zh-CN','en-US'].includes(language))return json({error:'unsupported-language'},400);
   const visitor=await visitorContext(request,env.DB,false);
   if(!visitor)return json({error:'reload-session'},401);
   if(!voice.local || !voice.languages.includes(language))return json({error:'voice-unavailable'},503);
   if(recognizing)return json({error:'voice-busy'},429);
   const audio=Buffer.from(await request.arrayBuffer());
   try {
     validateWave(audio);
     if(recognizing)return json({error:'voice-busy'},429);
     if(!reserveVoiceTurn(visitor.owner))return json({error:'voice-quota'},429);
     recognizing=true;
     try { return json(await recognize(audio,language,voice)); }
     finally { recognizing=false; }
   } catch(error) {
     if(error instanceof VoiceUnavailable)return json({error:error.message},error.status);
     throw error;
   }
 }
 async function dispatch(request,clientIp='loopback'){
  const url=new URL(request.url);if(url.origin!==origin)return json({error:'origin'},403);
  const headers=new Headers(request.headers);for(const k of [...headers.keys()])if(k.startsWith('oai-authenticated-')||k==='cf-connecting-ip'||k==='x-forwarded-for')headers.delete(k);
  headers.set('CF-Connecting-IP',clientIp);
  const token=accountToken(request),account=accounts.accounts.authenticate(token);
  const ret=safeReturn(url.searchParams.get('return_to'),origin);
  if(request.method==='GET' && url.pathname==='/signin-with-chatgpt')return redirect('/account?return_to='+encodeURIComponent(ret));
  if(request.method==='GET' && ['/account','/signout-with-chatgpt'].includes(url.pathname))return accountPage(ret,url.pathname.startsWith('/signout'));
  if(request.method==='POST' && url.pathname==='/account/session'){
   if(headers.get('Origin')!==origin)return json({error:'origin'},403);
   if(!headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded'))return json({error:'form'},415);
   const text=await request.text();if(text.length>2048)return json({error:'size'},413);
   const form=new URLSearchParams(text),returnTo=safeReturn(form.get('return_to'),origin),mode=form.get('mode');
   if(mode==='logout'){accounts.accounts.revoke(token);return redirect(returnTo,accountCookie+'=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');}
   if(!['login','register'].includes(mode)||account)return json({error:'account-state'},409);
   try{
    const auth=await accounts.accounts.enter(mode,{email:form.get('email'),password:form.get('password')},{ip:clientIp,initialState:()=>({funds:[]})});
    return redirect(returnTo,accountCookie+'='+auth.token+'; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000');
   }catch(e){if(!e.status)throw e;return accountPage(returnTo,false,'未能登录或注册。请核对输入后重试。 · Could not sign in or register. Check your details and retry.');}
  }
  if(account){headers.set('oai-authenticated-user-id',account.user.id);headers.set('oai-authenticated-user-email',account.user.email);}
  if(url.pathname==='/api/voice/status' && request.method==='GET'){
    const base=await worker.fetch(new Request(url),env);
    const publicVoice=base.ok?await base.json().catch(()=>({})):{};
    return json({...voice,...(publicVoice.deviceDictation?{deviceDictation:publicVoice.deviceDictation}:{})});
  }
  if(url.pathname==='/api/voice/transcribe' && request.method==='POST')return transcribe(new Request(request,{headers}));
  if(url.pathname==='/api/voice/reply' && request.method==='POST')return readReplyAloud(new Request(request,{headers}));
  // Inbound identity headers were discarded. The only identity reaching product logic comes from this application's validated session.
  const response=await worker.fetch(new Request(request,{headers}),env);
  if(response.headers.get('Content-Type')?.startsWith('text/html') && response.headers.has('Content-Security-Policy')){
   const pageHeaders=new Headers(response.headers);
   pageHeaders.set('Content-Security-Policy',response.headers.get('Content-Security-Policy')+"; media-src 'self' blob:");
   return new Response(response.body,{status:response.status,headers:pageHeaders});
  }
  return response;
 }
 return {dispatch,healthy(){return Boolean(sqlite.prepare('SELECT 1 FROM applied_direct_migrations LIMIT 1').get());},close(){sqlite.close();accounts.close();}};
}
export function createHttpAdapter(app,origin){
 return createServer({requestTimeout:30_000,headersTimeout:15_000},async(req,res)=>{
   const disconnect=new AbortController();
   res.once('close',()=>{if(!res.writableFinished)disconnect.abort();});
   try{
    if(req.url==='/healthz'&&['GET','HEAD'].includes(req.method)){
      const ok=app.healthy();res.writeHead(ok?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?undefined:JSON.stringify({ready:ok}));return;
    }
    const authority=(req.headers.host||'').toLowerCase(),port=req.socket.localPort;
    const allowed=new Set([new URL(origin).host,'127.0.0.1:'+port,'localhost:'+port,'[::1]:'+port]);
    if(!allowed.has(authority)){res.writeHead(403).end();return;}
    if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400).end();return;}
    const isVoice=req.method==='POST' && new URL(req.url,origin).pathname==='/api/voice/transcribe';
    const limit=isVoice?MAX_WAV_BYTES:20000;
    if(Number(req.headers['content-length'])>limit){res.writeHead(413).end();return;}
    const content=[];let length=0;for await(const piece of req){length+=piece.length;if(length>limit){res.writeHead(413).end();return;}content.push(piece);}
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
    const body=content.length?Buffer.concat(content):undefined;
    const response=await app.dispatch(new Request(new URL(req.url,origin),{method:req.method,headers,signal:disconnect.signal,...(body?{body}:{})}),req.socket.remoteAddress);
    res.statusCode=response.status;for(const [key,value] of response.headers)if(key!=='set-cookie')res.setHeader(key,value);
    const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();
   }catch{if(res.destroyed)return;if(res.headersSent){res.destroy();return;}res.writeHead(500,{'Cache-Control':'no-store'}).end();}
 });
}
export async function startDirectServer(env=process.env){
 const origin=env.FUNDROOM_PUBLIC_ORIGIN||(env.RAILWAY_PUBLIC_DOMAIN?'https://'+env.RAILWAY_PUBLIC_DOMAIN:null),credential=env.HARNESSROUTER_API_KEY;
 if(!origin||!credential)throw Error('Set the HTTPS origin and the production server runtime credential.');
 const port=Number(env.PORT||env.FUNDROOM_DIRECT_PORT||3348),host=env.FUNDROOM_DIRECT_BIND||'127.0.0.1';
 if(!Number.isInteger(port)||port<1||port>65535||!['127.0.0.1','0.0.0.0'].includes(host))throw Error('Set a valid application port and bind address.');
 const app=await createDirectApp({database:resolve(root,env.FUNDROOM_DIRECT_DB||'.fundroom/direct-public.sqlite'),origin,credential,monthlyTasks:env.FUNDROOM_MODEL_30D_LIMIT,monthlyDeviceMiB:env.FUNDROOM_DEVICE_DOWNLOAD_MIB_PER_MONTH,build:env.FUNDROOM_DIRECT_BUNDLE});
 const server=createHttpAdapter(app,origin);
 server.listen(port,host,()=>console.log('Fund Edition direct application listening on '+host+':'+port));
 server.on('close',()=>app.close());
 return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const server=await startDirectServer();
 process.once('SIGTERM',()=>server.close());
}
