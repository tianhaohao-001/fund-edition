import { existsSync,readFileSync,writeFileSync,renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { newGuide,designConversationTurn,proposeCatalogReply } from '../core/conversation.mjs';
import { findCatalog } from '../web/catalog-data.mjs';
import { runReplicaStudy } from '../web/catalog-replica.mjs';
import { researchBrief } from '../web/strategy-playbook.mjs';
import { examples } from '../hosting/site/example-prompts.mjs';
const target=fileURLToPath(new URL('../release/review-web/public-recorded-examples.json',import.meta.url));
const archive=existsSync(target)?JSON.parse(readFileSync(target,'utf8')):{};
const harnessId='chrn_642e1a7bf73e478686a90bb77fda796a';
if(!process.env.HARNESSROUTER_API_KEY || process.env.HARNESSROUTER_HARNESS_ID!==harnessId)throw Error('Launch with the verified direct Fundroom runtime.');
const runtime={env:{HARNESSROUTER_API_KEY:process.env.HARNESSROUTER_API_KEY,HARNESSROUTER_HARNESS_ID:harnessId,HARNESSROUTER_MODEL:'deepseek-v4.1-flash',FUNDROOM_ENABLE_HARNESS:'true'}};
for (const [sample,localized] of Object.entries(examples)) {
  for(const [language,question] of Object.entries(localized)){
    if(archive[sample]?.[language]?.responseId)continue;
    let answer,source;
    if(sample==='studio'){
      const g=await designConversationTurn({guide:newGuide(language),message:question,hosted:true,idempotencyKey:'recording-'+sample+'-'+language,language},runtime);
      source=g.messages.at(-1);answer=source.text;
    }else{
      const item=findCatalog('active-bond'),brief=researchBrief(runReplicaStudy(item.id),language);
      const copy=item.localized?.[language]||item;
      source=await proposeCatalogReply({entry:{ticker:item.ticker,reference:item.reference,summary:copy.summary,limitations:copy.limitations,researchBrief:brief},message:question,history:[],language,idempotencyKey:'recording-'+sample+'-'+language},runtime);answer=source.text;
    }
    if(!source.responseId||source.harnessId!==harnessId||!answer)throw Error('Missing real receipt');
    archive[sample]||={};
    archive[sample][language]={sample,language,question,answer,mode:'recorded',source:'Official HarnessRouter direct application-server session, recorded public example',generatedAt:new Date().toISOString(),responseId:source.responseId,harnessId,model:source.model};
    writeFileSync(target+'.tmp',JSON.stringify(archive,null,2)+'\n');renameSync(target+'.tmp',target);
    console.log(sample,language,source.responseId);
  }
}
