const randomUUID = () => crypto.randomUUID();
import { requestHarnessObject, ManagerUnavailable } from './manager.mjs';
import { replyLanguageInstruction } from './language.mjs';
import { readStaffingPlan, staffingSchema, MAX_TEAM_SIZE } from './staffing.mjs';
export { hiringIntent } from './staffing.mjs';

export const researchIntent = message =>
  /复刻|复制|仿照|重建|还原|回测|追踪|研究|replica(?:te|tion)?|recreat(?:e|ion)|reconstruct|backtest|research|track/i.test(message);

export function researchDraft(item, message) {
  return { id: randomUUID(), catalogId: item.id, ticker: item.ticker, name: item.name,
    request: message, requestedAt: new Date().toISOString() };
}

export async function conciergeReply({ message, language, lastReply, target, previousTarget, idempotencyKey }, options) {
  const candidate = target ?? previousTarget;
  const { value, harness } = await requestHarnessObject({
    input: { mode: 'lobby-concierge', question: message, language, lastReply: lastReply?.text ?? null,
      recognizedFund: candidate ? { ticker: candidate.ticker, name: candidate.name, section: candidate.section, mentioned: target ? 'this message' : 'previous turn' } : null,
      destinations: { fund: 'Design a private simulated fund and hire its team', lab: 'Research a market fund or a persona, inspect methods and simulation' } },
    instructions: [
      'You are Maya, the fictional product concierge at Fund Edition. Introduce yourself only if relevant. Answer the visitor directly and briefly, and suggest at most one next step.',
      'If they want to build or manage their own fund, suggest fund. For an existing fund, a method, or a personality-inspired fund, suggest lab. Ask a short clarifying question if ambiguous.',
      'Classify the next destination using the visitor’s wording and negations. An item from the previous turn is relevant only when they clearly refer back to it. With no identified fund, offer the catalog or ask its name. Building a personal team belongs in Studio even if the user mentions an example fund.',
      'For a recognized fund, a general question, source, or invitation to study means fundAction "details". A request for a backtest, historical comparison, or reproducing past performance means "history". An unspecified replication request may start with a proposed historical study. Only the historical VWELX baseline uses 65% VYM and 35% VCIT. These weights do not set a forward decision.',
      'If they want a market fund team to decide what to do next, manage it going forward, or propose an allocation today or for a future period, choose "forward". There, separate research and risk seats advise the manager, who can choose a new allocation or hold cash. Paper execution needs later, separate approval and an eligible observation. Personas have style profiles. Opening a page starts no meeting, study or order.',
      'Ask one clarifying question if two destinations are requested and neither is preferred. The product is a paper simulation. No real quotes, verified prediction or broker access. Return only JSON {answer,route,fundAction}. route is "fund", "lab", or null. fundAction is "details", "history", "forward", or null. Use a non-null fundAction only for route "lab" and a specific identified fund. No tools or private reasoning.',
      replyLanguageInstruction(language),
    ].join('\n'), idempotencyKey, timeoutSeconds: 60, maxOutputTokens: 1600, maxStep: 1, conversational:true,
  }, options);
  if (typeof value.answer !== 'string' || !value.answer.trim() || value.answer.length > 1000 ||
      ![null, 'fund', 'lab'].includes(value.route) ||
      ![null, 'details', 'history', 'forward'].includes(value.fundAction) ||
      Object.keys(value).some(k => !['answer', 'route', 'fundAction'].includes(k))) {
    throw new ManagerUnavailable('The concierge could not finish this response. Please retry.');
  }
  let fundAction = candidate && value.route === 'lab' ? value.fundAction : null;
  if (fundAction === 'forward' && candidate.section !== 'market') fundAction = 'details';
  return { text: value.answer.trim(), route: value.route, fundAction, ...(fundAction ? { catalogId:candidate.id } : {}),
    source: 'HarnessRouter manager', ...harness, timestamp: new Date().toISOString() };
}

export function executionEvidence(run) {
  if (!run) return null;
  return { id: run.id, asOf: run.scenario.asOf, symbol: run.execution.symbol,
    source: run.scenario.source, proposal: run.decision, evidence: run.evidence,
    checks: run.policy.checks, execution: run.execution,
    cashBefore: run.portfolioBefore.cash, cashAfter: run.portfolio.cash,
    equityBefore: run.portfolioBefore.equity, equityAfter: run.portfolio.equity,
    specialistOpinions:run.reviews.map(({name,role,desk,assignmentRole,summary,source,evidenceRefs})=>({name,role,desk,assignmentRole,summary,source,evidenceRefs})),
    unconsulted:run.unconsulted?.map(({name,reason})=>({name,reason})) ?? [] };
}


export async function proposeHire({ message, language, candidates=[], team=[], idempotencyKey }, options) {
  const { value, harness } = await requestHarnessObject({
    input:{mode:'staffing-proposal',question:message,language,currentTeam:team.map(({name,title,role})=>({name,title,role})),
      availableSeats:MAX_TEAM_SIZE-team.length,candidates:candidates.map(({id,name,role,desk,duty})=>({id,name,role,desk,duty}))},
    instructions:['You are Maya preparing a staffing proposal for a paper fund, pending explicit user confirmation.',
      'Return exactly {answer,hires}. hires is a list of proposed NEW employees. You may propose people outside the candidate directory. Do not rehire someone already on the team, or claim that a hire is complete. If the request exceeds available seats, explain and return an empty list. Keep duties concise.',
      staffingSchema,
      replyLanguageInstruction(language)].join('\n'),
    idempotencyKey,timeoutSeconds:75,maxOutputTokens:4200,maxStep:1,conversational:true,
  },options);
  if (Array.isArray(value.hires)) {
    try {
      if (typeof value.answer !== 'string' || !value.answer.trim() || value.answer.length>1000) throw new RangeError();
      const hires=readStaffingPlan(value.hires,team).map(member=>{
        const match=candidates.find(c=>c.name===member.name && c.role===member.role);
        return match?{...member,id:match.id}:member;
      });
      return {draft:hires.length?{id:randomUUID(),hires}:null,advice:{text:value.answer.trim(),language,source:'HarnessRouter manager',...harness}};
    } catch { throw new ManagerUnavailable('The manager could not prepare the requested seats. Try describing the names and duties again.'); }
  }
  const candidate = candidates.find(x=>x.id===value.candidateId);
  if (typeof value.answer !== 'string' || !value.answer.trim() || value.answer.length>1000 ||
      (value.candidateId!==null && (!candidate || typeof value.duty!=='string' || !value.duty.trim() || value.duty.length>500))) {
    throw new ManagerUnavailable('The manager could not prepare a staffing proposal. Try again.');
  }
  const draft = candidate ? {id:randomUUID(),candidateId:candidate.id,name:candidate.name,role:candidate.role,desk:candidate.desk,duty:value.duty.trim()} : null;
  return { draft, advice:{text:value.answer.trim(),language,source:'HarnessRouter manager',...harness} };
}

