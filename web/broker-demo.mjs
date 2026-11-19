import {getLanguage,t} from './i18n.mjs';

const brokerNames={alpaca:'Alpaca', ibkr:'Interactive Brokers (IBKR)'};
const wallet=()=>'/portfolio?lang='+getLanguage();
const action=(key,label,primary=false,busy=false)=>`<button type="button" data-demo-action="${key}" class="broker-demo-${primary?'primary':'secondary'}" ${busy?'disabled':''}>${label}</button>`;
const external=(url,label)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;

function guide(provider){
  const ibkr=provider==='ibkr';
  const name=brokerNames[provider];
  const steps=ibkr?[
    t('在 IBKR 官网核对所在地区、账户类型和资格，按要求提交开户资料。','Check regional eligibility and account type on IBKR’s website, then complete its application.'),
    t('在 Client Portal 按本人账户的入金指示办理，并申请目标市场和产品的交易权限。','Use the deposit instructions for your own account in Client Portal and request permissions for the markets and products you intend to trade.'),
    t('个人 Web API 使用 Client Portal Gateway。IBKR 说明此方式需已开立并入金的 Pro 实盘账户；先使用相应的模拟账户试跑。','Individual Web API access uses Client Portal Gateway and requires an open, funded IBKR Pro account. Test with the corresponding paper account first.'),
    t('第三方应用须另获 IBKR 批准。本产品尚未开放 IBKR 实盘授权。','Third-party integrations require separate IBKR approval. Live IBKR authorization is unavailable in this product.')
  ]:[
    t('在 Alpaca 官网核对资格并申请实盘账户，按券商要求完成身份核验。','Check eligibility and apply for a live account on Alpaca’s website. Complete the identity checks Alpaca requests.'),
    t('在自己的 Alpaca 控制台查看入金方式、可用资金及产品权限；仅在券商处操作资金。','Check funding options, available cash and product permissions in your own Alpaca dashboard. Fund the account directly with the broker.'),
    t('先在 Alpaca Paper 中试跑，核对模拟订单、回执与取消流程。','Start in Alpaca Paper and check order previews, receipts and cancellations.'),
    t('接入正式第三方应用时，会转到 Alpaca 核准环境和权限。默认只读，下单需单独的 trading 权限。本产品尚未开放该实盘授权。','For a live third-party integration, Alpaca shows the environment and permissions on its consent page. Read-only is the default. Trading requires a separate scope. Live authorization is unavailable here.')
  ];
  const sources=ibkr?[
    external('https://www.interactivebrokers.com/','IBKR'),
    external('https://www.interactivebrokers.com/campus/ibkr-api-page/web-api-trading/',t('Web API 与准入','Web API access'))
  ]:[
    external('https://alpaca.markets/','Alpaca'),
    external('https://alpaca.markets/learn/fund-live-trading-account',t('开户后入金','Funding your account')),
    external('https://docs.alpaca.markets/us/docs/using-oauth2-and-trading-api',t('授权权限','OAuth permissions'))
  ];
  return `<details class="broker-demo-guide"><summary>${t('以后如何用真钱交易？','How would live trading work?')}</summary><p>${t('以下是 '+name+' 的真实办理流程。','These steps take place with '+name+'.')}</p><ol>${steps.map(s=>'<li>'+s+'</li>').join('')}</ol><p class="broker-demo-links">${sources.join(' · ')}</p></details>`;
}

function selectBroker(current){
  const labels={
    alpaca:t('体验 Alpaca 的模拟授权。','Try a simulated Alpaca authorization.'),
    ibkr:t('体验盈透证券的模拟授权。','Try a simulated IBKR authorization.')
  };
  return `<h3 class="broker-demo-title" tabindex="-1">${t('选择要体验的券商','Choose a broker to explore')}</h3>
    <p class="broker-demo-lede">${t('先选券商，再看权限。确认后，演示记录会保存到当前工作区。','Choose a broker to review its permissions. Confirm to save a demo connection to this workspace.')}</p>
    <div class="broker-demo-options">${Object.entries(brokerNames).map(([id,name])=>`<button type="button" class="broker-demo-option" data-demo-broker="${id}"><strong>${name}</strong><span>${labels[id]}</span><span aria-hidden="true">→</span></button>`).join('')}</div>
    ${current?action('back',t('保留当前模拟连接','Keep current demo connection')):''}`;
}

