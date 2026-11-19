import { t, getLanguage } from './i18n.mjs';
import { reflectBrokerLanguage } from './broker-copy.mjs';
reflectBrokerLanguage();
const element = (id) => document.getElementById('broker-' + id);
const environment = element('environment');
const token = element('token');
const orderForm = element('order-form');
const confirmForm = element('confirm-form');
const review = element('review');
const receipts = element('receipts');
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long' });
let configuration;
let operations = [];
let pending;
let busy = false;
const cancellable = new Set(['new', 'partially_filled', 'accepted', 'pending_new', 'accepted_for_bidding', 'calculated']);

function node(tag, content, className) {
  const output = document.createElement(tag);
  if (content) output.textContent = content;
  if (className) output.className = className;
  return output;
}

function message(text, kind = '') {
  const target = element('message');
  target.textContent = text;
  target.dataset.kind = kind;
}

function utcStamp(value) {
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? new Intl.DateTimeFormat(getLanguage(), { dateStyle:'medium',timeStyle:'long' }).format(time) : t("不可用","Unavailable");
}

function describe(operation) {
  const { side, symbol, quantity, limitPrice } = operation.intent;
  return t(`${side === 'buy' ? '买入' : '卖出'} ${quantity} 股 ${symbol}，限价 ${money.format(Number(limitPrice))}`, `${side.toUpperCase()} ${quantity} ${symbol} at ${money.format(Number(limitPrice))} limit`);
}

