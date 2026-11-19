import { catalogBacktest } from './catalog-model.mjs';
import { runReplicaStudy } from './catalog-replica.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rounded = n => n.toFixed(2);
const signedPct = n => (n > 0 ? '+' : '') + rounded(n) + '%';
const normalized = (n, base) => n * 100 / base;

function scenarioSummary(study) {
  let peak = study.startingCash, holdDrawdown = 0, weightSum = 0;
  for (const point of study.points) {
    peak = Math.max(peak, point.benchmarkEquity);
    holdDrawdown = Math.max(holdDrawdown, 100 * (peak - point.benchmarkEquity) / peak);
    weightSum += point.weightPercent;
  }
  const firstExposure = study.points.findIndex(point => point.weightPercent > 0);
  return {
    holdDrawdown,
    meanTarget: weightSum / study.points.length,
    cashStart: firstExposure < 0 ? study.points.length : firstExposure,
  };
}

// The two historical studies compare same-date reinvested total returns. A
// style simulation instead compares a rule and buy-and-hold inside one scenario.
export function comparativeSeries(item) {
  if (item.section === 'persona') {
    const study = catalogBacktest(item.id);
    return {kind:'scenario',study,summary:scenarioSummary(study),points:study.points.map(p=>({
      date:p.date, a:normalized(p.equity,study.startingCash), b:normalized(p.benchmarkEquity,study.startingCash)
    }))};
  }
  if (item.id !== 'wellington' && item.id !== 'stocks-plus') return null;
  const study = runReplicaStudy(item.id);
  return {kind:'holdout',study,points:study.points.map(p=>({date:p.date,a:p.replica,b:p.target}))};
}

export function priceFigure({points}, labels, L) {
  const w=680,h=154, latest=points.at(-1);
  const values=points.flatMap(p=>[p.a,p.b]);
  const low=Math.floor(Math.min(...values)),high=Math.max(low+1,Math.ceil(Math.max(...values)));
  const x=index=>6+index*(w-12)/(points.length-1), y=value=>h-7-(value-low)*(h-14)/(high-low);
  const paths=['b','a'].map(key=>{
    const d=points.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p[key]).toFixed(1)).join(' ');
    return '<path class="fd-line fd-line-'+key+'" d="'+d+'"/>';
  }).join('');
  const ticks=[high,(high+low)/2,low];
  const legend=labels.map((label,i)=>'<span class="fd-legend-'+(i?'b':'a')+'">'+esc(label)+'</span>').join('');
  return '<figure class="fd-figure" data-fd-series="'+esc(JSON.stringify(points))+'" data-fd-label-a="'+esc(labels[0])+'" data-fd-label-b="'+esc(labels[1])+'"><figcaption class="fd-legend">'+legend+'</figcaption>'+
    '<div class="fd-coordinate"><div class="fd-scale">'+ticks.map(v=>'<span>'+rounded(v)+'</span>').join('')+'</div>'+
    '<svg role="img" aria-label="'+esc(labels.join(' / ')+' · '+points[0].date+' – '+latest.date)+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+ticks.map(v=>'<path class="fd-grid" d="M0 '+y(v)+'H'+w+'"/>').join('')+paths+
    '<path class="fd-cross" d="M674 0V154"/><circle class="fd-point" cx="674" cy="'+y(latest.a)+'" r="3"/></svg></div>'+
    '<div class="fd-dates"><time>'+points[0].date+'</time><time>'+latest.date+'</time></div>'+
    '<label class="fd-reader"><span>'+L('逐期查看','Inspect a date')+'</span><input type="range" min="0" max="'+(points.length-1)+'" value="'+(points.length-1)+'" step="1"/><output>'+latest.date+' · '+rounded(latest.a)+' / '+rounded(latest.b)+'</output></label></figure>';
}

