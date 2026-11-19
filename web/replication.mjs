import { t } from './i18n.mjs';
import { ARK_DISCLOSURES, ARK_FILING_LINKS, ARK_STUDY_CUTOFF, SYNTHETIC_DISCLOSURES } from './replication-cases.mjs';
import { analyzeDisclosures, DISCLOSURE_SCHEMA, validateDisclosures } from './replication-model.mjs';

const CASES = {
  synthetic: { data: SYNTHETIC_DISCLOSURES, time: '2026-08-20T16:00', get label() { return t("合成样本","Synthetic sample"); } },
  sec: { data: ARK_DISCLOSURES, time: ARK_STUDY_CUTOFF.slice(0,16), get label() { return t("SEC 披露 · 抽样持仓","SEC filings \u00b7 partial holdings"); } },
};
const MAX_FILE_BYTES = 256 * 1024;
const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const DELTA = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const EXAMPLE = JSON.stringify({
  schemaVersion: DISCLOSURE_SCHEMA,
  fundName: 'Example portfolio',
  snapshots: [
    { source: 'Filing accession or source URL', reportDate: '2026-07-31', publicAt: '2026-08-12T15:00:00Z', holdings: [{ symbol: 'ABC', weight: 10 }, { symbol: 'CASH', weight: 5 }] },
  ],
}, null, 2);

const workbenches = new Map();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function percentage(weight) {
  return weight === null ? `<span aria-label="${t("未披露","Not reported")}">—</span>` : `${NUMBER.format(weight)}%`;
}

function weightDifference(value) {
  return value === null ? '—' : `${DELTA.format(value)} ${t("个百分点","pp")}`;
}

function utcLabel(value) {
  return `${escapeHtml(value.slice(0, 10))} ${escapeHtml(value.slice(11, 16))} UTC`;
}

function displaySource(snapshot, key) {
  if (key === 'sec' && Object.hasOwn(ARK_FILING_LINKS, snapshot.source)) {
    return `<a href="${ARK_FILING_LINKS[snapshot.source]}" target="_blank" rel="noopener noreferrer">${escapeHtml(snapshot.source)} <span aria-hidden="true">↗</span></a>`;
  }
  return escapeHtml(snapshot.source);
}