async function request(action, params = {}) {
  if (!token.value) {
    token.focus();
    throw new Error(t("请输入本机券商操作口令。","Enter the local broker operator token."));
  }
  const response = await fetch('/api/broker/action', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-fundroom-broker-token': token.value },
    body: JSON.stringify({ action, environment: environment.value, ...params }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || t("券商未完成该请求。","The broker did not complete the request."));
  return result;
}

function syncConfirm() {
  element('confirm-button').disabled = busy || !pending || confirmForm.elements.confirmation.value !== pending.confirmation;
}

function setBusy(value) {
  busy = value;
  environment.disabled = value;
  token.disabled = value;
  for (const button of document.querySelectorAll('button:not(#broker-confirm-button)')) button.disabled = value;
  syncConfirm();
}

async function perform(work, label) {
  if (busy) return;
  setBusy(true);
  message(label);
  try {
    await work();
  } catch (error) {
    message(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

function closePreview() {
  pending = null;
  review.hidden = true;
  confirmForm.reset();
  syncConfirm();
}

function showPreview(operation, focus = true) {
  pending = operation;
  review.hidden = false;
  review.dataset.environment = operation.environment;
  const isCancel = operation.kind === 'cancel';
  const real = operation.environment === 'live';
  element('review-title').textContent = isCancel ? t("复核撤单","Review cancellation") : real ? t("复核真钱订单","Review real-money order") : t("复核券商模拟订单","Review broker paper order");
  const market = operation.market;
  const summary = node('strong', describe(operation));
  const note = node('p', market
    ? `${t('买价','Bid')} ${money.format(market.bid)} · ${t('卖价','Ask')} ${money.format(market.ask)} · Alpaca ${market.feed.toUpperCase()} · ${utcStamp(market.quotedAt)}`
    : t(`Alpaca 当前状态 ${operation.order.brokerStatus}，已成交 ${operation.order.filledQuantity} 股。`, `Alpaca currently reports ${operation.order.brokerStatus}. Filled shares so far: ${operation.order.filledQuantity}.`), 'broker-quote');
  const action = isCancel ? t("撤单请求","cancellation request") : real ? t("真钱订单","real-money order") : t("券商模拟订单","broker paper order");
  const expires = node('p', `${t('确认截止','Confirm by')} ${utcStamp(operation.expiresAt)}. ${t('发送前将复核','Before sending, the system rechecks')} ${isCancel ? t("订单状态","the order state") : t("账户与买卖报价","the account and the bid and ask")} · ${action}.`);
  element('preview-details').replaceChildren(summary, note, expires);
  element('confirm-phrase').textContent = operation.confirmation;
  element('confirm-button').textContent = isCancel ? t("发送撤单","Send cancellation") : real ? t("提交真钱订单","Submit real-money order") : t("提交券商模拟订单","Submit broker paper order");
  if (!focus) { syncConfirm(); return; }
  confirmForm.reset();
  syncConfirm();
  review.scrollIntoView({ block: 'nearest' });
  confirmForm.elements.confirmation.focus({ preventScroll: true });
}

function renderReceipts() {
  receipts.replaceChildren();
  if (!operations.length) {
    receipts.append(node('p', t("此环境没有已提交或待核实的券商操作。","No submitted or unresolved broker operations in this environment.")));
    return;
  }
  for (const operation of operations) {
    const item = node('article', '', 'broker-receipt');
    const heading = (operation.kind === 'cancel' ? t("撤单 · ","Cancellation \u00b7 ") : '') + describe(operation);
    const state = operation.order?.brokerStatus ?? operation.phase;
    item.append(node('strong', heading), node('p', `${operation.environment.toUpperCase()} · ${state.replaceAll('_', ' ')} · ${utcStamp(operation.createdAt)}`));
    if (operation.clientOrderId) item.append(node('p', `${t('客户订单编号','Client order ID')} ${operation.clientOrderId}`, 'broker-id'));
    if (operation.order?.filledQuantity !== null && operation.order?.filledQuantity !== undefined) {
      const average = operation.order.averageFillPrice ? ` · ${t('平均价格','average')} ${money.format(Number(operation.order.averageFillPrice))}` : '';
      item.append(node('p', `${t('已成交股数','Filled shares')}: ${operation.order.filledQuantity}${average}`));
    }
    if (['unknown', 'sending'].includes(operation.phase)) {
      item.append(node('p', t("该提交可能已到达 Alpaca。准备另一笔操作前，请在此处或 Alpaca 核实回执。","Submission may have reached Alpaca. Check the receipt here or in Alpaca before preparing another operation.")));
    }
    if (operation.phase === 'cancelRequested') {
      item.append(node('p', t("撤单请求已接受。请刷新核实订单的最终状态。","Cancellation request accepted. Refresh to verify the final order status.")));
    }
    const actions = node('div', '', 'broker-actions');
    const lookup = node('button', t("刷新券商状态","Refresh broker status"), 'broker-button broker-button-secondary');
    lookup.dataset.action = 'lookup';
    lookup.dataset.operation = operation.id;
    actions.append(lookup);
    if (operation.kind === 'order' && cancellable.has(operation.order?.brokerStatus)) {
      const cancel = node('button', t("预览撤单","Preview cancellation"), 'broker-button broker-button-secondary');
      cancel.dataset.action = 'previewCancel';
      cancel.dataset.operation = operation.id;
      actions.append(cancel);
    }
    item.append(actions);
    receipts.append(item);
  }
}

function updateReceipt(operation) {
  operations = [operation, ...operations.filter(({ id }) => id !== operation.id)];
  renderReceipts();
}

function chooseEnvironment() {
  const mode = configuration.modes[environment.value];
  const live = environment.value === 'live';
  element('symbol').replaceChildren(...mode.allowedSymbols.map((symbol) => new Option(symbol, symbol)));
  const note = element('environment-note');
  note.dataset.environment = environment.value;
  note.textContent = `${live ? t("实盘 · 订单使用真实资金。","Live \u00b7 orders use real money.") : t("模拟 · 订单使用 Alpaca 模拟券商账户。","Paper \u00b7 orders use Alpaca\u2019s simulated brokerage account.")} ${t('单笔上限','Maximum order')} ${money.format(mode.maxOrderUsd)}. ${t('行情源','Quote feed')}: ${configuration.feed.toUpperCase()}.`;
  closePreview();
  operations = [];
  renderReceipts();
}

orderForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void perform(async () => {
    closePreview();
    const { operation } = await request('previewOrder', Object.fromEntries(new FormData(orderForm)));
    showPreview(operation);
    message(t("预览已就绪。确认前请复核环境、数量与价格。","Preview ready. Review the environment, size and price before confirming."));
  }, t("正在检查账户、正常交易时间与报价…","Checking account, regular trading hours and quote\u2026"));
});

orderForm.addEventListener('input', () => {
  if (pending?.kind !== 'order') return;
  closePreview();
  message(t("订单资料已更改，请重新生成预览。","Order details changed. Request a new preview."));
});

confirmForm.elements.confirmation.addEventListener('input', syncConfirm);
confirmForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pending) return;
  const { kind, id } = pending;
  const confirmation = confirmForm.elements.confirmation.value;
  void perform(async () => {
    closePreview();
    const { operation } = await request(kind === 'cancel' ? 'confirmCancel' : 'confirmOrder', { id, confirmation });
    updateReceipt(operation);
    const phase = operation.phase;
    if (phase === 'recorded' || phase === 'cancelRequested') message(kind === 'cancel' ? t("已记录撤单响应，请刷新券商最新状态。","Cancellation response recorded. Refresh for the broker\u2019s latest status.") : t("已记录订单回执，请刷新成交状态。","Order receipt recorded. Refresh for fill status."));
    else if (phase === 'rejected') message(t("券商拒绝了此操作，请检查回执与配置。","The broker rejected this operation. Check the receipt and configuration."), 'error');
    else message(t("券商结果尚未核实。后续操作前请刷新状态。","The broker outcome is unresolved. Refresh the operation status before taking further action."), 'error');
  }, t("正在重新校验预览并发送已确认的请求…","Validating the preview again and sending the confirmed request\u2026"));
});

