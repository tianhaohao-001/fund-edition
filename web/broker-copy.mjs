import {t, getLanguage, setLanguage, LANGUAGES} from './i18n.mjs';
const COPY={"0": ["公开演示与普通模拟器可独立使用。支持的配置和测试步骤见 README。", "The public demo and the standard simulator can be used independently. Open the README for the supported setup and test procedure."], "1": ["仅使用允许的美股标的及整数股。订单为正常交易时段的当日有效限价单。", "Use whole shares of an allowed U.S. equity. Orders are DAY limits during the regular trading session."], "2": ["在交易电脑上直接打开Fund Edition，按配置文档设置独立的行情、Paper 或 Live 凭据、允许标的、单笔限额与本机操作口令，再重新启动。", "Open Fund Edition directly on the trading computer. Follow the setup documentation to configure separate market-data, Paper or Live credentials, allowed symbols, order limits and the local operator token, then restart."], "3": ["刷新回执以核实 Alpaca 的最新状态。", "Refresh a receipt to verify its latest status at Alpaca."], "4": ["为独立配置的 Alpaca 账户预览并确认限价单。券商账户与工作室、基金广场的模拟账本各自记录。", "Preview and confirm limit orders for a separately configured Alpaca account. Broker accounts and the Studio and Funds simulated ledgers are recorded separately."], "5": ["正在检查本机券商配置…", "Checking the local broker configuration…"], "6": ["私有操作控制台", "PRIVATE OPERATOR CONSOLE"], "7": ["需要本机配置", "Local setup required"], "8": ["本机操作口令", "Local operator token"], "9": ["尚未读取回执。", "No receipts loaded."], "10": ["Alpaca 环境", "Alpaca environment"], "11": ["执行账户", "Execution account"], "12": ["限价（美元）", "Limit price (USD)"], "13": ["准备订单", "Prepare an order"], "14": ["复核订单", "Review the order"], "15": ["关闭预览", "Dismiss preview"], "16": ["券商回执", "Broker receipts"], "17": ["预览订单", "Preview order"], "18": ["读取回执", "Load receipts"], "19": [" 以确认", " to confirm"], "20": ["券商连接与操作", "Broker connections and operations"], "21": ["确认", "Confirm"], "22": ["标的", "Symbol"], "23": ["股数", "Shares"], "24": ["输入 ", "Type "], "25": ["方向", "Side"], "26": ["卖出", "Sell"], "27": ["买入", "Buy"]};

export function reflectBrokerLanguage() {
  document.documentElement.lang=getLanguage();
  document.title=t('券商连接 · Fund Edition','Broker connections · Fund Edition');
  document.querySelector('[data-broker-brand]').textContent=t('Fund Edition','Fund Edition');
  document.querySelector('.broker-header > a').setAttribute('aria-label',t('返回Fund Edition连接页','Back to Fund Edition connections'));
  for(const element of document.querySelectorAll('[data-broker-copy]')) {
    const pair=COPY[element.dataset.brokerCopy]; if(pair) element.textContent=t(...pair);
  }
  document.querySelector('#broker-languages').replaceChildren(...LANGUAGES.map(({id,label})=>{
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.className='broker-language';button.setAttribute('aria-pressed',String(getLanguage()===id));
    button.onclick=()=>{setLanguage(id);reflectBrokerLanguage();window.dispatchEvent(new Event('morrowfolio-language-change'));};return button;
  }));
}
