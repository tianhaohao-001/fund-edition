import { TEAM_TEMPLATES, recommendTeamStyle } from './team-templates.mjs';

export const defersTeam = message => /先别(?:建|招|组|雇)|暂时不(?:建|招|组|雇)|先不(?:建|招|组|雇)|不要(?:建|招|雇)|只(?:是)?(?:想)?聊聊|\b(?:not yet|just (?:exploring|chatting|talking|browsing)|don.t (?:hire|build|create)|do not (?:hire|build|create))\b/iu.test(message);

export function wantsTeamPreview(message = '') {
  if (defersTeam(message)) return false;
  return /招人|招聘|招募|雇[用佣]|组队|组建|建(?:立)?(?:我的|一个|一家|这支|模拟|自己的)*基金|现在(?:建|开始)|见(?:见)?团队|看(?:看)?团队|\b(?:hire|hiring|recruit|staff my|meet (?:my |our |the )?team|show (?:me )?(?:my |our |the )?team|(?:create|build|start|launch|open|set up) (?:my |our |the |a |this )?(?:own |paper |AI |investment )*(?:fund|team)|build it now|let.s build it)\b/iu.test(message);
}

export function suggestedRoster(profile = {}) {
  const style = profile.templateId || recommendTeamStyle(profile.goal)?.id || 'growth';
  const template = TEAM_TEMPLATES.find(item => item.id === style) || TEAM_TEMPLATES[0];
  if (Array.isArray(profile.staffing)) return [profile.managerSeat??template.roster[0], ...profile.staffing];
  // Start with one research seat and one independent challenger. Each template
  // supplies its own duties. More specialists can be recruited in the room.
  return template.roster.filter((_, index) => [0,1,3].includes(index));
}

export const userTurns = guide => (guide?.messages ?? []).filter(turn => turn.role === 'user' && turn.text?.trim());

export function explicitTradePermissions(text) {
  const flags={};
  const allOff=/仅研究|只(?:做)?研究|只观察|仅观察|不(?:要)?交易|禁止(?:模拟)?交易|\b(?:no trad(?:ing|es)|research only|observe only|read[- ]only|do not trade|don.t trade|no buying (?:or|and) selling)\b/iu.test(text);
  for(const [key,allow,deny] of [
    ['allowBuy',/(?:取消禁止|恢复|开启|可以|允许)\s*(?:模拟)?买|\b(?:allow|enable|resume|permit) (?:paper |simulated )?buy/iu, /(?:不要|不许|禁止|不允许)\s*(?:模拟)?买|\b(?:no|do not|don.t|never|block|disable) (?:allow )?(?:paper |simulated )?buy/iu],
    ['allowSell',/(?:取消禁止|恢复|开启|可以|允许)\s*(?:模拟)?卖|\b(?:allow|enable|resume|permit) (?:paper |simulated )?sell/iu, /(?:不要|不许|禁止|不允许)\s*(?:模拟)?卖|\b(?:no|do not|don.t|never|block|disable) (?:allow )?(?:paper |simulated )?sell/iu],
  ]) {
    if(allOff || deny.test(text.replaceAll('取消禁止','恢复'))) flags[key]=false;
    else if(allow.test(text)) flags[key]=true;
  }
  return flags;
}

export function legacyDraftAdjustments(guide) {
  const turns=userTurns(guide);
  const permissions=turns.reduce((known,{text})=>({...known,...explicitTradePermissions(text)}),{});
  const name=turns.map(turn=>requestedFundName(turn.text)).filter(Boolean).at(-1) || '';
  const draft=guide.draft;
  return {name,permissions,needsReview:Boolean(draft &&
    ((name && draft.name!==name) || (['allowBuy','allowSell'].some(key=>
      draft.permissions?.[key] !== (permissions[key]??false)))))};
}

export function meaningfulIdea(text='') {
  const words=String(text).trim().replace(/[,.!?。，！？～~]+$/u,'').trim();
  if (!words || /^(?:你好(?:呀|啊|吗)?|您好|哈[喽啰罗]|试(?:麦|音)|听(?:得|的)见吗|我?(?:还)?(?:不(?:知道|确定)|没想好)|谢谢|好的?|开始|嗯+|ok(?:ay)?|hey(?: there)?|hello(?: maya)?|hi(?: maya)?|test(?:ing)?(?: (?:the )?mic)?|can you hear me|thanks|not sure(?: yet)?|i(?:’m|'m| am) (?:not sure|just exploring)(?: yet)?)$/iu.test(words)) return false;
  return !/^(?:什么是这个|怎么用|这是什么|what is this|how (?:do i use|does) (?:this|it)(?: work)?)$/iu.test(words);
}

export const investmentTurns = guide => userTurns(guide).filter(turn=>meaningfulIdea(turn.text) && !defersTeam(turn.text));

export function requestedFundName(message) {
  return String(message || '').match(/(?:基金(?:取名|名叫|叫|命名为)|(?:就|名字(?:是)?)叫|(?:基金)?名字(?:是|叫)|\b(?:name (?:it|the fund)|call (?:it|the fund)|fund (?:called|named)))\s*[“"「]?([^，。！？!?,.;\n”"」]{1,60})/iu)?.[1]?.split(/\s+(?:and|with)\s+/iu)[0]?.trim();
}

// Restore previously saved, pre-roster conversations only after an investment idea.
export function pendingFormationPreview(guide, researchDraft) {
  if (!guide || researchDraft || guide.phase === 'created' || guide.profile?.formationPaused) return false;
  if (guide.phase === 'ready') return Boolean(guide.draft && !guide.draft.formationVersion);
  if (defersTeam(userTurns(guide).at(-1)?.text)) return false;
  return investmentTurns(guide).length > 0;
}
