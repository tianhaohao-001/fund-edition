import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestedAnswers } from '../web/studio-answers.mjs';

const guide=(question,profile={})=>({phase:'discovery',profile,messages:[{role:'assistant',text:question}]});
test('Studio replies follow Maya’s current question in the selected display language',()=>{
  const welcome=suggestedAnswers({phase:'discovery',messages:[{id:'welcome',role:'assistant'}]},'zh-CN');
  assert.equal(welcome.length,3);
  assert.equal(new Set(welcome).size,3);
  const horizon=suggestedAnswers(guide('现金流是个好方向。你想持有多久？',{goal:'cash flow'}),'en-US');
  assert.ok(horizon.every(answer=>/months|years/u.test(answer)));
  const risk=suggestedAnswers(guide('Five years is clear. What downside are you comfortable with?',{goal:'cash flow',horizon:'five years'}),'zh-CN');
  assert.equal(risk.length,3);
  assert.ok(risk.every(answer=>/保守|波动/u.test(answer)));
  const cap=suggestedAnswers(guide('你想设定多少仓位上限？'),'en-US');
  assert.equal(cap.length,2);
  assert.ok(cap.every(answer=>answer.includes('%')));
});
test('Unfamiliar questions offer clarification while sign-off and completed briefs stay manual',()=>{
  assert.equal(suggestedAnswers(guide('还想告诉我什么？')).length,2);
  assert.deepEqual(suggestedAnswers(guide('Would you confirm the position cap?')),[]);
  assert.deepEqual(suggestedAnswers({...guide('风险多高？'),phase:'ready'}),[]);
  assert.deepEqual(suggestedAnswers({...guide('风险多高？'),draft:{id:'my-draft'}}),[]);
  assert.deepEqual(suggestedAnswers({phase:'discovery',messages:[{role:'user',text:'How long?'}]}),[]);
});

test('a manager asking how to react to a portfolio decline offers two pertinent replies',()=>{
  const zh=suggestedAnswers(guide('如果这只模拟基金某年账面下跌约两成，你更倾向继续持有等待价值回归，还是会感到不安？'),'zh-CN');
  assert.equal(zh.length,2);
  assert.match(zh[0],/降低仓位/u);
  assert.match(zh[1],/继续持有/u);
  const en=suggestedAnswers(guide('If the fund fell by 20%, would you hold or feel uneasy?'),'en-US');
  assert.equal(en.length,2);
  assert.match(en[1],/would hold/u);
  assert.match(suggestedAnswers(guide('营业收入下跌是在哪个季度？'),'en-US')[0],/example/u);
  assert.deepEqual(suggestedAnswers(guide('基金下跌后，是否授权减少仓位？')),[]);
});

test('real turns prefer the manager’s localized replies and retain language-switch fallbacks',()=>{
  const sample=guide('When should the team check in?');
  Object.assign(sample.messages[0],{language:'en-US',suggestedReplies:['Once a week.','After material news.']});
  assert.deepEqual(suggestedAnswers(sample,'en-US'),sample.messages[0].suggestedReplies);
  assert.match(suggestedAnswers(sample,'zh-CN')[0],/能给我/u);
  sample.messages[0].text='Would you authorize this order?';
  assert.deepEqual(suggestedAnswers(sample,'en-US'),[]);
});

test('newcomers can ask for help and respond to a naming question in either language',()=>{
  const initial=suggestedAnswers({phase:'discovery',messages:[]},'zh-CN');
  assert.match(initial[1],/还没想好/);
  for(const prompt of ['希望这家模拟基金叫什么名字？','What would you like to call your fund?']){
    const names=suggestedAnswers(guide(prompt),'en-US');
    assert.equal(names.length,2);assert.ok(names.every(reply=>reply.startsWith('Name it ')));
  }
  assert.match(suggestedAnswers(guide('这会降低组合的波动。'),'zh-CN')[0],/依据/);
});


test('replay understands each recommended English holding period',async()=>{
  const {newGuide,designConversationTurn}=await import('../core/conversation.mjs');
  const language='en-US';
  const initial=await designConversationTurn({guide:newGuide(language),message:'Research cash flow quality',language});
  const suggestions=suggestedAnswers(guide('How long should the fund hold investments?',initial.profile),language);
  assert.equal(suggestions.length,3);
  for(const answer of suggestions){
    const response=await designConversationTurn({guide:initial,message:answer,language});
    assert.match(response.profile.horizon,/(month|year)/iu);
    const ready=await designConversationTurn({guide:response,message:'I prefer a conservative approach with small drawdowns.',language});
    assert.equal(ready.phase,'ready');
  }
});
