import { getLanguage, t } from './i18n.mjs';
import { portrait } from './team.mjs';
import { escapeHtml } from './views.mjs';

// Maya appends this policy line to the founder's goal when a blueprint is confirmed.
const blueprintPolicy = /(?:^|\r?\n)Horizon: [^\r\n]*?\. Risk approach: [^\r\n]*?\. [^\r\n]*?Maximum position \d+(?:\.\d+)?%\. Simulated BUY is (?:allowed|prohibited)\. Simulated SELL is (?:allowed|prohibited)\.(?=[ \t]*(?:\r?\n|$))/u;

function fundCard(fund, allocation, formatMoney, displayName) {
  const summary = (fund.mandate ?? '').replace(blueprintPolicy, '').trim();
  const team = fund.team ?? [];
  const teamCount = t(`${team.length} 位成员`, `${team.length} ${team.length === 1 ? 'teammate' : 'teammates'}`);
  const name = escapeHtml(displayName(fund));
  const office = t('进入办公室', 'Open office');
  const allocationValue = Number.isSafeInteger(allocation?.valueCents)
    ? formatMoney.format(allocation.valueCents / 100)
    : t('待估值', 'Awaiting valuation');

  return `<li><a class="studio-directory-fund" data-office-fund="${escapeHtml(fund.id)}" href="#/office?fund=${encodeURIComponent(fund.id)}">
    <div class="studio-directory-team"><span class="studio-directory-faces" aria-hidden="true">${team.slice(0, 3).map(member => portrait(member)).join('')}</span><span>${teamCount}</span></div>
    <h2>${name}</h2>
    ${summary ? `<p class="studio-directory-mandate">${escapeHtml(summary)}</p>` : ''}
    <div class="studio-directory-card-foot">${allocation ? `<span class="studio-directory-capital"><small>${t('我的模拟持仓', 'My paper holding')}</small><strong>${allocationValue}</strong></span>` : ''}
      <span class="studio-directory-open">${office} <span aria-hidden="true">→</span></span></div>
  </a></li>`;
}

export function renderStudioDirectory({ funds = [], researchFunds = [], guide, studioAllocations = {}, busy = false, displayName = fund => fund.name } = {}) {
  const hasDraft = guide && guide.phase !== 'created' &&
    (guide.draft || guide.messages?.some(message => message.role === 'user'));
  const action = hasDraft ? t('继续组建基金', 'Continue fund draft') : t('新建基金', 'Build a fund');
  const formatMoney = new Intl.NumberFormat(getLanguage(), { style: 'currency', currency: 'USD' });
  return `<section class="studio-directory" aria-labelledby="studio-directory-title">
    <a class="studio-directory-back" href="#/"><span aria-hidden="true">←</span> ${t('返回大厅', 'Back to lobby')}</a>
    <header class="studio-directory-head"><h1 id="studio-directory-title">${t('我的工作室', 'My Studio')}</h1>
      <button type="button" class="button button--primary" data-action="start-fund"${busy ? ' disabled' : ''}>${hasDraft ? '' : '<span aria-hidden="true">＋</span> '}${action}</button></header>
    ${funds.length ? `<ul class="studio-directory-funds" aria-label="${t('我的基金', 'My funds')}">${funds.map(fund => fundCard(fund, studioAllocations?.[fund.id], formatMoney, displayName)).join('')}</ul>` : ''}
    ${researchFunds.length ? `<details class="studio-directory-archive"><summary>${t('历史研究模拟盘', 'Historical research accounts')} (${researchFunds.length})</summary>
      <ul>${researchFunds.map(fund => `<li><a href="#/office?fund=${encodeURIComponent(fund.id)}" data-office-fund="${escapeHtml(fund.id)}">${escapeHtml(fund.name)} <span aria-hidden="true">→</span></a></li>`).join('')}</ul></details>` : ''}
  </section>`;
}

