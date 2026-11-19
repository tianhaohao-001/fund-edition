import { t } from './i18n.mjs';
import { renderReplication } from './replication.mjs';
import { renderCatalog } from './catalog-view.mjs';
export { bindCatalogInteractions } from './catalog-view.mjs';

const MONEY = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
});
const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});

const ICONS = {
  innovation: '<span></span><span></span><span></span><span></span><span></span>',
  core: '<span></span><span></span><span></span><span></span>',
  defensive: '<span></span><span></span><span></span>',
};
const ACCOUNT_TERMS = ['Starter', 'Builder', 'Reserve'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function amount(value) {
  return Number.isFinite(value) ? MONEY.format(value) : '—';
}

function percent(value, signed = false) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 0.005) return '0%';
  const prefix = signed && value > 0 ? '+' : '';
  return `${prefix}${NUMBER.format(value)}%`;
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : DATE.format(date);
}

function strategyCards(strategies, selected, busy) {
  return strategies.map(strategy => {
    const active = selected.id === strategy.id;
    const motif = Object.hasOwn(ICONS, strategy.id) ? strategy.id : 'core';
    return `
      <button class="lab-strategy ${active ? 'lab-strategy-active' : ''}" type="button"
        data-action="select-strategy" data-id="${escapeHtml(strategy.id)}"
        aria-pressed="${active}" ${busy ? 'disabled' : ''}>
        <span class="lab-card-top">
          <span class="lab-motif lab-motif-${motif}" aria-hidden="true">${ICONS[motif]}</span>
          <span class="lab-select-indicator" aria-hidden="true">${active ? '✓' : '↗'}</span>
        </span>
        <span class="lab-category">${escapeHtml(strategy.category)}</span>
        <strong class="lab-card-title">${escapeHtml(strategy.name)}</strong>
        <span class="lab-card-description">${escapeHtml(strategy.summary)}</span>
        <span class="lab-card-meta"><span>${escapeHtml(strategy.symbol)} proxy</span><span>${percent(strategy.maxWeightPercent)} target cap</span></span>
      </button>`;
  }).join('');
}

function linePolygon(points, floor, ceiling, valueKey) {
  const coordinates = points.map((point, index) => ({
    x: index * 100 / (points.length - 1),
    y: (ceiling - point[valueKey]) * 100 / (ceiling - floor),
  }));
  const edge = (values, delta) => values.map(({ x, y }) => `${x.toFixed(2)}% ${(y + delta).toFixed(2)}%`);
  const top = edge(coordinates, -0.65);
  const bottom = edge(coordinates.toReversed(), 0.65);
  return `polygon(${[...top, ...bottom].join(',')})`;
}

function resultsChart(backtest) {
  const { points, startingCash } = backtest;
  if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(startingCash) || startingCash <= 0) return '';
  const path = points.filter(point => Number.isFinite(point.equity) && Number.isFinite(point.benchmarkEquity));
  if (path.length < 2) return '';

  const values = path.flatMap(({ equity, benchmarkEquity }) => [equity, benchmarkEquity]);
  const minimum = Math.min(...values, startingCash);
  const maximum = Math.max(...values, startingCash);
  const range = Math.max(maximum - minimum, startingCash * 0.02);
  const floor = minimum - range * 0.13;
  const ceiling = maximum + range * 0.13;
  const labels = [ceiling, (ceiling + floor) / 2, floor].map(value => percent((value / startingCash - 1) * 100, true));
  const strategyCurve = linePolygon(path, floor, ceiling, 'equity');
  const benchmarkCurve = linePolygon(path, floor, ceiling, 'benchmarkEquity');
  return `
    <figure class="lab-chart" aria-label="Cumulative return against a synthetic buy-and-hold comparison">
      <figcaption><strong>Cumulative return</strong>
        <span class="lab-chart-key"><span class="lab-key-strategy">Strategy</span><span class="lab-key-benchmark">Buy and hold</span></span>
      </figcaption>
      <div class="lab-plot-area" aria-hidden="true">
        <div class="lab-axis">${labels.map(label => `<span>${label}</span>`).join('')}</div>
        <div class="lab-plot">
          <div class="lab-curve lab-curve-benchmark" style="clip-path:${benchmarkCurve}"></div>
          <div class="lab-curve lab-curve-strategy" style="clip-path:${strategyCurve}"></div>
        </div>
      </div>
      <div class="lab-chart-dates"><span>${dateLabel(path[0].date)}</span><span>${dateLabel(path.at(-1).date)}</span></div>
    </figure>`;
}