function brokerPanel(view,selected,record,busy){
  const provider=selected||record.provider;
  if(view==='choose')return selectBroker(record.provider);
  const name=brokerNames[provider];
  if(view==='grant')return `<h3 class="broker-demo-title" tabindex="-1">${t('核对 '+name+' 的模拟授权','Review the '+name+' demo')}</h3>
    <p class="broker-demo-lede">${t('本次只保存你选择的券商名称。无需输入账户、密码或 API 密钥。','Only the selected broker is saved. No account number, password or API key is needed.')}</p>
    <dl class="broker-demo-grant"><div><dt>${t('演示范围','Demo scope')}</dt><dd>${t('显示模拟连接状态','Display a simulated connection')}</dd></div><div><dt>${t('真实账户权限','Real account permissions')}</dt><dd>${t('无。不能读取真实余额、交易或转账。','None. No access to real balances, orders or transfers.')}</dd></div></dl>
    ${record.provider&&record.provider!==provider?'<p>'+t('确认后将替换当前模拟连接。','Confirming will replace your current demo connection.')+'</p>':''}
    ${guide(provider)}<div class="broker-demo-actions">${action('connect',busy?t('保存中…','Saving…'):t('确认模拟连接','Confirm demo connection'),true,busy)}${action('choose',t('返回选择','Back to brokers'),false,busy)}</div>`;
  if(view==='disconnect')return `<h3 class="broker-demo-title" tabindex="-1">${t('解除 '+name+' 的模拟连接？','Disconnect the '+name+' demo?')}</h3>
    <p class="broker-demo-lede">${t('这只会清除当前工作区的模拟连接，已记录的模拟持仓和交易仍可查看。','This clears the demo connection in this workspace. Your existing paper holdings and transactions stay available.')}</p>
    <div class="broker-demo-actions">${action('confirm-disconnect',busy?t('解除中…','Disconnecting…'):t('确认解除','Confirm disconnect'),true,busy)}${action('back',t('保留连接','Keep connection'),false,busy)}</div>`;
  return `<h3 class="broker-demo-title" tabindex="-1">${t('已模拟连接','Demo connected')} · ${name}</h3><p class="broker-demo-lede">${t('你已走完授权演示。模拟钱包继续使用站内账本，当前没有真实券商授权。','You completed the walkthrough. The paper wallet uses the in-app ledger. No brokerage authorization is active.')}</p>
    <div class="broker-demo-actions"><a href="${wallet()}" class="broker-demo-primary">${t('查看我的投资组合','View my portfolio')}</a>${action('choose',t('更换券商','Change broker'))}${action('disconnect',t('解除模拟连接','Disconnect demo'))}</div>${guide(provider)}`;
}

export function createBrokerDemo({api,save}){
  let node,owner,record,view,selected,busy=false,notice='',failure=false;
  function draw(focus=false){
    if(!node?.isConnected)return;
    const fromWallet=new URLSearchParams(location.hash.split('?')[1]).get('view')==='broker';
    node.innerHTML=`<section class="broker-demo" data-broker-demo data-demo-state="${view}" aria-labelledby="broker-demo-heading">
      <header class="broker-demo-head"><span class="broker-demo-kicker">${t('授权演示 · 模拟','SIMULATED AUTHORIZATION')}</span><h2 id="broker-demo-heading">${t('连接券商','Broker connections')}</h2></header>
      <div class="broker-demo-body">${brokerPanel(view,selected,record,busy)}</div>
      <p class="broker-demo-status" role="${failure?'alert':'status'}" aria-live="polite"></p>
      ${failure?action('reload',t('刷新当前工作区','Reload workspace')):''}
      ${fromWallet&&view!=='connected'?'<a class="broker-demo-return" href="'+wallet()+'">← '+t('返回我的投资组合','Back to my portfolio')+'</a>':''}
    </section>`;
    node.querySelector('.broker-demo-status').textContent=notice;
    if(focus)node.querySelector('.broker-demo-title')?.focus({preventScroll:true});
  }
  async function commit(provider){
    const before=owner;busy=true;draw();
    try{
      const result=await api('/api/broker-demo',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({workspaceRef:before,expectedVersion:record.version,provider})});
      if(owner!==before||!save(before,result))return;
      record=result;selected=null;view=record.provider?'connected':'choose';
      notice=record.provider?t('模拟连接已保存。','Demo connection saved.'):t('已解除模拟连接。','Demo disconnected.');
    }catch(error){
      if(before===owner){failure=true;notice=error.status===409?t('账户或连接状态已更新。请刷新再确认。','Your account or connection changed. Reload before confirming.'):t('未能确认保存结果。请刷新工作区核对后重试。','The save could not be confirmed. Reload the workspace to check before retrying.');}
    }finally{if(owner===before){busy=false;draw(true);}}
  }
  function click(e){
    const button=e.target.closest('button');if(!button||busy)return;
    const key=button.dataset.demoAction;
    if(key==='reload'){location.reload();return;}
    if(failure)return;
    if(button.dataset.demoBroker){selected=button.dataset.demoBroker;view='grant';}
    else if(key==='connect'){void commit(selected);return;}
    else if(key==='confirm-disconnect'){void commit(null);return;}
    else if(key==='choose'){view='choose';selected=null;}
    else if(key==='back'){view=record.provider?'connected':'choose';selected=null;}
    else if(key==='disconnect'){view='disconnect';selected=null;}
    else return;
    notice='';draw(true);
  }
  return {mount(root,workspaceRef,saved){
    const next=saved||{provider:null,version:0};
    if(owner!==workspaceRef||record?.version!==next.version){view=next.provider?'connected':'choose';selected=null;notice='';failure=false;busy=false;}
    owner=workspaceRef;record=next;node=root;node.addEventListener('click',click);draw();
  },leave(){node=null;selected=null;view=record?.provider?'connected':'choose';notice='';failure=false;}};
}

