import { paintLanguagePicker } from './language-picker.mjs';
import {orderPanel,unresolvedOrder} from './one-time-membership.mjs';
import { annualFeeExample, MEMBERSHIP_PLAN as plan } from './membership-plan.mjs';
import { getLanguage, LANGUAGES, setLanguage, t } from './i18n.mjs';

const url = new URL(location.href);
if (LANGUAGES.some(item => item.id === url.searchParams.get('lang'))) setLanguage(url.searchParams.get('lang'));
const article = document.querySelector('#plans');
const notice = document.querySelector('#notice');
const languageButton = document.querySelector('#language');
let membership;
let assets = '10000';
let workspaceHome='/#/fund';
let pending=false;
let resultMessage;
let needsLogin=false;
let lastTest,checkoutAvailability,openingTest=false;
const ordersView=()=>url.searchParams.get('view')==='orders';
function testPage(term=cadence(),mode=''){
  const params=new URLSearchParams({lang:getLanguage(),cadence:term});
  if(mode)params.set('mode',mode);
  return '/checkout-test.html?'+params;
}
async function testApi(action,body){
  const result=await fetch('/api/checkout-test/'+action,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
  if(!result.ok)throw Error('test-unavailable');
  return result.json();
}
function testPanel(){
  const sandbox=checkoutAvailability?.sandboxAvailable;
  const label=sandbox?t('用 PayPal 测试付款','Test checkout with PayPal'):t('立即测试付款','Try test checkout now');
  return '<p class="fine">'+(sandbox?t('PayPal 沙盒 · 真实扣款 US$0。使用沙盒买家账号确认。','PayPal Sandbox · Actual charge US$0. Confirm with a sandbox buyer account.'):
    sandbox===false?t('站内付款模拟 · 真实扣款 US$0。','On-site checkout simulation · Actual charge US$0.'):t('一次性付款测试 · 真实扣款 US$0。','One-time checkout test · Actual charge US$0.'))+'</p>'+
    '<a class="commit login-to-checkout" id="try-checkout" href="'+testPage()+'">'+label+'</a>'+
    '<p><a id="official-orders" href="'+viewUrl('orders')+'">'+t('正式购买与我的订单','Real purchases and my orders')+' →</a></p>';
}
function hasDirectTerm(){return membership?.directPaymentTerms?.includes(cadence());}
function priceCardCheckout(){
  if(!membership)return '<p class="fine">'+t('正在读取付款方式…','Loading payment options…')+'</p>';
  if(ordersView())return checkoutPanel();
  if(!hasDirectTerm()&&!currentPurchase())return testPanel();
  return checkoutPanel()+'<p><a id="official-orders" href="'+viewUrl('orders')+'">'+t('我的正式订单','My purchase history')+
    ' →</a> · <a id="try-checkout" href="'+testPage()+'">'+t('试用零扣款结账','Try a zero-charge checkout')+'</a></p>';
}
async function startTest(event){
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();if(openingTest)return;
  const term=cadence(),lang=getLanguage(),link=document.getElementById('try-checkout');
  openingTest=true;link.setAttribute('aria-busy','true');
  link.textContent=t('正在打开测试付款…','Opening test checkout…');
  for(const option of article.querySelectorAll('[data-cadence]'))option.disabled=true;
  try{
    await firstTestState;
    const previous=await testApi('state'),mode=previous.mode;
    const open=previous.order&&['new','created','approved','capturing'].includes(previous.order.status)?previous.order:null;
    const dest=testPage(term,mode);
    if(open&&(open.cadence!==term||['approved','capturing'].includes(open.status))){location.assign(dest);return;}
    const result=await testApi('create',{cadence:term,mode,language:lang,requestKey:crypto.randomUUID()});
    if(mode==='sandbox'&&result.order?.approvalUrl){
      const approval=new URL(result.order.approvalUrl);
      if(approval.origin!=='https://www.sandbox.paypal.com'||approval.username||approval.password)throw Error('test-approval');
      location.assign(approval.href);return;
    }
    location.assign(dest);
  }catch{
    // Preserve the selected term and give the user a retry or the clearly marked local simulation.
    location.assign(testPage(term)+'&retry=1');
  }finally{openingTest=false;render();}
}
function showTestReceipt(){
  const status=document.querySelector('#test-access-summary');
  if(!status||!lastTest?.testAccess?.active)return;
  const when=date(lastTest.testAccess.endsAt);
  status.textContent=lastTest.mode==='sandbox'?t('PayPal 沙盒测试权益至 '+when,'PayPal Sandbox test access through '+when):
    t('站内模拟测试权益至 '+when,'On-site simulation access through '+when);
  status.hidden=false;
  const receipt=document.createElement('a');
  receipt.href=testPage(lastTest.testAccess.cadence,lastTest.mode);
  receipt.textContent=t('查看测试回执','View test receipt');
  status.append(' · ',receipt);
}
let cancelReview=false;
let orderAccount=null,orderReview=false,orderContact=null,orderConsent=false,orderKey=null;
function currentPurchase(){
  if(membership?.checkoutMode!=='one-time')return null;
  const open=unresolvedOrder(orderAccount?.orders);
  return ordersView()||open?.method==='goods-link'||membership.directPaymentTerms?.length?open:null;
}
function restorePurchaseTerm(){
  const current=currentPurchase(),selected=url.searchParams.get('cadence'),requested=url.searchParams.get('switchTo');
  if(current){
    if(['monthly','yearly'].includes(selected)&&selected!==current.cadence)url.searchParams.set('switchTo',selected);
    url.searchParams.set('cadence',current.cadence);
    if(url.searchParams.get('switchTo')===current.cadence)url.searchParams.delete('switchTo');
  }else if(requested){
    if(['monthly','yearly'].includes(requested))url.searchParams.set('cadence',requested);
    url.searchParams.delete('switchTo');
  }
  if(url.href!==location.href)history.replaceState(history.state,'',url);
}
function cadence(){
  const selected=currentPurchase()?.cadence??url.searchParams.get('cadence')??membership?.subscription?.cadence??membership?.checkout?.cadence;
  return selected==='yearly'&&(!ordersView()||membership?.billingProvider!=='stripe')?'yearly':'monthly';
}
function priceLabel(term=cadence()) {
  return term==='yearly'?t('US$99.99 / 年','US$99.99 / year'):t('US$9.99 / 月','US$9.99 / month');
}
function plansPicker(){
  if(ordersView()&&(membership?.billingProvider==='stripe'||(membership?.checkoutMode!=='one-time'&&membership?.subscription?.status!=='inactive')))return '';
  return '<div class="cadence-picker" role="group" aria-label="'+t('付款周期','Billing frequency')+'">'+['monthly','yearly'].map(term=>
    '<button type="button" data-cadence="'+term+'" aria-pressed="'+(term===cadence())+'" '+(pending?'disabled':'')+'>'+
    (term==='yearly'?t('年付','Yearly'):t('月付','Monthly'))+'</button>').join('')+'</div>';
}
function testCopy(){return membership.billingProvider==='paypal'?t('PayPal 沙盒，使用测试账户，不扣款。','PayPal sandbox. Use a test account. No charge.'):
  t('Stripe 测试模式，不扣款。','Stripe test mode. No charge.');}

function viewUrl(view) {
  const target=new URL(url);
  target.searchParams.set('view',view);
  target.searchParams.set('lang',getLanguage());
  target.searchParams.delete('step');
  target.hash='';
  return target.pathname+target.search;
}

function button(action, label, primary=false) {
  return '<button type="button" data-member-action="'+action+'" class="'+(primary?'commit':'secondary')+'" '+(pending?'disabled':'')+'>'+label+'</button>';
}

function membershipStatus() {
  if(membership?.subscription.status==='canceling')return t('已取消续订','Renewal canceled');
  if(membership?.subscription.status==='active')return membership.subscription.simulated?t('高级会员 · 模拟','Premium · simulated'):t('高级会员','Premium member');
  if(membership?.trialStatus==='trial')return t('七天试用中','Seven-day trial');
  if(membership?.trialStatus==='expired')return t('试用已结束','Trial ended');
  return t('基础资格','Free access');
}

function loginForCheckout() {
  const href=workspaceHome.startsWith('/#')?'/?auth=membership&purchase=orders&lang='+getLanguage()+'&cadence='+cadence():
    '/account?return_to='+encodeURIComponent(viewUrl('orders')+'&step=purchase');
  const label=hasDirectTerm()?t('登录并用 PayPal 付款','Sign in to pay with PayPal'):membership?.checkoutMode==='one-time'?t('登录申请付款单','Sign in to request payment'):t('登录并继续结账','Sign in and continue checkout');
  return '<a class="commit login-to-checkout" href="'+href+'">'+label+'</a>';
}

function checkoutPanel() {
  if(!membership)return '';
  const mode=membership.checkoutMode, sub=membership.subscription;
  if(mode==='one-time')return orderPanel({membership,account:orderAccount,cadence:cadence(),t,button,login:loginForCheckout(),contact:orderContact,
    consent:orderConsent,review:orderReview||(hasDirectTerm()&&url.searchParams.get('step')==='purchase'),formatDate:date,
    changingTerm:Boolean(currentPurchase()&&url.searchParams.has('switchTo'))});
  if(sub.status!=='inactive') {
    const canceling=sub.status==='canceling';
    const paypalCancel=mode==='live'&&membership.billingProvider==='paypal'&&!canceling&&!needsLogin
      ?cancelReview?'<p>'+t('确认停止 PayPal 自动续订？已付权益保留至本期结束。','Stop PayPal renewal? Paid access continues to the end of this period.')+'</p>'+button('cancel-payment',t('确认停止续订','Confirm cancellation'))+button('keep-payment',t('保留续订','Keep renewal')):button('review-cancel',t('取消续订','Cancel renewal')):'';
    return '<div class="checkout-box" id="checkout"><h3>'+membershipStatus()+'</h3><p>'+
      (canceling?t('可使用至 ','Access through '):t('本周期至 ','Current period ends '))+date(sub.periodEnd)+'</p>'+
      (sub.simulated?'<p class="fine">'+t('本机模拟。实际扣款 US$0。','Local simulation. Amount charged: US$0.')+'</p>':membership.billingTestMode?'<p class="fine">'+testCopy()+'</p>':'')+
      (mode==='live'?(needsLogin?loginForCheckout():button('portal',t('管理订阅','Manage subscription'))+paypalCancel):mode==='simulation'?button(canceling?'resume':'cancel',canceling?t('恢复续订','Resume renewal'):t('取消续订','Cancel renewal')):'')+'</div>';
  }
  if(mode==='simulation' && membership.checkout && url.searchParams.get('step')==='review')return '<div class="checkout-box" id="checkout" tabindex="-1"><h3>'+
    t('确认模拟订阅','Review your simulated subscription')+'</h3><dl><div><dt>'+t('订阅价格','Subscription price')+'</dt><dd>'+priceLabel(membership.checkout.cadence)+'</dd></div><div><dt>'+
    t('本次实际扣款','Amount charged today')+'</dt><dd>US$0.00</dd></div></dl><p>'+t('无需银行卡。可在「我的会员资格」取消或恢复模拟续订。','No card required. You can cancel or resume simulated renewal in My membership.')+'</p><div class="actions">'+
    button('confirm',t('确认开通模拟会员','Confirm simulated membership'),true)+button('back',t('返回','Back'))+'</div></div>';
  if(mode==='live'){
    const testMode=membership.billingTestMode;
    const description=testMode?testCopy():priceLabel()+' · '+t('自动续订。付款前可在安全结账页核对金额。','Renews automatically. Review the amount at secure checkout before paying.');
    if(membership.pendingCadence&&membership.pendingCadence!==cadence()){
      return '<p>'+t('你已有一笔等待 PayPal 批准的','A previous PayPal checkout is awaiting approval: ')+priceLabel(membership.pendingCadence)+'</p>'+
        button('abandon-pending',t('取消待批准订单，再选新方案','Cancel pending checkout to switch plans'),true)+
        button('use-pending',t('回到原方案','Return to original plan'))+'<p class="fine">'+description+'</p>';
    }
    const control=needsLogin?loginForCheckout():
      button('checkout',membership.billingProvider==='paypal'?t('使用 PayPal 订阅','Subscribe with PayPal'):url.searchParams.get('step')==='purchase'?t('继续安全结账','Resume secure checkout'):t('前往安全结账','Continue to secure checkout'),true);
    const portal=membership.hasBillingAccount&&!needsLogin?button('portal',t('管理账单','Manage billing')):'';
    return '<div class="actions">'+control+portal+'</div><p class="fine">'+description+'</p>';
  }
  if(mode==='simulation')return button('prepare',t('体验模拟开通','Try simulated checkout'),true)+'<p class="fine">'+t('本机模拟结账，无需银行卡，全程零扣款。','Local checkout demonstration. No card or charge.')+'</p>';
  return '<p class="fine">'+t('在线订阅尚未开放。你可以先与 Maya 对话，创建自己的模拟基金。','Online subscriptions are not open yet. Talk to Maya and start a paper fund.')+'</p>';
}

function money(number) {
  return new Intl.NumberFormat(getLanguage(),{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol'}).format(number);
}

function date(value) {
  return new Intl.DateTimeFormat(getLanguage(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}

function trialCopy() {
  if (!membership) return t('正在读取你的工作室状态。','Loading your Studio access.');
  if (membership.status === 'member') return t('可继续使用你的模拟团队、研究与审议。','Your paper team, research conversations and reviews are available.');
  if (membership.status === 'expired') return t(
    `试用于 ${date(membership.endsAt)} 结束。历史持仓、收益和已保存的决定仍可查看。新的自建 AI 团队对话与审议已暂停。`,
    `Your trial ended on ${date(membership.endsAt)}. Holdings, returns and saved decisions remain available. New Studio AI conversations and reviews are paused.`);
  if (membership.status === 'trial') return t(
    `试用剩余 ${membership.daysRemaining} 天，将于 ${date(membership.endsAt)} 结束。`,
    `${membership.daysRemaining} days left in your trial. It ends on ${date(membership.endsAt)}.`);
  return t('首次确认创建自己的模拟基金时开始 7 天试用。','Your seven-day trial starts when you confirm your first custom paper fund.');
}

function updateFees() {
  const target = document.querySelector('#figures');
  const input = document.querySelector('#assets');
  if (input.value === '' || !input.validity.valid) {
    target.textContent = t('请输入有效的美元余额。','Enter a valid dollar balance.');
    return;
  }
  const example = annualFeeExample(Number(input.value));
  const values = [
    [t('拟议平台费 · 0.15%','Proposed platform fee · 0.15%'),example.platform],
    [t('底层基金费用估算 · 0.0365%','Estimated underlying fund expenses · 0.0365%'),example.underlying],
    [t('合计估算 · 0.1865%','Estimated total · 0.1865%'),example.combined],
    [t('原基金 VWELX 公布费用率 · 0.24%','VWELX published expense ratio · 0.24%'),example.wellington],
    [t('假设比较费率 · 0.50%','Illustrative comparison rate · 0.50%'),example.comparison],
  ];
  target.innerHTML=values.map(([label,amount])=>`<div><dt>${label}</dt><dd>${money(amount)}</dd></div>`).join('');
}

function render() {
  const account = url.searchParams.get('view')==='account';
  document.documentElement.lang=getLanguage();
  paintLanguagePicker(languageButton,getLanguage(),changeHeaderLanguage);
  const brand=t('Fund Edition','Fund Edition');
  document.querySelector('header .brand').textContent=brand;
  const heading=ordersView()?t('正式购买与我的订单','Real purchases and my orders'):account?t('我的会员资格','My membership'):t('高级 AI 团队会员','Advanced AI Team membership');
  document.title=brand+' · '+heading;
  const fund=url.searchParams.get('from');
  const back=document.querySelector('#back');
  const dest=new URL(workspaceHome,location.origin);
  if(fund){if(dest.hash){dest.searchParams.set('catalog',fund);dest.hash='/lab'}else{dest.pathname='/funds';dest.searchParams.set('id',fund)}}
  dest.searchParams.set('lang',getLanguage());
  back.href=dest.href;
  back.textContent=fund?t('← 返回基金研究','← Back to fund research'):t('← 返回工作室','← Back to Studio');
  article.innerHTML=`<section class="member-hero"><div class="member-intro"><h1>${heading}</h1><p class="lead">${account&&membership?membershipStatus():t('每一笔模拟交易，都能问 Maya 为什么。','Ask Maya what drove each paper trade.')}</p>
    <a href="${viewUrl(account?'plan':'account')}">${account?t('查看会员权益','Explore membership benefits'):t('查看我的资格','View my membership')} ↗</a>
    <p class="fine" id="test-access-summary" hidden></p></div>
    <div class="plan-card">${account?'<h2>'+t('高级 AI 团队会员','Advanced AI Team membership')+'</h2>':''}${membership?plansPicker()+'<p class="price">US$'+(cadence()==='yearly'?plan.yearlyUsd:plan.monthlyUsd)+'<small> / '+(cadence()==='yearly'?t('年','year'):t('月','month'))+'</small></p>':''}<p>${trialCopy()}</p>${priceCardCheckout()}</div></section>
    <section class="benefits"><h2>${t('会员权益','What membership includes')}</h2>
    <div><h3>${t('与 Maya 持续对话','Keep talking with Maya')}</h3><p>${t('用自己的话调整研究方向，追问一笔模拟操作的依据。','Refine your mandate in your own words or ask what led to a paper trade.')}</p></div>
    <div><h3>${t('召集你的 AI 团队','Convene your AI team')}</h3><p>${t('让研究、组合与独立风控席审议同一个想法，查看每一席的意见。','Bring research, portfolio and risk specialists together and review their contributions.')}</p></div>
    <div><h3>${t('回顾模拟组合','Revisit your paper portfolio')}</h3><p>${t('查看持仓、收益及决策记录。会员结束后，历史记录仍可查看。','Review holdings, paper returns and decisions. Your records remain available when membership ends.')}</p></div></section>
    <details id="fees" ${url.hash==='#fees'?'open':''}><summary>${t('共享策略的年费试算','Annual cost of a shared strategy')}</summary>
    <p>${t('以 VWELX 研究组合举例，按平均余额计算一年费用。其他基金需要单独核算。模拟账户当前管理费为零。','The VWELX research portfolio illustrates one year of expenses at an average balance. Other strategies require their own estimates. Current paper accounts pay no management fee.')}</p>
    <label for="assets">${t('平均资产（美元）','Average assets (USD)')} <input id="assets" type="number" min="0" max="1000000000000" step="any" inputmode="decimal"></label><dl id="figures" aria-live="polite"></dl>
    <p class="fine">${t('假设 65% VYM 和 35% VCIT，发行人费用率分别为 0.04% 和 0.03%。真实配置会变化。估算未计点差、税和其他交易成本；两种策略的持仓与收益也可能不同。每项费用四舍五入到美分。','Assumes 65% VYM and 35% VCIT, with published expense ratios of 0.04% and 0.03%. Actual allocations vary. Spread, tax and other trading costs are excluded. Holdings and returns can differ. Line items rounded to cents.')}</p>
    <p class="fine"><a href="https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/fact-sheet/F0923.pdf" target="_blank" rel="noreferrer">VYM</a> · <a href="https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/investment-profiles/3146.pdf" target="_blank" rel="noreferrer">VCIT</a> · <a href="https://investor.vanguard.com/investment-products/mutual-funds/profile/vwelx" target="_blank" rel="noreferrer">VWELX</a></p></details>
    `;
  const input=document.querySelector('#assets');
  input.value=assets;
  input.addEventListener('input',()=>{assets=input.value;updateFees();});
  updateFees();
  showTestReceipt();
  notice.textContent=resultMessage?t(...resultMessage):'';
}

async function loadMembership() {
  const response=await fetch('/api/membership',{cache:'no-store'});
  if(!response.ok)throw Error('membership-unavailable');
  const result=await response.json();
  membership=result.membership;
  orderAccount=result.orderAccount??null;
  workspaceHome=result.workspaceHome || '/#/fund';
  restorePurchaseTerm();
}

article.addEventListener('click',async event=>{
  if(event.target.closest('#try-checkout')){await startTest(event);return;}
  const copy=event.target.closest('[data-copy-order]')?.dataset.copyOrder;
  if(copy){
    try{await navigator.clipboard.writeText(copy);notice.textContent=t('已复制订单号。','Order number copied.');}
    catch{notice.textContent=t('可以手动复制此订单号 ','Copy this order number manually: ')+copy;}
    return;
  }
  const receipt=event.target.closest('[data-report-receipt]')?.dataset.reportReceipt;
  if(receipt&&!pending){
    const field=document.getElementById('receipt-'+receipt);
    if(!field?.reportValidity())return;
    pending=true;
    try{await orderAction({action:'reportReceipt',orderId:receipt,transactionId:field.value.trim()});await loadMembership();
      resultMessage=['交易号已提交，正在等待核对。','Transaction ID submitted for review.'];}
    catch{resultMessage=['暂未保存，请检查订单后重试。','Could not save the transaction ID. Check the order and try again.'];}
    finally{pending=false;render();}return;
  }
  const withdraw=event.target.closest('[data-withdraw]')?.dataset.withdraw;
  const cancelOrder=event.target.closest('[data-cancel-order]')?.dataset.cancelOrder;
  if((withdraw||cancelOrder)&&!pending){
    pending=true;render();
    try{await orderAction({action:withdraw?'withdraw':'requestCancellation',orderId:withdraw??cancelOrder});await loadMembership();
      resultMessage=withdraw?['已撤回付款申请。','Payment request withdrawn.']:['撤单申请已送达。','Cancellation request received.'];}
    catch{resultMessage=['订单刚有更新，请刷新查看。','Your order changed. Refresh to view it.'];}
    finally{pending=false;render();}return;
  }
  const term=event.target.closest('[data-cadence]')?.dataset.cadence;
  if(term&&!pending){
    const open=currentPurchase();
    if(open){
      if(term===open.cadence)url.searchParams.delete('switchTo');
      else url.searchParams.set('switchTo',term);
      url.searchParams.set('cadence',open.cadence);history.replaceState(history.state,'',url);resultMessage=null;render();
      document.querySelector('#open-order-summary')?.focus();return;
    }
    url.searchParams.set('cadence',term);url.searchParams.delete('step');orderConsent=false;orderKey=null;history.replaceState(history.state,'',url);render();return;
  }
  const action=event.target.closest('[data-member-action]')?.dataset.memberAction;
  if(!action||pending)return;
  if(action==='return-to-order'){
    url.searchParams.delete('switchTo');history.replaceState(history.state,'',url);render();document.querySelector('#open-order-summary')?.focus();return;
  }
  if(action==='review-order'||action==='leave-order'){
    orderReview=action==='review-order';orderConsent=false;orderKey=null;
    if(!orderReview){url.searchParams.delete('step');history.replaceState(history.state,'',url);}
    render();document.querySelector('#invoice-recipient')?.focus();return;
  }
  if(action==='submit-order'){
    const field=document.querySelector('#invoice-recipient'),check=document.querySelector('#invoice-consent');
    if(!field?.value.trim()||!field.reportValidity()||(!hasDirectTerm()&&!check?.checked)){notice.textContent=hasDirectTerm()?t('请核实付款账户邮箱。','Check your paying account email.'):t('请核实收件邮箱，并同意接收本单付款请求。','Check the email and consent to this payment request.');return;}
    orderContact=field.value.trim();orderConsent=true;orderKey??=crypto.randomUUID();pending=true;render();
    try{
      const response=await orderAction({action:'request',requestKey:orderKey,cadence:cadence(),email:orderContact,consent:true});await loadMembership();
      orderReview=false;orderKey=null;url.searchParams.set('view','orders');history.replaceState(history.state,'',url);
      resultMessage=response.order?.method==='goods-link'?['订单已就绪，可以前往 PayPal 付款。','Your order is ready. Continue to PayPal to pay.']:['申请已保存。可在这里查看个人订单。','Your request is saved. Check your private order here.'];
    }catch{await loadMembership().catch(()=>{});resultMessage=['请核对当前订单状态后重试。','Check your order status before retrying.'];}
    finally{pending=false;render();}return;
  }
  if(action==='use-pending'&&membership.pendingCadence){url.searchParams.set('cadence',membership.pendingCadence);history.replaceState(history.state,'',url);render();return;}
  if(action==='review-cancel'||action==='keep-payment'){cancelReview=action==='review-cancel';render();return;}
  if(action==='back'){
    url.searchParams.delete('step');history.replaceState(history.state,'',url);render();return;
  }
  pending=true;resultMessage=null;render();
  try {
    if(action==='cancel-payment'||action==='abandon-pending'){
      const response=await fetch('/api/billing/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,onlyPending:action==='abandon-pending'})});
      if(!response.ok)throw Error('billing-unavailable');
      cancelReview=false;await loadMembership();
      if(action==='abandon-pending')resultMessage=['旧订单已在 PayPal 取消。现在可以按新方案继续。','PayPal canceled the old checkout. You can now continue with the new plan.'];return;
    }
    if(action==='checkout'||action==='portal'){
      const response=await fetch('/api/billing/'+action,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({language:getLanguage(),cadence:cadence(),returnPath:viewUrl('orders')})});
      if(response.status===401){needsLogin=true;resultMessage=['登录后将回到会员结账。','Sign in to return to membership checkout.'];return}
      if(!response.ok){
        const info=await response.json().catch(()=>({}));
        if(info.code==='billing-pending'){await loadMembership();resultMessage=['请先完成或管理已有的订阅，再选择新方案。','Please complete or manage your existing subscription before selecting a new plan.'];return;}
        throw Error('billing-unavailable');
      }
      const target=new URL((await response.json()).url);
      const provider=membership.checkoutMode==='one-time'?membership.legacyProvider:membership.billingProvider;
      const allowed=provider==='paypal'?[membership.billingTestMode?'www.sandbox.paypal.com':'www.paypal.com']:['checkout.stripe.com','billing.stripe.com'];
      if(target.protocol!=='https:' || !allowed.includes(target.host) || target.username || target.password)throw Error('billing-link');
      location.assign(target.href);
      return;
    }
    const payload={action,revision:membership.revision};
    if(action==='prepare')payload.cadence=cadence();
    if(action==='confirm')payload.checkoutId=membership.checkout?.id;
    const response=await fetch('/api/membership',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if (!response.ok) {if(response.status===409)await loadMembership();throw Error('membership-update')}
    membership=(await response.json()).membership;
    if(action==='prepare')url.searchParams.set('step','review');
    else {
      url.searchParams.set('view','orders');url.searchParams.delete('step');
      resultMessage=action==='confirm'?['模拟会员已开通，实际扣款 US$0。','Simulated membership is active. Amount charged: US$0.']:
        action==='cancel'?['已取消续订，本周期仍可使用。','Renewal canceled. Access continues through the current period.']:['已恢复模拟续订。','Simulated renewal resumed.'];
    }
    history.replaceState(history.state,'',url);
  } catch {
    resultMessage=['暂未完成。请检查当前资格，再重试。','This change did not finish. Check your membership and try again.'];
  } finally {
    pending=false;render();document.querySelector('#checkout')?.focus();
  }
});

function changeHeaderLanguage(value){
  setLanguage(value);
  url.searchParams.set('lang',getLanguage());history.replaceState(history.state,'',url);notice.textContent='';render();
}
article.addEventListener('input',event=>{
  if(event.target.id==='invoice-recipient'){orderContact=event.target.value;orderKey=null;}
  if(event.target.id==='invoice-consent')orderConsent=event.target.checked;
});
async function orderAction(body){
  const res=await fetch('/api/membership/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok)throw Error('invoice-request');
  return res.json();
}
const firstTestState=testApi('state').then(value=>{checkoutAvailability=value;if(!ordersView())render();}).catch(()=>{});
render();
async function loadTestReceipt(){
  let mode=url.searchParams.get('lastTest');
  if(!mode)try{mode=localStorage.getItem('fundroom.lastCheckoutTest');}catch{}
  if(!['simulation','sandbox'].includes(mode))return;
  const response=await fetch('/api/checkout-test/state?mode='+mode,{cache:'no-store'});
  if(response.ok){lastTest=await response.json();showTestReceipt();}
}
void firstTestState.then(loadTestReceipt).catch(()=>{});
try {
  await loadMembership();
  if(url.searchParams.get('paypal')==='return')resultMessage=['已从 PayPal 返回。请在订单或会员账单中查看本次付款状态。','Welcome back from PayPal. Check your order or billing history for the status of this payment.'];
  if(url.searchParams.get('paypal')==='cancel'&&membership?.pendingCadence)resultMessage=['已返回。待批准订单可继续结账，或先取消再换方案。','Checkout was interrupted. Resume the pending purchase or cancel it before switching plans.'];
  render();
} catch {
  notice.textContent=t('暂时无法读取工作室状态，请刷新重试。','Studio access is unavailable. Refresh to retry.');
}
if(location.hash==='#fees')document.querySelector('#fees')?.scrollIntoView();