function replayTrades(trades) {
  if (!Array.isArray(trades) || !trades.length) return '<p class="lab-muted">No orders filled in this sample.</p>';
  const rows = trades.map(trade => `
    <tr>
      <td>${dateLabel(trade.signalDate)}</td><td>${dateLabel(trade.date)}</td>
      <td>${escapeHtml(trade.action)}</td><td>${escapeHtml(trade.quantity)}</td>
      <td>${amount(trade.price)}</td><td>${amount(trade.cash)}</td>
    </tr>`).join('');
  return `<div class="lab-table-scroll" role="region" aria-label="Backtest fills" tabindex="0"><table class="lab-table">
    <thead><tr><th scope="col">Signal</th><th scope="col">Fill</th><th scope="col">Side</th><th scope="col">Shares</th><th scope="col">Price</th><th scope="col">Cash</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function replayResults(backtest) {
  const metrics = backtest.metrics ?? {};
  const stats = [
    ['Strategy return', percent(metrics.returnPercent, true)],
    ['Buy and hold', percent(metrics.benchmarkReturnPercent, true)],
    ['Max drawdown', percent(metrics.maxDrawdownPercent)],
    ['Ending equity', amount(metrics.endingEquity)],
  ];
  return `
    <p class="lab-result-meta">${escapeHtml(backtest.source)} <span aria-hidden="true">·</span> ${dateLabel(backtest.startDate)} – ${dateLabel(backtest.endDate)}</p>
    <dl class="lab-metrics">${stats.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
    ${resultsChart(backtest)}
    <details class="lab-details">
      <summary>Replay fills <span>${escapeHtml(metrics.tradeCount ?? 0)}</span></summary>
      ${replayTrades(backtest.trades)}
    </details>
    <details class="lab-details">
      <summary>Test assumptions</summary>
      <ul class="lab-assumptions">${(backtest.assumptions ?? []).map(assumption => `<li>${escapeHtml(assumption)}</li>`).join('')}</ul>
    </details>`;
}

function executionLabel(execution) {
  return execution?.status === 'filled'
    ? `${String(execution.side ?? '').toUpperCase()} ${execution.quantity} shares at ${amount(execution.price)}`
    : execution?.reason || execution?.status || 'Awaiting review';
}

function accountViews(followers) {
  return followers.map((follower, index) => {
    const { execution, portfolio } = follower;
    return `
      <li class="lab-account">
        <span class="lab-account-icon" aria-hidden="true">▤</span>
        <div class="lab-account-copy"><strong>${escapeHtml(follower.name ?? follower.label ?? ACCOUNT_TERMS[index] ?? 'Paper account')}</strong>
          <span class="lab-account-status">${escapeHtml(executionLabel(execution))}</span>
        </div>
        <div class="lab-account-money"><strong>${amount(portfolio?.equity ?? follower.equity ?? follower.cash)}</strong><span>${portfolio || Number.isFinite(follower.equity) ? 'Equity' : 'Starting cash'}</span></div>
      </li>`;
  }).join('');
}

function sharedDetails(sharedRun) {
  const { decision = {}, scenario = {}, policy = {}, evidence = [], reviews = [], harness } = sharedRun;
  const source = typeof scenario.source === 'string' ? scenario.source : scenario.source?.label;
  const checks = policy.checks ?? [];
  const decisionSource = sharedRun.provider === 'committee' ? 'AI investment committee'
    : sharedRun.provider === 'harnessrouter' || harness ? 'HarnessRouter manager' : 'Deterministic model';
  return `
    <div class="lab-proposal">
      <span class="lab-source">${decisionSource}</span>
      <div class="lab-proposal-row"><strong>${escapeHtml(decision.action ?? 'Review')} ${escapeHtml(decision.symbol ?? scenario.symbol ?? '')}</strong>
        <span class="lab-pill">${percent(decision.targetWeightPercent)} target</span></div>
      <p>${escapeHtml(decision.summary)}</p>
      ${source ? `<span class="lab-source">${escapeHtml(source)}</span>` : ''}
    </div>
    <ul class="lab-accounts" aria-label="Example accounts">${accountViews((sharedRun.followers ?? []).filter(({ personal }) => !personal))}</ul>
    <details class="lab-details">
      <summary>Evidence and policy</summary>
      ${decision.reconsider ? `<div class="lab-reconsider"><strong>What would change the decision</strong><p>${escapeHtml(decision.reconsider)}</p></div>` : ''}
      ${evidence.length ? `<dl class="lab-evidence">${evidence.map(item => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)} ${item.source ? `<small>${escapeHtml(item.source)}</small>` : ''}</dd></div>`).join('')}</dl>` : ''}
      ${reviews.length ? `<dl class="lab-evidence lab-review-evidence">${reviews.map(review => `<div><dt>${escapeHtml(review.name ?? review.role)}</dt><dd>${escapeHtml(review.summary)}</dd></div>`).join('')}</dl>` : ''}
      ${checks.length ? `<ul class="lab-checks">${checks.map(check => `<li><strong>${escapeHtml(check.label)}<small>${escapeHtml(check.status)}</small></strong><span>${escapeHtml(check.detail)}</span></li>`).join('')}</ul>` : ''}
    </details>`;
}

