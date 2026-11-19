import { validBuffettQuestion, explainDecision } from '../../core/buffett-followup.mjs';
import { draftResponse } from './drafts.mjs';
import { attachCookie, chooseSpace, listSpaces, visitorContext } from './visitors.mjs';
import { confirmedTeam, teamError, teamTurn } from './team-workspace.mjs';
import { showcase } from './showcase.mjs';
import { designConversationTurn, newGuide, proposeCatalogReply, prepareTeamBlueprint, managerOnlyBlueprint } from '../../core/conversation.mjs';
import { suggestedAnswers } from '../../web/studio-answers.mjs';
import { studioMembership } from '../../core/membership.mjs';
import { CATALOG } from '../../web/catalog-data.mjs';
import { runReplicaStudy } from '../../web/catalog-replica.mjs';
import { researchBrief } from '../../web/strategy-playbook.mjs';
import { assets } from './generated-assets.mjs';
import { assetPrefix,deviceDictation } from '../../web/device-dictation-files.mjs';
import { serveDeviceAsset } from './device-assets.mjs';
import { modelBudgetArgs, modelBudgetWhere, monthlyTaskLimit } from './model-budget.mjs';

const harnessId = 'chrn_642e1a7bf73e478686a90bb77fda796a';
function directRuntimeAvailable(env){
  // The model gateway requires a direct application-server connection. This flag is set only by the direct server adapter.
  return Boolean(env.FUNDROOM_DIRECT_APPLICATION_SERVER === true && env.FUNDROOM_HR_KEY && monthlyTaskLimit(env)>0);
}
async function availability(env){
  if(env.FUNDROOM_DIRECT_APPLICATION_SERVER===true && monthlyTaskLimit(env)===0)return {state:'temporarily-unavailable',reason:'operator-paused',at:null};
  return directRuntimeAvailable(env)?{state:'configured',at:null}:{state:'temporarily-unavailable',reason:'provider-direct-server-required',at:'2026-11-18T10:47:51.711Z'};
}
const runtimeFor=env=>({env:{HARNESSROUTER_API_KEY:env.FUNDROOM_HR_KEY,HARNESSROUTER_HARNESS_ID:harnessId,HARNESSROUTER_MODEL:'deepseek-v4.1-flash',FUNDROOM_ENABLE_HARNESS:'true'}});
const asLang = (value) => value === 'en-US' ? 'en-US' : 'zh-CN';
const policy = { 'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'self'",'Permissions-Policy':'camera=(),geolocation=(),microphone=(self)' };
const json = (body, status=200) => Response.json(body,{ status, headers:{...policy,'Cache-Control':'no-store',Vary:'Cookie'} });
const fail = (status, code) => json({ error:code }, status);
const byId = (id) => CATALOG.find((item) => item.id === id);
function localized(item, language) {
  const copy = language === 'en-US' ? item.localized?.['en-US'] : null;
  const { id, ticker, section, officialName, personName, personNameZh, researchedAt } = item;
  return { id,ticker,section,officialName:officialName || '',name:copy?.name || item.name,personName:language==='en-US'?personName:personNameZh,
    summary:copy?.summary || item.summary,mandate:copy?.mandate || item.mandate,limitations:copy?.limitations || item.limitations,category:copy?.category||item.category,risk:copy?.risk||item.risk,researchStatus:copy?.researchStatus||item.researchStatus,assets:item.assets||null,
    researchedAt, sources:item.sources.map((s,i)=>({url:s.url,title:copy?.sourceTitles?.[i] || s.title})) };
}
function studyFor(item, language) {
  const research=runReplicaStudy(item.id),brief=researchBrief(research,language);
  return { ...localized(item,language), evidence:brief.checks, asOf:brief.referenceDate, scope:brief.scope,status:research.status,metrics:research.metrics||null,holdout:research.holdout||null,series:(research.points||[]).filter(p=>Number.isFinite(p.target)&&Number.isFinite(p.replica)).map(({date,target,replica})=>({date,target,replica})) };
}
function assetFor(path,request) {
  const key = ['/','/studio','/funds'].includes(path) ? '/app.html' : path;
  const asset = Object.hasOwn(assets,key) ? assets[key] : undefined;
  if (!asset) return null;
  const [type,value,binary]=asset;
  if(key==='/device-dictation-worker.mjs'){
    // WebKit applies worker-src to an ES module worker's own same-origin imports.
    return new Response(value,{headers:{...policy,'Content-Type':type,'Cache-Control':'no-cache','Content-Security-Policy':"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'"}});
  }
  if(type==='video/mp4' || type==='audio/wav'){
    const total=(value.length/4)*3-(value.endsWith('==')?2:value.endsWith('=')?1:0);
    const headers={...policy,'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600'};
    const range=request.headers.get('range');
    if(!range)return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(value),c=>c.charCodeAt(0)),{headers:{...headers,'Content-Length':String(total)}});
    const parts=/^bytes=(\d+)-(\d*)$/.exec(range);
    if(!parts)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+total}});
    const from=Number(parts[1]),to=parts[2]?Math.min(total-1,Number(parts[2])):total-1;
    if(from>to||from>=total)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+total}});
    // Base64 quartets cover groups of three bytes. A metadata or range probe
    // should not decode a whole recording just to return a few requested bytes.
    let chunk=null;
    if(request.method!=='HEAD'){
      const group=Math.floor(from/3);
      const encoded=value.slice(group*4,(Math.floor(to/3)+1)*4);
      const start=from-group*3;
      chunk=Uint8Array.from(atob(encoded).slice(start,start+to-from+1),c=>c.charCodeAt(0));
    }
    return new Response(chunk,{status:206,headers:{...headers,'Content-Range':'bytes '+from+'-'+to+'/'+total,'Content-Length':String(to-from+1)}});
  }
  return new Response(request.method==='HEAD'?null:binary?Uint8Array.from(atob(value),(c)=>c.charCodeAt(0)):value,{headers:{...policy,'Content-Type':type,'Cache-Control':type.includes('html')?'no-cache':type.includes('javascript')||type.includes('css')?'no-cache':'public, max-age=300'}});
}
async function readState(db,owner,topic,language) {
  const row=await db.prepare('SELECT revision,content FROM conversations WHERE owner=? AND topic=?').bind(owner,topic).first();
  return row ? {revision:row.revision,value:JSON.parse(row.content)} :
    {revision:0,value:topic==='studio'?newGuide(language):{messages:[]}};
}
const present=(topic,row,language)=>({...row,value:topic==='studio'&&row.value.fund?{...row.value,fund:{...row.value.fund,team:confirmedTeam(row.value)}}:row.value,suggestions:topic==='studio'?suggestedAnswers(row.value,language):[]});
async function digest(text) {
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
  return Array.from(bytes,(b)=>b.toString(16).padStart(2,'0')).join('');
}
async function chat(request, env, ctx) {
  const owner=ctx.owner;
  if (request.headers.get('origin')!==new URL(request.url).origin) return fail(403,'origin');
  if (!request.headers.get('content-type')?.startsWith('application/json')) return fail(415,'json-required');
  if (Number(request.headers.get('content-length'))>16384) return fail(413,'body-limit');
  const reader=request.body?.getReader();
  if (!reader) return fail(400,'missing-body');
  const decoder=new TextDecoder(); let source='', count=0;
  for (;;) {
    const {done,value}=await reader.read();
    if(done) break;
    count+=value.length;
    if(count>16384){await reader.cancel();return fail(413,'body-limit');}
    source+=decoder.decode(value,{stream:true});
  }
  let body;
  try {body=JSON.parse(source+decoder.decode());}catch{return fail(400,'invalid-body');}
  const explaining=new URL(request.url).pathname==='/api/buffett/ask';
  let decision;
  if(explaining){
    if(!validBuffettQuestion(body))return fail(400,'invalid-archived-question');
    const archive=assets['/data/buffett-ai-study.json'];
    if(!archive)return fail(503,'archive-unavailable');
    const run=JSON.parse(archive[1]);
    decision=run.id===body.runId && run.decisions.find(d=>d.id===body.decisionId);
    if(!decision)return fail(404,'unknown-decision');
    body={topic:'archive:'+run.id+':'+decision.id,id:body.requestId,action:'explain',language:body.language,message:body.message};
  }
  if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['id','topic','message','language','revision','action','draftRevision','seatId','proposalId'].includes(k))) return fail(400,'unknown-field');
  const {id,topic,action,draftRevision}=body,language=asLang(body.language),message=typeof body.message==='string'?body.message.trim():'';
  let revision=body.revision;
  if(draftRevision!==undefined && (action!=='chat' || !Number.isSafeInteger(draftRevision) || draftRevision<0))return fail(400,'invalid-draft-revision');
  const billable=explaining || ['chat','hire','assign','ask'].includes(action);
  const addressed=['hire','assign','ask','accept'].includes(action);
  const seatId=addressed?body.seatId:'maya-chen';
  if (!explaining && (!['chat','confirm','solo','prepare','hire','assign','ask','accept'].includes(action) || typeof id!=='string' || !/^[a-f0-9-]{36}$/i.test(id) || !Number.isSafeInteger(revision) || revision<0 || !(topic==='studio'||byId(topic)) || (billable&&(!message||message.length>3000)) || (action!=='chat'&&topic!=='studio') || (addressed&&typeof seatId!=='string') || (!addressed&&body.seatId!==undefined) || (action==='accept'?!body.proposalId:body.proposalId!==undefined))) return fail(400,'invalid-request');
  const fingerprintFields=[topic,revision,action,message,language];
  if(addressed)fingerprintFields.push(seatId,body.proposalId??null);
  const db=env.DB, fingerprint=await digest(JSON.stringify(fingerprintFields));
  const existing=await db.prepare('SELECT fingerprint,status,result FROM calls WHERE owner=? AND request_id=?').bind(owner,id).first();
  if(existing) return existing.fingerprint!==fingerprint ? fail(409,'request-changed') : existing.status==='done' ? json(JSON.parse(existing.result)) : fail(409,existing.status==='busy'?'waiting':'retry-new-request');
  const row=await readState(db,owner,topic,language);
  if(explaining)revision=row.revision;
  if(row.revision!==revision) return fail(409,'stale');
  if(topic==='studio' && (billable||action==='accept') && studioMembership({studioMembership:{startedAt:row.value.fund?.createdAt}}).status==='expired')return fail(402,'studio-trial-ended');
  if(['solo','prepare','confirm'].includes(action)&&row.value.fund)return fail(409,'already-created');
  if(addressed){const error=teamError(row.value,action,seatId,body.proposalId);if(error)return fail(409,error);}

  if(action==='confirm' && (!row.value.draft || row.value.phase!=='ready')) return fail(409,'blueprint-required');
  if(billable && !directRuntimeAvailable(env))return fail(503,'agent-unavailable');
  const now=Date.now();
  const reservation=await db.prepare(`INSERT OR IGNORE INTO calls (owner,request_id,topic,fingerprint,started,status,ip_key,billable)
   SELECT ?,?,?,?,?,'busy',?,? WHERE (?=0 OR (
   (SELECT COUNT(*) FROM calls WHERE billable=1 AND owner=? AND started>?)<20 AND (SELECT COUNT(*) FROM calls WHERE billable=1 AND owner=? AND started>?)<? AND
   (SELECT COUNT(*) FROM calls WHERE billable=1 AND ip_key=? AND started>?)<30 AND (SELECT COUNT(*) FROM calls WHERE billable=1 AND ip_key=? AND started>?)<65 AND
   ${modelBudgetWhere})) AND
   NOT EXISTS (SELECT 1 FROM calls WHERE owner=? AND topic=? AND status='busy' AND started>?)`)
    .bind(owner,id,topic,fingerprint,now,ctx.ip,Number(billable),Number(billable),owner,now-3600000,owner,now-86400000,ctx.guest?20:50,ctx.ip,now-3600000,ctx.ip,now-86400000,...modelBudgetArgs(now,env),owner,topic,now-150000).run();
  if(!reservation.meta.changes) return fail(429,'capacity');
  try {
    const runtime=runtimeFor(env);
    let next,explanation;
    if(explaining){
      explanation=await explainDecision({decision,message,language,idempotencyKey:owner+':'+id},runtime);
      next={messages:[]};
    }else if(action==='prepare'){
      next=prepareTeamBlueprint(row.value,language);
    }else if(action==='solo'){
      next=managerOnlyBlueprint(row.value,language);
    }else if(action==='confirm'){
      next={...row.value,phase:'confirmed',fundId:crypto.randomUUID(),fund:{name:row.value.draft.name,cashCents:1000000,orderCount:0,team:confirmedTeam(row.value),createdAt:new Date().toISOString()}};
    }else if(topic==='studio' && row.value.phase==='confirmed'){
      next=await teamTurn(row.value,{action,seatId,message,language,idempotencyKey:owner+'-'+id},runtime);
    }else if(topic==='studio'){
      next=await designConversationTurn({guide:row.value,message,hosted:true,idempotencyKey:owner+'-'+id,language},runtime);
    }else{
      const reply=await proposeCatalogReply({entry:studyFor(byId(topic),language),message,history:row.value.messages,language,idempotencyKey:owner+'-'+id},runtime);
      next={messages:[...row.value.messages,{role:'user',text:message},{role:'assistant',...reply}].slice(-20)};
    }
    const newMessages=!explaining&&billable&&seatId==='maya-chen'?next.messages.slice(-2):[];
    if(newMessages.length)next.messages=[...row.value.messages,...newMessages].slice(-120);
    const result=explaining?explanation:present(topic,{revision:revision+1,value:next},language);
    const writes=[
      db.prepare(`INSERT INTO conversations(owner,topic,revision,content) SELECT ?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM conversations WHERE owner=? AND topic=? AND revision=?)
       ON CONFLICT(owner,topic) DO UPDATE SET revision=excluded.revision, content=excluded.content WHERE conversations.revision=?`)
        .bind(owner,topic,revision+1,JSON.stringify(next),revision,owner,topic,revision,revision),
      db.prepare("UPDATE calls SET status=CASE WHEN changes()=1 THEN 'done' ELSE 'stale' END,result=CASE WHEN changes()=1 THEN ? ELSE NULL END WHERE owner=? AND request_id=?").bind(JSON.stringify(result),owner,id),
      db.prepare("INSERT OR IGNORE INTO thread_journal(owner,topic,revision,messages,recorded) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM calls WHERE owner=? AND request_id=? AND status='done') AND ?>0")
        .bind(owner,topic,revision+1,JSON.stringify(newMessages),now,owner,id,newMessages.length)
    ];
    // A stale tab cannot restore the sent text with an old PUT, or erase another tab's newer draft.
    // The receipt, transcript and draft consumption commit together. Replaying the receipt does no further cleanup.
    if(action==='chat' && draftRevision!==undefined){
      writes.push(db.prepare(`UPDATE drafts SET message='',revision=revision+1,updated=?
        WHERE owner=? AND topic=? AND revision=? AND message=?
        AND EXISTS(SELECT 1 FROM calls WHERE owner=? AND request_id=? AND status='done')`)
        .bind(Date.now(),owner,topic,draftRevision,body.message,owner,id));
    }
    const updates=await db.batch(writes);
    return updates[0].meta.changes ? json(result):fail(409,'stale');
  }catch(error){
    console.error(JSON.stringify({stage:'conversation',kind:error?.name||'Error'}));
    await db.prepare("UPDATE calls SET status='failed' WHERE owner=? AND request_id=? AND status='busy'").bind(owner,id).run();
    return fail(503,'agent-unavailable');
  }
}
export default {async fetch(request,env) {
  const url=new URL(request.url),path=url.pathname,language=asLang(url.searchParams.get('lang'));
  const deviceEnabled=Boolean(assets['/device-dictation.mjs'] && assets['/device-dictation-files.mjs'] && assets['/device-dictation-worker.mjs']);
  if(path.startsWith(assetPrefix))return deviceEnabled?serveDeviceAsset(request,env.reserveDeviceBytes):fail(404,'not-found');
  if(path.startsWith('/api/example/'))return showcase({request,env,json,fail,runtimeFor,directRuntimeAvailable,study:lang=>studyFor(byId('active-bond'),lang)});
    if (['GET','HEAD'].includes(request.method) && !path.startsWith('/api/')) {
    const asset=assetFor(path,request);
    if(!asset)return fail(404,'not-found');
    return request.method==='HEAD'?new Response(null,{status:asset.status,headers:asset.headers}):asset;
  }
  if (request.method==='GET' && path==='/api/voice/status') return json({local:false,languages:[],source:'Browser speech service',maxSeconds:30,replyPlayback:false,...(deviceEnabled?{deviceDictation}:{})});
  if (request.method==='GET' && path==='/api/catalog') return json(CATALOG.map(item=>localized(item,language)));
  if (request.method==='GET' && path==='/api/study') {
    const item=byId(url.searchParams.get('id'));return item ? json(studyFor(item,language)) : fail(404,'study-not-found');
  }
  if(!['/api/session','/api/membership','/api/draft','/api/thread','/api/thread/history','/api/chat','/api/buffett/ask','/api/history','/api/history/select'].includes(path))return fail(404,'not-found');
  if(!env.DB)return fail(503,'storage-setup');
  if(['POST','PUT'].includes(request.method) && request.headers.get('origin')!==url.origin)return fail(403,'origin');
  const ctx=await visitorContext(request,env.DB,request.method==='GET');
  if(!ctx)return fail(401,'reload-session');
  if(ctx.limited)return fail(429,'capacity');
  const finish=response=>attachCookie(response,ctx);
  if(path==='/api/membership'){
    if(request.method!=='GET')return fail(403,'simulation-unavailable');
    const studio=await readState(env.DB,ctx.owner,'studio',language);
    return finish(json({membership:studioMembership({studioMembership:{startedAt:studio.value.fund?.createdAt}}),workspaceHome:'/studio'}));
  }
  if(path==='/api/draft'){
    const topic=url.searchParams.get('topic');if(topic!=='studio'&&!byId(topic))return fail(404,'topic');
    return finish(await draftResponse(request,env.DB,ctx.owner,topic,json,fail));
  }
  if(request.method==='GET' && path==='/api/session')return finish(json({signedIn:Boolean(ctx.account),guest:ctx.guest,agentReady:directRuntimeAvailable(env),agentConfigured:Boolean(env.FUNDROOM_HR_KEY),managerAvailability:await availability(env)}));
  if(request.method==='GET' && path==='/api/thread'){
    const topic=url.searchParams.get('topic');if(topic!=='studio'&&!byId(topic))return fail(404,'topic');
    return finish(json(present(topic,await readState(env.DB,ctx.owner,topic,language),language)));
  }
  if(request.method==='GET' && path==='/api/thread/history'){
    const topic=url.searchParams.get('topic'),limit=25;
    const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);
    if((topic!=='studio'&&!byId(topic))||!Number.isSafeInteger(before)||before<1)return fail(400,'invalid-request');
    const rows=await env.DB.prepare('SELECT revision,messages,recorded FROM thread_journal WHERE owner=? AND topic=? AND revision<? ORDER BY revision DESC LIMIT ?').bind(ctx.owner,topic,before,limit+1).all();
    const items=rows.results.slice(0,limit);
    return finish(json({items:items.reverse().map(r=>({revision:r.revision,messages:JSON.parse(r.messages),recorded:r.recorded})),nextBefore:rows.results.length>limit?items[0].revision:null}));
  }
  if(request.method==='GET' && path==='/api/history')return finish(json(await listSpaces(ctx,env.DB)));
  if(request.method==='POST' && path==='/api/history/select'){
    if(!ctx.account)return fail(403,'account-required');
    if(!request.headers.get('content-type')?.startsWith('application/json'))return fail(415,'json-required');
    const reader=request.body?.getReader();let raw='',length=0;if(!reader)return fail(400,'invalid-request');
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>200){await reader.cancel();return fail(413,'body-limit');}raw+=new TextDecoder().decode(value);}
    let body;try{body=JSON.parse(raw);}catch{return fail(400,'invalid-request');}
    if(!body||typeof body!=='object'||Object.keys(body).length!==1||!await chooseSpace(ctx,env.DB,body.id))return fail(404,'workspace');
    return finish(json({selected:true}));
  }
  if(request.method==='POST' && ['/api/chat','/api/buffett/ask'].includes(path))return finish(await chat(request,env,ctx));
  return fail(405,'method');
}};
