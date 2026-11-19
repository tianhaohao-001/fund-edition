import { CANDIDATES } from '../../web/team.mjs';
import { hiringIntent, proposeHire } from '../../core/concierge.mjs';
import { proposeAssignment, proposeTeamReply, assignmentIntent } from '../../core/team-coach.mjs';
import { MAX_TEAM_SIZE } from '../../core/staffing.mjs';

export function confirmedTeam(value) {
  const seats=value.fund?.team ?? value.draft?.roster ?? ['maya-chen'];
  return seats.map(seat => {
    const id=typeof seat==='string'?seat:seat.id,defaults=CANDIDATES.find(c=>c.id===id);
    return typeof seat==='string'?defaults:{...defaults,...seat};
  })
    .filter(Boolean).map(({id,name,role,desk,duty,title})=>({id,name,role,desk,duty,title}));
}

export function teamError(value,action,seatId,proposalId) {
  const team=confirmedTeam(value);
  if (!value.fund || !team.some(member=>member.id===seatId)) return 'unknown-seat';
  if (action==='hire' && seatId!=='maya-chen' || action==='assign' && seatId==='maya-chen') return 'wrong-seat';
  if (action!=='accept') return null;
  const proposal=value.fund.proposals?.[seatId];
  if (!proposal || proposal.id!==proposalId) return 'proposal-changed';
  if (proposal.hires && team.length+proposal.hires.length>MAX_TEAM_SIZE) return 'team-full';
  return null;
}

export async function teamTurn(value,{action,seatId,message,language,idempotencyKey},runtime) {
  const team=confirmedTeam(value),member=team.find(m=>m.id===seatId);
  const fund={...value.fund,team,proposals:{...value.fund.proposals},threads:{...value.fund.threads}};
  if(action==='accept'){
    const proposal=fund.proposals[seatId];
    if(proposal.hires){
      fund.team=[...team,...proposal.hires];
      fund.arrivals=proposal.hires.map(h=>h.id);
    }
    else fund.team=team.map(m=>m.id===seatId?{...m,duty:proposal.duty,title:proposal.title||m.title}:m);
    delete fund.proposals[seatId];
    return {...value,fund};
  }
  // Keep the manager's pre-formation history and each specialist's history separate.
  const prior=seatId==='maya-chen' ? value.messages : fund.threads[seatId]||[];
  const args={member,message,language,idempotencyKey};
  let advice;
  if(action==='hire'||seatId==='maya-chen'&&hiringIntent(message)){
    const result=await proposeHire({...args,team,candidates:CANDIDATES.filter(c=>!team.some(m=>c.id===m.id))},runtime);
    advice=result.advice;
    if(result.draft?.hires)fund.proposals[seatId]=result.draft;
    else delete fund.proposals[seatId];
  }else if(action==='assign'||seatId!=='maya-chen'&&assignmentIntent(message)){
    const result=await proposeAssignment(args,runtime);
    advice=result.advice;
    if(result.draft)fund.proposals[seatId]=result.draft;
    else delete fund.proposals[seatId];
  }else{
    const mandate=value.draft?.mandate||'', scenario={source:'Paper workspace',summary:'USD paper cash: '+fund.cashCents/100+'. Recorded orders: '+fund.orderCount+'. No live market feed.'};
    advice=await proposeTeamReply({...args,scenario,fund:{mandate,team,maxWeightPercent:value.draft?.maxWeightPercent,
      portfolio:Number.isSafeInteger(value.fund.cashCents) && (Array.isArray(value.fund.positions)||value.fund.orderCount===0)?{cashCents:value.fund.cashCents,positions:value.fund.positions??[]}:undefined,
      runs:[],chat:prior.map(turn=>({...turn,memberId:seatId}))}},runtime);
  }
  const turns=[{role:'user',text:message,memberId:seatId,id:crypto.randomUUID()},
    {role:'assistant',name:member.name,...advice,memberId:seatId,id:crypto.randomUUID()}];
  if(seatId==='maya-chen')return {...value,fund,messages:[...prior,...turns].slice(-120)};
  fund.threads[seatId]=[...prior,...turns].slice(-24);
  return {...value,fund};
}
