import { t } from './i18n.mjs';
import { exampleTrigger } from './studio-example.mjs';
import { fundResearchPreview } from './fund-research-preview.mjs';
import { renderVoiceButton } from './voice.mjs';

const safe = value => String(value ?? '').replace(/[&<>"']/gu, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const glyphs = {
  mic:'<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v3M9 21h6"/>',
  back:'<path d="m14 6-6 6 6 6"/>',
  next:'<path d="m9 6 6 6-6 6"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
};
const icon = name => `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyphs[name]}</svg>`;
const backButton = () => `<button type="button" class="ge-link ge-back" data-entry="back">${icon('back')}${t('返回','Back')}</button>`;
const heading = (title, description='') => `<h2 id="ge-title" tabindex="-1">${title}</h2>${description ? `<p class="ge-description">${description}</p>` : ''}`;
const choice = (href, name) => `<a class="ge-choice" href="#/${href}" data-entry-destination="${href}">${name}${icon('next')}</a>`;
const cta = (action, label, glyph='') => `<button class="ge-primary" type="button" data-entry="${action}">${glyph ? icon(glyph) : ''}${label}</button>`;

export function entryShell({step='home', draft='', issue='', state, busy, language} = {}) {
  if (step === 'home') return `<div class="guided-entry"><div class="ge-rail"><span class="ge-wordmark"><span class="seat-mark" aria-hidden="true"></span>${t('Fund Edition','Fund Edition')}</span><span class="ge-environment">${t('你的 AI 投资团队','Your AI investment team')}</span></div><section class="ge-home">${choice('fund',t('自建 AI 基金','Build an AI fund'))}${choice('lab',t('挑选 AI 基金','Explore AI funds'))}<button type="button" class="ge-link ge-settings" data-auth="menu">${icon('more')}${t('设置','Settings')}</button></section></div>`;
  const guide = state?.lobbyGuide;
  const question = t('你今天想做什么？','What would you like to do?');
  const example = t('可以说「帮我建一支稳健的基金」，或「我想研究 VWELX」。','Try “Build me a balanced fund” or “I want to research VWELX.”');
  let contents = '';
  if (step === 'browse') {
    contents = heading(t('从哪里开始？','Where would you like to start?')) +
      choice('fund',t('组建基金团队','Build a fund team')) +
      choice('lab',t('发现基金策略','Explore fund strategies'));
  }
  if (step === 'voice') {
    contents = heading(question,example) +
      `<div class="ge-voice">${renderVoiceButton({targetId:'lobby-message',label:t('开始说话','Start speaking'),lang:language})}
      <textarea aria-label="${t('识别文字','Recognized words')}" id="lobby-message" hidden>${safe(draft)}</textarea>
      <button class="ge-link" type="button" data-entry="type">${t('改用键盘','Use keyboard')}</button></div>`;
  }
  if (step === 'type' || step === 'review') {
    const available = state?.provider?.chatEnabled;
    contents = heading(step === 'review' ? t('这样说对吗？','Did I get that right?') : question,issue ? safe(issue) : example) +
      `<form data-form="lobby-guide" class="ge-composer"><label class="sr-only" for="lobby-message">${t('给 Maya 的话','Your message to Maya')}</label>
      <textarea id="lobby-message" name="message" rows="3" maxlength="800" required placeholder="${t('在这里输入…','Type here…')}">${safe(draft)}</textarea>
      <button type="submit" class="ge-primary" ${busy || !available || !draft.trim() ? 'disabled' : ''}>${t('发送给 Maya','Send to Maya')}${icon('next')}</button>
      ${available === false ? `<p><a href="#/connections">${t('连接 AI 经理','Connect the AI manager')}</a></p>` : ''}</form>`;
  }
  if (step === 'waiting') contents = heading(t('Maya 正在回复…','Maya is replying…'))+`<p class="ge-description" role="status">${t('正在将你的想法交给基金经理。','Sending your idea to the fund manager.')}</p>`;
  if (step === 'reply') {
    const destination = guide?.route === 'fund' ? t('和 Maya 继续组建基金','Continue in Studio')
      : guide?.fundAction === 'forward' ? t('查看团队的下一步','Visit the fund team')
      : guide?.fundAction === 'history' ? t('查看历史研究方案','See the historical study')
      : t('进入基金研究','Continue in Funds');
    contents = heading(t('Maya 的回复','A reply from Maya'),safe(guide?.text))+
      `<div class="ge-actions">${['fund','lab'].includes(guide?.route) ? `<button type="button" class="ge-primary" data-action="guided-route" data-id="${guide.route}">${destination}${icon('next')}</button>` : cta('type',t('继续交谈','Continue the conversation'))}
      <button type="button" class="ge-link" data-action="speak-message" data-text="${safe(guide?.text)}">${t('朗读回复','Read reply aloud')}</button></div>`;
  }
  return `<div class="guided-entry">
    <div class="ge-rail"><span class="ge-wordmark"><span class="seat-mark" aria-hidden="true"></span>${t("Fund Edition","Fund Edition")}</span><span class="ge-environment">${t('你的 AI 投资团队','Your AI investment team')}</span></div>
    <section class="ge-home"><div class="ge-portrait" role="img" aria-label="${t('虚构基金经理 Maya 的肖像','Portrait of fictional fund manager Maya')}"></div>
    <div class="ge-id"><strong>Maya</strong><i aria-hidden="true"></i>${t('你的 AI 基金经理','Your AI fund manager')}</div>
    <h1>${t('一起聊聊，\n你的投资想法。','Tell me your\ninvestment idea.')}</h1>
    <p class="ge-intro">${t('告诉我你想怎样组建基金，或想研究哪一只。','Tell me about the fund you want to build, or one you want to study.')}</p>
    ${cta('talk',t('和 Maya 说话','Talk with Maya'),'mic')}
    <a class="ge-link ge-browse" href="#/lab" data-entry-destination="lab">${t('发现基金策略','Explore fund strategies')}${icon('next')}</a>
    <span class="ge-foot">${t('模拟资金 · 独立执行记录','Paper money · Independent execution records')}</span>
    <button type="button" class="ge-link ge-settings" data-auth="menu">${icon('more')}${t('设置','Settings')}</button></section>
    ${contents ? `<dialog id="entry-sheet" aria-labelledby="ge-title"><div class="ge-sheet-inner">${backButton()}${contents}</div></dialog>` : ''}</div>`;
}

export function workspaceIntro(kind, hasTeam) {
  const isStudio = kind === 'fund';
  return `<section class="ge-workspace ${isStudio ? 'ge-studio' : 'ge-funds'}">
    <a href="#/" class="ge-link ge-work-back">${icon('back')}${t('返回大厅','Back to Maya')}</a>
    <div class="ge-work-grid">${isStudio ? '<div class="ge-work-art" aria-hidden="true"></div>' : fundResearchPreview()}<article>
    <span class="ge-work-kicker">${isStudio ? t('我的工作室','My Studio') : t('基金研究','Fund research')}</span>
    <h1>${isStudio ? (hasTeam ? t('回到你的基金团队。','Your team is here.') : t('你的基金，从一个想法开始。','Your fund starts with an idea.')) : t('想研究哪种投资方法？','Which investment approach interests you?')}</h1>
    <p>${isStudio ? t('和 Maya 说说你的策略，再一起挑选负责研究、风控与交易的同事。','Describe your idea to Maya, then assemble your research, risk and trading team.') : t('从 VWELX、ARKK 等主动基金开始，或研究巴菲特等投资者的公开方法。','Start with active funds such as VWELX and ARKK, or explore public approaches from investors like Buffett.')}</p>
    ${isStudio ? cta('open-studio',hasTeam ? t('回到我的团队','Open my team') : t('和 Maya 设计团队','Design my team with Maya'),'mic') + (!hasTeam ? exampleTrigger() : '') : `<div class="ge-collections">${cta('open-market',t('探索主动基金','Explore active funds'))}<button type="button" class="ge-link" data-entry="open-personas">${t('研究投资人物','Explore investor styles')}${icon('next')}</button></div>`}
    </article></div></section>`;
}

