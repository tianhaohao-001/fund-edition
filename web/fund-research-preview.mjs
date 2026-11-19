import { runReplicaStudy } from './catalog-replica.mjs';
import { t } from './i18n.mjs';

const snapshot = runReplicaStudy('wellington');
const number = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// All contours are drawn from the same frozen, published observations as the detail page.
export function indexedPlot(points, label) {
  const width = 400, height = 132;
  const observations = points.flatMap(p => [p.target, p.replica]);
  const floor = Math.floor(Math.min(...observations) / 10) * 10;
  const ceiling = Math.ceil(Math.max(...observations) / 10) * 10;
  const y = value => 8 + (ceiling - value) * (height - 18) / (ceiling - floor || 1);
  const x = index => 3 + index * (width - 7) / (points.length - 1);
  const line = key => points.map((point, index) => x(index).toFixed(2) + ',' + y(point[key]).toFixed(2)).join(' ');
  const grid = [floor, (floor + ceiling) / 2, ceiling].map(v => `<line x1="0" x2="400" y1="${y(v)}" y2="${y(v)}"/>`).join('');
  return `<svg class="index-plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}" preserveAspectRatio="none">
    <g class="plot-grid">${grid}</g>
    <polyline class="plot-fund" points="${line('target')}"/>
    <polyline class="plot-proxy" points="${line('replica')}"/>
  </svg>`;
}

export function fundResearchPreview() {
  const { points, holdout, metrics } = snapshot;
  return `<figure class="evidence-preview">
    <figcaption><span>${t('历史研究样本', 'Historical study')}</span><span>${t('基值 100', 'Indexed to 100')}</span></figcaption>
    <div class="preview-title"><strong>VWELX</strong><span>Vanguard Wellington</span></div>
    <div class="preview-graph">${indexedPlot(points, t('原基金与固定配置代理的留出期净值对照','Held-out indexed NAVs of the fund and its fixed allocation proxy'))}</div>
    <div class="preview-dates"><span>${holdout.start}</span><span>${holdout.end}</span></div>
    <dl class="preview-legend"><div><dt><i></i>VWELX</dt><dd>+${number.format(metrics.targetReturnPct)}%</dd></div><div><dt><i></i>${t('配置代理','Allocation proxy')}</dt><dd>+${number.format(metrics.replicaReturnPct)}%</dd></div></dl>
    <p>${t('23 个留出季度 · 含分配再投资','23 held-out quarters · distributions reinvested')}</p>
  </figure>`;
}