export function performancePanel(item, series, lang) {
  const L=(zh,en)=>lang==='en-US'?en:zh;
  const {points,study,kind}=series;
  const scenario=kind==='scenario', m=study.metrics;
  const labels=scenario?[L('风格规则组合','Style-rule portfolio'),L('全额买入持有','Fully invested buy and hold')]:[L('规则代理','Rule proxy'),item.ticker];
  const facts=scenario?[
    [L('规则组合收益','Rule return'),signedPct(m.returnPercent)],
    [L('买入持有收益','Buy and hold'),signedPct(m.benchmarkReturnPercent)],
    [L('平均目标仓位','Avg. target weight'),rounded(series.summary.meanTarget)+'%']
  ]:[
    [L('规则代理收益','Proxy return'),signedPct(m.replicaReturnPct)],
    [item.ticker+' '+L('区间收益','return'),signedPct(m.targetReturnPct)],
    [L('年化跟踪误差','Annualised tracking error'),rounded(m.trackingErrorPct)+'%']
  ];
  const source=study.sources?.filter(s=>s.url.startsWith('https://'));
  const limit=scenario
    ? scenarioNotes(item, study, series.summary, L)
    : item.id==='stocks-plus'
    ? L('VOO 代理只覆盖股票敞口。债券增强交易缺少可核验的历史记录。','VOO models the equity exposure. The historical bond-alpha trades are unavailable.')
    : L('规则按季恢复 65% VYM 和 35% VCIT。原基金只用于留出期对照。','The rule resets to 65% VYM and 35% VCIT each quarter. The target fund is used only for the holdout comparison.');
  const cadence=scenario?points.length+' '+L('个合成价格观察点 · 模型调用 0 次','synthetic price observations · zero AI calls')
    :study.holdout.periods+' '+(study.frequency==='quarterly'?L('个留出季度','held-out quarters'):L('个留出年度','held-out years'))+' · '+L('含分配再投资，起点 100','reinvested total returns, base 100');
  const method = scenario ? '' : '<p>'+L('规则依据 '+study.sourceCutoff+' 的公开投资授权。样本外比较从 '+study.holdout.start+' 至 '+study.dataAsOf+'，按预设规则回算，模型调用 '+study.modelCalls+' 次。另见投委会栏的 AI 研究流程。',
    'The rule follows the public mandate dated '+study.sourceCutoff+'. The holdout runs from '+study.holdout.start+' to '+study.dataAsOf+'. This historical calculation used a fixed rule and '+study.modelCalls+' AI calls. The Committee tab describes the separate AI review.')+'</p>';
  return '<section class="fd-performance" data-fd-kind="'+kind+'"><p class="fd-kicker">'+esc(cadence)+'</p><h2>'+L(scenario?'价格规则情景':'样本外跟踪走势',scenario?'Price-rule simulation':'Out-of-sample tracking')+'</h2>'+
    method+
    '<dl class="fd-metrics">'+facts.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>'+
    priceFigure(series,labels,L)+(scenario?limit:'<p class="fd-foot">'+esc(limit)+'</p>')+
    (source?'<div class="fd-originals">'+source.map(s=>'<a target="_blank" rel="noopener noreferrer" href="'+esc(s.url)+'">'+esc(lang==='en-US'?s.titleEn||s.title:s.title)+' ↗</a>').join('')+'</div>':'')+'</section>';
}