function paperFollow(chosen, account, busy) {
  if (!account) return `<details class="lab-own-account lab-open-follow">
    <summary>Follow in paper</summary>
    <p>Open your own simulated ${escapeHtml(chosen.name)} account. It will apply future shared reviews using its own cash and holdings.</p>
    <form class="lab-follow-form" data-form="follow-shared" data-strategy-id="${escapeHtml(chosen.id)}">
      <label>Starting paper cash ($) <input type="number" name="initialCash" min="100" max="1000000" step="0.01" value="10000" required></label>
      <button class="lab-button lab-button-primary" type="submit" ${busy ? 'disabled' : ''}>Confirm paper follow <span aria-hidden="true">→</span></button>
    </form>
  </details>`;
  const { portfolio, status, history = [] } = account;
  const active = status === 'active';
  return `<section class="lab-own-account" aria-label="Your paper account">
    <div class="lab-own-head"><div><span class="lab-own-state${active ? ' lab-own-state-active' : ''}">${active ? 'Following' : 'Paused'}</span><h3>Your paper account</h3></div>
      <button class="lab-button lab-button-outline" type="button" data-action="toggle-shared-follow" data-id="${escapeHtml(chosen.id)}" ${busy ? 'disabled' : ''}>${active ? 'Pause following' : 'Resume following'}</button>
    </div>
    <dl class="lab-metrics lab-own-metrics">
      <div><dt>Starting cash</dt><dd>${amount(portfolio.initialCash)}</dd></div><div><dt>Cash</dt><dd>${amount(portfolio.cash)}</dd></div><div><dt>Equity</dt><dd>${amount(portfolio.equity)}</dd></div><div><dt>Return</dt><dd>${percent(portfolio.returnPercent, true)}</dd></div>
    </dl>
    <p>${active ? 'Your account applies future shared reviews when you run them.' : 'Your cash, positions and history stay here. New shared reviews will skip this account until you resume.'}</p>
    ${portfolio.positions.length ? `<ul class="lab-owned-holdings" aria-label="Personal account positions">${portfolio.positions.map(position => `<li><strong>${escapeHtml(position.symbol)}</strong><span>${escapeHtml(position.quantity)} shares</span><span>${amount(position.marketValue)}</span></li>`).join('')}</ul>` : '<p class="lab-muted">No positions yet.</p>'}
    ${history.length ? `<details class="lab-details"><summary>Your follow history <span>${history.length}</span></summary>
      <div class="lab-table-scroll" role="region" aria-label="Your shared decision history" tabindex="0"><table class="lab-table"><thead><tr><th scope="col">Review (UTC)</th><th scope="col">Shared target</th><th scope="col">Account result</th><th scope="col">Equity</th></tr></thead><tbody>
      ${history.map(entry => `<tr><td>${escapeHtml(entry.createdAt.slice(0, 16).replace('T', ' '))}</td><td>${escapeHtml(entry.action)} ${escapeHtml(entry.symbol)} · ${percent(entry.targetWeightPercent)}</td><td>${escapeHtml(executionLabel(entry.execution))}</td><td>${amount(entry.equity)}</td></tr>`).join('')}</tbody></table></div>
    </details>` : ''}
  </section>`;
}

