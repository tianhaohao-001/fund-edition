import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTeam,setStudioLanguage,CANDIDATES,portrait} from '../web/team.mjs';
import {proposeTeamReply} from '../core/team-coach.mjs';

test('the occupied floors, desk introduction and hire feedback use the confirmed team',()=>{
  setStudioLanguage('en-US');
  try {
    const maya=CANDIDATES[0],leah=CANDIDATES.find(m=>m.id==='leah-kim');
    const html=renderTeam({team:[maya,leah],selectedId:leah.id,arrivals:[leah.id],fundName:'Juniper',aiReady:true});
    assert.match(html,/Juniper/);assert.match(html,/Latest arrival · Leah Kim/);assert.ok(html.includes(leah.duty));
    assert.match(html,/data-action="select-member" data-id="leah-kim"/);assert.match(html,/data-action="ask-first-duty"/);
    assert.doesNotMatch(html,/data-action="select-member" data-id="inez-rao"/);
  }finally{setStudioLanguage('zh-CN')}
});
test('employee portraits survive confirmation and arbitrary seat IDs',()=>{
  for(const name of ['Theo Park','Jules Bennett','Maya Chen','Anouk Meyer','陶晓']){
    assert.equal(portrait({name,id:'draft-person'}),portrait({name,id:'permanent-seat'}));
    assert.doesNotMatch(portrait({name}),/initials/);
    const cast=CANDIDATES.find(p=>p.name===name);
    if(cast) assert.equal(portrait({name}),portrait(cast));
  }
  assert.notEqual(portrait({name:'Theo Park'}),portrait({name:'Jules Bennett'}));
});
test('coworkers share desks, and bench focus offers reassignment without an active-seat conversation',()=>{
  setStudioLanguage('en-US');
  try {
    const [maya,theo,inez,,leah,jules]=CANDIDATES;
    const team=[maya,theo,{...inez,desk:'bench'},leah,jules];
    const staffed=renderTeam({team,selectedId:jules.id,aiReady:true});
    for(const member of team) assert.equal(staffed.split('data-action="select-member" data-id="'+member.id+'"').length,2);
    const initial=renderTeam({team,aiReady:true});
    for (const [view,atTable,otherResearchers] of [[initial,theo,[leah,jules]],[staffed,jules,[theo,leah]]]) {
      const table=view.split('data-office-desk="research"')[1].split('data-office-desk="')[0];
      const overflow=view.split('class="crew-extra office-room-overflow"')[1].split('class="office-room-bench')[0];
      assert.ok(table.includes('data-office-member="'+atTable.id+'" data-current-desk="research"'));
      assert.doesNotMatch(overflow,/<details|\shidden(?:\s|>)/u);
      for(const person of otherResearchers) assert.ok(overflow.includes('data-office-member="'+person.id+'" data-current-desk="research"'));
      const ids=[...view.matchAll(/data-office-member="([^"]+)"/gu)].map(match=>match[1]);
      assert.deepEqual(ids.sort(),team.map(member=>member.id).sort(),'Every person appears once, including bench and shared desks');
    }
    assert.match(staffed,/Risk · Open/);
    const reserve=renderTeam({team,selectedId:inez.id,aiReady:true});
    assert.match(reserve,/data-paired-seat="inez-rao"/);assert.match(reserve,/On the bench/);
    assert.match(reserve,/data-action="assign" data-id="inez-rao" data-desk="risk"/);
    assert.doesNotMatch(reserve,/data-action="ask-first-duty"|data-form="chat"/);
    assert.doesNotMatch(reserve,/data-id="maya-chen" aria-pressed="true"/);
  } finally {setStudioLanguage('zh-CN')}
});
test('the first-task briefing starts with the mandate and duty and excludes unrelated replay quotations',async()=>{
  const member=CANDIDATES[1],fund={team:[member],mandate:'Study cash conversion',chat:[],runs:[],maxWeightPercent:20,portfolio:{cashCents:840050,positions:[{symbol:'AZO',quantity:2,mark:67.8}],internalTag:'exclude'}};
  const env={FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'fixture',HARNESSROUTER_HARNESS_ID:'chrn_test'};
  const scenario={symbol:'NVDA',title:'synthetic demo',source:'synthetic replay'};
  for(const [message,first] of [['What would you check first?',true],['What price does the NVDA scenario use?',false]]){
    const reply=await proposeTeamReply({member,fund,scenario,message,language:'en-US'},{env,fetchImpl:async(u,{body})=>{
      const input=JSON.parse(JSON.parse(body).input);assert.equal(input.mandate,fund.mandate);assert.equal(input.teammate.duty,member.duty);assert.equal(input.maxWeightPercent,20);
      assert.equal(input.account.cash,8400.5);assert.deepEqual(input.account.positions,[{symbol:'AZO',quantity:2}]);assert.ok(!JSON.stringify(input.account).includes('exclude'));
      if(first){assert.ok(input.assignmentBrief.includes('ONE'));assert.equal(input.replay,undefined)}
      else{assert.equal(input.replay.source,'synthetic replay');assert.equal(input.replay.symbol,scenario.symbol)}
      return Response.json({id:'test-receipt',status:'completed',model:'fixture',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({answer:'I will compare cash generation against reported profit.'})}]}]});
    }});
    assert.equal(reply.responseId,'test-receipt');
  }
});

test('personal fund questions never import an unrun preset as portfolio evidence',async()=>{
  const member=CANDIDATES[1];
  const fund={team:[member],mandate:'Research auto-parts businesses',chat:[],runs:[],maxWeightPercent:20,
    portfolio:{cashCents:840050,positions:[{symbol:'AZO',quantity:2}]}};
  const scenario={symbol:'NVDA',title:'Unrun technology preset',summary:'A synthetic semiconductor thesis',source:'synthetic replay'};
  const env={FUNDROOM_ENABLE_HARNESS:'true',HARNESSROUTER_API_KEY:'fixture',HARNESSROUTER_HARNESS_ID:'chrn_test'};
  const sent=[];
  const options={env,fetchImpl:async(_url,{body})=>{
    sent.push(JSON.parse(JSON.parse(body).input));
    return Response.json({id:'test-receipt',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"answer":"I will inspect this paper account."}'}]}]});
  }};
  for(const message of ['How are my positions doing?','What price was used for my simulated order?','我的基金现在持有什么？']){
    await proposeTeamReply({member,fund,scenario,message,language:'en-US'},options);
    const input=sent.at(-1);
    assert.deepEqual(input.account.positions,[{symbol:'AZO',quantity:2}]);
    assert.equal(input.recordedExecution,null);
    assert.equal(input.replay,undefined);
    assert.ok(!JSON.stringify(input).includes('NVDA'));
  }
  await proposeTeamReply({member,fund,scenario,message:'Show the NVDA replay preset',language:'en-US'},options);
  assert.equal(sent.at(-1).replay.status,'unrun-preset');
  assert.match(sent.at(-1).replay.limitation,/No decision or execution/);
});