function scenarioNotes(item, study, summary, L) {
  const m=study.metrics, ruleDD=rounded(m.maxDrawdownPercent)+'%', holdDD=rounded(summary.holdDrawdown)+'%';
  const exposure=L(
    `规则先持有现金 ${summary.cashStart} 期，随后按信号投资，仓位上限 ${item.allocation}%。买入持有从首期全额建仓，完整参与这段上涨和中途回落。`,
    `The rule opens in cash for ${summary.cashStart} observations, then trades up to a ${item.allocation}% cap. Buy and hold invests from day one and experiences the full rise and intervening declines.`);
  const shared=['lynch','cathie-wood'].includes(item.id)
    ? L('本图中，林奇和伍德共用相同的成长规则与价格样本，因此走势一致。','Lynch and Wood share the same growth rule and price sample here, producing identical curves.')
    : '';
  const scope=L('本图仅计算价格规则，不含人物真实业绩或 AI 决策。各档案的价格样本可能不同，不能跨人排名。',
                'This chart uses price rules alone. It contains no investor track record or AI decisions. Price samples can differ across profiles, so these returns cannot rank investors.');
  return '<p class="fd-foot"><strong>'+L('最大回撤','Maximum drawdown')+'</strong> · '+
    L('规则组合','Rule')+' '+ruleDD+' / '+L('买入持有','Buy and hold')+' '+holdDD+'</p>'+
    '<p class="fd-foot">'+esc(exposure)+' '+L(`现金不计息。规则组合成交 ${m.tradeCount} 笔，两边均按单边 5 基点点差计算并向不利方向取整到美分。`,
    `Cash earns no interest. The rule makes ${m.tradeCount} trades. Both use a five-basis-point spread per side, rounded against the trade to the nearest cent.`)+'</p>'+
    '<p class="fd-foot">'+esc([shared,scope].filter(Boolean).join(' '))+'</p>';
}

export function tradesPanel(study,lang) {
  const L=(z,e)=>lang==='en-US'?e:z;
  const targets = new Map(study.points.map(point => [point.date,point.weightPercent]));
  const fills = [...study.trades].reverse().map(row => '<li><time>'+row.date+'</time><strong>'+
    (row.action==='BUY'?L('买入','Buy'):L('卖出','Sell'))+'</strong><span>'+rounded(row.units)+' '+L('份','units')+' × $'+rounded(row.price)+
    '</span><small>'+L('信号日','Signal')+' '+row.signalDate+' · '+L('目标仓位','Target')+' '+targets.get(row.date)+'%</small></li>');
  const earlier = fills.length-3;
  return '<section class="fd-trades"><h3>'+L('模拟成交记录','Simulated fills')+'</h3><p>'+
    L('每次使用上一观察日的信号，于下一观察日买卖至目标仓位。','Each fill trades toward the target weight set by the previous observation’s signal.')+
    '</p><ol>'+fills.slice(0,3).join('')+'</ol>'+(earlier>0?'<details><summary>'+L('再看 '+earlier+' 笔较早成交','Show '+earlier+' earlier fills')+'</summary><ol>'+fills.slice(3).join('')+'</ol></details>':'')+'</section>';
}

export function bindComparisons(root) {
  for(const figure of root.querySelectorAll('[data-fd-series]')){
    const slider=figure.querySelector('input'),svg=figure.querySelector('svg'),output=figure.querySelector('output');
    const points=JSON.parse(figure.dataset.fdSeries),values=points.flatMap(p=>[p.a,p.b]);
    const low=Math.floor(Math.min(...values)),high=Math.max(low+1,Math.ceil(Math.max(...values)));
    const update=()=>{
      const i=Number(slider.value),p=points[i],x=6+i*668/(points.length-1),y=147-(p.a-low)*140/(high-low);
      svg.querySelector('.fd-cross').setAttribute('d','M'+x+' 0V154');
      const dot=svg.querySelector('.fd-point');dot.setAttribute('cx',x);dot.setAttribute('cy',y);
      output.textContent=p.date+' · '+rounded(p.a)+' / '+rounded(p.b);
      slider.setAttribute('aria-valuetext',p.date+' · '+figure.dataset.fdLabelA+' '+rounded(p.a)+' · '+figure.dataset.fdLabelB+' '+rounded(p.b));
    };
    const point=e=>{const b=svg.getBoundingClientRect();if(!b.width)return;const u=((e.clientX-b.left)*680/b.width-6)/668;slider.value=Math.round(Math.max(0,Math.min(1,u))*(points.length-1));update();};
    slider.oninput=update;svg.onpointerdown=point;svg.onpointermove=e=>{if(e.pointerType==='mouse')point(e);};update();
  }
}