function displayResult(result, key) {
  if (!result.training.length) return `<div class="lab-empty"><strong>${t("决策时点尚无可用资料","No data available at the decision time")}</strong><p>${t("请选择较晚的决策时间，或添加更早公开的披露。","Choose a later decision time or add an earlier public disclosure.")}</p></div>`;
  const { comparison, holdout, modelConcentration, rows, training } = result;
  const metrics = [
    [t("已列持仓覆盖率¹","Named allocation coverage\u00b9"), `${percentage(result.modelCovered)}${holdout ? ` / ${percentage(holdout.covered)}` : ''}`],
    [t("已知持仓重合度","Known holding overlap"), comparison ? percentage(comparison.knownOverlap) : '—'],
    [t("权重距离²","Weight distance\u00b2"), comparison ? weightDifference(comparison.bucketedDistance).replace(/^\+/u, '') : '—'],
    [t("已列前三大持仓¹","Top 3 named positions\u00b9"), `${percentage(modelConcentration.topThree)}${comparison ? ` / ${percentage(comparison.concentration.topThree)}` : ''}`],
  ];
  const inputs = [...training.map(snapshot => ({ snapshot, role: t("模型输入","Model input") })), ...(holdout ? [{ snapshot: holdout, role: t("仅作留出比较","Holdout only") }] : [])];
  return `
    <div class="lab-research-summary"><strong>${escapeHtml(key === 'imported' ? result.fundName : key === 'sec' ? t('ARK Innovation ETF (ARKK) · 五项披露持仓','ARK Innovation ETF (ARKK) · five disclosed holdings') : t('模拟创新基金','Simulated Innovation Fund'))}</strong><span>${t("决策时点 ","Decision time ")}${utcLabel(result.decisionAt)}</span></div>
    <dl class="lab-metrics lab-research-metrics">${metrics.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
    <p class="lab-reading-note">¹ ${t("模型","Model")}${holdout ? t(' / 留出报告',' / holdout') : ''}. ² ${t("总绝对权重差的一半。未知配置合并为一项，因此该距离可能低估完整组合的差异。","Half the total absolute weight difference. Unknown allocations share one bucket, so this distance can understate full-portfolio differences.")}</p>
    ${holdout
      ? `<div class="lab-holdout"><span>${t("留出报告 ","Held-out report ")}<strong>${escapeHtml(holdout.reportDate)}</strong></span><span>${comparison.modelOnly}${t(" 个模型持仓未在留出报告列明 · "," model names absent from holdout \u00b7 ")}${comparison.holdoutOnly}${t(" 个留出持仓未在模型列明"," holdout names absent from model")}</span></div>`
      : `<p class="lab-method-note">${t("此数据集没有更晚的报告期，仅展示模型及其输入资料。","No later reporting period in this dataset. Only the model and its input disclosures are shown.")}</p>`}
    <details class="lab-details lab-research-details">
      <summary>${t("比较持仓权重","Compare holding weights")}</summary>
      <div class="lab-table-scroll lab-holdings-scroll" role="region" aria-label="${t("模型与披露权重","Model and disclosure weights")}" tabindex="0">
        <table class="lab-table lab-holdings"><thead><tr><th scope="col">${t("标的","Symbol")}</th><th scope="col">${t("模型","Model")}</th><th scope="col">${t("留出报告","Holdout")}</th><th scope="col">${t("差异","Difference")}</th></tr></thead>
        <tbody>${rows.map(({ symbol, modelWeight, disclosedWeight, delta }) => `<tr><th scope="row">${escapeHtml(symbol)}</th><td>${percentage(modelWeight)}</td><td>${percentage(disclosedWeight)}</td><td>${weightDifference(delta)}</td></tr>`).join('')}
        <tr><th scope="row">${t("未分类","Unclassified")}</th><td>${percentage(100 - result.modelCovered)}</td><td>${holdout ? percentage(100 - holdout.covered) : '—'}</td><td>${holdout ? weightDifference(holdout.covered - result.modelCovered) : '—'}</td></tr></tbody></table>
      </div>
      <p>${t("未列明的标的不计入已知权重。未分类余额可能包括其他持仓或现金。","Missing names contribute no known weight. The unclassified balance may contain other holdings or cash.")}</p>
    </details>
    <details class="lab-details lab-research-details">
      <summary>${t("披露时间线与来源","Disclosure timeline and sources")} <span>${inputs.length}</span></summary>
      <p>${t("模型平均使用决策时点已公开的最多三期报告，每期取当时可用的最新版本。下一报告期的首次披露仅用于比较。","The model averages up to three reporting periods that were available at the decision time. For each period it uses the latest available version. The first disclosure for the next reporting period is used only for comparison.")}</p>
      <ul class="lab-disclosure-list">${inputs.map(({ snapshot, role }) => `<li><span><strong>${role} · ${escapeHtml(snapshot.reportDate)}</strong>${displaySource(snapshot, key)}</span><span>${key === 'sec' ? t("可用时点代理","Available by proxy") : t("公开于","Public at")} ${utcLabel(snapshot.publicAt)}</span></li>`).join('')}</ul>
      ${key === 'sec' ? `<p>${t("五个固定标的使用各文件披露的净资产比例。样例采用 EDGAR 申报日次日中午 UTC，作为保守的可用时点代理；EDGAR 未公布网页首次可用时间。","Five fixed names, using each filing\u2019s percentage of net assets. The case uses noon UTC on the day after the EDGAR filing date as a conservative availability proxy. EDGAR does not publish first website availability. ")}<a href="https://www.sec.gov/about/webmaster-frequently-asked-questions" target="_blank" rel="noopener noreferrer">${t("SEC 时间说明 ↗","SEC timing notes \u2197")}</a></p>` : ''}
    </details>`;
}

function panelMarkup({activeCase, selectedTime, importedCase}) {
  return `
    <div class="lab-section-line">${t("持仓研究","Holdings research")}</div>
    <header class="lab-panel-header"><div><h2>${t("披露拟合研究","Disclosure replication")}</h2><p>${t("固定决策时点，将当时模型的权重与较晚披露比较。本研究衡量持仓接近程度，不衡量投资收益。","Freeze a decision in time, then compare its model weights with a later filing. This study measures holdings similarity, not investment returns.")}</p></div></header>
    <form class="lab-research-form" data-research-form>
      <label>${t("披露数据集 ","Disclosure dataset ")}<select name="dataset">
        <option value="synthetic"${activeCase === 'synthetic' ? ' selected' : ''}>${t("合成样本","Synthetic sample")}</option>
        <option value="sec"${activeCase === 'sec' ? ' selected' : ''}>${t("SEC 披露 · ARKK 样本","SEC filings \u00b7 ARKK sample")}</option>
        ${importedCase ? `<option value="imported"${activeCase === 'imported' ? ' selected' : ''}>${t("导入文件","Imported file")}</option>` : ''}
      </select></label>
      <label>${t("决策时间（UTC）","Decision time (UTC) ")}<input type="datetime-local" name="decision" value="${escapeHtml(selectedTime)}" required></label>
      <button class="lab-button lab-button-outline" type="submit">${t("运行研究 ","Run study ")}<span aria-hidden="true">↗</span></button>
    </form>
    <div class="lab-research-live" role="status" aria-live="polite"><p class="lab-research-badge" data-research-label></p><p class="lab-error" data-research-error hidden></p></div>
    <div class="lab-research-result" data-research-result></div>
    <details class="lab-details lab-research-details lab-import">
      <summary>${t("导入本地披露文件","Import a local disclosure file")}</summary>
      <p>${t("载入不超过 256 KB 的 JSON，仅保留在当前标签页。请使用有权使用的资料并核实实际公开时间。请自行核验导入来源。","Load a JSON file up to 256 KB. It stays in this tab. Import only data you\u2019re allowed to use and check the actual public timestamps. Verify the source before importing.")}</p>
      <label class="lab-file-label">${t("披露 JSON ","Disclosure JSON ")}<input data-research-file type="file" accept=".json,application/json"></label>
      <details><summary>${t("查看 JSON 格式","View the JSON format")}</summary><p>${t("每份快照使用唯一标识，权重为净资产百分比（10 代表 10%）。明确披露的现金使用 CASH。","Use unique identifiers per snapshot and percent of net assets (10 means 10%). Use CASH for explicitly reported cash.")}</p><pre>${escapeHtml(EXAMPLE)}</pre></details>
    </details>`;
}

