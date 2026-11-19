import {getLanguage,t} from './i18n.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/gu, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = cents => !Number.isFinite(cents) ? '—' : new Intl.NumberFormat(getLanguage(), {style:'currency',currency:'USD',currencyDisplay:'narrowSymbol'}).format(cents / 100);
const units = micros => new Intl.NumberFormat(getLanguage(),{maximumFractionDigits:6}).format(micros / 1e6);
const percent = (part,total) => !Number.isFinite(part)||!Number.isFinite(total) ? '—' : new Intl.NumberFormat(getLanguage(), {style:'percent', maximumFractionDigits:1}).format(total ? part / total : 0);
const name = item => (item.productId==='catalog:buffett'?t('巴菲特风格 · ','Buffett style · '):'')+t(item.name, item.nameEn || item.name);
export function numberedStudioName(fund, orderedFunds, idKey = 'id') {
  const same = orderedFunds.filter(item => item.name === fund.name);
  if (same.length < 2) return fund.name;
  const index = same.findIndex(item => item[idKey] === fund[idKey]);
  return index < 0 ? fund.name : fund.name + ' · ' + (index + 1);
}
function productName(book,item){
  if (item.kind !== 'studio') return name(item);
  return numberedStudioName(item, book.products.filter(product => product.kind === 'studio'), 'productId');
}
const src = item => t(item.source, item.sourceEn || item.source);
const date = value => !value ? '—' : String(value).includes('T') ? stamp(value) : String(value);
const stamp = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(getLanguage(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '—';
const details = pairs => '<dl class="wallet-pairs">'+pairs.map(([label,value])=>'<div><dt>'+escape(label)+'</dt><dd>'+escape(value)+'</dd></div>').join('')+'</dl>';
export const orderLink = productId => '#/portfolio?product='+encodeURIComponent(productId);
export function portfolioNav() {return '<a class="wallet-nav" href="#/portfolio">'+t('我的投资组合','My portfolio')+'</a>';}

// Trade sizes stay exact all the way from the visitor's decimal text to the JSON request.
function scaled(raw,precision) {
  if(!new RegExp('^\\d+(?:\\.\\d{1,'+precision+'})?$','u').test(raw))return 0;
  const [whole,fraction='']=raw.split('.');
  const value=Number(whole+fraction.padEnd(precision,'0'));
  return Number.isSafeInteger(value)?value:0;
}
function buyable(quote) {
  return quote.navCents !== null && (quote.navCents > 0 || quote.equityCents > 0);
}

function estimate(order, held, quote) {
  // Use the fund's exact equity per micro-unit when the displayed NAV is rounded.
  const unitized = quote.outstandingUnitsMicros > 0;
  const numerator = BigInt(unitized ? quote.equityCents : quote.navCents);
  const denominator = BigInt(unitized ? quote.outstandingUnitsMicros : 1_000_000);
  const value = quantity => (quantity * numerator + denominator / 2n) / denominator;
  const before = BigInt(held?.unitsMicros || 0);
  const buy = order.side === 'buy';
  const quantity = buy ? BigInt(order.amountCents) * denominator / numerator : BigInt(order.unitsMicros);
  const after = buy ? before + quantity : before - quantity;
  const change = value(after) - value(before);
  return {quantity: Number(quantity), cents: Number(buy ? change : -change)};
}
function holdings(book) {
  if(!book.positions.length)return '<p class="wallet-empty">'+t('尚未配置基金。选一只基金投入模拟资金，第一笔持仓就会出现在这里。','Choose a fund and invest paper cash to see your first holding here.')+'</p>';
  return '<ul class="wallet-positions">'+book.positions.map(p=>{
    const product=book.products.find(x=>x.productId===p.productId);
    if(!product)return '';
    return '<li><div class="wallet-position"><div><small>'+escape(product.ticker||t('自建基金','Studio fund'))+'</small><h3>'+escape(productName(book,product))+'</h3></div><div><strong>'+money(p.valueCents)+'</strong><small>'+percent(p.valueCents,book.equityCents)+' · '+t('占组合','of portfolio')+'</small></div></div><div class="wallet-meter" aria-hidden="true"><i style="width:'+(Number.isFinite(p.valueCents)&&book.equityCents>0?Math.max(0,Math.min(100,p.valueCents/book.equityCents*100)):0)+'%"></i></div><div class="wallet-position-foot"><span>'+units(p.unitsMicros)+' '+t('份','units')+' · '+t('净值','NAV')+' '+money(product.quote.navCents)+' · '+escape(date(product.quote.asOf))+'</span><button type="button" data-manage-product="'+escape(p.productId)+'">'+t('管理','Manage')+' ↗</button></div><details class="wallet-price-details"><summary>'+t('份额明细','Holding details')+'</summary>'+details([[t('持仓成本','Cost basis'),money(p.costBasisCents)],[t('持仓模拟盈亏','Unrealized paper P&L'),money(p.pnlCents)],[t('计价来源','Pricing basis'),src(product.quote)]])+'</details></li>';
  }).join('')+'</ul>';
}
function isCashClaim(entry) {
  return entry.side === 'claim' && entry.kind === 'paper-cash';
}

function claimEntry(entry) {
  const values = [
    [t('领取前现金', 'Cash before claim'), money(entry.cashBeforeCents)],
    [t('领取后现金', 'Cash after claim'), money(entry.cashAfterCents)],
    [t('回执编号', 'Receipt'), entry.id],
  ];
  return '<li><details><summary><span><b>' + t('领取模拟资金', 'Paper cash claim') + '</b><small>' +
    escape(stamp(entry.createdAt)) + '</small></span><span><b>+' + money(entry.amountCents) + '</b><small>' +
    t('模拟入金', 'Paper deposit') + ' ↴</small></span></summary>' + details(values) + '</details></li>';
}

function ledger(book) {
  const entries=book.orders||[];
  if(!entries.length)return '<p class="wallet-empty">'+t('领取模拟资金或完成一笔交易后，可在这里查看回执。','Your paper cash claims and completed orders will appear here.')+'</p>';
  return '<ol class="wallet-orders">'+entries.map(o=>isCashClaim(o)?claimEntry(o):'<li><details><summary><span><b>'+escape(productName(book,o))+'</b><small>'+escape(stamp(o.createdAt))+'</small></span><span><b>'+ (o.side==='buy'?'−':'+')+money(o.amountCents)+'</b><small>'+(o.side==='buy'?t('申购','Purchase'):t('赎回','Redemption'))+' ↴</small></span></summary>'+details([[t('成交份额','Units'),units(o.unitsMicros)],[t('模拟成交净值','Paper NAV'),money(o.navCents)],[t('净值日期','NAV date'),date(o.asOf)],[t('计价来源','Pricing basis'),src(o)],[t('成交后现金','Cash after fill'),money(o.cashAfterCents)],[t('回执编号','Receipt'),o.id]])+'</details></li>').join('')+'</ol>';
}
function legacyAccounts(legacy) {
  const rows=legacy?.catalogPositions||[];
  if(!rows.length)return '';
  return '<section class="wallet-legacy"><h2>'+t('历史独立模拟账户','Historical strategy accounts')+'</h2><p>'+t('这些旧账户单独保存。下列现金与持仓不计入上方统一钱包。','These older paper accounts are separate. Their cash and holdings are excluded from the wallet above.')+'</p>'+rows.map(x=>
    '<details><summary><span><b>'+escape(name(x))+'</b><small>'+escape(x.ticker)+' · '+units(x.unitsMicros)+' '+t('份','units')+'</small></span><b>'+money(x.valueCents)+' ↴</b></summary>'+
    details([[t('旧账户现金','Archived cash'),money(x.cashCents)],[t('旧账户权益','Archived equity'),money(x.equityCents)],[t('每份历史估值','Archived unit value'),money(x.navCents)],[t('估值日期','Valuation date'),date(x.asOf)],[t('计价来源','Pricing basis'),src(x)]])+
    (x.receipts?.length?'<h3>'+t('历史回执','Archived receipts')+'</h3><ol>'+x.receipts.map(o=>'<li>'+escape(date(o.asOf))+' · '+(String(o.side).toLowerCase()==='buy'?t('买入','Buy'):t('卖出','Sell'))+' '+units(o.unitsMicros)+' '+t('份','units')+' × '+money(o.priceCents)+' · '+money(o.amountCents)+'</li>').join('')+'</ol>':'')+
    '<a class="wallet-order-link" href="/funds?id='+encodeURIComponent(x.catalogId)+'&amp;lang='+getLanguage()+'">'+t('打开基金档案','Open fund research')+' ↗</a></details>').join('')+'</section>';
}
function productSelect(book, selected) {
  return '<label for="wallet-product">'+t('配置哪只基金？','Choose a fund')+'</label><select id="wallet-product"><option value="">'+t('选择一只基金','Select a fund')+'</option>'+['studio','catalog'].map(key=>{
    const group=book.products.filter(x=>x.kind===key);
    return group.length?'<optgroup label="'+t(key==='studio'?'我的自建基金':'基金展馆', key==='studio'?'My studio funds':'Fund gallery')+'">'+group.map(p=>'<option value="'+escape(p.productId)+'" '+(p.productId===selected?'selected':'')+'>'+escape(productName(book,p))+(p.ticker?' · '+escape(p.ticker):'')+'</option>').join('')+'</optgroup>':'';
  }).join('')+'</select>';
}
export function createWallet({api,newFund}) {
  let brokerDemoProvider;
  let claimRequest = '', claiming = false, claimIssue = '', claimNotice = '';

  function setClaimRequest(requestId) {
    claimRequest = requestId;
    try {
      const key = storageKey() + '.cash-claim';
      if (requestId) sessionStorage.setItem(key, requestId);
      else sessionStorage.removeItem(key);
    } catch {}
  }

  function fundingPanel() {
    const amount = t('US$100,000 模拟资金', 'US$100,000 in paper cash');
    const button = claiming ? t('正在领取…', 'Adding paper cash…') : claimRequest
      ? t('核对这次领取', 'Check this claim') : t('领取这笔模拟资金', 'Add paper cash');
    const feedback = claimIssue
      ? '<p class="wallet-problem" role="alert">' + escape(claimIssue) + '</p>'
      : claimNotice ? '<p class="wallet-message" role="status">' + escape(claimNotice) + '</p>' : '';
    return '<div class="wallet-funding"><details' + (claimRequest ? ' open' : '') +
      '><summary data-wallet-funding>' + t('领取 ', 'Claim ') + amount + '</summary><p>' +
      t('资金进入本组合的可用现金，可投入自建基金或基金展馆的策略。', 'Use the cash in your portfolio to invest in your own funds or a fund from the gallery.') +
      '</p><button type="button" class="wallet-commit" data-wallet-claim' + (posting || preview ? ' disabled' : '') +
      '>' + button + '</button></details>' + feedback + '</div>';
  }
  let olderLoading=false,node,book,selected='',side='buy',input='',preview,posting=false,notice='',issue='',fetching=false,owner='',serial=0,routeKey='';
  let entryProductId = '';
  const storageKey=()=> 'fund-edition.portfolio.pending.'+owner;
  function remember(order){try{if(order)sessionStorage.setItem(storageKey(),JSON.stringify(order));else sessionStorage.removeItem(storageKey());}catch{}}
  function pending(){try{return JSON.parse(sessionStorage.getItem(storageKey())||'null');}catch{return null;}}
  function product(){return book?.products.find(p=>p.productId===selected);}
  function position(){return book?.positions.find(p=>p.productId===selected);}
  function walletReturnLink() {
    const studio = book.products.find(item => item.kind === 'studio' && item.productId === entryProductId);
    if (!studio) return '<a href="#/" class="wallet-back">← ' + t('大厅', 'Lobby') + '</a>';
    const id = studio.productId.slice('studio:'.length);
    return '<a href="#/office?fund=' + encodeURIComponent(id) + '" class="wallet-back">← ' + t('返回基金办公室', 'Back to fund office') + '</a>';
  }
  function draw(focus) {
    if(!node?.isConnected)return;
    const feedback=(issue?'<p class="wallet-problem" role="alert">'+escape(issue)+'</p>':'')+(notice?'<p class="wallet-message" role="status">'+escape(notice)+'</p>':'');
    if(!book){node.innerHTML='<div class="wallet-page"><h1>'+t('我的投资组合','My portfolio')+'</h1>'+feedback+(issue?'<button class="wallet-commit" data-wallet-retry>'+t('重试','Retry')+'</button>':'<p role="status">'+t('正在读取模拟钱包…','Opening your paper wallet…')+'</p>')+'</div>';return;}
    const p=product(), held=position(), isBuy=side==='buy';
    let ticket=productSelect(book,selected);
    if(p) {
      const q=p.quote, source=src(q);
      ticket+='<p class="wallet-quote"><b>'+t('每份模拟净值','Paper NAV per unit')+' '+money(q.navCents)+'</b><span>'+escape(date(q.asOf))+' · '+escape(source)+'</span></p>';
      if(q.navCents===null || (!buyable(q)&&!held)){ticket+='<p>'+t('这只基金尚无可申购的净值。','A subscription NAV is unavailable for this fund.')+'</p>';}else if(preview){
        const currentQuote = q.asOf === preview.expectedAsOf && q.navCents === preview.expectedNavCents;
        const est = currentQuote ? estimate(preview,held,q) : null;
        ticket+='<h3 tabindex="-1" id="wallet-check">'+t('确认这笔模拟交易','Review this paper order')+'</h3>'+details([[t('基金','Fund'),productName(book,p)],[t('操作','Action'),isBuy?t('申购','Buy'):t('赎回','Redeem')],[t('预计金额','Estimated amount'),money(est?.cents)],[t('预计份额','Estimated units'),est ? units(est.quantity) : '—'],[t('预计剩余现金','Estimated cash after'),est ? money(book.cashCents+(isBuy?-est.cents:est.cents)) : '—']])+'<div class="wallet-actions"><button class="wallet-commit" type="button" data-wallet-confirm '+(posting?'disabled':'')+'>'+(posting?t('提交中…','Submitting…'):t('确认模拟交易','Confirm paper order'))+'</button><button type="button" data-wallet-edit '+(posting?'disabled':'')+'>'+t('返回修改','Edit order')+'</button></div>';
      }else{
        ticket+='<div class="wallet-side" aria-label="'+t('交易方向','Order side')+'"><button type="button" data-wallet-side="buy" '+(buyable(q)?'':'disabled')+' aria-pressed="'+isBuy+'">'+(held?t('追加','Add funds'):t('投入','Invest'))+'</button><button type="button" data-wallet-side="sell" aria-pressed="'+!isBuy+'" '+(!held?.unitsMicros?'disabled':'')+'>'+t('赎回','Redeem')+'</button></div><form data-wallet-order><label for="wallet-size">'+(isBuy?t('投入金额（美元）','Amount (USD)'):t('赎回份额','Units to redeem'))+'</label><div class="wallet-size"><input id="wallet-size" name="size" inputmode="decimal" required autocomplete="off" placeholder="'+(isBuy?'0.00':'0.000000')+'" value="'+escape(input)+'">'+(!isBuy?'<button type="button" data-wallet-all>'+t('全部','All units')+'</button>':'')+'</div><p class="wallet-available">'+(isBuy?t('可用现金','Available cash')+' '+money(book.cashCents):t('持有份额','Units held')+' '+units(held?.unitsMicros||0))+'</p><button type="submit" class="wallet-commit">'+t('预览模拟交易','Preview paper order')+' →</button></form>';
      }
    }
    node.innerHTML='<article class="wallet-page"><header class="wallet-heading"><div>'+walletReturnLink()+'<h1>'+t('我的投资组合','My portfolio')+'</h1></div><span class="wallet-env">'+t('模拟钱包','Paper wallet')+' · USD</span></header><section class="wallet-balance" aria-label="'+t('钱包资产','Wallet balances')+'"><div><span>'+t('模拟总资产','Total paper equity')+'</span><strong>'+money(book.equityCents)+'</strong></div>'+details([[t('可用现金','Available cash'),money(book.cashCents)],[t('基金持仓','Fund holdings'),money(book.investedValueCents)],[t('累计模拟盈亏','Paper P&L since opening'),money(book.pnlCents)]])+'</section>'+fundingPanel()+'<div class="wallet-grid'+(p?' is-configuring':'')+'"><section class="wallet-invest"><h2>'+t('配置资金','Allocate funds')+'</h2>'+feedback+ticket+'<div class="wallet-discover"><button type="button" data-wallet-new>'+t('与 Maya 新建一只基金','Build another fund with Maya')+' ↗</button><a href="/funds?lang='+getLanguage()+'">'+t('浏览基金展馆','Explore the fund gallery')+' ↗</a></div></section><section class="wallet-hold"><h2>'+t('我的持仓','My holdings')+'</h2>'+holdings(book)+'<p class="wallet-caption">'+t('占比按总资产计算，剩余为现金。不同策略的模拟净值日期可能不同。','Weights use total equity including cash. Strategies can have different NAV dates.')+'</p></section></div><section class="wallet-history"><h2>'+t('资金与交易记录','Account activity')+'</h2>'+ledger(book)+(book.olderOrdersCursor?'<button class="wallet-older" type="button" data-wallet-older '+(olderLoading?'disabled':'')+'>'+t('查看更早的交易','Load earlier transactions')+'</button>':'')+'</section>'+legacyAccounts(book.legacy)+'<aside class="wallet-tail"><p>'+t('钱包只计算你投入后的份额变动。基金档案中的历史回测单独展示。','This wallet tracks units from your own orders. Historical strategy results appear separately in each fund’s research.')+'</p><p>'+t('实盘账户 · 尚未开放','Live brokerage · Not yet available')+'</p></aside></article>';
    const brokerLink=document.createElement('a');
    brokerLink.href='/?lang='+getLanguage()+'#/connections?view=broker';
    brokerLink.className='wallet-broker-link';
    brokerLink.dataset.walletBroker='';
    const brokerName={alpaca:'Alpaca',ibkr:'IBKR'}[brokerDemoProvider];
    brokerLink.textContent=brokerName?t('管理模拟连接 · '+brokerName,'Manage demo connection · '+brokerName):t('体验券商连接','Try a broker connection');
    node.querySelector('.wallet-heading').append(brokerLink);
    if(preview)node.querySelector('#wallet-product').disabled=true;
    if(focus)node.querySelector(focus)?.focus();
  }
  async function load() {
    const attempt=++serial;fetching=true;
    try {const result=await api('/api/portfolio');if(attempt!==serial)return;book=result;issue='';
      if (claimRequest && !claiming && book.orders.some(entry => isCashClaim(entry) && entry.requestId === claimRequest)) {
        setClaimRequest('');
        claimIssue = '';
        claimNotice = t('上次领取的 US$100,000 模拟资金已到账。', 'Your previous US$100,000 paper cash claim was recorded.');
      }
      const outstanding=pending();
      if(outstanding&&!posting){
        const recorded=book.orders.find(o=>o.requestId===outstanding.requestId);
        if(recorded){remember(null);preview=null;notice=t('上次提交的模拟交易已记账。','Your last paper order was recorded.')+' '+money(recorded.amountCents);}
        else if(book.products.some(p=>p.productId===outstanding.productId)){
          selected=outstanding.productId;side=outstanding.side;preview=outstanding;
          issue=t('上次提交尚待核对。重试会查询同一笔回执。','Your previous submission awaits a receipt. Retry to check the same order.');
        }
      }
      if(selected&&!product()){selected='';side='buy';preview=null;input='';issue=t('这只基金不在本钱包中，请重新选择。','This fund is unavailable in this wallet. Choose another.');}
    }catch(e){if(attempt===serial)issue=e.message;}finally{if(attempt===serial){fetching=false;draw();}}
  }
  async function loadOlder() {
    if(olderLoading||!book?.olderOrdersCursor)return;
    const cursor=book.olderOrdersCursor, previous=owner;olderLoading=true;draw();
    try {const page=await api('/api/portfolio?before='+encodeURIComponent(cursor));
      if(owner===previous&&book.olderOrdersCursor===cursor){
        const known=new Set(book.orders.map(o=>o.id));book={...book,orders:[...book.orders,...page.orders.filter(o=>!known.has(o.id))],olderOrdersCursor:page.olderOrdersCursor};
      }
    }catch(e){if(owner===previous)issue=e.message;}finally{if(owner===previous){olderLoading=false;draw('.wallet-history summary');}}
  }
  function choose(id){
    selected=id;input='';side='buy';preview=null;issue='';notice='';
    const next=new URL(location.href);next.searchParams.delete('product');next.hash=id?orderLink(id):'#/portfolio';
    history.replaceState(history.state,'',next);routeKey=location.hash;
    draw('#wallet-product');
  }
  async function claimCash() {
    if (posting || preview || !owner) return;
    const workspaceRef = owner;
    const requestId = claimRequest || crypto.randomUUID();
    setClaimRequest(requestId);
    claiming = posting = true;
    claimNotice = claimIssue = '';
    ++serial;
    fetching = false;
    draw();
    try {
      const result = await api('/api/portfolio/claim', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Idempotency-Key': requestId},
        body: JSON.stringify({requestId, workspaceRef}),
      });
      if (workspaceRef !== owner) return;
      book = result;
      setClaimRequest('');
      claimNotice = t('US$100,000 模拟资金已到账。', 'US$100,000 in paper cash has been added.');
    } catch (error) {
      if (workspaceRef !== owner) return;
      if ([400, 403, 409].includes(error.status)) {
        claimIssue = error.message + ' ' + t('请刷新以核对当前工作区和余额。', 'Refresh to check your current workspace and balance.');
      } else {
        claimIssue = error.message + ' ' + t('用「核对这次领取」查询原回执。', 'Select “Check this claim” to recover the original receipt.');
      }
    } finally {
      if (workspaceRef === owner) {
        claiming = posting = false;
        draw(claimRequest ? '[data-wallet-claim]' : '[data-wallet-funding]');
      }
    }
  }
  async function confirm() {
    if(posting||!preview)return;
    const order=preview, startOwner=owner;posting=true;issue='';notice='';remember(order);draw();
    try {const result=await api('/api/portfolio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(order)});
      if(startOwner!==owner)return;
      book=result;remember(null);preview=null;input='';side='buy';
      notice=t('模拟交易已记入钱包。','Paper order recorded.')+' '+t('成交','Filled')+' '+units(result.receipt.unitsMicros)+' '+t('份','units')+' · '+money(result.receipt.amountCents);
    }catch(e){if(startOwner!==owner)return;issue=e.message;
      if(e.status>=400&&e.status<500){remember(null);preview=null;const problem=issue;await load();issue=problem;}
      else issue+=' '+t('可重试本笔订单，系统会核对同一回执。','Retry this order to check its original receipt.');
    }finally{if(startOwner===owner){posting=false;draw(preview?'[data-wallet-confirm]':'#wallet-product');}}
  }
  function bind(element){
    element.addEventListener('input',e=>{if(e.target.id==='wallet-size')input=e.target.value;});
    element.addEventListener('change',e=>{if(e.target.id==='wallet-product')choose(e.target.value);});
    element.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b||posting)return;
      if(b.hasAttribute('data-wallet-new'))newFund();
      else if(b.hasAttribute('data-wallet-claim'))void claimCash();
      else if(b.hasAttribute('data-wallet-older'))void loadOlder();
      else if(b.hasAttribute('data-wallet-retry'))void load();
      else if(b.hasAttribute('data-wallet-confirm'))void confirm();
      else if(b.hasAttribute('data-wallet-edit')){preview=null;issue='';draw('#wallet-size');}
      else if(b.dataset.manageProduct){choose(b.dataset.manageProduct);}
      else if(b.dataset.walletSide){side=b.dataset.walletSide;input='';issue='';notice='';draw('#wallet-size');}
      else if(b.hasAttribute('data-wallet-all')){input=String((position()?.unitsMicros||0)/1e6);draw('#wallet-size');}
    });
    element.addEventListener('submit',e=>{
      if(!e.target.matches('[data-wallet-order]'))return;e.preventDefault();
      const p=product(),held=position();if(!p||posting||preview)return;
      const buy=side==='buy', size=scaled(input,buy?2:6),max=buy?book.cashCents:(held?.unitsMicros||0);
      if(!size||size>max){issue=buy?t('请输入可用现金以内的金额，最多两位小数。','Enter an amount within your cash balance, with up to two decimals.'):t('请输入持有范围内的份额，最多六位小数。','Enter up to six decimals and no more than your units held.');draw('#wallet-size');return;}
      const order={productId:p.productId,side,...(buy?{amountCents:size}:{unitsMicros:size}),expectedNavCents:p.quote.navCents,expectedAsOf:p.quote.asOf};
      if(p.quote.navCents===null || (buy&&!buyable(p.quote))){issue=t('请等待有效净值。','An eligible NAV is required.');draw();return;}
      const estimateNow=estimate(order,held,p.quote);
      if(!buy && Number.isSafeInteger(p.quote.fundCashCents) && estimateNow.cents > p.quote.fundCashCents) {
        issue=t('基金可用于赎回的模拟现金为 ', 'The fund has this much paper cash available to redeem: ')+money(p.quote.fundCashCents);
        draw('#wallet-size');return;
      }
      if(!estimateNow.quantity||(estimateNow.cents<1&&(buy||size!==held?.unitsMicros))){issue=t('所选份额不足一美分，请调整数量。','This order is worth less than one cent. Adjust the size.');draw('#wallet-size');return;}
      const last=pending();
      preview={...order,requestId:last&&Object.entries(order).every(([k,v])=>last[k]===v)?last.requestId:crypto.randomUUID()};
      issue='';notice='';draw('#wallet-check');
    });
  }
  return {
    mount(element,id,visitor,provider){
      brokerDemoProvider=provider;
      if(visitor!==owner){owner=visitor;claimRequest='';claimNotice=claimIssue='';claiming=false;
        try { claimRequest = sessionStorage.getItem(storageKey() + '.cash-claim') || ''; } catch {}
        book=null;posting=false;preview=null;routeKey='';input='';selected='';issue='';notice='';serial++;fetching=false;}
      const entered=node?.isConnected!==true;
      node=element;bind(element);
      if(routeKey!==location.hash){routeKey=location.hash;entryProductId=id||'';selected=entryProductId;side='buy';input='';issue='';notice='';preview=null;}
      draw();if((entered||!book)&&!posting&&!fetching)void load();
    },
    clear(){serial++;owner='';claiming=false;claimRequest=claimNotice=claimIssue='';node=null;book=null;fetching=false;preview=null;posting=false;},
  };
}
