import { suggestedAnswers } from './studio-answers.mjs';
import { openingQuestion } from './voice.mjs';
import { executionReason, known } from './decision-copy.mjs';
import { meetingSlot,researchReviewButton } from './team-meeting.mjs';
import { newLobby, readingControl, researchPrompt } from './experience.mjs';
import { CANDIDATES, portrait, renderRoom, renderChat, renderTeam, roleLabel, studioText as t } from './team.mjs';
import { getLanguage } from './i18n.mjs';
import {watchMount} from './studio-watch.mjs';
import { studioBriefing } from './studio-review.mjs';
import { investmentTurns, pendingFormationPreview } from './studio-formation.mjs';
import { teamSystemText } from './team-copy.mjs';
import { openDraftCandidates, seatSpecialism, staffingOnlyTurn } from './formation-recruiting.mjs';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const count = new Intl.NumberFormat('en-US');
const percentage = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' });
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function money(value) { return Number.isFinite(value) ? currency.format(value) : '—'; }
function quantity(value) { return Number.isFinite(value) ? count.format(value) : '—'; }
function percent(value) { return Number.isFinite(value) ? `${percentage.format(value)}%` : '—'; }
function shortDate(value) { if(/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value; return value && Number.isFinite(Date.parse(value)) ? `${new Intl.DateTimeFormat(getLanguage(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' }).format(new Date(value))} PT` : '—'; }
function signedPercent(value) { return `${value > 0 ? '+' : ''}${percent(value)}`; }

const executionLabels = { filled: ['Paper fill', 'green'], blocked: ['Blocked', 'orange'], held: ['No order', 'neutral'] };
const roles = { manager: 'Portfolio Manager', research: 'Research', risk: 'Portfolio Risk', trader: 'Execution', quant: 'Portfolio Construction' };

function tag(text, variant = 'neutral') { return `<span class="tag tag--${variant}">${escapeHtml(text)}</span>`; }
function statusTag(execution) {
  const labels = { filled: [t('模拟成交', 'Paper fill'), 'green'], blocked: [t('已拦截', 'Blocked'), 'orange'], held: [t('未下单', 'No order'), 'neutral'] };
  return tag(...(labels[execution?.status] ?? [t('审议', 'Review'), 'neutral']));
}

function actionLabel(action) { return ({ ALLOCATE:t('配置','Allocate'),BUY: t('买入', 'BUY'), SELL: t('卖出', 'SELL'), HOLD: t('持有', 'HOLD') })[action] ?? action; }

function providerLabel(run) {
  if(run?.provider==='historical-proxy') return t('公开历史策略代理','Public historical strategy proxy');
  const provider = typeof run.provider === 'object' ? run.provider.mode : run.provider;
  if (provider === 'committee') return t('HarnessRouter 投委会', 'HarnessRouter committee');
  return provider === 'harnessrouter' || run.harness ? t('HarnessRouter 基金经理', 'HarnessRouter manager') : t('确定性离线回放', 'Deterministic replay');
}

function floorPreview() {
  const desks = [
    ['Research', 'Theo Park', 'TP', 'research'], ['Portfolio risk', 'Inez Rao', 'IR', 'risk'], ['Execution', 'Eli Morgan', 'EM', 'execution'],
  ];
  return `<div class="lobby-floor" aria-label="Example fund floor. Maya Chen manages three specialist desks.">
    <div class="lobby-floor-label"><span>THE FUND FLOOR</span><span><i aria-hidden="true"></i> Team in session</span></div>
    <div class="lobby-manager"><div class="lobby-avatar">MC</div><div><strong>Maya Chen</strong><span>Portfolio manager</span></div><p>“Check the downside before we size the position.”</p></div>
    <div class="lobby-floor-desks">${desks.map(([desk, name, initials, color]) => `<div class="lobby-desk lobby-desk--${color}"><span class="lobby-desk-title">${desk}</span><div><span class="lobby-avatar">${initials}</span><strong>${name}</strong></div></div>`).join('')}</div>
  </div>`;
}

function curve(points, startingCash, key, max) {
  const coords = points.map(({ [key]: value }, index) => [index * 100 / (points.length - 1), 96 - ((value / startingCash - 1) * 100 / max * 90)]);
  const edge = (items, shift) => items.map(([x, y]) => `${x.toFixed(2)}% ${(y + shift).toFixed(2)}%`);
  return `polygon(${[...edge(coords, -1.1), ...edge(coords.toReversed(), 1.1)].join(',')})`;
}

function strategyPreview(preview) {
  const values = preview?.points?.length > 1 && preview.startingCash > 0 ? preview.points : null;
  const startingCash = preview?.startingCash;
  const start = new Date(preview?.startDate);
  const end = new Date(preview?.endDate);
  const localizedMonth = new Intl.DateTimeFormat(getLanguage(), { month: 'short', timeZone: 'UTC' });
  const period = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
    ? `${localizedMonth.format(start)}–${localizedMonth.format(end)} ${end.getUTCFullYear()}` : '';
  const max = values ? Math.ceil(Math.max(...values.map(({ benchmarkEquity, equity }) => Math.max(benchmarkEquity, equity) / startingCash - 1)) * 10) * 10 : 40;
  const chart = values ? `<div class="lobby-study-chart" role="img" aria-label="${t('同组合成数据下，Innovation Scout 与买入持有的累计回报比较。', 'Cumulative return, Innovation Scout versus buy and hold on the same synthetic data.')}">
    <div class="lobby-study-axis" aria-hidden="true"><span>+${max}%</span><span>+${max / 2}%</span><span>0%</span></div>
    <div class="lobby-study-grid" aria-hidden="true">
      <span class="lobby-study-line lobby-study-line--benchmark" style="clip-path:${curve(values, startingCash, 'benchmarkEquity', max)}"></span>
      <span class="lobby-study-line" style="clip-path:${curve(values, startingCash, 'equity', max)}"></span>
    </div>
  </div>` : `<div class="lobby-study-chart lobby-study-chart--pending"><p>${t('回测数据随工作室加载。', 'Backtest data loads with the workspace.')}</p></div>`;
  return `<div class="lobby-study">
    <div class="lobby-study-top"><div><span>${t('策略简报', 'STRATEGY BRIEF')}</span><h3>Innovation Scout</h3></div><span class="lobby-study-tag">${t('合成回放', 'Synthetic replay')}</span></div>
    <div class="lobby-study-stats"><div><span>${t('策略回报', 'Strategy return')}</span><strong>${signedPercent(preview?.metrics?.returnPercent)}</strong></div><div><span>${t('最大回撤', 'Max drawdown')}</span><strong>${percent(preview?.metrics?.maxDrawdownPercent)}</strong></div></div>
    ${chart}
    <div class="lobby-study-foot"><span>${t('策略', 'Strategy')}</span><span>${t('买入持有', 'Buy and hold')}</span><span>${period}</span></div>
  </div>`;
}

export function renderWelcome(preview, options = {}) {
  return newLobby(options);
}

export function renderTemplateSuggestion(template, reason) {
  if (!template) return '';
  return `<div class="template-suggestion">
    <div class="template-suggestion-head"><div><span class="eyebrow">RECOMMENDED TEAM</span><h3>${escapeHtml(template.label)}</h3></div><span class="template-cap">${percent(template.maxWeightPercent)} sample cap</span></div>
    <p>${escapeHtml(reason)}</p>
    <details open><summary>Seats and responsibilities</summary><ul>${template.roster.map(({ id, duty }) => {
      const member = CANDIDATES.find((candidate) => candidate.id === id);
      return `<li><strong>${escapeHtml(member?.name)} <span>· ${escapeHtml(roles[member?.role])}</span></strong><p>${escapeHtml(duty)}</p></li>`;
    }).join('')}</ul></details>
    <button type="button" class="button button--primary" data-action="use-team-template" data-id="${escapeHtml(template.id)}">Use this team <span aria-hidden="true">↗</span></button>
  </div>`;
}

export function renderTemplateNote(template) {
  if (!template) return 'Start with the standard four desks.';
  return `${escapeHtml(template.summary)}${template.inspiration ? ` <span>${escapeHtml(template.inspiration)} <a href="${escapeHtml(template.inspirationUrl)}" target="_blank" rel="noopener noreferrer">Read the shareholder letter</a></span>` : ''}`;
}

function fundControls(state, fund, showCreate, busy) {
  const templates = state.teamTemplates ?? [];
  return `<section class="fund-controls" aria-label="Fund selection">
    <div class="fund-switch">
      ${state.funds?.length ? `<div class="fund-picker"><label for="fund-selector">Active fund</label>
        <select id="fund-selector" data-control="fund" ${busy ? 'disabled' : ''}>${state.funds.map((item) => `<option value="${escapeHtml(item.id)}" ${fund?.id === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div>` : ''}
      <button type="button" class="button button--outline" data-action="toggle-create" aria-expanded="${showCreate}" aria-controls="create-fund-panel" ${busy ? 'disabled' : ''}>${showCreate ? 'Close' : '<span aria-hidden="true">+</span> New fund'}</button>
    </div>
    <div id="create-fund-panel" class="fund-create" ${showCreate ? '' : 'hidden'}>
      <h2>Create a paper fund</h2>
      <p>Each fund starts with its own simulated balance and a four-person team.</p>
      <form data-form="create-fund" class="fund-create-form">
        <label for="new-fund-name">Fund name</label>
        <input type="text" id="new-fund-name" name="name" placeholder="e.g. The Core Fund" required maxlength="80">
        ${templates.length ? `<details class="recommend-setup">
          <summary>Recommend a team from one sentence</summary>
          <label for="style-brief">How should this team invest?</label>
          <textarea id="style-brief" rows="2" maxlength="500" placeholder="e.g. Find businesses with durable cash flow and a margin of safety."></textarea>
          <button type="button" class="button button--outline" data-action="recommend-team">Recommend team</button>
          <div id="template-suggestion"></div><p id="template-announcement" role="status"></p>
        </details><label for="fund-template">Operating style</label>
        <select id="fund-template" name="templateId" data-control="fund-template" aria-describedby="fund-template-note">
          <option value="">Custom team brief</option>
          ${templates.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join('')}
        </select><p class="template-note" id="fund-template-note">Start with the standard four desks.</p>` : ''}
        <label for="new-fund-mandate">Mandate <span>optional</span></label>
        <textarea id="new-fund-mandate" name="mandate" placeholder="Describe what your fund should look for." rows="2" maxlength="1500"></textarea>
        <p class="template-permission-note">After creation, set which orders and tickers the simulator may use in Order permissions.</p>
        <button class="button button--primary" type="submit" ${busy ? 'disabled' : ''}>Create fund <span aria-hidden="true">↗</span></button>
      </form>
    </div>
  </section>`;
}

function scenarioPreview(scenario) {
  if (!scenario) return '';
  const last = scenario.series?.at(-1);
  const first = scenario.series?.[0];
  const move = last && first ? (last / first - 1) * 100 : null;
  return `<aside class="market-card" aria-label="Replay scenario">
    <div class="market-top"><span class="eyebrow">${t('回放快照', 'REPLAY SNAPSHOT')}</span>${tag(t('合成数据', 'Synthetic data'), 'lime')}</div>
    <div class="market-name"><span>${escapeHtml(scenario.symbol)}</span><strong>${money(last)}</strong></div>
    <div class="market-chart"><canvas id="scenario-chart" role="img" aria-label="${escapeHtml(`${scenario.symbol} mock observations, from ${money(first)} to ${money(last)}, ${signedPercent(move)} across the replay window.`)}"></canvas></div>
    <div class="market-chart-ends"><span>${money(first)}</span><span>${signedPercent(move)}</span></div>
    <div class="market-bottom"><h3>${escapeHtml(known(scenario.title))}</h3><p>${escapeHtml(scenarioSummary(scenario))}</p><span>${shortDate(scenario.asOf)}</span></div>
  </aside>`;
}

function scenarioSummary(scenario) {
  const descriptions = {
    'innovation-signal': '合成增长与估值假设超过策略门槛。', 'thin-evidence': '需求保持正增长，但合成估值假设未达到策略门槛。',
    'de-risk': '合成需求假设转负。已有持仓的账户可用此情景查看退出过程。', 'stale-quote': '投资信号为正，但报价已经过期 17 分钟。',
    'closed-market': '合成报价仍在，但常规交易时段已经结束。', 'missing-quote': '合成历史价格可用，当前买卖报价缺失。',
    'index-rebound': '合成大盘情景，有效双边报价与正回报假设。',
  };
  return t(descriptions[scenario.id] ?? scenario.summary, scenario.summary);
}

function summaryStats(portfolio) {
  if (!portfolio) return '';
  const rows = [
    [t('组合价值', 'Portfolio value'), money(portfolio.equity)],
    [t('可用现金', 'Available cash'), money(portfolio.cash)],
    [t('模拟回报', 'Paper return'), signedPercent(portfolio.returnPercent)],
    [t('持仓数', 'Holdings'), quantity(portfolio.positions?.length ?? 0)],
  ];
  return `<dl class="portfolio-strip">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function settings({ state, draft, scenario, busy, activeAction, fund }) {
  const schedule = fund.schedule ?? {};
  const provider = state.provider ?? {};
  const permissions = draft.permissions;
  const permissionsSummary = !permissions.allowBuy && !permissions.allowSell ? t('仅研究', 'Review only')
    : permissions.allowBuy && permissions.allowSell ? t('可买入和卖出', 'Buy and sell') : permissions.allowBuy ? t('仅买入', 'Buy only') : t('仅卖出', 'Sell only');
  return `<section class="panel setup-panel" aria-labelledby="replay-heading">
    <div class="panel-heading"><div><span class="eyebrow">${t('基金授权', 'FUND BRIEF')}</span><h2 id="replay-heading">${t('明确你的授权。', 'Set the mandate.')}</h2></div>${tag(t('模拟账户', 'Paper account'), 'green')}</div>
    <form data-form="replay" class="setup-form">
      <div class="field"><label for="fund-mandate">${t('投资授权', 'Investment mandate')}</label>
        <textarea name="mandate" id="fund-mandate" rows="3" maxlength="1500" required placeholder="${t('例如：寻找需求加速、估值合理的公司。', 'e.g. Look for accelerating demand with a credible valuation.')}">${escapeHtml(draft.mandate)}</textarea></div>
      <div class="setup-fields">
        <div class="field"><label for="replay-scenario">${t('回放情景', 'Replay scenario')}</label><select name="scenarioId" id="replay-scenario" data-control="scenario">
          ${(state.scenarios ?? []).map((item) => `<option value="${escapeHtml(item.id)}" ${scenario?.id === item.id ? 'selected' : ''}>${escapeHtml(known(item.title))} · ${escapeHtml(item.symbol)}</option>`).join('')}
        </select></div>
        <div class="field"><label for="fund-limit">${t('单一持仓上限', 'Single-position cap')}</label><div class="suffix-field"><input id="fund-limit" name="maxWeightPercent" type="number" min="0" max="100" step="0.01" value="${escapeHtml(draft.maxWeightPercent)}" required><span aria-hidden="true">%</span></div></div>
      </div>
      <div class="field provider-field"><label for="manager-provider">${t('审议模式', 'Review mode')}</label><select id="manager-provider" name="provider" data-control="provider">
        <option value="replay" ${draft.provider === 'replay' ? 'selected' : ''}>${t('离线示例回放', 'Offline example replay')}</option>
        ${provider.enabled ? `<option value="harnessrouter" ${draft.provider === 'harnessrouter' ? 'selected' : ''}>${t('HarnessRouter 基金经理', 'HarnessRouter manager')}</option>` : ''}
        ${provider.committeeEnabled ? `<option value="committee" ${draft.provider === 'committee' ? 'selected' : ''}>${t('AI 投资委员会', 'AI investment committee')}</option>` : ''}
      </select><small class="provider-note" ${provider.committeeEnabled && draft.provider === 'committee' ? '' : 'hidden'}>${t('各专业席位与经理分别调用模型，可能需要更多时间。', 'Specialists and the manager make separate model calls. This review can take longer.')}</small></div>
      <div class="setup-actions">
        <button class="button button--primary" type="submit" name="intent" value="replay" ${busy || !scenario ? 'disabled' : ''}>${activeAction === 'runScenario' ? t('正在审议…', 'Running review…') : t('开始模拟审议', 'Run paper review')} <span aria-hidden="true">↗</span></button>
        <button class="button button--outline" type="submit" name="intent" value="save" ${busy ? 'disabled' : ''}>${activeAction === 'updateFund' ? t('保存中…', 'Saving…') : t('保存授权', 'Save brief')}</button>
      </div>
      <details class="schedule permission-details" ${permissions.open ? 'open' : ''}>
        <summary>${t('订单权限', 'Order permissions')} <span>${permissionsSummary}</span></summary>
        <p>${t('你设定模拟账户的权限，经理提出交易建议，模拟引擎执行检查。', 'You set the rules for your paper account. The manager can propose a trade, and the simulator enforces these permissions.')}</p>
        <div class="permissions-controls">
          <div class="permissions-trades"><label><input type="checkbox" name="allowBuy" ${permissions.allowBuy ? 'checked' : ''}> ${t('允许买入', 'Allow buys')}</label><label><input type="checkbox" name="allowSell" ${permissions.allowSell ? 'checked' : ''}> ${t('允许卖出', 'Allow sells')}</label></div>
          <div class="field"><label for="allowed-symbols">${t('允许的标的', 'Allowed tickers')}</label><input id="allowed-symbols" type="text" name="allowedSymbols" value="${escapeHtml(permissions.symbols)}" placeholder="NVDA, SPY" maxlength="180" aria-describedby="tickers-help"><small id="tickers-help">${t('用逗号分隔。留空表示允许所有回放标的。', 'Use commas to separate tickers. Leave blank to allow all replay tickers.')}</small></div>
        </div>
      </details>
    </form>
    <details class="schedule" ${schedule.enabled || activeAction === 'setSchedule' ? 'open' : ''}>
      <summary>${t('回放计划', 'Replay schedule')} <span>${schedule.enabled ? schedule.frequency === 'hourly' ? t('每小时', 'Hourly') : t('每天', 'Daily') : t('手动', 'Manual')}</span></summary>
      <p>${t('使用已保存的授权与合成情景，自动进行模拟审议。', 'Use the saved brief and a synthetic scenario for automatic paper reviews.')}</p>
      <form data-form="schedule" class="schedule-form">
        <div class="field"><label for="replay-frequency">${t('频率', 'Frequency')}</label><select id="replay-frequency" name="frequency">
          <option value="manual" ${!schedule.enabled ? 'selected' : ''}>${t('仅手动', 'Manual only')}</option>
          <option value="hourly" ${schedule.enabled && schedule.frequency === 'hourly' ? 'selected' : ''}>${t('每小时', 'Hourly')}</option>
          <option value="daily" ${schedule.enabled && schedule.frequency === 'daily' ? 'selected' : ''}>${t('每天', 'Daily')}</option>
        </select></div>
        <button class="button button--outline" type="submit" ${busy ? 'disabled' : ''}>${t('保存计划', 'Save schedule')}</button>
      </form>
      ${schedule.nextRunAt && schedule.enabled ? `<p>${t('下次回放', 'Next replay')} ${shortDate(schedule.nextRunAt)}</p>` : ''}
    </details>
  </section>`;
}

function fillSummary(execution) {
  if (execution?.legs?.length) return execution.legs.map(leg=>`${escapeHtml(actionLabel(leg.side))} ${escapeHtml(leg.symbol)} · ${quantity(leg.quantity)} ${t('归一化单位','rebased units')} × ${money(leg.price)} · ${t('费用','fee')} ${money(leg.fee)}`).join('<br>');
  if (execution?.status !== 'filled') return escapeHtml(executionReason(execution));
  if (getLanguage() === 'zh-CN') return `${actionLabel(execution.side)} ${escapeHtml(execution.symbol)} ${quantity(execution.quantity)} 股，价格 ${money(execution.price)} · 总额 ${money(execution.notional)}`;
  const shares = `${quantity(execution.quantity)} ${execution.quantity === 1 ? 'share' : 'shares'}`;
  return `${escapeHtml(execution.side)} ${shares} of ${escapeHtml(execution.symbol)} at ${money(execution.price)} · ${money(execution.notional)} total`;
}


function reviewCards(reviews = [], evidence = []) {
  if (!reviews.length) return '';
  const evidenceLabels = new Map(evidence.map(({ id, label }) => [id, label]));
  return `<div class="trace-reviews">${reviews.map((review) => {
    const references = review.evidenceRefs?.map((id) => evidenceLabels.get(id)).filter(Boolean) ?? [];
    return `<article>
    <div class="trace-review-head"><span class="eyebrow">${escapeHtml(roleLabel(review.role))}</span>${review.sentiment ? tag(known(review.sentiment)) : ''}</div>
    <h3>${escapeHtml(review.name)}</h3><p>${escapeHtml(review.summary)}</p>
    ${review.source ? `<p class="review-source">${escapeHtml(known(review.source))}${review.responseId ? ` · ${escapeHtml(review.responseId)}` : ''}</p>` : ''}
    ${review.duty || review.reconsider || references.length ? `<details class="review-duty"><summary>${t('审议笔记', 'Review notes')}</summary>${review.duty ? `<p><b>${t('职责', 'Responsibility')}</b> ${escapeHtml(review.duty)}</p>` : ''}${review.reconsider ? `<p><b>${t('什么会改变这个判断？', 'What would change this view?')}</b> ${escapeHtml(review.reconsider)}</p>` : ''}${references.length ? `<p><b>${t('证据', 'Evidence')}</b> ${escapeHtml(references.map(known).join(' · '))}</p>` : ''}</details>` : ''}
  </article>`;
  }).join('')}</div>`;
}

function evidenceTable(evidence = []) {
  return evidence.length ? `<details class="trace-accordion" open><summary>${t('证据与来源', 'Evidence and sources')} <span>${t(`${evidence.length} 项`, `${evidence.length} items`)}</span></summary>
    <div class="evidence-list">${evidence.map((item) => `<article><div><h3>${escapeHtml(known(item.label))}</h3><p>${escapeHtml(known(item.source))}${item.asOf ? ` · ${shortDate(item.asOf)}` : ''}</p></div><strong>${escapeHtml(known(item.value))}</strong></article>`).join('')}</div>
  </details>` : '';
}

function policyList(policy) {
  return policy?.checks?.length ? `<details class="trace-accordion" open><summary>${t('独立风控检查', 'Independent policy checks')} <span>${t(`${policy.checks.length} 项检查`, `${policy.checks.length} checks`)}</span></summary>
    <div class="policy-list">${policy.checks.map((check) => `<article>${tag(known(check.status), check.status === 'pass' ? 'green' : check.status === 'block' ? 'orange' : 'neutral')}<div><h3>${escapeHtml(known(check.label))}</h3><p>${escapeHtml(known(check.detail))}</p></div></article>`).join('')}</div>
  </details>` : '';
}

export function runTrace(run, { title = t('最近决策', 'Latest decision') } = {}) {
  if (!run) return `<section class="panel trace-empty"><h2>${escapeHtml(title)}</h2><p>${t('运行一次模拟审议，即可查看证据、经理提案与独立执行结果。', 'Run a paper review to see the team’s evidence, the manager’s proposal and the independent execution result.')}</p></section>`;
  const decision = run.decision ?? {};
  const execution = run.execution ?? {};
  const before = run.portfolioBefore;
  const after = run.portfolio;
  return `<section class="panel trace" id="decision-trace" aria-labelledby="trace-heading" tabindex="-1">
    <div class="panel-heading"><div><span class="eyebrow">${t('决策记录', 'DECISION RECORD')}</span><h2 id="trace-heading">${escapeHtml(title)}</h2></div>${statusTag(execution)}</div>
    <div class="trace-meta">${escapeHtml(known(run.scenario?.title) ?? t('模拟审议', 'Paper review'))} · ${escapeHtml(providerLabel(run))} · ${shortDate(run.createdAt ?? run.scenario?.asOf)}</div>
    <div class="trace-call">
      <div><span class="eyebrow">${t('经理提案', 'MANAGER PROPOSAL')}</span><h3>${escapeHtml(actionLabel(decision.action) || t('审议', 'Review'))} ${escapeHtml(decision.symbol)}</h3></div>
      <div><span class="eyebrow">${run.provider==='historical-proxy'?t('历史日期','Historical date'):t('目标权重', 'TARGET WEIGHT')}</span><strong>${run.provider==='historical-proxy'?escapeHtml(run.execution.date):percent(decision.targetWeightPercent)}</strong></div>
      <p>${escapeHtml(decision.summary)}</p>
      ${(decision.whatWouldChange || decision.reconsider) ? `<p class="trace-reconsider"><b>${t('什么会改变这个决定？', 'What would change the decision?')}</b> ${escapeHtml(decision.whatWouldChange || decision.reconsider)}</p>` : ''}
    </div>
    <div class="trace-execution"><span class="eyebrow">${t('模拟执行', 'SIMULATED EXECUTION')}</span><p><strong>${fillSummary(execution)}</strong></p>
      ${execution.status === 'filled' ? `<p>${escapeHtml(executionReason(execution))}</p>` : ''}
      ${before && after ? `<dl><div><dt>${t('之前的现金', 'Cash before')}</dt><dd>${money(before.cash)}</dd></div><div><dt>${t('之后的现金', 'Cash after')}</dt><dd>${money(after.cash)}</dd></div><div><dt>${t('组合价值', 'Portfolio value')}</dt><dd>${money(after.equity)}</dd></div></dl>` : ''}
    </div>
    ${reviewCards(run.reviews, run.evidence)}
    ${evidenceTable(run.evidence)}
    ${policyList(run.policy)}
    ${run.unconsulted?.length ? `<p class="trace-source">${t('本轮未参与', 'Not consulted this round')} · ${run.unconsulted.map(({ name }) => escapeHtml(name)).join(' · ')}</p>` : ''}
    <p class="trace-source">${escapeHtml(known(run.scenario?.source) ?? t('合成市场回放', 'Synthetic market replay'))} · ${escapeHtml(known(run.policy?.source) ?? t('模拟订单规则', 'Paper order policy'))} · ${escapeHtml(run.contractVersion ?? t('版本未记录','Version not recorded'))}</p>
  </section>`;
}

export function renderProFund({ state, fund, draft, scenario, showCreate, busy, activeAction }) {
  if (!fund) return `<div class="page-head"><h1>Start your first fund.</h1><p>Give your AI investment team a mandate and follow its first paper review.</p></div>${fundControls(state, fund, true, busy)}`;
  return `<div class="fund-home">
    <header class="fund-header">
      <div class="page-head"><span class="eyebrow page-kicker">INVESTMENT WORKSPACE</span><h1>${escapeHtml(fund.name)}<span class="title-period" aria-hidden="true">.</span></h1><p>Give your team a mandate and follow each decision from evidence to paper execution.</p></div>
      ${fundControls(state, fund, showCreate, busy)}
    </header>
    ${summaryStats(fund.portfolio)}
    <div class="fund-grid">${settings({ state, draft, scenario, busy, activeAction, fund })}${scenarioPreview(scenario)}</div>
    ${runTrace(fund.runs?.[0])}
  </div>`;
}

function formationCandidates(roster, editable,busy) {
  const people=roster.map(seat=>({...CANDIDATES.find(person=>person.id===seat.id),...seat}));
  return `<ul class="formation-all-seats" aria-label="${t('候选团队与职责','Proposed team and responsibilities')}">${people.map(person=>
    `<li data-formation-seat="${escapeHtml(person.id)}">${portrait(person)}
      <div><span class="formation-role">${escapeHtml(teamSystemText(person.title) || seatSpecialism(person.id,t) || roleLabel(person.role))}</span>
      <h3>${escapeHtml(person.name)}</h3><p>${escapeHtml(teamSystemText(person.duty))}</p></div>
      ${editable&&person.role!=='manager'?`<button type="button" class="formation-remove" data-action="remove-draft-seat" data-id="${escapeHtml(person.id)}" aria-label="${escapeHtml(t('移除 '+person.name,'Remove '+person.name))}" ${busy?'disabled':''}>×</button>`:''}</li>`
  ).join('')}</ul>`;
}
function recruitmentDesk(roster, busy, capacity) {
  const candidates=openDraftCandidates(roster);
  if(!candidates.length)return '';
  const others=roster.filter(s=>s.id!=='maya-chen');
  const full=roster.length>=capacity;
  const target=others.map(seat=>{
    const person=CANDIDATES.find(c=>c.id===seat.id)??seat;
    return `<option value="${escapeHtml(seat.id)}">${escapeHtml(t('替换 '+person.name,'Replace '+person.name))}</option>`;
  }).join('');
  return `<section class="formation-recruit" id="draft-recruiting" tabindex="-1" aria-label="${t('候选人才','Candidate desk')}"><header><h3>${t('再邀一位同事','Invite a specialist')}</h3>
    <p>${t('选一位候选人，或告诉 Maya 你还想招谁。','Choose a candidate or tell Maya who else you need.')}</p></header>
    <fieldset class="formation-talent" ${busy?'disabled':''}><legend class="sr-only">${t('候选专家','Available specialists')}</legend>${candidates.map((person,index)=>
      `<label><input name="draft-talent" type="radio" value="${escapeHtml(person.id)}" ${index===0?'checked':''}>
      ${portrait(person)}<span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(seatSpecialism(person.id,t))}</small></span></label>`).join('')}</fieldset>
    <div class="formation-match"><select data-draft-target aria-label="${t('选择新增或替换的席位','Choose a new or existing seat')}" ${busy?'disabled':''}>${full?'':`<option value="">${t('增加一个席位','Add a new seat')}</option>`}${target}</select>
    <button type="button" data-action="${full?'replace':'add'}-draft-seat" class="formation-confirm" ${busy?'disabled':''}>${full?t('替换候选人','Replace teammate'):t('加入蓝图','Add to proposal')}</button></div></section>`;
}
function guideBlueprint(guide, busy, editable, capacity, fundingNote) {
  const draft = guide.draft;
  if (!draft) return '';
  const roster = draft.roster ?? [];
  const isBridge = text => /^(?:Prepare a paper blueprint using|I want to start with business research and risk\. Suggest|按刚才的目标、基金名称|我想从研究公司经营和风险开始。请推荐)/u.test(text || '');
  const ideas = investmentTurns(guide).filter(turn=>turn.kind!=='roster-edit'&&!staffingOnlyTurn(turn.text)).map(turn => turn.text.trim()).filter(text => !isBridge(text));
  const currentGoal = guide.profile?.goal?.trim();
  const userGoal = currentGoal&&ideas.some(text=>text.includes(currentGoal))?currentGoal:(!currentGoal||isBridge(currentGoal)?ideas[0]:null);
  const goal = userGoal || (isBridge(currentGoal) ? t('先研究企业经营和风险，观察模拟组合。','Study business quality and risk in a paper portfolio.') : currentGoal);
  const goalLabel = userGoal ? t('你的投资想法','Your investment idea') : t('Maya 建议的起点','Maya’s suggested starting point');
  return `<section class="formation-spread" aria-labelledby="blueprint-heading">
    <div class="formation-intro"><div data-formation-host></div><p class="formation-fundname">${escapeHtml(draft.name || t('你的模拟基金','Your paper fund'))}</p><h2 id="blueprint-heading" tabindex="-1">${t('遇见你的小组','Meet your team.')}</h2>
    ${goal ? `<blockquote><span>${goalLabel}</span><p>${escapeHtml(goal)}</p></blockquote>` : ''}
    <p class="formation-status" tabindex="-1" role="status">${t(`含 Maya 在内，共 ${roster.length} 位候选。由你确认入职。`,`${roster.length} proposed teammates, including Maya. They join when you confirm.`)}</p>
    ${editable&&openDraftCandidates(roster).length?`<button type="button" class="formation-discover" data-action="open-draft-market">${t('浏览更多专家 · 宏观、债券与交易','Meet more specialists · Macro, bonds and trading')} ↓</button>`:''}</div>
    ${formationCandidates(roster,editable,busy)}
    ${editable?recruitmentDesk(roster,busy,capacity):''}
    <footer class="formation-decision"><p class="office-formation-funding">${fundingNote}</p><div class="formation-actions"><button type="button" class="formation-confirm hire-team" data-action="confirm-team" data-id="${escapeHtml(draft.id || draft.draftId)}" ${busy ? 'disabled' : ''}>${busy ? t('团队正在入驻…','Opening your office…') : t('确认组建，去见团队','Confirm and meet my team')} <span aria-hidden="true">↗</span></button><button type="button" class="formation-change" data-action="change-team">${t('调整人选或分工','Change the team')}</button></div>
    <details class="formation-rules"><summary>${t('模拟账户规则','Paper account rules')}</summary><p>${t('单一持仓上限','Single position cap')} ${percent(draft.maxWeightPercent)}</p><p>${draft.permissions?.allowBuy === false ? t('禁止模拟买入。','Simulated buys are blocked.') : t('允许模拟买入。','Simulated buys are allowed.')} ${draft.permissions?.allowSell === false ? t('禁止模拟卖出。','Simulated sells are blocked.') : t('允许模拟卖出。','Simulated sells are allowed.')} ${t('确认仅创建模拟账户。','Confirmation opens a paper account only.')}</p>${guide.profile?.sampleDefaults ? `<p>${t('未指定的期限与风险偏好采用演示设置，可请 Maya 修改。','Unspecified horizon and risk settings use sample values. Ask Maya to revise them.')}</p>` : ''}</details></footer></section>`;
}

function renderGuide({ guide = {}, busy, voiceMarkup, aiReady, researchDraft, pendingDesignMessage, supportsFormationRestore, editable, capacity, fundingNote }) {
  const manager = CANDIDATES[0];
  const ready = guide.phase === 'ready' && guide.draft && !(supportsFormationRestore && pendingFormationPreview(guide, researchDraft));
  const messages = guide.messages ?? [];
  const restoring = pendingFormationPreview(guide, researchDraft);
  const suggested = busy || ready ? [] : suggestedAnswers(guide).slice(0,2);
  const hint = aiReady ? t('点选一句，直接发送','Tap a reply to send it') : t('选一句存为草稿','Choose a reply to keep as a draft');
  const quickReplies=suggested.length ? `<div class="guide-answers" role="group" aria-label="${hint}"><span>${hint}</span><div>${suggested.map((answer,index)=>`<button type="button" data-action="send-guide-answer" data-index="${index}">${escapeHtml(answer)}</button>`).join('')}</div></div>` : '';
  return `<div class="fund-onboarding ${ready ? 'has-team-preview' : 'formation-opening'}"><section class="guide-setting">
    <div class="guide-manager-seat">${portrait(manager, 'manager-intro-portrait')}</div><div class="guide-person-copy"><span class="eyebrow">${t('组建基金','Fund formation')}</span><h1>Maya Chen</h1><p>${t('你的基金经理','Your fund manager')}</p></div>${readingControl()}

  </section>
  <section class="guide-conversation" aria-label="${t('和 Maya 设计你的基金', 'Design your fund with Maya')}">
    <div class="guide-step-label"><span>${ready ? t('你的团队蓝图', 'YOUR BLUEPRINT') : t('和 Maya 聊投资想法', 'In conversation with Maya')}</span></div>
    ${ready ? guideBlueprint(guide, busy, editable, capacity, fundingNote) : ''}
    ${ready ? `<details class="formation-transcript"><summary>${t('回看与 Maya 的对话','Conversation with Maya')}</summary>` : ''}
    <div class="guide-messages" role="log" aria-live="polite">
      ${messages.length ? messages.slice(-12).map((message) => {
        const text = message.id === 'welcome' ? openingQuestion(t) : message.text ?? message.content;
        return `<article class="guide-message${message.role === 'user' ? ' guide-message--user' : ''}">${message.role === 'assistant' ? `<span class="message-author">${portrait(manager)} Maya</span>` : `<span class="message-author">${t('你', 'You')}</span>`}<p>${escapeHtml(text)}</p>${message.role === 'assistant' ? `<button class="read-reply" type="button" data-action="speak-message" data-voice-receipt="${escapeHtml(message.responseId||'')}" data-voice-lang="${escapeHtml(message.language||'')}" data-text="${escapeHtml(text)}">${t('读给我听', 'Read aloud')} ♫</button>` : ''}</article>`;
      }).join('') : `<article class="guide-message"><span class="message-author">${portrait(manager)} Maya</span><h2>${openingQuestion(t)}</h2></article>`}
      ${pendingDesignMessage ? `<article class="guide-message guide-message--user" data-pending-design><span class="message-author">${t('你','You')}</span><p>${escapeHtml(pendingDesignMessage)}</p></article>` : ''}
      ${busy ? `<p class="thinking" role="status"><i></i><i></i><i></i> ${t('Maya 正在整理你的想法…', 'Maya is putting it together…')}</p>` : ''}
    </div>
    ${ready ? '</details>' : ''}
    ${researchPrompt(researchDraft, busy)}
    ${ready ? `<details class="revise-blueprint"><summary>${t('和 Maya 修改这份蓝图','Revise this blueprint with Maya')}</summary>` : ''}
    <form data-form="studio-onboard" class="guide-composer conversation-composer voice-first">${quickReplies}<div class="voice-start">${voiceMarkup}<span class="voice-invitation">${t('点击开始说话', 'Tap to start speaking')}</span><button class="text-button" type="button" data-action="toggle-typing">${t('改用文字', 'Use the keyboard')}</button></div><label for="guide-message" class="transcript-label">${t('你的话，可修改后发送', 'Your words. Edit before sending.')}</label><textarea id="guide-message" name="message" rows="3" placeholder="${t('我想研究能长期成长的科技公司…', 'I’m interested in long-term technology companies…')}" maxlength="800" required ${busy ? 'disabled' : ''}></textarea><div class="transcript-actions"><button type="button" class="text-button" data-action="clear-transcript">${t('重新说', 'Try again')}</button><button class="button button--primary" type="submit" aria-label="${t('发送给 Maya','Send to Maya')}" ${busy || (!aiReady && !(ready&&editable)) ? 'disabled' : ''}>${t('发送给 Maya', 'Send to Maya')} ↑</button></div></form>
      <p class="guide-help">${t('可以一起说想投什么、想请谁。比如「我想研究消费公司，小林看财报，阿杰管风险」。','Describe the strategy and people together. Try “Research consumer companies, with Lin on earnings and Jay on risk.”')}</p>${ready ? '</details>' : ''}
    ${ready ? '' : `<div class="formation-shortcut"><button type="button" class="guide-team-entry" data-action="prepare-team" ${busy ? 'disabled' : ''}>${restoring ? t('载入我的团队','Load my team') : t('创建我的模拟基金','Create my paper fund')} <span aria-hidden="true">↗</span></button></div>`}
    ${!aiReady ? `<p class="maya-connection" role="status">${ready&&editable?t('你仍可点选或说出要增减的专家，修改会保存到蓝图。连接 Maya 后可继续讨论其他问题。','Choose or name the specialists you want to add or remove. Changes are saved to your proposal. Reconnect Maya for other questions.'):t('Maya 暂时离线。你可以先口述或打字，草稿会保存在当前标签页。', 'Maya is offline. Dictate or type a draft and it will stay in this tab.')} <button type="button" class="text-button" data-action="retry">${t('重新连接 Maya', 'Reconnect to Maya')}</button></p>` : ''}
  </section></div>`;
}

function reviewReceipt(run) {
  if (!run) return '';
  return `<section class="review-receipt" id="review-receipt" tabindex="-1"><div class="receipt-header"><span><i aria-hidden="true"></i> ${t('团队审议完成', 'TEAM REVIEW COMPLETE')}</span>${statusTag(run.execution)}</div>
    <h2>${escapeHtml(actionLabel(run.decision.action))} ${escapeHtml(run.decision.symbol)}<span>${run.decision.targetWeightPercent!=null ? percent(run.decision.targetWeightPercent)+' '+t('目标', 'target'):escapeHtml(run.execution.date)}</span></h2><p>${escapeHtml(run.decision.summary)}</p>
    <button type="button" class="trade-question" data-action="ask-run" data-id="${escapeHtml(run.id ?? run.requestId)}">${t('问 Maya 为什么这样交易', 'Ask Maya why this trade happened')} ↗</button><div class="receipt-execution"><span>${t('模拟执行', 'What happened')}</span><strong>${fillSummary(run.execution)}</strong></div>
    <div class="receipt-cash"><span>${t('模拟现金', 'Paper cash')}</span><strong>${money(run.portfolioBefore?.cash)} <span>→</span> ${money(run.portfolio?.cash)}</strong></div>
    <details class="receipt-detail"><summary>${t('查看团队理由与独立风控', 'See the team’s reasoning and checks')} <span aria-hidden="true">＋</span></summary>${runTrace(run)}</details>
  </section>`;
}

function officeCapital(fund, state) {
  const position = state.studioAllocations?.[fund.id];
  const href = '#/portfolio?product=' + encodeURIComponent('studio:' + fund.id);
  const value = position && Number.isSafeInteger(position.valueCents) ? money(position.valueCents / 100) : t('待估值', 'Awaiting valuation');
  return `<div class="office-capital">${position ? `<span>${t('你的模拟持仓市值', 'Your paper investment')}</span><strong data-office-allocation>${value}</strong>` : ''}
    <a href="${href}" class="office-capital-link">${position?.valueCents === 0 ? t('从组合投入模拟资金', 'Allocate paper cash') : t('管理模拟资金', 'Manage paper allocation')} <span aria-hidden="true">↗</span></a></div>`;
}

export function renderFund({ state, fund, displayName = fund?.name, draft, scenario, busy, activeAction, guide, pendingDesignMessage, onboarding, proMode, selectedId, arrivals, showRecruit, hasStudioFunds = state.funds?.slice(1).length > 0, firstCapitalAllocation = !state.funds?.slice(1).some(item => !item.replica), voiceMarkup = '', guideVoiceMarkup = '' }) {
  if (onboarding) {
    const back = hasStudioFunds ? '#/fund' : '#/';
    const label = hasStudioFunds ? t('我的工作室','My Studio') : t('返回大厅','Back to lobby');
    const amount = Number.isSafeInteger(state.portfolioCashCents) ? money(state.portfolioCashCents / 100) : '';
    const fundingNote = !firstCapitalAllocation ? t('新基金从零开始。组建后，可在投资组合中为它分配模拟资金。','This fund starts at zero. Allocate paper cash to it from your portfolio after formation.') :
      (amount ? t(`组建首只基金时，将把组合中全部可用模拟现金 ${amount} 投入这只基金。`,`Forming your first fund invests all ${amount} of your available paper cash in it.`) :
        t('组建首只基金时，将把组合中全部可用模拟现金投入这只基金。','Forming your first fund invests all available paper cash in it.'));
    return `<div class="my-studio"><header class="workspace-toolbar"><a class="text-button" href="${back}">← ${label}</a></header>${renderGuide({
      guide: guide ?? state.guide ?? {}, pendingDesignMessage, supportsFormationRestore: state.studioFormationVersion >= 2, editable: state.studioFormationVersion >= 3,
      capacity: state.studioTeamCapacity, researchDraft: state.researchDraft, busy, voiceMarkup: guideVoiceMarkup, aiReady: state.provider?.chatEnabled, fundingNote,
    })}</div>`;
  }
  const latest = fund.runs?.[0];
  const membership = !fund.replica && state.membership?.startedAt ? state.membership : null;
  const accessLink = membership ? `<p class="review-mode-note"><a href="/membership.html?lang=${getLanguage()}">${membership.status === 'expired' ? t('试用已结束 · 查看会员方案','Trial ended · View membership') : t(`工作室试用剩余 ${membership.daysRemaining} 天 · 会员方案`, `Studio trial: ${membership.daysRemaining} days left · Membership`)} ↗</a></p>` : '';
  const reviewButton = `<button class="button button--primary team-review-button" type="button" data-action="review-team" ${busy ? 'disabled' : ''}>${activeAction === 'runScenario' ? t('团队正在审议…', 'Your team is reviewing…') : fund.replica ? t('推进下一期历史调仓', 'Advance one historical period') : t('召集团队，模拟审议', 'Review with my team')} <span aria-hidden="true">✦</span></button>`;
  const tradingRecord = `<a class="office-record-link" href="#/fund-record?fund=${encodeURIComponent(fund.id)}">${t('这只基金的交易明细', 'Fund trading record')} ↗</a>`;
  const workspace = fund.replica ? `<header class="workspace-toolbar"><a class="text-button" href="#/lab">← ${t('基金展馆','Fund gallery')}</a></header>
    <div class="fund-title-row"><div><span class="eyebrow">${t('基金历史回放', 'Historical fund replay')}</span><h1>${escapeHtml(fund.name)}</h1></div><span class="fund-title-balance"><span>${t('策略模拟净值总额','Strategy paper equity')}</span><strong>${money(fund.portfolio?.equity)}</strong></span></div>
    <div class="wallet-entry"><span>${t('此基金使用历史总回报代理单位进行模拟调仓。','This fund replays historical rebalances using total-return proxy units.')}</span><a class="wallet-order-link" href="#/portfolio?product=${encodeURIComponent('catalog:' + fund.replica.catalogId)}">${t('投入模拟资金','Invest paper cash')} ↗</a></div>
    <div class="studio-workspace"><div class="studio-space-column">${renderRoom({team:fund.team,selectedId})}</div><div class="fund-conversation-column">${renderChat({team:fund.team,chat:fund.chat,selectedId,busy:activeAction==='sendChat',voiceMarkup,aiReady:state.provider?.chatEnabled})}</div></div>
    <div class="office-ledger-tools">${reviewButton}${tradingRecord}</div>` :
    renderTeam({team:fund.team,fundId:fund.id,fundName:displayName,selectedId,arrivals,showRecruit,chat:fund.chat,busy:activeAction==='sendChat',voiceMarkup,aiReady:state.provider?.chatEnabled,
      balanceMarkup:officeCapital(fund,state),watchMarkup:state.funds?.[0]?.id!==fund.id ? watchMount(true) : ''});
  const study = fund.replica && state.researchStudies?.[fund.replica.catalogId];
  return `<div class="my-studio" data-office-id="${escapeHtml(fund.id)}">${workspace}
    ${fund.replica ? '' : `<section class="office-ledger" aria-labelledby="office-ledger-title"><header><h2 id="office-ledger-title">${t('策略模拟账本','Strategy paper ledger')}</h2>${tradingRecord}</header>
      ${fund.studioCapital ? '' : `<p class="review-mode-note">${t('这份策略账本保留独立模拟本金。个人持仓金额请见投资组合。','This strategy ledger has its own paper balance. Your portfolio shows the amount you have invested.')}</p>`}
      ${studioBriefing(fund,membership,busy)}<div class="office-ledger-tools">${reviewButton}<button class="pro-toggle" type="button" data-action="toggle-pro" aria-expanded="${Boolean(proMode)}">${proMode ? t('关闭专业设置','Close professional controls') : t('专业设置','Professional controls')}</button></div>
      <p class="review-mode-note">${t('模拟审议采用合成行情回放。','Paper reviews use synthetic market replay.')}</p></section>`}
    <div id="studio-meeting" tabindex="-1">${meetingSlot('runScenario',fund.id)}</div>
    ${study?.metrics ? `<div class="mt-study-actions">${researchReviewButton(study,state.researchReviews?.[fund.replica.catalogId],busy || !state.provider?.chatEnabled)}${meetingSlot('reviewResearch',fund.replica.catalogId)}</div>` : ''}
    ${latest ? reviewReceipt(latest) : ''}${accessLink}
    ${proMode && !fund.replica ? `<section class="pro-workspace" id="pro-workspace"><div class="section-title"><div><span class="eyebrow">${t('专业设置', 'PROFESSIONAL CONTROLS')}</span><h2>${t('基金规则', 'Fund rules')}</h2></div><button class="icon-button" data-action="toggle-pro" type="button" aria-label="${t('关闭专业设置', 'Close professional controls')}">×</button></div><div class="fund-grid">${settings({ state, draft, scenario, busy, activeAction, fund })}${scenarioPreview(scenario)}</div></section>` : ''}
  </div>`;
}

function holdingsTable(positions = []) {
  const rebased=positions.some(position=>position.basis==='rebased-total-return-units');
  return positions.length ? `<table class="portfolio-table"><thead><tr><th scope="col">${t('标的', 'Ticker')}</th><th scope="col">${rebased?t('历史单位','Historical units'):t('股数', 'Shares')}</th><th scope="col">${t('市值', 'Market value')}</th><th scope="col" class="table-secondary">${t('权重', 'Weight')}</th><th scope="col" class="table-extra">${t('未实现盈亏', 'Unrealized P&L')}</th></tr></thead>
    <tbody>${positions.map((position) => `<tr><th scope="row">${escapeHtml(position.symbol)}</th><td>${quantity(position.quantity)}</td><td>${money(position.marketValue)}</td><td class="table-secondary">${percent(position.weightPercent)}</td><td class="table-extra">${money(position.unrealizedPnl)}</td></tr>`).join('')}</tbody></table>`
    : `<p class="empty-copy">${t('暂无持仓。符合规则的模拟成交会显示在这里。', 'There are no holdings yet. An eligible paper fill will appear here.')}</p>`;
}

function ordersTable(runs) {
  const orders = runs.filter(({ execution }) => execution?.status === 'filled').flatMap(run => run.execution.legs?.length ? run.execution.legs.map(leg => ({execution:leg,createdAt:run.execution.date ?? run.createdAt})) : [run]);
  return orders.length ? `<table class="portfolio-table"><thead><tr><th scope="col">${t('标的', 'Ticker')}</th><th scope="col">${t('订单', 'Order')}</th><th scope="col">${t('金额', 'Notional')}</th><th scope="col" class="table-secondary">${t('成交价', 'Fill price')}</th><th scope="col" class="table-extra">${t('审议时间', 'Reviewed')}</th></tr></thead>
    <tbody>${orders.map(({ execution, createdAt }) => `<tr><th scope="row">${escapeHtml(execution.symbol)}</th><td>${escapeHtml(actionLabel(execution.side))} ${quantity(execution.quantity)}</td><td>${money(execution.notional)}</td><td class="table-secondary">${money(execution.price)}</td><td class="table-extra">${shortDate(createdAt)}</td></tr>`).join('')}</tbody></table>`
    : `<p class="empty-copy">${t('模拟成交会在发生后显示在这里。', 'Paper fills appear here as they happen.')}</p>`;
}

export function renderPortfolio({ fund, displayName = fund?.name, selectedRunId }) {
  if (!fund) return `<div class="page-head"><h1>${t('组合', 'Portfolio')}.</h1><p>${t('先创建模拟基金，建立自己的账户。', 'Create a paper fund to start an account.')}</p></div><a class="button button--primary" href="#/fund">${t('打开我的工作室', 'Open My Studio')}</a>`;
  const runs = fund.runs ?? [];
  const selected = runs.find(({ id, requestId }) => (id ?? requestId) === selectedRunId) ?? runs[0];
  return `<div class="portfolio-view">
    <div class="page-head"><span class="eyebrow page-kicker">${escapeHtml(displayName)}</span><a class="wallet-back" href="#/office?fund=${encodeURIComponent(fund.id)}">← ${fund.replica ? t('返回基金回放','Back to fund replay') : t('返回基金办公室','Back to fund office')}</a><h1>${t('基金交易明细', 'Fund trading record')}<span class="title-period" aria-hidden="true">.</span></h1><p>${t('查看持仓、成交，以及背后的每一次决策。', 'Track holdings, fills and the decisions behind them.')}</p></div>
    ${summaryStats(fund.portfolio)}
    <div class="portfolio-grid">
      <section class="panel portfolio-holdings"><div class="panel-heading"><h2>${t('持仓', 'Holdings')}</h2>${tag(t('模拟', 'Simulated'), 'green')}</div>${holdingsTable(fund.portfolio?.positions)}</section>
      <section class="panel portfolio-orders"><div class="panel-heading"><h2>${t('订单', 'Orders')}</h2>${tag(t('模拟成交', 'Paper fills'), 'green')}</div>${ordersTable(runs)}</section>
    </div>
    <section class="panel history-panel"><div class="panel-heading"><h2>${t('决策历史', 'Decision history')}</h2>${tag(t(`${runs.length} 次审议`, `${runs.length} ${runs.length === 1 ? 'review' : 'reviews'}`))}</div>
      ${runs.length ? `<ul class="history-list">${runs.map((run) => `<li><button class="history-row" type="button" data-action="select-run" data-id="${escapeHtml(run.id ?? run.requestId)}" aria-pressed="${selected === run}">
        <strong>${escapeHtml(known(run.scenario?.title) ?? t('模拟审议', 'Paper review'))}</strong><span>${shortDate(run.createdAt)}</span>${statusTag(run.execution)}<span aria-hidden="true">→</span>
      </button></li>`).join('')}</ul>` : `<p class="empty-copy">${t('暂无审议记录。可以在基金内发起第一次模拟审议。', 'No reviews yet. Run a paper review with your fund team to start your history.')}</p>`}
    </section>
    ${selected ? `<button type="button" class="trade-question" data-action="ask-run" data-id="${escapeHtml(selected.id ?? selected.requestId)}">${t('问 Maya 这笔操作的原因','Ask Maya about this decision')} ↗</button>` : ''}
    ${selected?.activity ? meetingSlot('recorded',selected.id) : ''}
    ${selected ? runTrace(selected, { title: t('选中的决策', 'Selected decision') }) : ''}
  </div>`;
}

function connectionRow({ title, detail, variant, description }) {
  return `<article class="connection-row"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>${tag(detail, variant)}</article>`;
}

export function renderConnections({ state, busy, checkedAt, activeAction, market, paper, ticker }) {
  const provider = state.provider ?? {};
  const marketConnection = state.connections?.market ?? {};
  const paperConnection = state.connections?.paper ?? {};
  const brokerConnection = state.connections?.broker ?? {};
  return `<div class="connections-view">
    <header class="page-head"><span class="eyebrow page-kicker">${t('工作室设置', 'WORKSPACE SETTINGS')}</span><h1>${t('连接', 'Connections')}<span class="title-period" aria-hidden="true">.</span></h1><p>${t('体验券商授权，查看模拟工作室的运行状态。', 'Explore broker authorization and check your paper workspace status.')}</p></header>
    <div data-broker-demo-root></div>
    <section class="panel connection-panel" aria-labelledby="connection-title">
      <div class="panel-heading"><h2 id="connection-title">${t('运行环境', 'Environment status')}</h2><button type="button" class="button button--outline" data-action="refresh-connections" ${busy ? 'disabled' : ''}>${busy ? t('检查中…', 'Checking…') : t('检查状态', 'Check status')}</button></div>
      ${checkedAt ? `<p class="connection-time">${t('最近检查', 'Checked')} ${shortDate(checkedAt)}</p>` : ''}
      ${connectionRow({ title: t('合成市场回放', 'Synthetic market replay'), detail: t('就绪', 'Ready'), variant: 'green', description: t('使用标注时间的合成报价与固定情景。模拟成交保存在各基金的独立账本。', 'Timestamped synthetic quotes and fixed market scenarios. All paper fills stay in the fund’s own account.') })}
      ${connectionRow({ title: t('HarnessRouter 基金经理', 'HarnessRouter manager'), detail: provider.enabled ? t('已启用', 'Enabled') : provider.configured ? t('已配置', 'Configured') : t('未连接', 'Unavailable'), variant: provider.enabled ? 'green' : 'neutral', description: provider.enabled ? t(`经理通过 ${provider.model || '配置的模型'} 提出建议，每张订单仍由模拟引擎检查。`, `The manager can submit proposals using ${provider.model || 'the configured model'}. The paper engine checks every order.`) : t('需在服务器配置托管模型。普通对话不会自动改为离线示例回复。', 'Set up the hosted manager on the server. Normal conversations never fall back to a scripted reply.') })}
      ${connectionRow({ title: t('Alpaca 市场行情', 'Alpaca market data'), detail: marketConnection.enabled ? t('已配置', 'Configured') : t('未连接', 'Disconnected'), variant: marketConnection.enabled ? 'green' : 'neutral', description: marketConnection.enabled ? t(`可读取独立的 ${marketConnection.feed.toUpperCase()} 快照。模拟审议使用合成回放报价。`, `Check an isolated ${marketConnection.feed.toUpperCase()} snapshot. Paper reviews use synthetic replay quotes.`) : t('在服务器配置行情连接后，可单独查询 Alpaca 快照。', 'Configure the market-data connection on the server to look up an Alpaca snapshot.') })}
      ${marketConnection.enabled ? `<form class="connection-form" data-form="market-check"><div class="field"><label for="market-ticker">${t('美股代码', 'US ticker')}</label><input id="market-ticker" name="symbol" type="text" value="${escapeHtml(ticker || 'NVDA')}" pattern="[a-zA-Z]{1,6}([.][a-zA-Z])?" maxlength="8" required></div><button class="button button--outline" type="submit" ${busy ? 'disabled' : ''}>${activeAction === 'market-check' ? t('查询中…', 'Looking up…') : t('查询报价', 'Look up quote')}</button></form>` : ''}
      ${market ? `<div class="connection-result" role="status"><strong>${escapeHtml(market.symbol)} · ${escapeHtml(market.source)} · ${escapeHtml(market.feed.toUpperCase())}</strong><p>${market.freshness === 'missing' ? t('报价不可用', 'Quote unavailable') : t(`买价 ${money(market.bid)} · 卖价 ${money(market.ask)} · ${market.delayStatus === 'delayed' ? '延时行情' : market.freshness === 'fresh' ? '新鲜' : '过期'}`, `Bid ${money(market.bid)} · Ask ${money(market.ask)} · ${escapeHtml(market.delayStatus === 'delayed' ? 'delayed feed' : market.freshness)}`)} · ${shortDate(market.quoteAt)}</p></div>` : ''}
      ${connectionRow({ title: t('Alpaca 模拟账户', 'Alpaca paper account'), detail: paperConnection.enabled ? t('已配置', 'Configured') : t('未连接', 'Disconnected'), variant: paperConnection.enabled ? 'green' : 'neutral', description: paperConnection.enabled ? t('查看券商模拟账户状态。工作室保留独立模拟账本。', 'Check broker paper account status. The studio keeps its own paper ledger.') : t('当前工作室在自身的模拟引擎中记录成交。', 'This workspace records fills in its own simulator.') })}
      ${paperConnection.enabled ? `<button type="button" class="button button--outline connection-check" data-action="paper-check" ${busy ? 'disabled' : ''}>${activeAction === 'paper-check' ? t('检查中…', 'Checking…') : t('检查模拟账户', 'Check paper account')}</button>` : ''}
      ${paper ? `<div class="connection-result" role="status"><strong>${escapeHtml(paper.source)} · ${escapeHtml(paper.status)}</strong><p>${paper.accountBlocked || paper.tradingBlocked ? t('券商报告了账户限制。', 'Broker reported a restriction.') : t('已读取券商模拟账户状态。', 'Broker returned paper account status.')}</p></div>` : ''}
      ${connectionRow({ title: t('券商交易控制台', 'Broker trading console'), detail: brokerConnection.enabled ? t('可用', 'Available') : t('已关闭', 'Disabled'), variant: brokerConnection.enabled ? 'green' : 'neutral', description: t('独立配置并核对券商账户与订单权限。', 'Review the separately configured broker account and order permissions.') })}
      ${brokerConnection.enabled ? `<a class="button button--outline connection-check" href="/broker.html">${t('打开券商控制台', 'Open broker trading console')}</a>` : ''}
      ${connectionRow({ title: t('普通工作室实盘交易', 'Live brokerage in Studio'), detail: t('已关闭', 'Disabled'), variant: 'neutral', description: t('工作室使用模拟资金，真实订单只在独立授权的券商控制台处理。', 'The studio uses paper funds. Real orders belong to the separately authorized broker console.') })}
    </section>
  </div>`;
}
