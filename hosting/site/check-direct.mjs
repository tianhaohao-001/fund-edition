import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {createDirectApp} from './direct-server.mjs';
const origin='https://direct-review.example',live=process.argv.includes('--hosted');
const app=await createDirectApp({database:':memory:',origin,credential:live?process.env.HARNESSROUTER_API_KEY:'unit-key'});
if(live&&!process.env.HARNESSROUTER_API_KEY)throw Error('Set the local direct runtime first.');
const password=randomBytes(24).toString('base64url');
const send=(path,{method='GET',cookie,body,headers={}}={})=>app.dispatch(new Request(origin+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:origin}:{}),...headers},...(body?{body}:{})}),'local-test');
const cookie=r=>r.headers.getSetCookie()[0].split(';')[0];
const input=(data)=>({headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const post=(cookie,topic,message,revision,action='chat')=>send('/api/chat',{method:'POST',cookie,...input({id:crypto.randomUUID(),topic,message,revision,action,language:'zh-CN'})});
try{
 const g1=await send('/api/session'),g2=await send('/api/session'),one=cookie(g1),two=cookie(g2);
 const spoofed=await (await send('/api/session',{cookie:one,headers:{'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'test@example.invalid'}})).json();assert.equal(spoofed.guest,true);
 const draft=await send('/api/draft?topic=studio',{method:'PUT',cookie:one,...input({message:'跨设备演示草稿',revision:0})});assert.equal(draft.status,200);
 assert.equal((await (await send('/api/draft?topic=studio',{cookie:two})).json()).message,'');
 const register=(email,cookieValue,mode='register')=>send('/account/session',{method:'POST',cookie:cookieValue,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password,mode,return_to:'/studio'}).toString()});
 const u1=await register('qa-owner-a@example.invalid',one),u2=await register('qa-owner-b@example.invalid',two);assert.equal(u1.status,303);assert.equal(u2.status,303);
 const firstCookie=one+'; '+cookie(u1),secondCookie=two+'; '+cookie(u2);
 const signed=await (await send('/api/session',{cookie:firstCookie})).json();assert.equal(signed.signedIn,true);
 assert.equal((await (await send('/api/draft?topic=studio',{cookie:firstCookie})).json()).message,'跨设备演示草稿');
 assert.equal((await (await send('/api/draft?topic=studio',{cookie:secondCookie})).json()).message,'');
 const login=await register('qa-owner-a@example.invalid','','login');assert.equal(login.status,303);
 assert.equal((await (await send('/api/draft?topic=studio',{cookie:cookie(login)})).json()).message,'跨设备演示草稿');
 const book=await (await send('/api/history',{cookie:firstCookie})).json();assert.equal((await send('/api/history/select',{method:'POST',cookie:secondCookie,...input({id:book.active})})).status,404);
 let receipts=[];
 if(live){
   const anonymous=cookie(await send('/api/session'));
   for(const [topic,message,revision] of [['studio','我想用五年研究现金流，风险选择稳健，只用模拟盘，请保留所有现金。',0],['studio','延续这个研究方向，单只上限改成5%，禁止买入，复述一下团队会怎么执行。',1],['active-bond','研究这只债券基金时，为什么久期估计会失效？请结合资料回答。',0]]){
     const result=await post(anonymous,topic,message,revision),out=await result.json();assert.equal(result.status,200,JSON.stringify(out));const reply=out.value.messages.at(-1);assert.ok(reply.responseId);receipts.push({topic,responseId:reply.responseId,harnessId:reply.harnessId});
   }
   const confirmed=await post(anonymous,'studio','',2,'confirm');assert.equal(confirmed.status,200);
   const after=await post(anonymous,'studio','我们刚才设定的单只仓位上限是多少？我的模拟盘有订单吗？',3);const data=await after.json();assert.equal(after.status,200,JSON.stringify(data));assert.equal(data.value.fund.orderCount,0);
   const last=data.value.messages.at(-1);receipts.push({topic:'studio-post-confirm',responseId:last.responseId,harnessId:last.harnessId});
 }
 console.log(JSON.stringify({directServer:true,environment:'in-process HTTPS Request adapter on this PC; no public listener created',fixtureAccounts:2,emailRegisterAndLogin:true,guestDraftAdopted:true,crossAccount:404,reopenNewDeviceRestored:true,externallySuppliedIdentityRejected:true,receipts}));
}finally{app.close();}
