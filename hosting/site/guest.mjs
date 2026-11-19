import { newGuide, designConversationTurn } from '../../core/conversation.mjs';
import { suggestedAnswers } from '../../web/studio-answers.mjs';
const key=lang=>'morrowfolio.studio.guest.v1.'+lang;
const visible=(guide,lang)=>({revision:guide.messages.length,value:guide,suggestions:suggestedAnswers(guide,lang)});
export function guestState(lang){
  let saved;
  try {saved=JSON.parse(sessionStorage.getItem(key(lang)));}catch{}
  const guide=saved?.id && Array.isArray(saved.messages) && ['discovery','ready','confirmed'].includes(saved.phase) ? saved:newGuide(lang);
  return visible(guide,lang);
}
export async function guestTurn(state,message,action,language){
  let guide=state.value;
  if(guide.phase==='confirmed')return state;
  if(action==='confirm'){
    if(!guide.draft || guide.phase!=='ready')throw Error('Create a blueprint first.');
    guide={...guide,phase:'confirmed',fundId:crypto.randomUUID(),fund:{cashCents:1000000,orderCount:0}};
  }else guide=await designConversationTurn({guide,message,hosted:false,language});
  try{sessionStorage.setItem(key(language),JSON.stringify(guide));}catch{}
  return visible(guide,language);
}