function feeMetrics(accounts, balance, annualFeePercent, annualCost) {
  const assets = accounts * balance;
  const gross = assets * annualFeePercent / 100;
  return { assets, gross, perAccount: gross / accounts, surplus: annualCost === null ? null : gross - annualCost };
}

function feeResult(metrics) {
  const stats = [
    ['Modeled assets', metrics.assets], ['Annual gross fees', metrics.gross], ['Annual fee per account', metrics.perAccount],
  ];
  if (metrics.surplus !== null) stats.push(['Gross fees less entered cost', metrics.surplus]);
  return stats.map(([label, value]) => `<div><dt>${label}</dt><dd>${amount(value)}</dd></div>`).join('');
}

function feeCalculator() {
  const defaults = feeMetrics(1_000, 2_000, 0.5, null);
  return `
    <article class="lab-panel lab-economics">
      <div class="lab-panel-header"><div><h2>Shared research economics</h2><p>Estimate the gross fees that could fund one research process across multiple accounts.</p></div></div>
      <form class="lab-fee-form" data-form="fee">
        <label>Accounts <input type="number" name="accounts" min="1" max="1000000" step="1" value="1000" required></label>
        <label>Average account balance ($) <input type="number" name="balance" min="1" max="10000000" step="0.01" value="2000" required></label>
        <label>Annual fee (%) <input type="number" name="annualFeePercent" min="0" max="10" step="0.01" value="0.5" required></label>
        <label>Annual operating cost ($) <input type="number" name="annualCost" min="0" max="1000000000" step="0.01" placeholder="Optional"></label>
        <button class="lab-button lab-button-outline" type="submit">Update estimate <span aria-hidden="true">↗</span></button>
      </form>
      <dl class="lab-metrics lab-fee-results" data-fee-results aria-live="polite">${feeResult(defaults)}</dl>
      <p class="lab-method-note">This hypothetical annual model assumes balances stay constant. Enter estimated research, model, data, infrastructure and account servicing costs to compare them with gross fees.</p>
      <details class="lab-details"><summary>What this estimate includes</summary><p>Gross fees use the rate and balances you enter. To compare research economics, enter model, data, infrastructure, and account-servicing costs together. These estimates do not set a fee on any account.</p></details>
    </article>`;
}

export function updateFeeEstimate(form) {
  if (!form.reportValidity()) return;
  const fields = new FormData(form);
  const annualCost = fields.get('annualCost');
  const metrics = feeMetrics(
    Number(fields.get('accounts')),
    Number(fields.get('balance')),
    Number(fields.get('annualFeePercent')),
    annualCost === '' ? null : Number(annualCost),
  );
  const result = form.parentElement.querySelector('[data-fee-results]');
  if (result) result.innerHTML = feeResult(metrics);
}

