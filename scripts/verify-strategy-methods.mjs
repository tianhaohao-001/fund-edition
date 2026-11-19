import { randomUUID } from 'node:crypto';
import { CATALOG } from '../web/catalog-data.mjs';
import { runReplicaStudy } from '../web/catalog-replica.mjs';
import { researchBrief } from '../web/strategy-playbook.mjs';
import { planResearchReview, reviewHistoricalResearch } from '../core/historical-review.mjs';

const [mode,id] = process.argv.slice(2);
if(mode && mode!=='--hosted') throw new Error('Use no arguments for local checks, or --hosted <catalog-id> for a live three-seat review.');
if(!mode) {
  for(const item of CATALOG) {
    const brief=researchBrief(runReplicaStudy(item.id),'en-US');
    console.log(JSON.stringify({ticker:brief.ticker,scope:brief.scope,observed:brief.checks[0].observed,blocked:brief.missing,modelCalls:0}));
  }
} else {
  const study=runReplicaStudy(id);
  const language='zh-CN', plan=planResearchReview(study,language);
  const review=await reviewHistoricalResearch({study,language,plan,idempotencyKey:'verify-'+randomUUID(),emit:()=>{}},{env:process.env});
  console.log(JSON.stringify({ticker:review.ticker,status:review.status,modelCalls:review.modelCalls,
    seats:review.seats.map(({role,status,responseId,evidenceRefs,text})=>({role,status,responseId,evidenceRefs,text}))}));
  if(review.status!=='complete') process.exitCode=1;
}
