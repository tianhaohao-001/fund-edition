const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={requested:['待处理','Requested'],issuing:['正在准备付款单','Preparing payment request'],awaiting_payment:['等待付款或到账核对','Awaiting payment or verification'],
  paid:['付款已核实','Payment verified'],void:['已撤销','Voided'],refunded:['已退款或撤销付款','Refunded or reversed']};
export function unresolvedOrder(orders=[]){
  return orders.find(order=>['requested','issuing','awaiting_payment'].includes(order.status));
}
function goodsPayment(order,t,changingTerm){
  const id=esc(order.id);
  let payment='';
  if(order.directUrl&&!changingTerm){
    const amount='US$'+Number(order.amountUsd).toFixed(2);
    payment='<p>'+t('如果 PayPal 提供备注栏，请填本站订单号。','If PayPal offers a note field, enter this order number.')+
      ' <strong>'+id+'</strong> <button class="secondary" type="button" data-copy-order="'+id+'">'+t('复制','Copy')+'</button></p>'+
      (order.directUrl.startsWith('https://paypal.me/')?'<p>'+t('付款类型请选择「商品与服务」。如果只显示「亲友」，请退出结账。','Choose “Goods and Services”. If you only see “Friends and Family”, leave checkout.')+'</p>':'')+
      '<a class="commit" target="_blank" rel="noopener noreferrer" href="'+esc(order.directUrl)+'">'+t('前往 PayPal 支付 ','Pay with PayPal · ')+amount+' ↗</a>';
  }else if(!changingTerm&&!order.receiptReported&&!order.cancelRequested)payment='<p>'+t('此付款链接暂不可用。已付可在下方登记，未付款可申请撤单。','This payment link is unavailable. If you paid, enter your receipt below. Otherwise you can request cancellation.')+'</p>';
  if(order.cancelRequested)payment='<p>'+t('撤单待核对，请暂缓付款。','Cancellation is under review. Please hold payment.')+'</p>';
  return payment+'<p class="fine">'+(order.receiptReported?t('交易号已提交，核实到账后将开通。请勿重复付款。','Transaction ID received. Access starts after we verify the payment. Please pay only once.'):
    t('付款后由我们核对到账并开通会员。PayPal 没有备注栏时，请在下方填写交易号供核对。','We activate membership after verifying receipt. If PayPal had no note field, enter your transaction ID below so we can match the payment.'))+'</p>'+
    '<details><summary>'+ (order.receiptReported?t('更正交易号','Correct transaction ID'):t('已付款，登记交易号','Already paid? Enter transaction ID'))+'</summary>'+
    '<label for="receipt-'+id+'">'+t('PayPal 交易号','PayPal transaction ID')+'</label><input id="receipt-'+id+'" type="text" autocomplete="off" required minlength="5" maxlength="64"><button type="button" class="secondary" data-report-receipt="'+id+'">'+t('提交核对','Submit for verification')+'</button></details>';
}
export function orderPanel({membership,account,cadence,t,button,login,contact,consent,review,formatDate,changingTerm=false}){
  const orders=account?.orders??[],open=unresolvedOrder(orders);
  const direct=membership.directPaymentTerms?.includes(cadence);
  const note='<p class="fine">'+t('一次付清，期满时可以自行再买。不会自动扣款。','Pay once for a fixed term. Buy again when you choose. No automatic charges.')+'</p>';
  const term=cadence==='yearly'?t('一年','one year'):t('一个月','one month');
  const active=membership.subscription?.status!=='inactive'?'<p>'+t('当前权益有效至 ','Current access through ')+formatDate(membership.subscription.periodEnd)+'</p>':'';
  let controls='';
  let openSummary='';
  if(open){
    const termName=open.cadence==='yearly'?t('年卡','annual pass'):t('月卡','monthly pass');
    const amount='US$'+Number(open.amountUsd).toFixed(2);
    const guidance=open.receiptReported?t('交易号已提交，请等待到账核对。','Your receipt is under review. Please wait for confirmation.'):
      open.cancelRequested?t('撤单正在核对，处理后即可重新选期。','Your cancellation is under review. You can choose a new term once it is resolved.'):
      open.status==='requested'?t('要换期限，可在下方撤回未付款的申请，然后选择新期限。','To switch terms, withdraw the unpaid request below, then select another term.'):
      t('如果尚未付款，可以在下方申请撤单。确认原单未收款后即可换期。','If you have not paid, request cancellation below. You can switch terms once the unpaid order is closed.');
    openSummary='<div id="open-order-summary" tabindex="-1"><strong>'+t('当前订单 · ','Current order · ')+termName+' · '+amount+'</strong><p>'+guidance+'</p>'+
      (changingTerm?button('return-to-order',t('查看原订单','View existing order')):'')+'</div>';
  }
  if(membership.existingRecurring)controls=button('portal',t('管理现有会员','Manage existing membership'));
  else if(!open&&membership.acceptsOrders){
    if(!account)controls=login;
    else if(!review&&!direct)controls=button('review-order',t('申请一次性付款单','Request a one-time payment'),true);
    else controls='<div class="order-confirm"><h3>'+(direct?t('核对付款信息','Review your purchase'):t('确认付款申请','Review payment request'))+'</h3><p>'+term+' · US$'+(cadence==='yearly'?'99.99':'9.99')+'</p>'+
      '<label for="invoice-recipient">'+t('你本人付款时使用的 PayPal 邮箱','Your paying PayPal account email')+'</label><input id="invoice-recipient" type="email" autocomplete="email" maxlength="254" value="'+esc(contact??account.email)+'">'+
      '<p class="fine">'+(direct?t('请使用此邮箱对应的 PayPal 账户。我们会按邮箱及交易记录核实会员订单。','Use the PayPal account with this email. We match it against the payment record to activate your pass.'):t('付款单会发到这个邮箱。请用交易记录显示相同邮箱的本人 PayPal 账户付款，以便核对到账。','We send the request to this email. Pay from your own PayPal account using the same email shown on its transaction record.'))+'</p>'+
      (direct?'':'<label class="consent"><input id="invoice-consent" type="checkbox" '+(consent?'checked':'')+'>'+t('同意就这笔订单接收一次商品与服务付款请求。','I agree to receive a Goods and Services payment request for this order.')+'</label>')+
      '<div class="actions">'+button('submit-order',direct?t('确认邮箱，用 PayPal 购买','Confirm email and buy with PayPal'):t('确认申请','Submit request'),true)+(direct?'':button('leave-order',t('返回','Back')))+'</div></div>';
  }
  const lines=orders.map(o=>{
    const date=o.startsAt&&o.endsAt?'<p>'+formatDate(o.startsAt)+' – '+formatDate(o.endsAt)+'</p>':'';
    let next='';
    if(o.status==='requested')next='<p>'+t('运营团队会为这笔订单准备专属 PayPal 付款单。','Our team will prepare a private PayPal payment request for this order.')+'</p>'+
      '<button class="secondary" type="button" data-withdraw="'+esc(o.id)+'">'+t('撤回申请','Withdraw request')+'</button>';
    if(o.status==='issuing')next='<p>'+t('付款单正在准备中，稍后可回来查看。','Your payment request is being prepared. Check back shortly.')+'</p>';
    if(o.status==='awaiting_payment'&&o.method==='goods-link')next=goodsPayment(o,t,changingTerm);
    else if(o.status==='awaiting_payment'&&!changingTerm){
      next=o.invoiceUrl?'<a class="commit" target="_blank" rel="noopener noreferrer" href="'+esc(o.invoiceUrl)+'">'+t('在 PayPal 打开专属账单','Open your invoice in PayPal')+' ↗</a>':
        '<a class="secondary" target="_blank" rel="noopener noreferrer" href="https://www.paypal.com/myaccount/activities/">'+t('在 PayPal 查看付款请求','View your request in PayPal')+' ↗</a>';
      next+='<p class="fine">'+t('付款后我们会核对到账；未核实前请勿重复付款。请使用商品与服务付款。','We will verify the payment after it clears. Pay once using Goods and Services.')+'</p>';
    }
    if(['issuing','awaiting_payment'].includes(o.status)){
      if(o.cancelRequested&&o.method!=='goods-link')next='<p>'+t('已申请撤单，请暂缓付款。运营将核对 PayPal 的记录并更新订单。','Cancellation requested. Hold payment while our team checks PayPal and updates the order.')+'</p>';
      else if(!o.cancelRequested&&!o.receiptReported)next+='<button type="button" class="secondary" data-cancel-order="'+esc(o.id)+'">'+t('申请撤单','Request cancellation')+'</button>';
    }
    return '<li><strong>'+t(...(labels[o.status]??['处理中','Processing']))+'</strong><p>US$'+Number(o.amountUsd).toFixed(2)+' · '+(o.cadence==='yearly'?t('一年','One year'):t('一个月','One month'))+'</p><small>'+esc(o.id)+'</small>'+date+next+'</li>';
  }).join('');
  const terms=direct&&!open?'<p class="fine">'+t('真实美元付款，到账由我们核对后开通。','Real USD payment. We activate access after verifying receipt.')+'</p>':'';
  return openSummary+active+note+terms+controls+(lines?'<section class="order-history"><h3>'+t('我的订单','My orders')+'</h3><ol>'+lines+'</ol></section>':'');
}