export function renderLab(options = {}) {
  return renderCatalog(options);
}

export function renderLegacyLab({ strategies = [], selectedStrategy, backtest, sharedRun, sharedFollows = {}, busy = false, scenarios = [], followers = [] } = {}) {
  const selectedId = typeof selectedStrategy === 'string' ? selectedStrategy : selectedStrategy?.id;
  const chosen = strategies.find(strategy => strategy.id === selectedId) ?? strategies[0];
  if (!chosen) return '<section class="lab-page"><h1>Strategy Lab</h1><p>The strategy catalog is loading.</p></section>';
  const scenario = scenarios.find(item => item.id === chosen.scenarioId);
  const matchingBacktest = backtest?.strategyId === chosen.id ? backtest : null;
  const matchingRun = sharedRun && (sharedRun.strategyId ? sharedRun.strategyId === chosen.id : sharedRun.scenario?.id === chosen.scenarioId);

  return `
    <section class="lab-page" aria-label="Strategy Lab">
      <header class="lab-heading">
        <div class="lab-heading-copy">
          <span class="lab-overline">${t("策略研究","Strategy research")}</span>
          <h1>Strategy Lab</h1>
          <p>Research model strategies and follow shared decisions in a paper portfolio.</p>
        </div>
        <div class="lab-heading-status">
          <div class="lab-environment"><span aria-hidden="true"></span>Paper portfolios</div>
          <span>Replay prices are synthetic.</span>
        </div>
      </header>
      <div class="lab-catalog" aria-label="Strategy catalog">
        ${strategyCards(strategies, chosen, busy)}
      </div>
      <article class="lab-panel lab-replay">
        <div class="lab-section-line">Strategy and risk</div>
        <div class="lab-brief">
          <header class="lab-panel-header"><div><h2>${escapeHtml(chosen.name)}</h2><p>${escapeHtml(chosen.method)}</p></div></header>
          <dl class="lab-brief-facts"><div><dt>Reference proxy</dt><dd>${escapeHtml(chosen.symbol)}</dd></div><div><dt>Target cap</dt><dd>${percent(chosen.maxWeightPercent)}</dd></div><div><dt>Model scope</dt><dd>Long only</dd></div></dl>
        </div>
        <div class="lab-replay-actions">
          <button class="lab-button lab-button-primary" type="button" data-action="backtest" data-id="${escapeHtml(chosen.id)}" ${busy ? 'disabled' : ''}>
            Run backtest <span aria-hidden="true">→</span>
          </button>
          ${matchingBacktest ? '' : '<p class="lab-method-note">Compare the rule against buy and hold over 72 synthetic sessions.</p>'}
        </div>
        ${matchingBacktest ? replayResults(matchingBacktest) : ''}
      </article>
      ${renderReplication()}
      <article class="lab-panel lab-shared">
        <div class="lab-section-line">Paper allocation</div>
        <div class="lab-follow-brief">
          <header class="lab-panel-header"><div><h2>Follow the shared decision</h2><p>The manager makes one proposal. Each paper account checks its own cash, holdings and allocation limit.</p></div></header>
          <button class="lab-button lab-button-outline" type="button" data-action="run-shared" data-id="${escapeHtml(chosen.scenarioId)}" ${busy ? 'disabled' : ''}>
            Run shared review <span aria-hidden="true">→</span>
          </button>
        </div>
        <div class="lab-scenario"><span>Replay scenario</span><strong>${escapeHtml(scenario?.title ?? chosen.symbol)}</strong></div>
        ${paperFollow(chosen, sharedFollows[chosen.id], busy)}
        <h3 class="lab-example-title">Example accounts</h3>
        ${matchingRun ? sharedDetails(sharedRun) : (followers.length ? `<ul class="lab-accounts" aria-label="Example accounts">${accountViews(followers)}</ul>` : '')}
      </article>
      <details class="lab-economics-wrap"><summary>Fee assumptions and economics</summary>${feeCalculator()}</details>
    </section>`;
}
