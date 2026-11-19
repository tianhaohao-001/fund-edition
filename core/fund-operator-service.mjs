import { operatorMandate, runForwardMeeting, explainForward } from './fund-operator.mjs';
import { ForwardError, emptyBook, digest, approveDecision, revokeDecision, settleDecision, compareForward } from './fund-operator-ledger.mjs';
import { ManagerUnavailable } from './manager.mjs';

const scopedRequest = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,90}$/;
const actions = new Set(['meet','approve','withdraw','settle','ask','compare']);
export function viewForward(data,id,language) {
  const mandate=operatorMandate(id,language);
  return {mandate,book:data.forwardFunds?.[id]??emptyBook()};
}
export async function actForward({id,body,language,store,authorize,readReference,budget,provider,env,fetchImpl}) {
  const {catalogId,action,decisionId,requestId}=body;
  const legalFields=['catalogId','action','decisionId','requestId','language',...(action==='ask'?['question']:[])];
  if(!actions.has(action)||typeof requestId!=='string'||!scopedRequest.test(requestId)||requestId.startsWith('schedule:')||
     Object.keys(body).some(k=>!legalFields.includes(k)) || (action!=='meet' && (typeof decisionId!=='string'||!scopedRequest.test(decisionId))) ||
     (action==='ask' && (typeof body.question!=='string'||body.question.trim().length<1||body.question.length>800))) {
    throw new ForwardError('operator-request','Invalid forward-operation request.',400);
  }
  authorize();
  const {data,revision}=store.read(id), {mandate,book}=viewForward(data,catalogId,language);
  const signature=digest(['forward-paper-v1',action,catalogId,decisionId??null,...(action==='ask'?[body.question.trim()]:[])]);
  const prior=store.readReceipt(id,requestId);
  if(prior) {
    if(prior.signature!==signature) throw new ForwardError('operator-request','This request ID is already in use.');
    return {mandate,book,receipt:prior.run};
  }
  let record,activity;
  try {
    if(action==='meet') {
      if(!provider.chatEnabled) throw new ManagerUnavailable('A configured HarnessRouter is required for this fund team.');
      activity=store.activity.start(id,requestId,'forwardMeeting',signature);
      if(!activity) throw new ForwardError('operator-pending','This meeting is already running.');
      record=await budget(3,()=>runForwardMeeting({mandate,book,language,id:requestId,idempotencyKey:id+':'+requestId,
        emit:activity.emit,readReference},{env,fetchImpl}));
    } else if(action==='ask') {
      if(!provider.chatEnabled) throw new ManagerUnavailable('The manager requires HarnessRouter.');
      record=await budget(1,()=>explainForward({book,decisionId,question:body.question.trim(),language,
        idempotencyKey:id+':'+requestId},{env,fetchImpl}));
      book.questions??=[];
      book.questions.push(record);
    } else if(action==='approve') {
      record=approveDecision(book,decisionId,new Date().toISOString());
    } else if(action==='withdraw') {
      record=revokeDecision(book,decisionId,new Date().toISOString());
    } else {
      const order=book.orders.findLast(o=>o.decisionId===decisionId);
      const decision=book.decisions.find(d=>d.id===decisionId);
      const symbols=action==='compare'?['VWELX',...Object.keys(order?.after?.unitsMicros??{})]:
        order?.status==='authorized' ? [...new Set([...(decision?.record.proposal?.targets??[]).map(t=>t.symbol),...Object.keys(book.unitsMicros),
          ...(catalogId==='wellington'?['VWELX']:[])])]:[];
      const values=await Promise.allSettled(symbols.map(s=>readReference(s)));
      const references=Object.fromEntries(symbols.map((s,i)=>[s,values[i].value]));
      record=action==='compare'?compareForward(book,decisionId,references,new Date().toISOString()):
        settleDecision(book,decisionId,references,new Date().toISOString());
    }
    authorize();
    data.forwardFunds??={};
    data.forwardFunds[catalogId]=book;
    const receipt={action,catalogId,decisionId:action==='meet'?record.id:decisionId,recordedStatus:record.status??(action==='ask'?'answered':'compared'),
      ...(action==='ask'?{responseId:record.responseId}:{})};
    store.save(id,revision,data,{requestId,signature,run:receipt});
    activity?.finish(record.status==='sealed'?'complete':'failed');
    return {mandate,book,receipt};
  } catch(error) {
    activity?.finish('failed'); throw error;
  }
}

