import { salonDirectory, bindSalonDirectory, setupSalonStyle, salonDetailHead, salonGuide, bindSalonGuide, salonCredits, galleryUrl, studyVisual } from './strategy-salon.mjs';
import { meetingSlot,researchReviewButton } from './team-meeting.mjs';
import { researchPrompt } from './experience.mjs';
import { researchBrief } from './strategy-playbook.mjs';
import { getLanguage, t } from './i18n.mjs';
import { localizedCatalogEntry, catalogSampleLabel, catalogAssumptions } from './catalog-copy.mjs';
import { CATALOG, findCatalog, catalogBacktest } from './catalog-model.mjs';
import { renderReplication } from './replication.mjs';
import { runReplicaStudy } from './catalog-replica.mjs';

import { marketReferenceSlot, bindMarketReference } from './market-reference.mjs';

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function money(value) { return Number.isFinite(value) ? USD.format(value) : '—'; }
function pct(value) { return `${value > 0 ? '+' : ''}${NUMBER.format(value ?? 0)}%`; }
function assets(item) { return item.assets ? `$${NUMBER.format(item.assets.value / 1e9)}B` : '—'; }



function localizedSampleSource(source) {
  for (const kind of ['historical', 'synthetic', 'imported']) {
    if (source === catalogSampleLabel(kind, 'zh-CN') || source === catalogSampleLabel(kind, 'en-US')) return catalogSampleLabel(kind, getLanguage());
  }
  return source;
}
function localizedCatalogError(message) {
  const known = {
    '导入文件需要 source 和 4–3000 项 prices，每项包含 date 与正数 close。': 'The import needs a source and 4–3,000 prices, each with a date and positive close.',
    '净值日期必须递增，价格需在 $0.01–$1,000,000 之间。': 'Dates must be valid and increasing, with prices between $0.01 and $1,000,000.',
    '价格样本导致金额超出精确模拟范围。': 'The price sample exceeds the exact simulation range.',
  };
  return t(message, known[message] ?? message);
}