element('dismiss').addEventListener('click', () => {
  closePreview();
  orderForm.querySelector('button').focus();
});

environment.addEventListener('change', chooseEnvironment);
element('history').addEventListener('click', () => void perform(async () => {
  ({ operations } = await request('history'));
  renderReceipts();
  message(t("已从本机券商日志读取回执。","Receipts loaded from the local broker journal."));
}, t("正在读取券商回执…","Loading broker receipts\u2026")));

receipts.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, operation: id } = button.dataset;
  void perform(async () => {
    const result = await request(action, { id });
    if (action === 'previewCancel') {
      showPreview(result.operation);
      message(t("撤单预览已就绪。","Cancellation preview ready."));
    } else {
      updateReceipt(result.operation);
      message(result.found ? t("券商状态已刷新。","Broker status refreshed.") : t("Alpaca 尚未提供可核验的操作回执。","Alpaca has not provided a verifiable receipt for this operation."), result.found ? '' : 'error');
    }
  }, t("正在查询 Alpaca 最新状态…","Looking up the latest status at Alpaca\u2026"));
});

try {
  const response = await fetch('/api/broker/status', { credentials: 'same-origin' });
  if (!response.ok) throw new Error(t("请直接连接本机服务以检查券商可用性。","Use a direct local connection to check broker availability."));
  configuration = await response.json();
  if (configuration.enabled) {
    environment.replaceChildren(...Object.entries(configuration.modes)
      .filter(([, mode]) => mode.enabled).map(([mode]) => new Option(mode === 'live' ? t("实盘 · 真实资金","Live \u00b7 real money") : t("模拟 · 券商模拟账户","Paper \u00b7 simulated brokerage"), mode)));
    element('workspace').hidden = false;
    chooseEnvironment();
    message(t("券商连接已配置。请输入操作口令以准备或复核操作。","Broker connection configured. Enter the operator token to prepare or review an operation."));
  } else {
    element('unavailable').hidden = false;
    message(t("此实例已关闭券商交易。","Broker trading is disabled in this instance."));
  }
} catch (error) {
  message(error.message, 'error');
}

window.addEventListener('morrowfolio-language-change', () => {
  reflectBrokerLanguage();
  if (configuration?.enabled) {
    for (const option of environment.options) option.textContent=option.value==='live'?t('实盘 · 真实资金','Live · real money'):t('模拟 · 券商模拟账户','Paper · simulated brokerage');
    const saved=confirmForm.elements.confirmation.value;
    if(pending) {showPreview(pending,false);confirmForm.elements.confirmation.value=saved;syncConfirm();}
    renderReceipts();
  } else if(configuration) message(t('此实例已关闭券商交易。','Broker trading is disabled in this instance.'));
});