function currentCase({activeCase, importedCase}) {
  return activeCase === 'imported' ? importedCase : CASES[activeCase];
}

export function renderReplication(initialCase = 'synthetic') {
  return `<fundroom-replication data-initial-case="${initialCase === 'sec' ? 'sec' : 'synthetic'}" class="lab-panel lab-research" aria-label="${t("披露拟合研究","Disclosure replication")}"></fundroom-replication>`;
}

if (globalThis.customElements && !customElements.get('fundroom-replication')) {
  customElements.define('fundroom-replication', class extends HTMLElement {
    connectedCallback() {
      const initial = this.dataset.initialCase === 'sec' ? 'sec' : 'synthetic';
      if (!workbenches.has(initial)) workbenches.set(initial, {activeCase:initial, selectedTime:CASES[initial].time});
      this.studyState = workbenches.get(initial);
      this.innerHTML = panelMarkup(this.studyState);
      const form = this.querySelector('[data-research-form]');
      const file = this.querySelector('[data-research-file]');
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        this.studyState.selectedTime = form.elements.decision.value;
        this.runStudy();
      });
      form.elements.dataset.addEventListener('change', () => {
        this.studyState.activeCase = form.elements.dataset.value;
        this.studyState.selectedTime = currentCase(this.studyState).time;
        form.elements.decision.value = this.studyState.selectedTime;
        this.runStudy();
      });
      file.addEventListener('change', () => void this.loadFile(file));
      this.runStudy();
    }

    runStudy() {
      const {selectedTime, activeCase} = this.studyState;
      const selected = currentCase(this.studyState);
      this.querySelector('[data-research-label]').textContent = selected.label;
      const error = this.querySelector('[data-research-error]');
      const output = this.querySelector('[data-research-result]');
      try {
        const iso = new Date(`${selectedTime}${selectedTime.length === 16 ? ':00' : ''}Z`).toISOString();
        const result = analyzeDisclosures(selected.data, iso);
        output.innerHTML = displayResult(result, activeCase);
        error.hidden = true;
      } catch {
        output.replaceChildren();
        error.hidden = false;
        error.textContent = t("请输入有效的 UTC 决策时间。","Enter a valid decision time in UTC.");
      }
    }

    async loadFile(field) {
      const [file] = field.files;
      if (!file) return;
      const error = this.querySelector('[data-research-error]');
      try {
        if (file.size > MAX_FILE_BYTES) throw new Error(t("请选择不超过 256 KB 的 JSON 文件。","Choose a JSON file up to 256 KB."));
        let data;
        try { data = JSON.parse(await file.text()); } catch { throw new Error(t("请选择有效的 JSON 披露文件。","Choose a valid JSON disclosure file.")); }
        if (!this.isConnected || field.files[0] !== file) return;
        const { snapshots } = validateDisclosures(data);
        const firstPublic = snapshots.reduce((first, snapshot) => snapshot.publicAt < first ? snapshot.publicAt : first, snapshots[0].publicAt);
        const minute = new Date(Math.ceil(Date.parse(firstPublic) / 60_000) * 60_000).toISOString().slice(0, 16);
        this.studyState.importedCase = { data, time: minute, get label() { return t("本地导入 · 来源未验证","Local import \u00b7 source not verified"); } };
        this.studyState.activeCase = 'imported';
        this.studyState.selectedTime = minute;
        const form = this.querySelector('[data-research-form]');
        if (!form.elements.dataset.querySelector('option[value="imported"]')) form.elements.dataset.add(new Option(t("导入文件","Imported file"), 'imported'));
        form.elements.dataset.value = this.studyState.activeCase;
        form.elements.decision.value = minute;
        this.runStudy();
      } catch (problem) {
        if (!this.isConnected || field.files[0] !== file) return;
        error.hidden = false;
        error.textContent = t('披露文件格式不符合要求：请检查版本、日期、唯一标的及 0–100% 的权重。', problem.message);
      }
    }
  });
}