function replicaPanel(item, study, draft, busy, review, hosted) {
  const published = study ?? (['wellington', 'stocks-plus'].includes(item.id) ? runReplicaStudy(item.id) : null);
  const isHistorical=Boolean(published?.metrics && published.points?.length>1);
  const annual=published?.frequency==='annual';
  const basis=annual ? t('股票贝塔代理与原基金的总回报，基点均为 100。','Equity-beta proxy and original fund total returns, both indexed to 100.') : t('公开策略代理与原基金总回报，基点均为 100。','Public-strategy proxy and original fund total return, both indexed to 100.');
  const heading=isHistorical ? t('历史配置对照','Historical proxy comparison') : t('公开策略研究','Public strategy study');
  const prepare=`<button class="funds-button funds-button-primary" data-action="prepare-research" data-id="${esc(item.id)}" type="button" ${busy?'disabled':''}>${study?.paperFundSupported===true ? t('拟建模拟策略基金','Prepare a paper strategy fund') : t('向研究团队提案','Prepare research brief')} ↗</button>`;
  const pending=draft?.catalogId===item.id;
  let results='';
  if(isHistorical) {
    const {metrics,points}=published;
    const quarters = points.slice(1).map((q,index)=>({date:q.date,gap:100*((q.replica/points[index].replica)-(q.target/points[index].target))}));
    const widest = quarters.reduce((worst,q)=>Math.abs(q.gap)>Math.abs(worst.gap)?q:worst,quarters[0]);
    const labels=[['replicaReturnPct',t('代理累计回报','Proxy return')],['targetReturnPct',t('原基金累计回报','Fund return')],['gapPct',t('回报差','Return gap')],['trackingErrorPct',t('年化跟踪误差','Annualized tracking error')],['correlation',annual?t('年度回报相关性','Annual return correlation'):t('季度回报相关性','Quarterly return correlation')],['maxDrawdownPct',t('代理最大回撤','Proxy max drawdown')]];
    const dollars=(value)=>Number.isFinite(value)?NUMBER.format(value):'—';
    results=`<div class="study-summary"><strong>${t('公开策略代理跟踪','Public strategy proxy tracking')}</strong><span>${esc(points[0].date)} — ${esc(points.at(-1).date)}</span></div><p>${basis} ${t('同日美元净值，收益含分配再投资。','Same-date USD NAV returns include reinvested distributions.')}</p>
    <figure class="study-figure"><figcaption><span>${t('策略代理','Strategy proxy')}</span><span>${esc(item.ticker)} · ${t('原基金','Original fund')}</span></figcaption><canvas class="study-canvas" data-study-points="${esc(JSON.stringify(points.map(({date,replica,target})=>({date,replica,target}))))}" aria-label="${basis}"></canvas><div class="study-dates"><span>${esc(points[0].date)}</span><span>${esc(points.at(-1).date)}</span></div></figure>
    <dl class="funds-stats">${labels.map(([key,label])=>`<div><dt>${label}</dt><dd>${Number.isFinite(metrics?.[key])?(key==='correlation'?metrics[key].toFixed(4):key==='gapPct'?NUMBER.format(metrics[key])+' pp':pct(metrics[key])):'—'}</dd></div>`).join('')}</dl>
    <p>${t('历史预设权重','Historical preset weights')} ${(published.allocation || []).map(leg=>esc(leg.symbol)+' '+dollars(leg.weightPct)+'%').join(' / ')} · ${t('留出期','Holdout')} ${esc(published.holdout?.periods)} ${annual?t('年','years'):t('季','quarters')}</p>
    <p>${t('每次调仓成本','Trading cost')} ${dollars(metrics?.feeBps)} bp · ${t('每 $100 累计成本','Total cost per $100')} $${dollars(metrics?.feesPer100)} · ${annual?t('年度偏离最大','Largest annual gap'):t('季度偏离最大','Largest quarterly gap')} ${esc(widest.date)} (${dollars(widest.gap)} pp).</p>
    <p>${annual ? t('股票贝塔基准仅衡量股票敞口，未模拟原基金的债券超额收益策略。','The equity-beta baseline measures equity exposure. The fund’s bond-alpha strategy is outside this model.') : t('固定的股息股票与投资级债代理，无法反映原经理的个股选择、信用配置与择时。','A fixed dividend-stock and investment-grade-credit proxy cannot capture the manager’s stock selection, credit choices or timing.')}</p>
    <details class="funds-details"><summary>${t('核对逐期数值与来源','Inspect observations and sources')}</summary><table><thead><tr><th>${t('日期','Date')}</th><th>${t('代理','Proxy')}</th><th>${esc(item.ticker)}</th></tr></thead><tbody>${points.map(q=>`<tr><td>${esc(q.date)}</td><td>${dollars(q.replica)}</td><td>${dollars(q.target)}</td></tr>`).join('')}</tbody></table>${(published.sources||[]).filter(source=>/^https:\/\//u.test(source.url)).map(source=>`<a href="${esc(source.url)}" rel="noreferrer" target="_blank">${esc(getLanguage()==='en-US' ? source.titleEn || new URL(source.url).hostname : source.title || new URL(source.url).hostname)} ↗</a>`).join(' · ')}</details>`;
  } else {
    results=`<p>${study ? t('现有证据支持方法研究。公开样本还不足以对原基金和代理收益作同口径检验。','The available evidence supports a method study. Comparable public observations are insufficient for a return-tracking test.') : item.ticker==='VWELX' ? t('研究团队可对比 VWELX 与由 VYM、VCIT 构成的公开策略代理，检验样本外跟踪差异。','Compare VWELX with a public proxy built from VYM and VCIT and measure the out-of-sample tracking gap.') : t('检查公开策略、披露与可验证范围，团队将列出可以核对的证据。','Review the public strategy, disclosures and scope. The team will identify evidence that can be checked.')}</p>`;
  }
  if(study?.seats?.length) {
    const roles={disclosure:t('披露研究','Disclosures'),allocation:t('组合构建','Allocation'),risk:t('风险检查','Risk checks'),evaluation:t('绩效核验','Evaluation'),execution:t('模拟执行','Paper execution')};
    const brief=researchBrief(study,getLanguage());
    const fields=[[t('组合规则','Portfolio rule'),brief.rule],[t('比较基准','Comparison'),brief.benchmark],[t('成本','Costs'),brief.cost],
      [t('研究席','Research seat'),brief.roles.research],[t('风险席','Risk seat'),brief.roles.risk],[t('经理席','Manager seat'),brief.roles.manager]];
    results+=`<details class="funds-details"><summary>${t('研究席位与核验记录','Research seats and evidence')}</summary>
      <h3>${esc(brief.name)}</h3><p>${esc(brief.manager)} · ${t('资料核对','Sources checked')} ${esc(brief.verifiedAt)}</p>
      <dl>${fields.map(([label,value])=>`<dt><strong>${esc(label)}</strong></dt><dd>${esc(value)}</dd>`).join('')}</dl>
      <ul>${brief.checks.map(c=>`<li><strong>${c.status==='passed'?t('已核验','Verified'):t('缺少数据','Missing inputs')}</strong> · ${esc(c.detail)}</li>`).join('')}</ul>
      <p>${t('本次规则检查的模型调用数','Model calls for this deterministic check')} · ${brief.modelCalls}</p>
      <ul>${study.seats.map(seat=>`<li><strong>${esc(roles[seat.id] || seat.id)}</strong> · ${seat.kind==='source' ? t('公开资料','Public source') : t('固定规则','Deterministic rule')} · ${esc(getLanguage()==='en-US' ? seat.evidenceEn : seat.evidence)}</li>`).join('')}</ul>
      ${brief.sources.filter(s=>/^https:\/\//u.test(s.url)).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)} ↗</a>`).join(' · ')}</details>`;
  }
  return `<section class="funds-section replica-study" id="replica-comparison"><div class="funds-section-heading"><div><span class="funds-eyebrow">${esc(item.ticker)}</span><h2>${heading}</h2></div></div>${results}${pending?researchPrompt(draft,busy):prepare}${researchReviewButton(study,review,busy || !hosted)}${meetingSlot('reviewResearch',item.id)}</section>`;
}

function drawReplicaChart(canvas) {
  const points=JSON.parse(canvas.dataset.studyPoints);
  const width=Math.max(240,Math.floor(canvas.getBoundingClientRect().width));
  const height=190, scale=Math.min(2,globalThis.devicePixelRatio||1);
  canvas.width=width*scale;canvas.height=height*scale;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.scale(scale,scale);
  const values=points.flatMap(p=>[p.replica,p.target]);
  const floor=Math.floor((Math.min(...values)-2)/5)*5,ceiling=Math.ceil((Math.max(...values)+2)/5)*5;
  const x=i=>35+i*(width-44)/(points.length-1),y=v=>8+(ceiling-v)/(ceiling-floor)*(height-17);
  const style = getComputedStyle(canvas);
  const original = style.getPropertyValue('--study-original').trim() || '#536078';
  const proxy = style.getPropertyValue('--study-proxy').trim() || '#254bd1';
  const grid = style.getPropertyValue('--study-grid').trim() || '#d7dee9';
  ctx.font='11px system-ui';ctx.textBaseline='middle';
  for(let i=0;i<4;i++){const value=floor+(ceiling-floor)*i/3;ctx.fillStyle=original;ctx.fillText(String(Math.round(value)),0,y(value));ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(33,y(value));ctx.lineTo(width-5,y(value));ctx.stroke();}
  for(const [key,color,dash] of [['target',original,[]],['replica',proxy,[5,4]]]){ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2.6;ctx.setLineDash(dash);points.forEach((p,i)=>i?ctx.lineTo(x(i),y(p[key])):ctx.moveTo(x(i),y(p[key])));ctx.stroke();}
}

function localCatalogUrl(id) {
  const params=new URLSearchParams({lang:getLanguage()});
  const lobby=new URLSearchParams(globalThis.location?.search).get('lobby');
  if(['motion','static','original'].includes(lobby))params.set('lobby',lobby);
  if(id)params.set('catalog',id);
  return '/?'+params+'#/lab';
}
function salonOptions() {
  return {items:CATALOG.map(x=>localizedCatalogEntry(x,getLanguage())),lang:getLanguage(),url:localCatalogUrl,backUrl:localCatalogUrl().replace('#/lab','#/')};
}
function catalogList(section,busy,pending) {
  return salonDirectory({...salonOptions(),extra:researchPrompt(pending,busy)});
}


function chart(study) {
  const values = study.points.flatMap(point => [point.equity, point.benchmarkEquity]);
  const low = Math.min(...values, study.startingCash);
  const high = Math.max(...values, study.startingCash);
  const pad = Math.max(high - low, 300) * .12;
  const floor = low - pad;
  const ceiling = high + pad;
  function polygon(key) {
    const coords = study.points.map((point, index) => ({ x: index * 100 / (study.points.length - 1), y: (ceiling - point[key]) * 100 / (ceiling - floor) }));
    return `polygon(${[...coords.map(p => `${p.x}% ${p.y - .5}%`), ...coords.toReversed().map(p => `${p.x}% ${p.y + .5}%`)].join(',')})`;
  }
  return `<figure class="funds-chart"><figcaption><span><i></i>${t("透明规则实验","Transparent rule experiment")}</span><span><i></i>${t("同一价格买入并持有","Buy and hold at the same prices")}</span></figcaption><div class="funds-graph" role="img" aria-label="${t("规则实验与买入持有的样本累计价格收益曲线","Sample cumulative price returns: rule experiment versus buy and hold")}"><div class="funds-gridline"><span>${pct((ceiling / study.startingCash - 1) * 100)}</span></div><div class="funds-gridline"><span>${pct(((ceiling + floor) / 2 / study.startingCash - 1) * 100)}</span></div><div class="funds-gridline"><span>${pct((floor / study.startingCash - 1) * 100)}</span></div><div class="funds-curve funds-benchmark" style="clip-path:${polygon('benchmarkEquity')}"></div><div class="funds-curve" style="clip-path:${polygon('equity')}"></div></div><div class="funds-chart-dates"><span>${study.startDate}</span><span>${study.endDate}</span></div></figure>`;
}

function performance(item, study, busy) {
  return `<section class="funds-section" id="catalog-performance"><div class="funds-section-heading"><div><span class="funds-eyebrow">${t("价格实验","PERFORMANCE LAB")}</span><h2>${study.kind === 'historical' ? t('公开净值，重新计算。','Public NAV. Recalculated.') : t('让方法经历一个市场情景。','Put the method through a market scenario.')}</h2></div><button type="button" class="funds-button funds-button-outline" data-action="catalog-backtest" data-id="${item.id}" ${busy ? 'disabled' : ''}>${t("重算实验 ↻","Recalculate \u21bb")}</button></div>
    <div class="funds-data-label"><i></i>${esc(catalogSampleLabel(study.kind, getLanguage()))}<span>${study.points.length}${t(" 个观察点"," observations")}</span></div>
    <dl class="funds-stats"><div><dt>${t("规则累计价格收益","Cumulative rule price return")}</dt><dd>${pct(study.metrics.returnPercent)}</dd></div><div><dt>${t("同价格买入持有","Same-price buy and hold")}</dt><dd>${pct(study.metrics.benchmarkReturnPercent)}</dd></div><div><dt>${t("观察点最大回撤","Maximum observed drawdown")}</dt><dd>${NUMBER.format(study.metrics.maxDrawdownPercent)}%</dd></div><div><dt>${t("实验期末模拟资产","Ending simulated equity")}</dt><dd>${money(study.metrics.endingEquity)}</dd></div></dl>
    ${chart(study)}<details class="funds-details"><summary>${t("计算规则、逐笔成交与数据来源","Rules, individual fills and data sources")} <span>＋</span></summary><ul>${catalogAssumptions(item, getLanguage()).map(text => `<li>${esc(text)}</li>`).join('')}</ul><p class="funds-source-line">${study.source.startsWith('https://') ? `<a href="${esc(study.source)}" target="_blank" rel="noreferrer">${t("查看价格原始来源 ↗","View original price source ↗")}</a>` : esc(study.source)}</p><div class="funds-trades"><table><thead><tr><th>${t("信号日","Signal date")}</th><th>${t("成交日","Fill date")}</th><th>${t("方向","Side")}</th><th>${t("份额","Units")}</th><th>${t("价格","Price")}</th></tr></thead><tbody>${study.trades.map(trade => `<tr><td>${trade.signalDate ?? '—'}</td><td>${trade.date}</td><td>${trade.action === "BUY" ? t("买入","Buy") : t("卖出","Sell")}</td><td>${NUMBER.format(trade.units)}</td><td>${money(trade.price)}</td></tr>`).join('')}</tbody></table></div></details>
    <details class="funds-details"><summary>${t("用自己的价格数据重算","Recalculate with your own prices")} <span>＋</span></summary><p>${t("导入有来源的历史价格 JSON，仅在当前浏览器计算。格式为 ","Import historical price JSON with a source. Calculation stays in this browser. Format: ")}<code>{"source":"${t("来源","Source")}","prices":[{"date":"2026-01-01","close":100},…]}</code>.</p><label class="funds-upload">${t("选择价格文件","Choose a price file")}<input type="file" accept=".json,application/json" data-catalog-import="${item.id}"></label><p class="funds-import-status" role="status"></p></details>
  </section>`;
}

function paperArchive(account) {
  if(account?.environment!=='catalog-paper'||!account?.history?.length)return '';
  return '<details class="fd-tools"><summary>'+t('旧版独立模拟账户记录','Archived strategy sandbox')+'</summary><p>'+t('这本旧账独立保存。余额和回执没有转入组合钱包。','This old account is archived separately. Its balance and receipts have not moved into the portfolio wallet.')+'</p><ul class="funds-paper-trades">'+account.history.map(trade=>'<li><b>'+esc(trade.side)+' '+NUMBER.format(trade.units)+'</b><span>'+money(trade.value)+'</span><small>'+esc(trade.quoteDate)+' · '+esc(localizedSampleSource(trade.source))+'</small></li>').join('')+'</ul></details>';
}

function researchDossier(item, account, busy) {
  const sources = item.sources.filter(source => /^https:\/\//u.test(source.url));
  const facts = [
    [t('研究范围','Research coverage'), item.researchStatus],
    [t('主要风险','Key risk'), item.risk],
    [t('资料核对','Sources checked'), item.researchedAt],
  ];
  if (item.assets) facts.push([t('披露资产','Disclosed assets'),assets(item)+' · '+item.assets.asOf]);
  return `<aside class="research-dossier"><h2>${t('研究档案','Research file')}</h2>
    <dl>${facts.map(([name,value])=>`<div><dt>${name}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    ${sources[0]?`<a class="issuer-source" href="${esc(sources[0].url)}" target="_blank" rel="noreferrer">${t('查看原始文件','Read the original source')} ↗</a>`:''}

    <a class="issuer-source" href="/membership.html?from=${encodeURIComponent(item.id)}&amp;lang=${getLanguage()}#fees">${t('查看费用假设','View fee assumptions')} ↗</a>
  </aside>`;
}

function teamAndChat(item, chats, provider, busy) {
  const hosted = Boolean(provider?.chatEnabled);
  const intro = item.section === 'persona'
    ? t(`你好，我是${item.name}的 AI 经理。我们可以从你的投资疑问聊起。你想先讨论买入一家公司要看什么，还是这种风格最怕什么？`, `Hello, I’m the AI manager of ${item.name}. Shall we discuss what to look for in a business, or what can go wrong with this style?`)
    : t(`你好，我是${item.name}研究团队的 AI 经理。想先了解我们的研究方法，还是问问这套策略在什么情况下可能亏损？`, `Hello, I’m the AI manager of the ${item.name} research team. Would you like to explore our approach or the conditions in which this strategy could lose money?`);
  return `<section class="funds-section funds-conversation" id="catalog-team"><div class="funds-section-heading"><div><span class="funds-eyebrow">${t("认识团队","MEET THE TEAM")}</span><h2>${t("好策略，应该经得起提问。","A good strategy should stand up to questions.")}</h2></div><span class="funds-online${hosted ? '' : ' funds-online-unavailable'}">${hosted ? t('Agent 已连接','Agent connected') : t('AI 尚未连接','AI not connected')}</span></div>
    <div class="funds-chat-log" aria-live="polite" aria-label="${t("与基金经理的对话","Conversation with the fund manager")}"><div class="funds-chat-message"><span class="funds-chat-face" style="--fund-accent:${item.color}">${item.mark}</span><div><strong>${esc(item.name)} · ${t("AI 经理","AI manager")}</strong><p>${esc(intro)}</p></div></div>${(chats ?? []).map(message => `<div class="funds-chat-message ${message.role === 'user' ? 'funds-chat-user' : ''}">${message.role !== 'user' ? `<span class="funds-chat-face" style="--fund-accent:${item.color}">${item.mark}</span>` : ''}<div><strong>${message.role === 'user' ? t('你','You') : `${esc(item.name)} · ${t("AI 经理","AI manager")}`}</strong><p>${esc(message.text)}</p>${message.role !== 'user' ? `<button class="read-reply" type="button" data-action="speak-message" data-text="${esc(message.text)}">${t('读给我听','Read aloud')}</button>` : ''}${message.source ? `<small>${esc(message.source)}</small>` : ''}</div></div>`).join('')}</div>
    <form data-form="catalog-chat" data-id="${item.id}" class="funds-chat-form"><label class="visually-hidden" for="catalog-message">${t("向基金经理提问","Ask the fund manager")}</label><textarea id="catalog-message" name="message" rows="2" maxlength="800" placeholder="${t("问问：为什么这样配置？市场下跌时会怎么做？","Ask: Why this allocation? What happens if markets fall?")}" required></textarea><div class="funds-chat-tools"><span class="funds-voice-slot" data-voice-for="catalog-message"></span><span class="funds-chat-provider">${hosted ? 'HarnessRouter Agent' : t('AI 尚未连接','AI not connected')}</span><input type="hidden" name="provider" value="harnessrouter"><button type="submit" class="funds-button funds-button-primary" ${busy || !hosted ? 'disabled' : ''}>${t("发送","Send")} <span>↑</span></button></div></form>
    ${hosted ? '' : `<p class="funds-connection-note">${t('连接 AI 经理后发送。你的草稿可以留在这里。','Connect the AI manager to send. Your draft can stay here.')}<a href="#/connections">${t('连接设置 ↗','Connection settings ↗')}</a></p>`}
  </section>`;
}

export function renderCatalog({ catalogId, catalogSection = 'market', catalogChats = {}, catalogAccounts = {}, catalogBacktests = {}, researchDraft, researchStudies = {}, researchReviews = {}, provider = {}, busy = false } = {}) {
  const item = localizedCatalogEntry(findCatalog(catalogId), getLanguage());
  if (!item) return catalogList(catalogSection, busy, researchDraft);
  const study = catalogBacktests[item.id] ?? catalogBacktest(item.id);
  const canAdjust = ['wellington','stocks-plus','premium-income'].includes(item.id);
  const operatorLink = item.section==='market'
    ? `<a class="funds-button funds-button-primary" href="/fund-operator.html?fund=${encodeURIComponent(item.id)}&amp;lang=${encodeURIComponent(getLanguage())}">${canAdjust?t('让 AI 团队决定下一期','Ask the AI team to decide its next move'):t('让 AI 团队评估下一步','Ask the AI team to assess its next move')} ↗</a>
       <small>${canAdjust?t('锁定本次公开证据 · 模拟资金','Evidence locked for this decision · Paper funds'):t('研究席与风险席参与 · 证据不足时维持现金','Research and risk review · Hold cash when evidence is insufficient')}</small>` : '';
  const persona=item.section==='persona';
  const head=salonDetailHead(item,getLanguage(),galleryUrl(localCatalogUrl,persona?'people':'markets'),provider.chatEnabled);
  const liveChat=persona?personConversation(item,catalogChats[item.id],provider,busy):teamAndChat(item,catalogChats[item.id],provider,busy);
  const research=replicaPanel(item,researchStudies[item.id],researchDraft,busy,researchReviews[item.id],provider.chatEnabled);
  const credit=salonCredits(item,getLanguage());
  const committeeExtras=(credit||operatorLink) ? '<section class="fd-actions">'+operatorLink+credit+'</section>' : '';
  const walletEntry='<div class="wallet-entry"><span>'+t('从你的模拟钱包配置这只策略。','Allocate paper cash from your portfolio to this strategy.')+'</span><a class="wallet-order-link" href="#/portfolio?product='+encodeURIComponent('catalog:'+item.id)+'">'+t('投入模拟资金','Invest paper cash')+' ↗</a></div>';
  const sandbox='<details class="fd-tools"><summary>'+t('更多研究工具','More research tools')+' <span aria-hidden="true">↗</span></summary>'+
    researchDossier(item,catalogAccounts[item.id],busy)+performance(item,study,busy)+research+marketReferenceSlot(item.ticker)+(item.id==='ark-innovation'?renderReplication('sec'):'')+'</details>';
  return '<section class="sx-detail" data-study-id="'+esc(item.id)+'">'+head+'<div class="sx-body">'+walletEntry+studyVisual(item,getLanguage(),{committeeExtras,managerAvailable:provider.chatEnabled===true})+
    (item.id==='buffett'?'<details class="fd-tools"><summary>'+t('与研究员讨论巴菲特的公开投资方法','Discuss Buffett’s published methods')+'</summary>'+liveChat+'</details>':(persona?salonGuide(item,getLanguage()):'')+liveChat+sandbox)+paperArchive(catalogAccounts[item.id])+'</div></section>';
}

function personConversation(item, messages=[], provider, busy) {
  const enabled=Boolean(provider?.chatEnabled);

  const name=getLanguage()==='zh-CN'?(item.personNameZh||item.personName):item.personName;
  const recent=messages.slice(-6).map(row=>`<div class="sx-message"><small>${row.role==='user'?t('你','You'):t('风格 AI 研究员','AI style researcher')}</small><p>${esc(row.text)}</p>${row.responseId?`<details class="sx-sources"><summary>${t('模型回执','Model receipt')}</summary><code>${esc(row.responseId)}</code></details>`:''}</div>`).join('');
  const content = `<section class="sx-live"><span class="sx-eyebrow">${enabled?t('Agent 已连接','Agent connected'):t('AI 尚未连接','AI not connected')} · HarnessRouter · ${t('实时对话','Live conversation')}</span><h2>${t('想问这位研究员什么？','What would you like to ask?')}</h2>${recent}<form data-form="catalog-chat" data-id="${esc(item.id)}"><label for="catalog-message">${esc(name)} · ${t('公开理念研究','Public-method study')}</label><textarea id="catalog-message" name="message" maxlength="800" rows="2" placeholder="${t('如果一家好公司涨价了，还值得研究吗？','What if the price of a great company keeps rising?')}" required></textarea><input type="hidden" name="provider" value="harnessrouter"><div class="sx-live-controls"><span class="funds-voice-slot" data-voice-for="catalog-message"></span><button type="submit" class="sx-person-submit" ${busy||!enabled?'disabled':''}>${t('发送问题','Ask question')} ↑</button></div></form></section>`;
  return enabled?content:content+'<a class="issuer-source" href="#/connections">'+t('连接设置','Connection settings')+'</a>';
}


export function bindCatalogInteractions(root) {
  setupSalonStyle();
  bindSalonDirectory(root,salonOptions());
  bindSalonGuide(root);
  bindMarketReference(root);
  for (const canvas of root.querySelectorAll('.study-canvas')) drawReplicaChart(canvas);
  for (const button of root.querySelectorAll('[data-catalog-scroll]')) button.addEventListener('click', () => {
    const target = root.querySelector(`#${button.dataset.catalogScroll}`);
    if (!target) return;
    const disclosure = target.closest('.unit-sandbox');
    if (disclosure) disclosure.open = true;
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  });
  for (const input of root.querySelectorAll('[data-catalog-import]')) input.addEventListener('change', async () => {
    const status = input.closest('details').querySelector('.funds-import-status');
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 500_000) throw new Error(t('文件需小于 500 KB。','The file must be smaller than 500 KB.'));
      const item = findCatalog(input.dataset.catalogImport);
      const study = catalogBacktest(input.dataset.catalogImport, JSON.parse(await file.text()));
      const performanceSection = root.querySelector('#catalog-performance');
      const details = input.closest('details');
      const result = document.createElement('div');
      result.className = 'funds-import-result';
      result.innerHTML = `<strong>${t("本地重算完成","Local calculation complete")}</strong><p>${esc(catalogSampleLabel(study.kind, getLanguage()))} · ${esc(study.source)}</p><dl class="funds-stats"><div><dt>${t("累计价格收益","Cumulative price return")}</dt><dd>${pct(study.metrics.returnPercent)}</dd></div><div><dt>${t("观察点最大回撤","Maximum observed drawdown")}</dt><dd>${NUMBER.format(study.metrics.maxDrawdownPercent)}%</dd></div></dl>${chart(study)}`;
      performanceSection.querySelector('.funds-import-result')?.remove();
      details.append(result);
      status.textContent = t('已在浏览器内完成计算，文件未上传。','Calculated in your browser. The file was not uploaded.');
    } catch (error) { status.textContent = localizedCatalogError(error.message) || t('无法读取该价格文件。','Unable to read that price file.'); }
  });
}
