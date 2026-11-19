import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL,fileURLToPath } from 'node:url';

const phase=process.argv[2];
if(!['baseline','candidate'].includes(phase))throw Error('Choose baseline or candidate.');
const root=fileURLToPath(new URL('../',import.meta.url));
const checkout=phase==='baseline'?await mkdtemp(join(tmpdir(),'fund-edition-role-baseline-')):root;
const output=join(root,'release/review-web/role-response-checks');
const stamp=Date.now();
if(phase==='baseline')execFileSync('tar',['-xzf',join(root,'release/cloud/full-web/previous/bd56faca8e59b6ae974747d7806e4349a29affaa9a12d88e5b4a4831b73992b7.tgz'),'-C',checkout]);
const load=path=>import(pathToFileURL(join(checkout,path)).href);
try{
const {designConversationTurn,newGuide,proposeCatalogReply}=await load('core/conversation.mjs');
const {proposeTeamReply}=await load('core/team-coach.mjs');
const {explainDecision}=await load('core/buffett-followup.mjs');
const {CANDIDATES}=await load('web/team.mjs');
const {SCENARIOS}=await load('core/engine.mjs');
const {runReplicaStudy}=await load('core/replica.mjs');
const {researchBrief}=await load('web/strategy-playbook.mjs');
const {findCatalog}=await load('core/catalog.mjs');
const archive=JSON.parse(await readFile(join(checkout,'web/data/buffett-ai-study.json'),'utf8'));
const entry=findCatalog('wellington'),decision=archive.decisions[3];
const manager=CANDIDATES.find(m=>m.role==='manager'), analyst={...CANDIDATES.find(m=>m.role==='research'),duty:'Compare retailer inventory growth with operating cash flow.'};
const question={
  maya:'我想用模拟盘研究消费企业的现金流，先不要买卖。你会请谁先看什么？',
  colleague:'For your first assignment, what would you check before this paper fund buys a retailer?',
  catalog:'How does the Wellington study balance stocks and bonds, and what important information is missing?',
  buffett:'为什么这次只建两成仓位，什么证据使你没有满仓？'
};
const cases={
  maya:(key,opts)=>designConversationTurn({guide:newGuide('zh-CN'),language:'zh-CN',message:question.maya,hosted:true,idempotencyKey:key},opts),
  colleague:(key,opts)=>proposeTeamReply({member:analyst,message:question.colleague,language:'en-US',idempotencyKey:key,
    fund:{name:'Retail cash desk',team:[manager,analyst],mandate:'Research retailers; paper purchases are paused.',maxWeightPercent:10,
      permissions:{allowBuy:false,allowSell:false,allowedSymbols:[]},portfolio:{cashCents:1000000,positions:[]},chat:[],runs:[]},scenario:SCENARIOS[0]},opts),
  catalog:(key,opts)=>proposeCatalogReply({entry:{...entry,...entry.localized?.['en-US'],researchBrief:researchBrief(runReplicaStudy(entry.id),'en-US')},message:question.catalog,
    history:[],language:'en-US',idempotencyKey:key},opts),
  buffett:(key,opts)=>explainDecision({decision,message:question.buffett,language:'zh-CN',idempotencyKey:key},opts)
};
const results=[];
await mkdir(output,{recursive:true});
const ordered=Object.entries(cases);
if(process.argv.includes('--reverse'))ordered.reverse();
const single=process.argv.find(arg=>arg.startsWith('--role='))?.slice(7);
if(single&&!Object.hasOwn(cases,single))throw Error('Unknown role.');
for(const [role,call] of ordered){
  if(single&&role!==single)continue;
  const started=performance.now();const metrics=[];
  const env={...process.env,FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_MODEL:'deepseek-v4.1-flash'};
  const fetchImpl=async(url,init)=>{
    const outbound=JSON.parse(init.body);
    const before=performance.now(),res=await fetch(url,init),headersMs=Math.round(performance.now()-before);
    const receipt=await res.clone().json().catch(()=>({}));
    metrics.push({status:res.status,responseStatus:receipt.status,outputTypes:receipt.output?.map(e=>e.type),headersMs,model:receipt.model,applied:receipt.reasoning?.applied,requested:outbound.reasoning?.effort??'default',
      inputChars:JSON.stringify(outbound.input).length,outputTokens:receipt.usage?.output_tokens,
      reasoningTokens:receipt.usage?.output_tokens_details?.reasoning_tokens});
    return res;
  };
  let row;
  try{
    const reply=await call(role+':'+randomUUID(),{env,fetchImpl});
    const message=role==='maya'?reply.messages.at(-1):reply;
    const text=message.answer??message.text;
    row={role,ms:Math.round(performance.now()-started),question:question[role],text,chars:text?.length??0,
      firstSentence:text?.split(/(?<=[。！？!?])|(?<=\.)\s/u)[0],receipt:message.responseId,mode:reply.mode??'live',
      evidenceRefs:[...new Set((reply.excerpts??[]).flatMap(r=>r.evidenceRefs??[]))],metrics};
    assert.ok(row.receipt,'Missing actual provider receipt');
  }catch(error){row={role,ms:Math.round(performance.now()-started),question:question[role],error:error.message,metrics};}
  results.push(row);
  await writeFile(join(output,phase+'-'+stamp+'.json'),JSON.stringify({at:new Date(stamp).toISOString(),phase,results},null,2)+'\n');
  console.log(JSON.stringify({role,ms:row.ms,chars:row.chars,mode:row.mode,error:row.error,metrics}));
}
if(results.some(r=>r.error||r.mode!=='live'))process.exitCode=1;
}finally{if(phase==='baseline')await rm(checkout,{recursive:true,force:true});}
