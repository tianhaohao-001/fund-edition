import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root=fileURLToPath(new URL('../',import.meta.url));
const archive=resolve(root,'release/cloud/full-web/fund-edition-web.tgz');
const live=process.argv.includes('--live');
const baselineIndex=process.argv.indexOf('--same-app-as');
const baseline=baselineIndex<0?null:resolve(process.argv[baselineIndex+1]);
const credential=live?(process.env.FUNDROOM_HR_KEY||process.env.HARNESSROUTER_API_KEY):undefined;
if(live&&!credential)throw Error('A dedicated runtime credential is required for a live acceptance.');
const stage=await mkdtemp(join(tmpdir(),'fund-edition-verify-'));
const origin='https://cloud-check.example';
const evidence={checkedAt:new Date().toISOString(),node:process.version,provider:live?'live':'disconnected',checks:[]};
const digest=data=>createHash('sha256').update(data).digest('hex');
let child,base,cookie;

async function start(){
  const env={SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,PORT:'0',FUNDROOM_PUBLIC_ORIGIN:origin,
    FUNDROOM_CLOUD_BIND:'127.0.0.1',FUNDROOM_DB_PATH:join(stage,'workspace.sqlite'),FUNDROOM_MODEL_30D_LIMIT:'1',FUNDROOM_WATCH_ENABLED:'false',
    ...(credential?{FUNDROOM_HR_KEY:credential}:{})};
  child=spawn(process.execPath,['start.mjs'],{cwd:stage,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const lines=createInterface({input:child.stdout});
  const ready=once(lines,'line');
  const exited=once(child,'exit').then(()=>{throw Error('Package did not start');});
  const [line]=await Promise.race([ready,exited]);
  const port=/ listening on port (\d+)/u.exec(line)?.[1];
  assert.ok(port,'Node package reported its listening port');
  base='http://127.0.0.1:'+port;
}
async function stop(){if(child){const done=once(child,'exit');child.kill();await done;child=undefined;}}
function post(url,data,cookieJar=cookie,source=origin){
  return fetch(base+url,{method:'POST',headers:{Origin:source,'Content-Type':'application/json',Cookie:cookieJar},body:JSON.stringify(data)});
}
async function action(type,fields={}){
  const res=await post('/api/action',{action:type,requestId:randomUUID(),language:'en-US',...fields});
  const body=await res.json();assert.equal(res.status,200,JSON.stringify([type,body.code,body.error]));return body;
}
try{
  evidence.archiveSha256=digest(await readFile(archive));evidence.bytes=(await stat(archive)).size;
  execFileSync('tar',['-xzf',archive,'-C',stage]);
  const manifest=JSON.parse(await readFile(join(stage,'manifest.json'),'utf8')).files;
  const original=baseline?JSON.parse(execFileSync('tar',['-xOf',baseline,'./manifest.json'],{encoding:'utf8'})).files:null;
  if(original){
    evidence.baselineSha256=digest(await readFile(baseline));
    assert.deepEqual(Object.keys(original).sort(),Object.keys(manifest).sort());
    const oldRecipe=execFileSync('tar',['-xOf',baseline,'./Dockerfile'],{encoding:'utf8'});
    assert.equal(oldRecipe.replace(/^VOLUME \["\/data"\]\r?\n/m,''),await readFile(join(stage,'Dockerfile'),'utf8'));
  }
  for(const [name,sha] of Object.entries(manifest)){
    assert.equal(digest(await readFile(join(stage,name))),sha);
    if(original && name!=='Dockerfile')assert.equal(original[name],sha,name+' differs from the accepted archive');
    if(!original && (name.startsWith('web/')||name.startsWith('core/')||name==='server.mjs'))assert.equal(digest(await readFile(join(root,name))),sha,name+' differs from the reviewed source');
  }
  evidence.manifestFiles=Object.keys(manifest).length;
  const entries=execFileSync('tar',['-tzf',archive],{encoding:'utf8'});
  assert.doesNotMatch(entries,/(?:^|[/\\])(?:\.env|\.fundroom|\.git|windows-harness|[^/\n]*\.(?:sqlite|pem|key|log|db))(?:$|[.\s/])/im);
  evidence.checks.push('source and deployed asset hashes, package allowlist');
  await start();
  assert.deepEqual(await (await fetch(base+'/healthz')).json(),{ready:true});
  for(const path of ['/','/studio','/funds','/funds/','/team']) {
    const page=await fetch(base+path);
    assert.equal(page.status,200,path);assert.equal(digest(Buffer.from(await page.arrayBuffer())),manifest['web/index.html'],path);
  }
  evidence.checks.push('identical homepage and both deep-link entries');
  const first=await fetch(base+'/api/state');
  assert.match(first.headers.get('set-cookie'),/HttpOnly.*SameSite=Strict.*Secure/);
  cookie=first.headers.get('set-cookie').split(';')[0];
  assert.equal(Boolean((await first.json()).provider.chatEnabled),live);
  const stranger=(await fetch(base+'/api/state')).headers.get('set-cookie').split(';')[0];
  assert.notEqual(stranger,cookie);
  const idea='Research durable consumer businesses with strong free cash flow.';
  await action('designConversation',{provider:'replay',message:idea});
  const blueprint=await action('prepareTeamStudio');
  const formed=await action('confirmFundDraft',{draftId:blueprint.guide.draft.id});
  const fund=formed.fund;
  assert.ok(fund.id);
  const foreign=await (await fetch(base+'/api/state',{headers:{Cookie:stranger}})).json();
  assert.ok(!foreign.funds.some(f=>f.id===fund.id));
  const talk=await action('sendChat',{fundId:fund.id,memberId:fund.team[0].id,message:'Explain your responsibilities.',provider:'replay'});
  assert.ok(talk.fund.chat.length>=2);
  assert.equal((await post('/api/action',{action:'prepareTeamStudio'},cookie,'https://other.example')).status,403);
  for(const url of ['/broker.html','/api/broker/status','/api/paper/account','/api/mobile/state'])assert.equal((await fetch(base+url)).status,404,url);
  evidence.checks.push('guest paper fund creation, teammate chat, visitor isolation, exact origin, private accounts and broker routes');
  const archiveData=await (await fetch(base+'/data/buffett-ai-study.json')).json();
  const buy=archiveData.decisions.find(d=>d.action==='BUY')||archiveData.decisions.at(-1);
  const query={requestId:randomUUID(),runId:archiveData.id,decisionId:buy.id,language:'en-US',message:'What justified a small initial allocation?'};
  const answer=await post('/api/buffett/ask',query);
  if(live){
    assert.equal(answer.status,200);const receipt=await answer.json();assert.equal(receipt.decisionId,buy.id);
    assert.equal(receipt.mode,'live');assert.ok(receipt.responseId);evidence.liveReceipt={decision:buy.id,responseId:receipt.responseId,mode:receipt.mode,sourceCount:receipt.excerpts.length};
  }else assert.equal(answer.status,503);
  await stop();await start();
  const after=await (await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();
  assert.equal(after.fund.id,fund.id);assert.equal(after.fund.chat.length,talk.fund.chat.length);
  if(live){
    const replay=await (await post('/api/buffett/ask',query)).json();
    assert.equal(replay.responseId,evidence.liveReceipt.responseId);
    const capped=await post('/api/buffett/ask',{...query,requestId:randomUUID()});
    assert.equal(capped.status,429);assert.equal((await capped.json()).code,'manager-capacity');
    evidence.checks.push('real scoped Buffett answer, idempotent receipt, rolling budget remains exhausted after process restart');
  }else evidence.checks.push('unconfigured provider reports unavailable');
  evidence.checks.push('same browser workspace and paper team after process restart');
  await writeFile(join(dirname(archive),live?'verification-live.json':'verification-offline.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
}finally{await stop();await rm(stage,{recursive:true,force:true});}
