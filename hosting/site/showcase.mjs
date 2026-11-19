import recordings from '../../release/review-web/public-recorded-examples.json' with {type:'json'};
import { designConversationTurn, newGuide, proposeCatalogReply } from '../../core/conversation.mjs';

import { examples } from './example-prompts.mjs';
import { modelBudgetArgs, modelBudgetWhere } from './model-budget.mjs';
const hour=3600000;
export async function showcase({request,env,json,fail,runtimeFor,directRuntimeAvailable,study}) {
  const url=new URL(request.url);
  const sample=url.pathname.split('/').at(-1);
  const language=url.searchParams.get('lang')||'zh-CN';
  if(!Object.hasOwn(examples,sample)||!['zh-CN','en-US'].includes(language) ||
    [...url.searchParams.keys()].some(k=>k!=='lang') || url.searchParams.getAll('lang').length>1) return fail(400,'invalid-request');
  const question=examples[sample][language];
  const key={sample,language,question};
  if(!['GET','POST'].includes(request.method))return fail(405,'method');
  if(request.method==='POST'){
    if(request.headers.get('origin')!==url.origin)return fail(403,'origin');
    if(Number(request.headers.get('content-length'))>0)return fail(400,'fixed-question-only');
    if(request.body){
      const reader=request.body.getReader();
      for(;;){const {done,value}=await reader.read();if(done)break;if(value.byteLength){await reader.cancel();return fail(400,'fixed-question-only');}}
    }
  }
  if(!directRuntimeAvailable(env)){
    const saved=recordings[sample]?.[language];
    return saved?.question===question && saved?.responseId ? json({...saved,mode:'recorded'}):fail(503,'example-unavailable');
  }
  if(!env.DB)return fail(503,'storage-setup');
  const now=Date.now(),db=env.DB;
  const last=await db.prepare("SELECT started,status,result FROM public_examples WHERE sample=? AND language=? AND started>? ORDER BY started DESC LIMIT 1").bind(sample,language,now-12*hour).first();
  if(last?.status==='done')return json({...key,mode:'cached',...JSON.parse(last.result)});
  if(last?.status==='busy' && now-last.started<100000)return json({...key,mode:'pending'},202);
  if(request.method==='GET')return json({...key,mode:'available'});
  if(!directRuntimeAvailable(env))return fail(503,'agent-unavailable');
  const id=crypto.randomUUID();
  const approved=await db.prepare(`INSERT INTO public_examples (id,sample,language,started,status)
    SELECT ?,?,?,?,'busy' WHERE
    (SELECT COUNT(*) FROM public_examples WHERE started>?)<4 AND (SELECT COUNT(*) FROM public_examples WHERE started>?)<8 AND
    ${modelBudgetWhere} AND
    NOT EXISTS (SELECT 1 FROM public_examples WHERE sample=? AND language=? AND
       ((status='done' AND started>?) OR (status='busy' AND started>?) OR (status='failed' AND started>?)))`)
    .bind(id,sample,language,now,now-hour,now-24*hour,...modelBudgetArgs(now,env),sample,language,now-12*hour,now-100000,now-5*60000).run();
  if(!approved.meta.changes){
    const other=await db.prepare("SELECT started,status,result FROM public_examples WHERE sample=? AND language=? ORDER BY started DESC LIMIT 1").bind(sample,language).first();
    if(other?.status==='done' && now-other.started<12*hour)return json({...key,mode:'cached',...JSON.parse(other.result)});
    if(other?.status==='busy' && now-other.started<100000)return json({...key,mode:'pending'},202);
    return fail(429,'capacity');
  }
  try{
    const runtime=runtimeFor(env);
    let answer;
    if(sample==='studio'){
      const guide=await designConversationTurn({guide:newGuide(language),message:question,hosted:true,idempotencyKey:'public-example-'+id,language},runtime);
      const reply=guide.messages.at(-1);
      answer={answer:reply.text,summary:guide.draft?.summary || '',responseId:reply.responseId,harnessId:reply.harnessId,model:reply.model};
    }else{
      const reply=await proposeCatalogReply({entry:study(language),message:question,history:[],language,idempotencyKey:'public-example-'+id},runtime);
      answer={answer:reply.text,responseId:reply.responseId,harnessId:reply.harnessId,model:reply.model};
    }
    if(!answer.responseId || !answer.answer)throw Error('Missing receipt');
    answer.generatedAt=new Date().toISOString();
    await db.prepare("UPDATE public_examples SET status='done',result=? WHERE id=?").bind(JSON.stringify(answer),id).run();
    return json({...key,mode:'live',...answer});
  }catch(error){
    console.error(JSON.stringify({stage:'fixed-example',kind:error?.name||'Error'}));
    await db.prepare("UPDATE public_examples SET status='failed' WHERE id=?").bind(id).run();
    return fail(503,'agent-unavailable');
  }
}
