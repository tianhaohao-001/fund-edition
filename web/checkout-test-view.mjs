import {paintLanguagePicker} from './language-picker.mjs';
import {getLanguage,setLanguage,t} from './i18n.mjs';

const url=new URL(location.href),by=id=>document.getElementById(id);
if(['zh-CN','en-US'].includes(url.searchParams.get('lang')))setLanguage(url.searchParams.get('lang'));
const selectedTerm=['monthly','yearly'].includes(url.searchParams.get('cadence'))?url.searchParams.get('cadence'):null;
let mode=url.searchParams.get('mode')||'',state,term=selectedTerm||'monthly',busy=false,restart=false,requestKey=crypto.randomUUID(),errorCode='';
const termName=value=>value==='yearly'?t('一年','one year'):t('一个月','one month');
const messages={
  'test-unverified':['核对沙盒回执时未能确认付款，可稍后重试。','The sandbox receipt could not be verified. Try again later.'],
  'test-approval-required':['请先批准测试付款。','Approve the test payment first.'],
  'test-session':['请刷新此页，重新载入测试会话。','Refresh this page to reopen your test session.'],
  'test-order-missing':['此浏览器没有这笔测试订单。','This test order is unavailable in this browser.'],
  'test-sandbox-unavailable':['当前还没有连接 PayPal 沙盒，可选择站内模拟。','PayPal Sandbox is not connected. You can use the on-site simulation.'],
  'test-pending':['请先完成或取消当前测试单。','Finish or cancel the current test order first.'],
  'billing-unavailable':['PayPal 沙盒暂未响应，请重试或选择站内模拟。','PayPal Sandbox is unavailable. Retry or choose the on-site simulation.']
};
function options(element,items,selected){element.replaceChildren(...items.map(([value,label])=>new Option(label,value,false,value===selected)));}
function display(){
  const lang=getLanguage();document.documentElement.lang=lang;
  paintLanguagePicker(by('language'),lang,next=>{setLanguage(next);url.searchParams.set('lang',next);history.replaceState({},'',url);display();});
  const copy=(id,zh,en)=>{by(id).textContent=t(zh,en);};
  copy('heading','体验付款流程','Try the checkout');document.title='Fund Edition · '+by('heading').textContent;
  copy('label','测试环境 · 零真实扣款','Test environment · No real charge');
  copy('intro','选择一个期限，体验付款和开通。测试结果可在会员页回看，正式会员资格独立计算。','Choose a term to try checkout and review your test access on the membership page. Your regular membership is tracked separately.');
  copy('back','← 我的会员资格','← My membership');by('back').href='/membership.html?view=account&lang='+lang+'&cadence='+(state?.order?.cadence||term)+(state?.testAccess.active?'&lastTest='+mode:'');
  copy('mode-label','测试方式','Test method');copy('cadence-label','测试期限','Test term');
  const sandboxLabel=t('PayPal 官方沙盒','Official PayPal Sandbox');
  options(by('test-mode'),[['simulation',t('站内模拟 · 无需账号','On-site simulation · No account needed')],...(state?.sandboxAvailable||mode==='sandbox'?[['sandbox',sandboxLabel]]:[])],mode);
  copy('mode-note',mode==='sandbox'?'使用 PayPal 沙盒买家账号，在 PayPal 批准一次性测试付款。':'由本站模拟，不连接 PayPal，不会真实扣款，无需账号。',
    mode==='sandbox'?'Approve a one-time test payment at PayPal with a sandbox buyer account.':'Simulated on this site. No connection to PayPal, no real charge, and no account needed.');
  const order=restart?null:state?.order,status=order?.status;
  const mismatch=Boolean(selectedTerm&&order?.cadence!==selectedTerm&&['new','created','approved','capturing'].includes(status));
  options(by('test-cadence'),[['monthly',t('一个月 · US$9.99','One month · US$9.99')],['yearly',t('一年 · US$99.99','One year · US$99.99')]],order&&status!=='cancelled'?order.cadence:term);
  by('test-mode').disabled=busy;by('test-cadence').disabled=busy||Boolean(order&&status!=='cancelled');
  const button=(id,visible,zh,en)=>{const element=by(id);element.hidden=!visible;element.disabled=busy;element.textContent=t(zh,en);};
  button('test-create',Boolean(state)&&(!order||['cancelled','captured','new'].includes(status)||(mode==='sandbox'&&status==='created')),status==='captured'?'再试一次':mode==='sandbox'?'前往 PayPal 沙盒':'开始测试',status==='captured'?'Try again':mode==='sandbox'?'Continue to PayPal Sandbox':'Start test');
  button('test-approve',mode==='simulation'&&status==='created','确认模拟付款','Confirm simulated payment');
  button('test-capture',['approved','capturing'].includes(status)||mode==='sandbox'&&status==='created','核验沙盒付款','Verify test payment');
  button('test-cancel',['new','created','approved'].includes(status),'取消测试单','Cancel test order');
  button('test-switch',mismatch&&status!=='capturing','取消旧测试单，改测'+termName(selectedTerm),'Cancel previous test and try '+termName(selectedTerm));
  let statusText='';
  if(state?.testAccess.active){
    const end=new Intl.DateTimeFormat(lang,{dateStyle:'long'}).format(new Date(state.testAccess.endsAt));
    statusText=t('测试权益已开通，有效至 '+end+'。','Test access is active through '+end+'.');
  }
  if(status==='cancelled')statusText=t('测试订单已取消。','Test order canceled.')+' '+statusText;
  if(['created','approved','capturing'].includes(status))statusText=t('测试订单待确认 · ','Test order awaiting confirmation · ')+'US$'+order.amountUsd+'. '+statusText;
  if(mismatch)statusText=t('已有一笔'+termName(order.cadence)+'测试单（US$'+order.amountUsd+'）。你刚选择了'+termName(selectedTerm)+'。','You have an open '+termName(order.cadence)+' test order (US$'+order.amountUsd+'). You selected '+termName(selectedTerm)+'. ')+(status==='capturing'?t('请先核验已有付款。','Verify the current payment first.'):'');
  by('test-status').textContent=statusText;by('receipt').textContent=order?.receipt?t('测试回执 ','Test receipt ')+order.receipt:'';
  by('error').textContent=errorCode?t(...(messages[errorCode]||['暂时未能完成，请重试。','Unable to finish. Please try again.'])):'';
}
async function api(action,body){
  const target='/api/checkout-test/'+action;
  const response=body?await fetch(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,mode:mode||undefined,language:getLanguage()})}):
    await fetch(target+(mode?'?mode='+encodeURIComponent(mode):''),{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw Error(data.error?.code||data.code||'test-error');
  mode=data.mode;state=data;
  if(action==='capture'&&data.testAccess?.active){try{localStorage.setItem('fundroom.lastCheckoutTest',mode);}catch{}}
}
async function task(fn){if(busy)return;busy=true;errorCode='';display();try{await fn();}catch(e){errorCode=e.message;}finally{busy=false;display();}}
function cleanReturn(){for(const key of ['order','step','token','PayerID','paymentId'])url.searchParams.delete(key);history.replaceState({},'',url);}
function goToPayPal(order){
  if(mode!=='sandbox'||!order?.approvalUrl)return;
  const link=new URL(order.approvalUrl);
  if(link.origin!=='https://www.sandbox.paypal.com')throw Error('test-unverified');
  location.assign(link.href);
}
by('test-mode').onchange=()=>{mode=by('test-mode').value;state=null;restart=false;requestKey=crypto.randomUUID();cleanReturn();url.searchParams.set('mode',mode);history.replaceState({},'',url);void task(()=>api('state'));};
by('test-cadence').onchange=()=>{term=by('test-cadence').value;requestKey=crypto.randomUUID();};
by('test-create').onclick=()=>task(async()=>{
  if(!restart&&state?.order?.status==='captured'){restart=true;requestKey=crypto.randomUUID();return;}
  if(!restart&&state?.order?.status==='created'){goToPayPal(state.order);return;}
  if(state?.order?.status==='cancelled')requestKey=crypto.randomUUID();
  await api('create',{cadence:state?.order?.status==='new'?state.order.cadence:term,requestKey});restart=false;goToPayPal(state.order);
});
by('test-approve').onclick=()=>task(async()=>{const id=state.order.id;await api('approve',{id});await api('capture',{id});});
by('test-capture').onclick=()=>task(()=>api('capture',{id:state.order.id}));
by('test-cancel').onclick=()=>task(async()=>{await api('cancel',{id:state.order.id});requestKey=crypto.randomUUID();});
by('test-switch').onclick=()=>task(async()=>{
  if(!selectedTerm||state.order.cadence===selectedTerm)return;
  term=selectedTerm;await api('cancel',{id:state.order.id});requestKey=crypto.randomUUID();
  await api('create',{cadence:term,requestKey});goToPayPal(state.order);
});
await task(async()=>{
  try{await api('state');}catch(e){
    if(e.message!=='test-sandbox-unavailable')throw e;
    mode='simulation';await api('state');throw e;
  }
  const id=url.searchParams.get('order'),step=url.searchParams.get('step');
  if(url.searchParams.get('retry')==='1'){errorCode='billing-unavailable';url.searchParams.delete('retry');history.replaceState({},'',url);}
  if(mode==='sandbox'&&id&&['return','cancel'].includes(step)){
    if(state.order?.id!==id)throw Error('test-order-missing');
    if(step==='return')await api('capture',{id});else if(state.order.status!=='captured')await api('cancel',{id});
    cleanReturn();
  }
});
