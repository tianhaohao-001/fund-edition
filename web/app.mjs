import { suggestedAnswers } from './studio-answers.mjs';
import { requestJson, RequestConnectionError } from './json-request.mjs';
import {createWallet,numberedStudioName,portfolioNav} from './portfolio-wallet.mjs';
import {createBrokerDemo} from './broker-demo.mjs';
import { defersTeam, investmentTurns, legacyDraftAdjustments, pendingFormationPreview, userTurns, wantsTeamPreview } from './studio-formation.mjs';
import { spokenDraftChange } from './formation-recruiting.mjs';
import { workspaceIntro } from './guided-entry.mjs';
import { attachReception } from './reception-local.mjs';
import {bindWatch} from './studio-watch.mjs';
import { bindBriefing, clearBriefings } from './studio-review.mjs';
import { findCatalog } from './catalog-data.mjs';
import { exampleBrief, exampleTrigger, openStudioExample } from './studio-example.mjs';
import { createMeetingController } from './team-meeting.mjs';
import { accountPanel, menuPanel, readingControl, speechPreference } from './experience.mjs';
import { renderStudioDirectory } from './studio-directory.mjs';
import { CANDIDATES, renderOfficeRoom, renderSeatLog } from './team.mjs';
import {bindOfficeSeating} from './office-seating.mjs';
import { getLanguage, setLanguage, t } from './i18n.mjs';
import { paintLanguagePicker } from './language-picker.mjs';
import { recommendTeamStyle } from './team-templates.mjs';
import { renderLab, updateFeeEstimate, bindCatalogInteractions } from './lab.mjs';
import { renderVoiceButton, bindVoice, saveNarrationSpeed, speakFundReply, speakReply, stopSpeaking } from './voice.mjs';
import { escapeHtml, renderConnections, renderFund, renderPortfolio, renderTemplateNote, renderTemplateSuggestion, renderWelcome } from './views.mjs';

// Previously shared links and saved home-screen entries use path-based routes.
// Resolve them before reading the selected fund or attaching history listeners.
const publicEntry = new URL(location.href);
const publicPage = { '/studio': 'fund', '/funds': 'lab', '/team': 'team', '/portfolio':'portfolio' }[publicEntry.pathname.replace(/\/$/u, '')];
if (publicPage) {
  publicEntry.pathname = '/';
  if (publicPage === 'lab' && publicEntry.searchParams.has('id')) {
    if (!publicEntry.searchParams.has('catalog')) publicEntry.searchParams.set('catalog', publicEntry.searchParams.get('id'));
    publicEntry.searchParams.delete('id');
  }
  if (!publicEntry.hash.startsWith('#/')) publicEntry.hash = '/' + publicPage;
  history.replaceState(history.state, '', publicEntry);
}

const app = document.querySelector('#app');
const notices = document.querySelector('#notices');
const main = document.querySelector('#main-content');
const titles = { home: 'Fund Edition', fund: 'Build an AI fund', team: 'Team', office: 'Team office', lab: 'Explore AI funds', portfolio: 'My portfolio', 'fund-record':'Fund trading record', connections: 'Connections' };
const wallet=createWallet({api,newFund:startFundDesign});
const brokerDemo=createBrokerDemo({api,save:(workspaceRef,result)=>{
  if(state?.funds?.[0]?.id!==workspaceRef)return false;
  state.brokerDemo=result;
  return true;
}});
const selectedMembers = new Map();
const latestHires=new Map();
const pendingArrivals=new Map();
const retryKeys = new Map();
let state;
let accountUser;
let sheetMode;
let accountPending = false;
let accountEpoch = 0;
const changedOfficeChats = new Set();
let loadingOfficeChat = false;
const accountChannel = 'BroadcastChannel' in window ? new BroadcastChannel('morrowfolio-account-change') : null;
let lastLobbyIdea = '';
let entryDraft = '';
let entryWasDictated = false;
let entryIssue = '';
let entryFocus = '';
let entryLocation = location.hash;
const lobbySteps = new Set(['browse', 'voice', 'type', 'review', 'waiting', 'reply']);
function entryStep() {
  const value = history.state?.entryStep;
  return lobbySteps.has(value) ? value : 'home';
}
function setEntryStep(step, {replace = false, focus = ''} = {}) {
  entryFocus = focus;
  const method = replace ? 'replaceState' : 'pushState';
  history[method]({...history.state, entryStep:step}, '', location.href);
  render();
}
function enterWorkspace(kind, { catalogId, group, guided = false } = {}) {
  const before = location.href;
  const target = new URL(before);
  for (const key of ['catalog', 'group', 'id']) target.searchParams.delete(key);
  if (kind === 'lab' && catalogId) target.searchParams.set('catalog', catalogId);
  if (kind === 'lab' && group) target.searchParams.set('group', group);
  target.hash = '/' + kind;
  const guidedWorkspace = guided ? kind : null;
  if (target.href === before && (history.state?.guidedWorkspace || null) === guidedWorkspace) return;
  history.pushState({guidedWorkspace}, '', target);
  window.dispatchEvent(new HashChangeEvent('hashchange',{oldURL:before,newURL:location.href}));
}
let questionRunId;
const sheet = document.querySelector('#account-sheet');
let activeAction = '';
let error = '';
let errorMessages;
let guestSignIn=false;
let feedback = '';
let checkedAt;
let market;
let paper;
let ticker = 'NVDA';
let showCreate = false;
let draft;
let selectedStrategy;
let selectedRunId;
let movingMember;
let movingFundId;
let cleanupSeating;
const pendingMoves = new Set();
let dropTarget;
let chartObserver;
let voiceCleanup;
let pendingDesignMessage='';
let dictatedGuide=false;
let proMode = false;
let showRecruit = false;
let feedbackTimer;
const composerDrafts = new Map();
const requestedLanguage=new URLSearchParams(location.search).get('lang');
let voiceLanguage=['en-US','zh-CN'].includes(requestedLanguage) ? setLanguage(requestedLanguage) : getLanguage();

const meetings=createMeetingController({
  getActivity:async requestId=>(await api('/api/team/activity?requestId='+encodeURIComponent(requestId))).activity,
  getContext(type,id){
    if(type==='reviewResearch'){
      const review=state?.researchReviews?.[id],study=state?.researchStudies?.[id];
      return {review,study,activity:review?.activity,title:study?.ticker};
    }
    const fund=currentFund();
    const run=type==='recorded' ? fund?.runs?.find(run=>run.id===id) :
      fund?.id===id ? fund.runs?.[0] : null;
    return {run,activity:run?.activity,title:fund?.name};
  }
});

function localNotice(value) {
  const entries = [
    ['团队已入驻。', 'Your team has moved in.'],
    ['工作台任命已保存。', 'Desk assignment saved.'],
    ['成员已移出团队。', 'Teammate removed.'],
    ['职责已保存。', 'Responsibilities saved.'],
    ['基金授权已保存。', 'Fund brief saved.'],
    ['模拟审议已完成。', 'Paper review completed.'],
    ['回放计划已保存。', 'Replay schedule saved.'],
    ['共享回放已完成。', 'Shared replay completed.'],
    ['回测已完成。', 'Backtest completed.'],
    ['你的模拟基金已就绪。', 'Your paper fund is ready.'],
    ['已建立独立的模拟跟随账户。', 'Your paper follow account is open.'],
    ['已暂停跟随。', 'Following paused.'],
    ['已恢复跟随。', 'Following resumed.'],
    ['无法连接服务器，请检查网络后重试。', 'Failed to fetch'],
  ];
  const match = entries.find((pair) => pair.includes(value));
  if (match) return t(...match);
  if (typeof value === 'string' && value.endsWith(' joined the team.')) return t(`${value.slice(0, -17)} 已加入团队。`, value);
  return value;
}

function chooseLanguage(value) {
  if (voiceLanguage === value) return;
  const candidate = app.querySelector('[name="draft-talent"]:checked')?.value;
  const replacing = app.querySelector('[data-draft-target]')?.value;
  const formValues = [...app.querySelectorAll('form[data-form]')].map((form) => ({
    type: form.dataset.form,
    fields: [...form.elements].filter((field) => field.name && !['hidden', 'submit', 'button'].includes(field.type))
      .map((field) => ({ name: field.name, value: field.value, checked: field.checked })),
  }));
  stopSpeaking();
  voiceLanguage = setLanguage(value);
  const currentUrl=new URL(location.href);
  currentUrl.searchParams.set('lang',voiceLanguage);
  history.replaceState(history.state,'',currentUrl);
  render();
  if (sheet.open) renderSheet();
  if (candidate) {
    const chosen = app.querySelector('[name="draft-talent"][value="' + CSS.escape(candidate) + '"]');
    if (chosen) chosen.checked = true;
  }
  const target = app.querySelector('[data-draft-target]');
  if (target && replacing && [...target.options].some(option => option.value === replacing)) {
    target.value = replacing;
    target.dispatchEvent(new Event('change', {bubbles:true}));
  }
  for (const saved of formValues) {
    const form = app.querySelector(`form[data-form="${CSS.escape(saved.type)}"]`);
    if (!form) continue;
    for (const field of saved.fields) {
      const element = form.elements.namedItem(field.name);
      if (!element || !('value' in element)) continue;
      element.value = field.value;
      if (element.type === 'checkbox' || element.type === 'radio') element.checked = field.checked;
      if (element.tagName === 'TEXTAREA') form.classList.toggle('has-transcript', Boolean(element.value.trim()));
    }
  }
  window.dispatchEvent(new Event('morrowfolio-language-change'));
}

function composerKey(id) {
  const fund = currentFund();
  const owner = id === 'guide-message' ? state?.guide?.messages?.length ?? 0 : fund?.id ?? '';
  const member = ['studio-chat-message','studio-duty'].includes(id) ? ':' + (focusedDesk(fund) ?? '') : '';
  return `${page()}:${id}:${owner}${member}`;
}

function guideDraftKey() {
  return state?.guide?.id ? 'fundroom.maya.draft.'+state.guide.id : null;
}
function writeGuideDraft(text) {
  const key=guideDraftKey();
  if(!key)return;
  try {
    if(text)sessionStorage.setItem(key,JSON.stringify({turn:state.guide.messages?.at(-1)?.id,text}));
    else sessionStorage.removeItem(key);
  } catch {}
}
function restoreGuideDraft() {
  try {
    const saved=JSON.parse(sessionStorage.getItem(guideDraftKey()));
    return saved?.turn===state?.guide?.messages?.at(-1)?.id ? saved?.text||'' : '';
  } catch {return ''}
}

function rememberComposers() {
  for (const input of app.querySelectorAll('textarea[id]')) composerDrafts.set(input.dataset.composerKey || composerKey(input.id), input.value);
}

function finishRender() {
  for (const input of app.querySelectorAll('textarea[id]')) {
    input.dataset.composerKey = composerKey(input.id);
    if (composerDrafts.has(composerKey(input.id))) input.value = composerDrafts.get(composerKey(input.id));
    if(input.id==='guide-message'&&!input.value&&!pendingDesignMessage)input.value=restoreGuideDraft();
    input.form?.classList.toggle('has-transcript', Boolean(input.value.trim()));
  }
  for (const placeholder of app.querySelectorAll('[data-voice-for]')) {
    placeholder.innerHTML = renderVoiceButton({ targetId: placeholder.dataset.voiceFor, label: t('开始说话', 'Start speaking'), lang: voiceLanguage });
  }
  voiceCleanup = bindVoice(app, {
    onTranscript({target, final}) {
      if (target.id==='guide-message'&&final)dictatedGuide=true;
      if (target.id !== 'lobby-message' || page() !== 'home' || entryStep() !== 'voice') return;
      entryDraft = target.value;
      if (final) queueMicrotask(() => {
        entryWasDictated=true;
        if (entryStep() === 'voice' && page() === 'home') setEntryStep('review',{replace:true,focus:'#lobby-message'});
      });
    },
    onError(problem) {
      if (page() !== 'home' || entryStep() !== 'voice') return;
      entryIssue = problem.message;
      queueMicrotask(() => {
        if (entryStep() === 'voice' && page() === 'home') setEntryStep('type',{replace:true,focus:'#lobby-message'});
      });
    }
  });
  if (page() === 'lab') bindCatalogInteractions?.(app);
  attachReception(app, page(), voiceLanguage, (kind = 'fund') => {
    enterWorkspace(kind);
    if (kind === 'fund' && state && !state.provider?.chatEnabled) void refresh();
  }, state?.connections?.voice);
  const rail = app.querySelector('.ge-rail,.ge-workspace');
  if (rail) {
    const picker = document.createElement('div');
    picker.className = 'guide-language';
    rail.insertBefore(picker,rail.querySelector('.receiver-settings') ?? rail.firstChild);
    picker.insertAdjacentHTML('beforebegin',portfolioNav());
    paintLanguagePicker(picker,voiceLanguage,changeHeaderLanguage);
  }
  meetings.paint();
}

function changeHeaderLanguage(value) {
  chooseLanguage(value);
  const visible = [...document.querySelectorAll('.brand-language button[lang="' + value + '"]')].find(item => item.getClientRects().length);
  visible?.focus({preventScroll:true});
}

function studioFunds() {
  const funds = state?.funds ?? [];
  return funds.filter((fund, index) => !fund.replica && (index > 0 || fund.runs?.length || fund.chat?.length || fund.name !== 'My First Fund'));
}

function studioDisplayName(fund) {
  if (!fund || fund.replica) return fund?.name;
  const investable = state.funds.slice(1).filter(item => !item.replica);
  return numberedStudioName(fund, investable);
}
function storedFunds() {
  return studioFunds().length > 0 || state?.funds.some(fund => fund.replica);
}

function routeParams() {
  return new URLSearchParams(location.hash.split('?')[1]);
}

function designingFund() {
  return page() === 'fund' && (!storedFunds() || (routeParams().get('view') === 'create' && state?.guide?.phase !== 'created'));
}

function officeHash(id, view, member) {
  const params = new URLSearchParams({fund:id});
  if (view) params.set('view',view);
  if (member) params.set('member',member);
  return '#/office?' + params;
}

function startFundDesign() {
  if (activeAction || !state) return;
  const open = () => { proMode=false; location.hash = '#/fund?view=create'; };
  if (state.guide?.phase === 'created') {
    void mutate('resetDesignConversation',{}, {complete:open});
  } else open();
}

function page() {
  const path = location.hash.replace(/^#\/?/u, '').split('?')[0];
  return Object.hasOwn(titles, path) ? path : 'home';
}

function currentFund() {
  const route = page(), params = routeParams();
  const hasFundIdentity = ['office','team','fund-record'].includes(route) || (route === 'fund' && params.get('view') === 'watch');
  const id = hasFundIdentity ? params.get('fund') : null;
  if (id) return state?.funds.find(fund => fund.id === id);
  return state?.funds?.find(fund => fund.id === state.selectedFundId) ?? state?.fund ?? state?.funds?.[0];
}

function resetDraft() {
  const fund = currentFund();
  const permission = fund?.permissions ?? {};
  draft = fund && {
    fundId: fund.id,
    mandate: fund.mandate ?? '',
    maxWeightPercent: fund.maxWeightPercent ?? 12,
    scenarioId: fund.scenarioId ?? state.scenarios?.[0]?.id,
    provider: ['harnessrouter', 'committee'].includes(state.provider?.mode) ? state.provider.mode : 'replay',
    permissions: {
      allowBuy: permission.allowBuy !== false, allowSell: permission.allowSell !== false,
      symbols: permission.allowedSymbols?.join(', ') ?? '',
      open: permission.allowBuy === false || permission.allowSell === false || Boolean(permission.allowedSymbols?.length),
    },
  };
}

function setState(next, { reset = false } = {}) {
  state = next;
  if (reset || !draft || draft.fundId !== currentFund()?.id) resetDraft();
}

function normalizeStudioLocation() {
  if (!state) return;
  const route = page(), params = routeParams();
  const legacyWatch = route === 'fund' && params.get('view') === 'watch';
  if (route !== 'team' && route !== 'office' && !legacyWatch) return;
  const active = studioFunds();
  const fund = currentFund();
  const hasOffice = fund && (fund.replica || active.some(item => item.id === fund.id));
  const explicit = params.has('fund');
  if (explicit && !hasOffice) {
    if (route !== 'office') {
      history.replaceState(history.state, '', officeHash(params.get('fund')));
      entryLocation = location.hash;
    }
    return;
  }
  const selected = hasOffice ? fund : active[0] ?? state.funds.find(item=>item.replica);
  const colleague = selected?.team?.find(member => member.id === params.get('member') && member.role !== 'manager');
  const target = selected ? officeHash(selected.id, legacyWatch || params.get('view') === 'watch' ? 'watch' : undefined, colleague?.id) : '#/fund';
  if (target !== location.hash) {
    history.replaceState({...history.state, guidedWorkspace:null},'',target);
    entryLocation=location.hash;
  }
}

function drawChart(canvas, prices) {
  const points = (prices ?? []).filter(Number.isFinite);
  if (!canvas || points.length < 2) return;
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const pixelRatio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(pixelRatio, pixelRatio);

  ctx.lineWidth = 1;
  ctx.strokeStyle = '#b4d2b339';
  for (let index = 0; index < 4; index += 1) {
    const y = Math.round(10 + (height - 20) * index / 3) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const low = Math.min(...points);
  const high = Math.max(...points);
  const range = high - low || 1;
  const xAt = (index) => 6 + (width - 12) * index / (points.length - 1);
  const yAt = (price) => 15 + (height - 32) * (1 - (price - low) / range);
  const path = new Path2D();
  points.forEach((price, index) => {
    if (index === 0) path.moveTo(xAt(index), yAt(price));
    else path.lineTo(xAt(index), yAt(price));
  });
  const area = new Path2D(path);
  area.lineTo(xAt(points.length - 1), height);
  area.lineTo(xAt(0), height);
  area.closePath();
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, '#ddec934e');
  shade.addColorStop(1, '#ddec9302');
  ctx.fillStyle = shade;
  ctx.fill(area);
  ctx.strokeStyle = '#ddec93';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  ctx.beginPath();
  ctx.arc(xAt(points.length - 1), yAt(points.at(-1)), 3.5, 0, 2 * Math.PI);
  ctx.fillStyle = '#ddec93';
  ctx.fill();
}

function chartFor(scenario) {
  chartObserver?.disconnect();
  const canvas = document.querySelector('#scenario-chart');
  if (!canvas || !scenario) return;
  chartObserver = new ResizeObserver(() => drawChart(canvas, scenario.series));
  chartObserver.observe(canvas);
}

function resultFor(collection, strategyId) {
  return Array.isArray(collection) ? collection.find((result) => result.strategyId === strategyId) : collection?.[strategyId];
}

let restoredGuideVersion = '';
function restoreSavedFormation() {
  const guide=state?.guide;
  if (activeAction || !(state?.studioFormationVersion >= 2) || !app.querySelector('.guide-conversation') || !pendingFormationPreview(guide,state.researchDraft)) return;
  const version=JSON.stringify([guide.id,guide.draft?.id,guide.messages?.at(-1)?.id]);
  if (restoredGuideVersion === version) return;
  restoredGuideVersion=version;
  queueMicrotask(()=>{if (!activeAction && page()==='fund' && state?.guide===guide) void prepareTeamFromConversation();});
}

function render({ focus, scrollChat = false } = {}) {
  // Initial session and preferences requests may finish after a visitor starts dictating.
  if (page()==='home' && entryStep()==='voice' && app.querySelector('#entry-sheet[open] [data-voice-target]')) return;
  if(page()==='fund'&&app.querySelector('.guide-composer [data-voice-target][aria-pressed="true"]'))return;
  rememberComposers();
  cleanupSeating?.();
  cleanupSeating=undefined;
  movingMember=null;
  movingFundId=null;
  setDropTarget(null);
  app.classList.remove('crew-dragging');
  voiceCleanup?.();
  voiceCleanup = undefined;
  setLanguage(voiceLanguage);
  document.documentElement.lang = voiceLanguage;
  paintLanguagePicker(document.querySelector('.header-utilities [data-language-picker]'),voiceLanguage,changeHeaderLanguage);
  const labels = voiceLanguage.startsWith('zh') ? { fund: '自建 AI 基金', team: '团队', office: '团队办公室', lab: '挑选 AI 基金', portfolio: '组合', connections: '连接' } : { fund: 'Build an AI fund', team: 'Team', office: 'Team office', lab: 'Explore AI funds', portfolio: 'Portfolio', connections: 'Connections' };
  normalizeStudioLocation();
  const current = page();
  labels.fund=t('我的工作室','My Studio');
  labels.office=t('基金办公室','Fund office');
  const fundQuery = new URLSearchParams(location.search);
  const selectedCatalogId = current === 'lab' ? findCatalog(fundQuery.get('catalog'))?.id : undefined;
  if(current!=='connections')brokerDemo.leave();
  labels['fund-record']=t('基金交易明细','Fund trading record');
  labels.portfolio=t('我的投资组合','My portfolio');
  const walletHeader=document.querySelector('.header-utilities .wallet-nav');
  walletHeader.textContent=labels.portfolio;
  if(current==='portfolio')walletHeader.setAttribute('aria-current','page');else walletHeader.removeAttribute('aria-current');
  sheet.setAttribute('aria-label',t('账户与工作空间','Account and workspace'));
  const loginButton = document.querySelector('.header-account');
  loginButton.textContent = accountUser ? t('我的账户','Account') : t('登录','Sign in');
  loginButton.title = accountUser?.email ?? '';
  document.querySelector('.header-menu').setAttribute('aria-label',t('更多选项','More options'));
  const busy = Boolean(activeAction);
  for (const link of document.querySelectorAll('[data-page]')) {
    link.textContent = labels[link.dataset.page];
    if (link.dataset.page === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  for (const option of document.querySelectorAll('[name="interface-language"]')) option.checked = option.value === voiceLanguage;
  document.querySelector('.skip-link').textContent = t('跳到内容', 'Skip to content');
  document.querySelector('.site-nav').setAttribute('aria-label', t('工作区', 'Workspace'));

  document.querySelector('[data-footer-description]').textContent = current==='lab' && selectedCatalogId==='buffett' ? t('公开历史数据 · 模拟资金','Public historical data · Paper money') : t('虚构 AI 团队 · 模拟资金 · 合成工作室回放', 'Fictional AI teammates · Paper money · Synthetic studio replay');
  const plans = document.querySelector('[data-footer-plans]');
  plans.textContent = t('探索高级会员','Explore premium');
  plans.href = '/membership.html?lang=' + voiceLanguage;
  document.querySelector('[data-footer-portfolio]').textContent = t('组合', 'Portfolio');
  document.querySelector('[data-footer-connections]').textContent = t('连接', 'Connections');
  const publicName = 'Fund Edition';
  document.querySelectorAll('[data-brand-text]').forEach(label => { label.textContent = publicName; });
  document.title = current === 'home' ? publicName+' · '+t('你的 AI 投资团队','Your AI investment team') : `${labels[current] || titles[current]} · ${publicName}`;
  if (['office','fund-record'].includes(current) && currentFund()) document.title = studioDisplayName(currentFund()) + ' · ' + document.title;
  document.body.dataset.workspace = current === 'office' ? 'team' : current==='fund-record'?'portfolio':current;
  const guidedWorkspace = current === 'lab' && history.state?.guidedWorkspace === 'lab';
  document.body.toggleAttribute('data-guided-workspace', guidedWorkspace);
  notices.innerHTML = error ? `<div class="notice notice--error" role="alert"><span>${escapeHtml(errorMessages?.[voiceLanguage] || localNotice(error))}</span>${guestSignIn?'<button type="button" class="text-button" data-auth="login">'+t('登录继续','Sign in to continue')+'</button>':''}<button type="button" data-action="clear-notice" aria-label="${t('关闭错误提示', 'Dismiss error')}">×</button></div>`
    : feedback ? `<div class="notice notice--success" role="status"><span>${escapeHtml(localNotice(feedback))}</span><button type="button" data-action="clear-notice" aria-label="${t('关闭提示', 'Dismiss message')}">×</button></div>` : '';

  chartObserver?.disconnect();
  if (current === 'home') {
    const step = entryStep();
    app.innerHTML = renderWelcome(state?.lobbyPreview, {state, busy, language:voiceLanguage, step, draft:entryDraft, issue:entryIssue});
    finishRender();
    const dialog = app.querySelector('#entry-sheet');
    if (dialog) {
      dialog.showModal();
      const target = entryFocus ? app.querySelector(entryFocus) : dialog.querySelector('#ge-title');
      target?.focus({preventScroll:true});
      dialog.addEventListener('cancel',event=>{event.preventDefault();history.back();});
      dialog.addEventListener('click',event=>{if(event.target===dialog) history.back();});
    } else if (entryFocus) app.querySelector(entryFocus)?.focus({preventScroll:true});
    entryFocus = '';
    return;
  }
  if (guidedWorkspace && state) {
    const fund = currentFund();
    app.innerHTML = workspaceIntro(current, Boolean(fund && !designingFund()));
    finishRender();
    return;
  }

  if (!state) {
    app.innerHTML = error ? `<section class="panel load-error"><h1>${t('暂时无法打开基金团队。', 'The fund team could not open.')}</h1><button class="button button--primary" type="button" data-action="retry">${t('重试', 'Try again')}</button></section>`
      : `<div class="app-loading" role="status"><span class="app-spinner" aria-hidden="true"></span> ${t('正在打开基金团队…', 'Opening the fund team…')}</div>`;
    return;
  }

  const fund = currentFund();
  switch (current) {
    case 'lab': {
      const strategyId = selectedStrategy ?? state.strategies?.[0]?.id;
      app.innerHTML = renderLab({
        strategies: state.strategies, scenarios: state.scenarios, followers: state.followers,
        selectedStrategy: strategyId, busy,
        backtest: resultFor(state.backtests, strategyId) ?? state.backtest,
        sharedRun: resultFor(state.sharedRuns, strategyId) ?? state.sharedRun,
        sharedFollows: state.sharedFollows,
        catalogId: selectedCatalogId, catalogSection: fundQuery.get('group') === 'people' ? 'persona' : 'market',
        catalogChats: state.catalogChats, catalogAccounts: state.catalogAccounts,
        researchReviews:state.researchReviews,researchDraft:state.researchDraft, researchStudies:state.researchStudies, catalogBacktests: state.catalogBacktests, provider: state.provider, language: voiceLanguage,
      });
      break;
    }
    case 'portfolio': {
      app.innerHTML='<div data-wallet-root></div>';
      const productId=new URLSearchParams(location.hash.split('?')[1]).get('product')||new URLSearchParams(location.search).get('product');
      wallet.mount(app.firstElementChild,productId,state.funds?.[0]?.id,state.brokerDemo?.provider);
      break;
    }
    case 'fund-record':
      app.innerHTML = renderPortfolio({ fund, displayName:studioDisplayName(fund), selectedRunId });
      break;
    case 'connections':
      app.innerHTML = renderConnections({ state, busy, checkedAt, activeAction, market, paper, ticker });
      brokerDemo.mount(app.querySelector('[data-broker-demo-root]'),state.funds[0].id,state.brokerDemo);
      break;
    default: {
      const onboarding = designingFund();
      if (current === 'fund' && !onboarding) {
        app.innerHTML = renderStudioDirectory({funds:studioFunds(),displayName:studioDisplayName,researchFunds:state.funds.filter(item=>item.replica),guide:state.guide,busy,studioAllocations:state.studioAllocations});
        break;
      }
      if (!onboarding && (!fund || (!fund.replica && !studioFunds().some(item=>item.id===fund.id)))) {
        app.innerHTML = '<section class="page-head"><h1>'+t('找不到这间办公室','Office unavailable')+'</h1><a href="#/fund">← '+t('我的工作室','My Studio')+'</a></section>';
        break;
      }
      if (draft?.fundId !== fund?.id) resetDraft();
      const scenario = state.scenarios?.find(({ id }) => id === draft?.scenarioId) ?? state.scenarios?.[0];
      app.innerHTML = renderFund({ state, fund, displayName:studioDisplayName(fund), draft, scenario, showCreate, busy, activeAction,
        guide: state.guide, pendingDesignMessage: activeAction==='designConversation' ? pendingDesignMessage : '', onboarding, proMode, selectedId: fund ? focusedDesk(fund) : undefined,
        hasStudioFunds:storedFunds(), firstCapitalAllocation:!state.funds.slice(1).some(item=>!item.replica), showRecruit, arrivals:latestHires.get(fund?.id) ?? [],
        voiceMarkup: renderVoiceButton({ targetId: 'studio-chat-message', label: t('开始说话', 'Start speaking'), lang: voiceLanguage }),
        guideVoiceMarkup: renderVoiceButton({ targetId: 'guide-message', label: t('开始说话', 'Start speaking'), lang: voiceLanguage }),
      });
      if (onboarding) app.querySelector('.guide-setting')?.insertAdjacentHTML('beforeend',exampleTrigger());
      if (!onboarding && !fund?.replica) bindFundRoom(fund);
      bindBriefing(app, fund);
      if (fund?.hiringDraft && !onboarding && app.querySelector('.studio-chat-form [name="memberId"]')?.value===fund.team.find(m=>m.role==='manager')?.id) app.querySelector('.conversation-person')?.insertAdjacentHTML('afterend', hirePreview(fund.hiringDraft));
      if (scrollChat) {const log=app.querySelector('.studio-messages');if(log)log.scrollTop=log.scrollHeight;}
      chartFor(scenario);
    }
  }
  bindWatch(app,fund);
  finishRender();
  if (current==='fund') restoreSavedFormation();
  if (focus) app.querySelector(focus)?.focus({ preventScroll: true });
}

async function api(url, options) {
  let result;
  try { result = await requestJson(url, options); }
  catch (problem) {
    if (!(problem instanceof RequestConnectionError)) throw problem;
    const message = problem.resultUnknown
      ? t('连接中断，结果暂未确认。请刷新核对结果后再试。', 'The connection was interrupted and the result is unconfirmed. Refresh to check the result before trying again.')
      : t('暂时无法读取最新状态，请检查网络后刷新。', 'The latest state could not be loaded. Check your connection and refresh.');
    throw new Error(message);
  }
  const { response, data } = result;
  if (!response.ok) {
    const problem = new Error(data?.messages?.[voiceLanguage] || data?.error?.message || data?.error || data?.message || t(`服务器返回 ${response.status}。`, `The server returned ${response.status}.`));
    problem.status=response.status;
    problem.code=data?.code;
    problem.localizedMessages = data?.messages;
    guestSignIn=['guest-chat-limit','guest-voice-limit','guest-onboarding-capacity','sign-in-required'].includes(data?.code);
    throw problem;
  }
  if (!data) throw new Error(t('服务器返回了空内容，请重试。', 'The server returned an empty response. Please retry.'));
  return data;
}

function readNewReply(action, next, payload) {
  const fund = next.funds?.find(item => item.id === payload.fundId) ?? next.fund;
  const replies = { concierge:next.lobbyGuide, designConversation:next.guide?.messages?.at(-1),
    sendChat:fund?.chat?.at(-1), catalogChat:next.catalogChats?.[payload.catalogId]?.at(-1) };
  const reply = replies[action];
  if(!reply?.text||reply.role==='user')return;
  if (action==='sendChat' && (page()!=='office' || currentFund()?.id!==payload.fundId || focusedDesk(currentFund())!==payload.memberId)) return;
  const managerTeam=action==='sendChat'&&fund?.team?.some(m=>m.role==='manager'&&m.id===reply.memberId);
  if(action==='designConversation'||managerTeam)speakFundReply(reply.text,{lang:reply.language||voiceLanguage,topic:managerTeam?'fund:'+fund.id:'studio',responseId:reply.responseId,replyPlayback:next.connections?.voice?.replyPlayback});
  else speakReply(reply.text,{lang:voiceLanguage});
}

function hirePreview(draft) {
  const hires=draft.hires??[draft];
  return `<section class="hire-preview"><div><small>${t('招聘提案','Hiring proposal')}</small>${hires.map(member=>`<h3>${escapeHtml(member.name)}${member.title?' · '+escapeHtml(member.title):''}</h3><p>${escapeHtml(member.duty)}</p>`).join('')}</div><button class="button button--primary" type="button" data-action="confirm-hire" data-id="${escapeHtml(draft.id)}">${t(`确认雇用 ${hires.length} 位员工`,`Hire ${hires.length} ${hires.length===1?'teammate':'teammates'}`)}</button></section>`;
}

function renderSheet() {
  sheet.querySelector('.sheet-close').setAttribute('aria-label', t('关闭','Close'));
  const body=sheet.querySelector('.sheet-content');
  body.innerHTML = sheetMode === 'menu' ? menuPanel(accountUser) : accountPanel({user:accountUser,mode:sheetMode,pending:accountPending});
  for (const input of body.querySelectorAll('[name="interface-language"]')) input.checked=input.value===voiceLanguage;
}

function openSheet(mode) {
  if (accountPending) return;
  sheetMode=mode;
  renderSheet();
  if (!sheet.open) sheet.showModal();
  sheet.querySelector(mode === 'menu' ? '.sheet-close' : 'input, .account-link')?.focus();
}

function clearIdentityState() {
  changedOfficeChats.clear();
  pendingMoves.clear();
  cleanupSeating?.();
  accountEpoch++;
  wallet.clear();
  clearBriefings();
  meetings.clear();
  stopSpeaking();
  voiceCleanup?.();
  app.replaceChildren();
  latestHires.clear();pendingArrivals.clear();selectedMembers.clear(); retryKeys.clear(); composerDrafts.clear();
  state = undefined; draft = undefined; selectedRunId = undefined;
  proMode=false; showRecruit=false;
  entryDraft=''; entryWasDictated=false; entryIssue=''; entryFocus='';
  if (page()==='home' && entryStep()!=='home') history.replaceState({...history.state,entryStep:'home'},'',location.href);
  market=undefined; paper=undefined; checkedAt=undefined; lastLobbyIdea=''; questionRunId=undefined;
  error=''; feedback=''; errorMessages=undefined;
}

async function authenticate(mode, form) {
  if (activeAction || accountPending) return;
  accountPending = true; activeAction='auth';
  const button = form?.querySelector('[type="submit"]') ?? sheet.querySelector('[data-auth="logout"]');
  if (button) button.disabled=true;
  const fields = form ? new FormData(form) : null;
  try {
    const result=await api('/api/auth/'+mode,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields ? {email:fields.get('email'),password:fields.get('password')} : {})});
    clearIdentityState();
    accountUser=result.user;
    accountChannel?.postMessage('changed');
    sheet.close();
    if(accountUser && new URL(location.href).searchParams.get('auth')==='membership'){
      location.assign(membershipDestination());
      return;
    }
    setState(await api('/api/state?language='+encodeURIComponent(voiceLanguage)),{reset:true});
  } catch (problem) {
    const status=sheet.querySelector('.auth-error');
    if (sheet.open && status) status.textContent=problem.message;
    else {error=problem.message;errorMessages=problem.localizedMessages;}
  } finally {
    if (button) button.disabled=false;
    accountPending=false;activeAction='';render();
  }
}

// Only the log changes on a peer's message. Leave the active composer, recording and focus in place.
async function syncOfficeChat() {
  const fund = currentFund();
  if (loadingOfficeChat || activeAction || document.hidden || page() !== 'office' || !changedOfficeChats.has(fund?.id)) return;
  const log = app.querySelector('#studio-chat .studio-messages');
  if (!log || log.contains(document.activeElement) || (!window.getSelection()?.isCollapsed && log.contains(window.getSelection()?.anchorNode))) return;
  const epoch = accountEpoch;
  const snapshot = state;
  changedOfficeChats.delete(fund.id);
  loadingOfficeChat = true;
  let retry = true;
  try {
    const next = await api('/api/state?language=' + encodeURIComponent(voiceLanguage));
    if (epoch !== accountEpoch || next.funds?.[0]?.id !== state?.funds[0]?.id || page() !== 'office' || currentFund()?.id !== fund.id) return;
    if (activeAction || snapshot !== state || !log.isConnected || log.contains(document.activeElement)) {
      changedOfficeChats.add(fund.id);
      return;
    }
    const fresh = next.funds.find(item => item.id === fund.id);
    const member = fund.team.find(item => item.id === focusedDesk(fund));
    if (!fresh || !member) return;
    fund.chat = fresh.chat;
    const template = document.createElement('template');
    template.innerHTML = renderSeatLog({chat:fund.chat, member, atDesk:!fund.replica});
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 12;
    log.replaceChildren(...template.content.firstElementChild.childNodes);
    if (atEnd) log.scrollTop = log.scrollHeight;
  } catch {
    if (epoch === accountEpoch) changedOfficeChats.add(fund.id);
    retry = false;
  } finally {
    loadingOfficeChat = false;
    if (retry && epoch === accountEpoch && changedOfficeChats.size) queueMicrotask(syncOfficeChat);
  }
}
document.addEventListener('visibilitychange', syncOfficeChat);
app.addEventListener('focusout', () => { if (changedOfficeChats.size) queueMicrotask(syncOfficeChat); });

if(accountChannel) accountChannel.onmessage=event=>{
  if (event.data?.type === 'fund-chat' && state?.funds[0]?.id === event.data.workspace && state.funds.some(fund=>fund.id===event.data.fund)) {
    changedOfficeChats.add(event.data.fund);
    void syncOfficeChat();
    return;
  }
  if(event.data!=='changed') return;
  clearIdentityState(); accountUser=null; sheet.close(); activeAction=''; render();
  window.location.reload();
};
sheet.addEventListener('submit', event => {
  const form=event.target.closest('[data-auth-form]');
  if (form) {event.preventDefault();void authenticate(form.dataset.authForm,form);}
});
sheet.addEventListener('click', event => {
  if (event.target===sheet || event.target.closest('[data-dismiss-dialog]')) sheet.close();
});
document.addEventListener('click', event => {
  const control=event.target.closest('[data-auth]');
  if (!control || activeAction || accountPending) return;
  if (control.dataset.auth==='logout') void authenticate('logout');
  else openSheet(control.dataset.auth);
});
async function loadAccount() {
  try {accountUser=(await api('/api/auth/session')).user;}
  catch {accountUser=null;}
  render();
}

async function refresh({ connection = false, openingOffice = false } = {}) {
  if (activeAction) return;
  activeAction = 'refresh';
  error = '';
  feedback = '';
  if (openingOffice) {
    rememberComposers();
    cleanupSeating?.();
    voiceCleanup?.();
    app.innerHTML='<div class="app-loading" role="status">'+t('正在打开基金办公室…','Opening your fund office…')+'</div>';
    main.focus({preventScroll:true});
    window.scrollTo(0,0);
  } else render();
  try {
    const epoch=accountEpoch;
    const next=await api(`/api/state?language=${encodeURIComponent(voiceLanguage)}`);
    if(epoch!==accountEpoch)return;
    setState(next);
    if (connection) checkedAt = new Date().toISOString();
  } catch (problem) {
    error = problem.message || t('无法连接服务器。', 'The server could not be reached.');
    errorMessages = problem.localizedMessages;
  } finally {
    activeAction = '';
    render({ focus: connection ? '[data-action="refresh-connections"]' : null });
  }
}

async function checkConnection(kind) {
  if (activeAction) return;
  const isMarket = kind === 'market';
  activeAction = `${kind}-check`;
  error = '';
  feedback = '';
  if (isMarket) market = null;
  else paper = null;
  render();
  try {
    const path = isMarket ? `/api/market/snapshot?symbol=${encodeURIComponent(ticker)}` : '/api/paper/account';
    const result = await api(path);
    if (isMarket) market = result;
    else paper = result;
  } catch (problem) {
    error = problem.message || t('暂时无法检查连接。', 'The connection could not be checked.');
    errorMessages = problem.localizedMessages;
  } finally {
    activeAction = '';
    render({ focus: isMarket ? '#market-ticker' : '[data-action="paper-check"]' });
  }
}

function newRequestId() {
  return crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(18)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function mutate(action, payload, options = {}) {
  if (activeAction) return false;
  activeAction = action;
  guestSignIn=false;
  error = '';
  feedback = '';
  const retryKey = ['adjustDraftRoster','reviewResearch','concierge','prepareResearch','confirmResearch','confirmHire','confirmAssignment','prepareSoloStudio','prepareTeamStudio','sendChat','runScenario', 'runShared', 'designConversation', 'resetDesignConversation', 'confirmFundDraft', 'catalogBuy', 'catalogSell', 'catalogBacktest', 'catalogChat'].includes(action) ? JSON.stringify([action, Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'language'))]) : '';
  if (retryKey) {
    if (!retryKeys.has(retryKey)) retryKeys.set(retryKey, newRequestId());
    payload = { ...payload, requestId: retryKeys.get(retryKey) };
  }
  const finishMeeting=['reviewResearch','runScenario'].includes(action) ? meetings.begin(action,payload.catalogId||payload.fundId,payload.requestId) : null;
  if (options.pending) options.pending();
  if (!options.quiet) render({ scrollChat: options.scrollChat });
  const epoch=accountEpoch;
  let succeeded = false;
  try {
    const next = await api('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload, language: voiceLanguage }),
    });
    if (accountEpoch!==epoch) return false;
    setState(next, { reset: options.reset });
    if (action==='sendChat') accountChannel?.postMessage({type:'fund-chat', workspace:next.funds?.[0]?.id, fund:payload.fundId});
    if (retryKey) retryKeys.delete(retryKey);
    options.complete?.(next);
    let readDictatedReply=false;
    if (action==='concierge' && entryWasDictated && page()==='home' && entryStep()==='reply') {
      try {readDictatedReply=localStorage.getItem('morrowfolio.read-aloud')===null;} catch {}
    }
    if(action==='designConversation'&&page()==='fund'&&dictatedGuide) {
      try {readDictatedReply=localStorage.getItem('morrowfolio.read-aloud')===null} catch {}
    }
    if ((action!=='designConversation'||page()==='fund') && (speechPreference() || readDictatedReply)) readNewReply(action, next, payload);
    if(action==='designConversation')dictatedGuide=false;
    feedback = options.message ?? '';
    succeeded = true;
  } catch (problem) {
    error = problem.message || t('操作暂未完成，请重试。', 'That action could not be completed. Please retry.');
    errorMessages = problem.localizedMessages;
  } finally {
    if(finishMeeting)await finishMeeting(succeeded);
    activeAction = '';
    render({ focus: succeeded ? options.focus : options.errorFocus, scrollChat: options.scrollChat });
    clearTimeout(feedbackTimer);
    if (succeeded && feedback) feedbackTimer = setTimeout(() => { feedback = ''; if (!error) notices.replaceChildren(); }, 3200);
    if (changedOfficeChats.size) queueMicrotask(syncOfficeChat);
    if (succeeded) options.afterRender?.();
    else if(epoch===accountEpoch) {
      options.restore?.();
      for(const input of app.querySelectorAll('textarea[id]')) {
        if(input.value.trim()) { input.form?.classList.add('has-transcript');composerDrafts.set(composerKey(input.id),input.value); }
      }
    }
  }
  return succeeded;
}

function snapshotDraft(form) {
  const fields = new FormData(form);
  draft.mandate = fields.get('mandate');
  draft.maxWeightPercent = fields.get('maxWeightPercent');
  draft.scenarioId = fields.get('scenarioId');
  draft.provider = fields.get('provider') ?? 'replay';
  draft.permissions = {
    allowBuy: fields.has('allowBuy'), allowSell: fields.has('allowSell'),
    symbols: fields.get('allowedSymbols') ?? '', open: Boolean(form.querySelector('.permission-details')?.open),
  };
}

function portfolioManager(fund) {
  return fund?.team.find(member => member.role === 'manager' && member.desk !== 'bench') ?? fund?.team.find(member => member.role === 'manager');
}
function focusedDesk(fund) {
  if(!fund)return undefined;
  const requested = page() === 'office' && !fund.replica ? routeParams().get('member') : selectedMembers.get(fund.id);
  return fund.team?.find(member => member.id === requested)?.id ?? portfolioManager(fund)?.id;
}
function rememberDesk(fundId,id) {
  const fund = currentFund();
  if (page() === 'office' && fund?.id === fundId && !fund.replica) {
    const member = fund.team?.find(person => person.id === id);
    if (!member) return;
    const target = officeHash(fundId, routeParams().get('view'), member.role === 'manager' ? undefined : member.id);
    if (target !== location.hash) history.replaceState(history.state, '', target);
    entryLocation = location.hash;
    return;
  }
  selectedMembers.set(fundId,id);
}
function openDeskComposer() {
  const field=app.querySelector('#studio-chat form[data-form="chat"] textarea');
  if(!field)return;
  field.form.hidden=false;field.form.classList.add('is-typing');field.focus();
}

function selectMember(fund, id) {
  stopSpeaking();
  questionRunId=undefined;
  rememberDesk(fund.id,id);
  render();
  jumpTo('studio-chat');
}

function jumpTo(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start' });
}

// Older local review servers retain the visitor's conversation in their own
// SQLite store. Use their existing draft operation on that same origin.
async function prepareTeamFromConversation() {
  if (activeAction || !state?.guide || state.guide.phase === 'created') return;
  const options={afterRender:()=>{
    const heading=document.getElementById('blueprint-heading');
    heading?.focus({preventScroll:true});
    heading?.closest('.formation-spread')?.scrollIntoView({block:'start'});
  }};
  if (state.studioFormationVersion >= 2) return mutate('prepareTeamStudio',{},options);
  const guide=state.guide, profile=guide.profile || {}, turns=userTurns(guide);
  const {name,permissions}=legacyDraftAdjustments(guide);
  const flags=[
    permissions.allowBuy===true?t('允许模拟买入。','Allow buys.'):t('禁止买入。','No buys.'),
    permissions.allowSell===true?t('允许模拟卖出。','Allow sells.'):t('禁止卖出。','No sells.'),
    name?t('基金名字叫「'+name+'」。','Name it "'+name+'".'):''
  ].filter(Boolean).join(' ');
  const request=(investmentTurns(guide).length?t(
    '按刚才的目标、基金名称和约定的人选及分工拟定模拟蓝图。未谈妥的研究设置你来决定，仅作示例。',
    'Prepare a paper blueprint using the goal, fund name, people and duties we discussed. Use sensible defaults for any missing research settings as examples.'
  ):t('我想从研究公司经营和风险开始。请推荐一名研究员和一名风险分析师作为候选人。未谈妥的研究设置你来决定，仅作示例。','I want to start with business research and risk. Suggest a research analyst and an independent risk analyst for my team. Use sensible defaults for missing research settings as examples.'))+' '+flags;
  const needsStaffing = !Array.isArray(profile.staffing) && (!investmentTurns(guide).length || turns.some(turn=>/\bhire|\brecruit|analyst|trader|researcher|招|聘|雇|研究员|分析师|交易员|负责/iu.test(turn.text)));
  return mutate('designConversation',{message:request.trim(),provider:needsStaffing && state.provider?.chatEnabled?'harnessrouter':'replay'},options);
}

const workstations = {
  management:['管理桌','management'], research:['研究桌','research'], risk:['风控桌','risk'],
  execution:['模拟执行桌','paper execution'], bench:['候补席','the bench'],
};

function visibleFundRoom(id) {
  const room=app.querySelector('[data-office-room]');
  return page()==='office' && currentFund()?.id===id && room?.dataset.fundId===id ? room : null;
}

function bindFundRoom(fund) {
  if (!fund) return;
  cleanupSeating=bindOfficeSeating(app,{
    fundId:fund.id,
    onFirstVisible:room=>{
      if (!visibleFundRoom(fund.id) || !pendingArrivals.has(fund.id)) return;
      for (const id of pendingArrivals.get(fund.id)) room.querySelector('[data-office-member="'+CSS.escape(id)+'"]')?.classList.add('is-seat-arriving');
      pendingArrivals.delete(fund.id);
    },
    isBusy:()=>Boolean(activeAction) || pendingMoves.has(fund.id) || Boolean(app.querySelector('[data-voice-target][aria-pressed="true"]')),
    onMove:(memberId,desk)=>visibleFundRoom(fund.id) ? assignMember(fund,memberId,desk) : false,
  });
}

function paintSeatReceipt(fund, member, previousDesk, message, confirmed) {
  const room=visibleFundRoom(fund.id);
  if (!room) return;
  const focused=document.activeElement;
  const roomHadFocus=room.contains(focused);
  // A move between active desks leaves the conversation, dictation and draft DOM untouched.
  const changesConversation=focusedDesk(fund)===member.id && previousDesk!==member.desk &&
    (previousDesk==='bench' || member.desk==='bench');
  if (changesConversation && !app.querySelector('[data-voice-target][aria-pressed="true"]')) {
    const fieldId=focused?.id;
    const range=focused?.tagName==='TEXTAREA' ? [focused.selectionStart,focused.selectionEnd,focused.selectionDirection] : null;
    render();
    const next=fieldId && document.getElementById(fieldId);
    if (next && !roomHadFocus) {
      next.focus({preventScroll:true});
      if (range && next.tagName==='TEXTAREA') next.setSelectionRange(...range);
    }
  } else {
    const template=document.createElement('template');
    template.innerHTML=renderOfficeRoom({team:fund.team, fundId:fund.id, fundName:studioDisplayName(fund), selectedId:focusedDesk(fund), arrivals:latestHires.get(fund.id) ?? [], showRecruit});
    cleanupSeating?.();
    room.replaceWith(template.content);
    bindFundRoom(fund);
    if (focusedDesk(fund)===member.id) for (const choice of app.querySelectorAll('#studio-chat [data-action="assign"]')) {
      choice.disabled=choice.dataset.desk===member.desk;
      choice.setAttribute('aria-pressed',String(choice.disabled));
    }
  }
  const currentRoom=visibleFundRoom(fund.id);
  if (!currentRoom) return;
  const occupant=currentRoom.querySelector('[data-office-member="'+CSS.escape(member.id)+'"]');
  if (confirmed) {
    occupant?.classList.add('is-seat-arriving');
    currentRoom.querySelector('[data-office-desk="'+CSS.escape(member.desk)+'"]')?.classList.add('did-seat-drop');
  }
  const status=currentRoom.querySelector('[data-seat-announcement]');
  if (status) status.textContent=message;
  if (roomHadFocus) occupant?.querySelector('[data-seat-handle]')?.focus({preventScroll:true});
}

async function assignMember(fund, memberId, desk) {
  const member=fund.team.find(person=>person.id===memberId);
  if (!member || !Object.hasOwn(workstations,desk) || member.desk===desk || activeAction || pendingMoves.has(fund.id)) return false;
  if (fund.replica) return mutate('updateMember', {fundId:fund.id,memberId,desk}, {quiet:true,message:'Desk assignment saved.'});
  if (!visibleFundRoom(fund.id)) return false;
  const expectedDesk=member.desk, epoch=accountEpoch, language=voiceLanguage;
  const key=JSON.stringify(['move-seat',fund.id,memberId,expectedDesk,desk]);
  if (!retryKeys.has(key)) retryKeys.set(key,newRequestId());
  const requestId=retryKeys.get(key);
  pendingMoves.add(fund.id);
  let next, confirmed=false, message;
  try {
    const response=await api('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'updateMember',fundId:fund.id,memberId,expectedDesk,desk,requestId,language})});
    next=response.funds?.find(item=>item.id===fund.id)?.team.find(person=>person.id===memberId);
    confirmed=next?.desk===desk;
    if (!confirmed) throw new Error(t('工位尚未确认，请重新核对。','The desk assignment could not be confirmed. Check the room again.'));
    retryKeys.delete(key);
    message=t(member.name+' 已移至'+workstations[desk][0]+'。',member.name+' moved to '+workstations[desk][1]+'.');
  } catch (problem) {
    if (problem.status>=400 && problem.status<500) retryKeys.delete(key);
    message=problem.message;
    if (problem.code==='desk-changed' && epoch===accountEpoch) {
      try {
        const fresh=await api('/api/state?language='+encodeURIComponent(voiceLanguage));
        next=fresh.funds?.find(item=>item.id===fund.id)?.team.find(person=>person.id===memberId);
        message=t('工位已在其他窗口更新。请按当前座位重新选择。','This desk changed in another window. Choose again using the updated room.');
      } catch { /* Keep the original error until the visitor can refresh. */ }
    }
  } finally {
    if (epoch===accountEpoch) pendingMoves.delete(fund.id);
  }
  if (epoch!==accountEpoch) return false;
  const savedFund=state?.funds.find(item=>item.id===fund.id);
  const savedMember=savedFund?.team.find(person=>person.id===memberId);
  if (!savedMember) return false;
  const previousDesk=savedMember.desk;
  if (next) savedMember.desk=next.desk;
  paintSeatReceipt(savedFund,savedMember,previousDesk,message,confirmed);
  return confirmed;
}

function highlightPlacement(id) {
  if (app.querySelector('[data-office-room]')) return;
  app.querySelector(`[data-drag-member="${CSS.escape(id)}"]`)?.classList.add('studio-member--landed');
  app.querySelector(`.inh-pin[data-id="${CSS.escape(id)}"]`)?.classList.add('inh-arriving');
} 

function announceHire(fundId,ids) {
  const team=state?.funds.find(fund=>fund.id===fundId)?.team??[];
  const seated=ids.map(id=>team.find(m=>m.id===id)).filter(Boolean);
  if(!seated.length)return;
  const idsOnTeam=seated.map(member=>member.id);
  latestHires.set(fundId,idsOnTeam);
  pendingArrivals.set(fundId,new Set([...(pendingArrivals.get(fundId) ?? []),...idsOnTeam]));
  showRecruit=false;

}

function recommendTeam() {
  const input = app.querySelector('#style-brief');
  const suggestion = app.querySelector('#template-suggestion');
  const announcement = app.querySelector('#template-announcement');
  if (!input || !suggestion || !announcement) return;
  const match = recommendTeamStyle(input.value);
  const template = state.teamTemplates?.find(({ id }) => id === match?.id);
  suggestion.innerHTML = renderTemplateSuggestion(template, match?.reason);
  announcement.textContent = template ? `${template.label} recommended. Review the seats before choosing a team.` : 'Describe how you would like the fund to invest.';
  if (!template) input.focus();
}

function useTeamTemplate(id) {
  const select = app.querySelector('#fund-template');
  const template = state.teamTemplates?.find((item) => item.id === id);
  if (!select || !template) return;
  select.value = id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  app.querySelector('#template-suggestion')?.replaceChildren();
  const announcement = app.querySelector('#template-announcement');
  if (announcement) announcement.textContent = `${template.label} selected. Create the fund to apply this setup.`;
  select.focus();
}

app.addEventListener('input',event=>{
  if (page() !== 'home' || event.target.id !== 'lobby-message') return;
  entryDraft=event.target.value;
  const send=event.target.form?.querySelector('[type="submit"]');
  if (send) send.disabled=!entryDraft.trim() || !state?.provider?.chatEnabled || Boolean(activeAction);
});

app.addEventListener('click',event=>{
  const destination = event.target.closest('[data-entry-destination]');
  if (destination && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    enterWorkspace(destination.dataset.entryDestination, {guided:true});
    return;
  }
  const control=event.target.closest('[data-entry]');
  if (!control) return;
  switch(control.dataset.entry) {
    case 'talk':
      entryWasDictated=false;
      entryIssue='';
      if (entryDraft.trim()) setEntryStep('type',{focus:'#lobby-message'});
      else {
        setEntryStep('voice');
        app.querySelector('#entry-sheet [data-voice-target]')?.click();
      }
      break;
    case 'browse':
      setEntryStep('browse');
      break;
    case 'back':
      history.back();
      break;
    case 'type':
      if(entryStep()==='reply') {
        entryDraft=''; entryWasDictated=false; composerDrafts.delete(composerKey('lobby-message'));
      }
      entryIssue='';
      setEntryStep('type',{replace:entryStep()==='voice',focus:'#lobby-message'});
      break;
    case 'studio-example': {
      const hasPersonalDraft=()=>Boolean(app.querySelector('#guide-message')?.value.trim() ||
        composerDrafts.get(composerKey('guide-message'))?.trim() ||
        state?.guide?.draft || state?.guide?.messages?.some(message=>message.role==='user'));
      openStudioExample({hasDraft:hasPersonalDraft,onUse:()=>{
        const existing=hasPersonalDraft();
        if (page()!=='fund') return;
        if(history.state?.guidedWorkspace==='fund') {
          history.pushState({...history.state,guidedWorkspace:null},'',location.href);
          render();
        }
        const field=app.querySelector('#guide-message');
        if(!field) return;
        const revision=field.closest('details');
        if(revision) revision.open=true;
        field.form?.classList.add('is-typing');
        if(!existing && !field.value.trim()) field.value=exampleBrief();
        field.dispatchEvent(new Event('input',{bubbles:true}));
        field.focus();
      }});
      break;
    }
    case 'open-studio':
    case 'open-market':
    case 'open-personas':
      if (control.dataset.entry === 'open-studio') enterWorkspace('fund');
      else enterWorkspace('lab', {group: control.dataset.entry === 'open-market' ? 'markets' : 'people'});
      break;
  }
});

document.addEventListener('click', (event) => {
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    main.focus();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id, desk } = button.dataset;
  const fund = currentFund();
  if (action === 'clear-notice') {
    feedback = '';
    error = '';
    notices.replaceChildren();
    return;
  }
  if (action === 'toggle-typing') {
    const form = button.form || button.closest('form');
    form?.classList.add('is-typing');
    form?.querySelector('textarea')?.focus();
    return;
  }
  if (action === 'clear-transcript') {
    const form = button.closest('form');
    const input = form?.querySelector('textarea');
    if (input) { input.value = ''; composerDrafts.delete(composerKey(input.id)); if(input.id==='guide-message'){writeGuideDraft('');dictatedGuide=false} }
    form?.classList.remove('has-transcript', 'is-typing');
    return;
  }
  if (action === 'read-preference') {
    const enabled=!speechPreference();
    try {localStorage.setItem('morrowfolio.read-aloud',String(enabled));} catch {}
    if (!enabled) stopSpeaking();
    for(const control of document.querySelectorAll('[data-action="read-preference"]')) control.outerHTML=readingControl();
    return;
  }
  if (action === 'speak-message') {
    if (button.dataset.speaking === 'true') { stopSpeaking(); button.dataset.speaking = 'false'; button.textContent = t('读给我听 ♫', 'Read aloud ♫'); return; }
    stopSpeaking();
    const started = speakFundReply(button.dataset.text, {lang:button.dataset.voiceLang || voiceLanguage,
      topic:button.dataset.voiceManager==='true'&&fund?'fund:'+fund.id:'studio',responseId:button.dataset.voiceReceipt,replyPlayback:state?.connections?.voice?.replyPlayback, onState: ({ state: speakingState }) => {
      button.dataset.speaking = String(['loading','speaking'].includes(speakingState));
      button.textContent = speakingState === 'speaking' ? t('停止朗读 ■', 'Stop reading ■') : t('读给我听 ♫', 'Read aloud ♫');
    } });
    if (!started) button.textContent = t('此浏览器暂不支持朗读', 'Speech is unavailable');
    return;
  }
  if (activeAction) return;
  switch (action) {
    case 'open-draft-market':
      jumpTo('draft-recruiting');break;
    case 'add-draft-seat':
    case 'replace-draft-seat':
    case 'remove-draft-seat': {
      const draftId=state.guide?.draft?.id;
      if(!draftId)break;
      const desk=button.closest('.formation-recruit');
      const operation=action.split('-')[0];
      const candidateId=desk?.querySelector('[name="draft-talent"]:checked')?.value;
      const memberId=operation==='remove'?id:desk?.querySelector('[data-draft-target]')?.value;
      void mutate('adjustDraftRoster',{draftId,operation,...(candidateId?{candidateId}:{}),...(memberId?{memberId}:{})},{
        quiet:true,afterRender:()=>{const el=app.querySelector('.formation-status');el?.focus?.({preventScroll:true});}
      });
      break;
    }
    case 'prepare-team':
      void prepareTeamFromConversation(); break;
    case 'change-team': {
      const input=app.querySelector('#guide-message');
      if(input){const details=input.closest('details');if(details)details.open=true;input.form.classList.add('is-typing');input.placeholder=t('比如：让小林改为跟踪盈利，新增一位独立风险研究员。','For example: Have Lin track earnings and add an independent risk reviewer.');input.focus();}
      break;
    }
    case 'describe-hires': {
      const manager=fund?.team.find(m=>m.role==='manager');
      if(!manager) break;
      showRecruit=false; selectMember(fund,manager.id);openDeskComposer();
      const field=app.querySelector('#studio-chat-message');
      if(field){field.placeholder=t('例如：招小林查财报、阿杰做风险压力测试。','For example: Hire Lin to review filings and Jay to stress-test risk.');field.form.classList.add('is-typing');field.focus();}
      break;
    }
    case 'confirm-assignment':
      if(fund) void mutate('confirmAssignment',{fundId:fund.id,memberId:button.dataset.member,draftId:id},{message:t('职责已保存。','Assignment saved.')});
      break;
    case 'open-hiring':
      showRecruit=true; render(); jumpTo('studio-recruit'); break;
    case 'confirm-hire': {
      if(!fund)break;
      const before=new Set(fund.team.map(m=>m.id));
      let joined=[];
      void mutate('confirmHire',{fundId:fund.id,draftId:id},{
        message:t('新同事已入驻。','Your new teammate is in the studio.'),
        complete:next=>{joined=(next.funds.find(item=>item.id===fund.id)?.team??[]).filter(m=>!before.has(m.id)).map(m=>m.id);announceHire(fund.id,joined)},
        afterRender:()=>{requestAnimationFrame(()=>joined.forEach(highlightPlacement))}
      });
      break;
    }
    case 'guided-route': {
      const suggestion=state?.lobbyGuide;
      if (!suggestion || !['fund','lab'].includes(suggestion.route)) break;
      stopSpeaking();
      if (suggestion.route==='lab') {
        if (suggestion.fundAction==='forward' && suggestion.catalogId) {
          const query = new URLSearchParams({fund:suggestion.catalogId,lang:voiceLanguage});
          location.assign('/fund-operator.html?'+query);
          break;
        }
      }
      const idea=lastLobbyIdea;
      const openStudio=suggestion.route==='fund';
      if(openStudio) location.hash='#/fund?view=create';
      else enterWorkspace(suggestion.route, {catalogId:suggestion.catalogId});
      if(idea && openStudio) {
        const sendIdea=()=>mutate('designConversation',{message:idea,provider:'harnessrouter'},{complete:()=>{lastLobbyIdea='';},restore:()=>{
          const input=app.querySelector('#guide-message');
          if(input){input.value=idea;input.form.classList.add('is-typing');input.dispatchEvent(new Event('input',{bubbles:true}));}
        }});
        if(state.guide?.phase==='created') void mutate('resetDesignConversation',{}).then(done=>{if(done)void sendIdea();});
        else void sendIdea();
      }
      break;
    }
    case 'ask-studio-recap': {
      const manager = portfolioManager(fund);
      if (!manager || !fund.runs?.some(run=>run.id===id)) break;
      rememberDesk(fund.id,manager.id);
      const message = t('上次团队为什么这样操作？请按回执解释实际成交、模拟现金和当前收盘观察。','Why did the team make its last decision? Explain the actual fills, paper cash and closing observation from my records.');
      void mutate('sendChat',{fundId:fund.id,memberId:manager.id,message,runId:id,studioReview:true,provider:'harnessrouter'},{
        scrollChat:true, complete:()=>{questionRunId=id;}, afterRender:()=>jumpTo('studio-chat'),
      });
      break;
    }
    case 'ask-run': {
      if (!fund || !id) break;
      const manager=fund.team.find(member=>member.role==='manager');
      if (manager) rememberDesk(fund.id,manager.id);
      questionRunId=id;
      if (page() !== 'office') {
        history.pushState({}, '', officeHash(fund.id));
        entryLocation = location.hash;
      }
      render();
      const input=app.querySelector('#studio-chat-message');
      if(input){openDeskComposer();input.value=t('为什么这次这样操作？请逐项解释成交和风控。','Why did we do this? Walk me through the fills and risk checks.');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();jumpTo('studio-chat');}
      break;
    }
    case 'review-research':
      void mutate('reviewResearch',{catalogId:id,retry:button.dataset.retry==='true'},{afterRender:()=>app.querySelector('[data-meeting-type="reviewResearch"] .mt-view')?.focus({preventScroll:true})});
      requestAnimationFrame(()=>app.querySelector('[data-meeting-type="reviewResearch"]')?.scrollIntoView({block:'center'}));break;
    case 'prepare-research':
      void mutate('prepareResearch',{catalogId:id,message:t('请用公开数据研究这个基金并给出可验证的对比。','Study this fund with public evidence and give me a verifiable comparison.')},{afterRender:()=>app.querySelector('.research-prompt')?.scrollIntoView({block:'center'})});break;
    case 'confirm-research':
    case 'create-replica': {
      const draftToRun=state?.researchDraft;if(!draftToRun || draftToRun.id!==id) break;
      const createFund=action==='create-replica';
      void mutate('confirmResearch',{draftId:id,createFund},{reset:createFund,complete:()=>{
        if(createFund)location.hash=officeHash(state.selectedFundId);
        else enterWorkspace('lab', {catalogId:draftToRun.catalogId});
      },afterRender:()=>{document.getElementById(createFund?'review-receipt':'replica-comparison')?.scrollIntoView({block:'center'});}});break;
    }
    case 'retry': void refresh(); break;
    case 'refresh-connections': void refresh({ connection: true }); break;
    case 'paper-check': void checkConnection('paper'); break;
    case 'toggle-create':
    case 'start-fund': startFundDesign(); break;
    case 'toggle-pro':
      proMode = !proMode;
      render();
      if (proMode) jumpTo('pro-workspace');
      break;
    case 'toggle-recruit':
      showRecruit = !showRecruit;
      render();
      if (showRecruit) jumpTo('studio-recruit');
      break;
    case 'send-guide-answer': {
      const field=app.querySelector('#guide-message');
      const answer=suggestedAnswers(state?.guide,voiceLanguage)[Number(button.dataset.index)];
      if(!app.contains(button) || !answer || !field || field.value.trim() ||
         app.querySelector(`[data-voice-target="${field.id}"][aria-pressed="true"]`)) break;
      field.value=answer;
      if (state?.provider?.chatEnabled) field.form.requestSubmit();
      else {
        field.dispatchEvent(new Event('input', {bubbles:true}));
        field.form.classList.add('is-typing', 'has-transcript');
        field.focus();
      }
      break;
    }
    case 'guide-example': {
      const input = app.querySelector('#guide-message');
      if (input) { input.value = button.dataset.text; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); }
      break;
    }
    case 'confirm-team': {
      if (!state.guide?.draft?.formationVersion && legacyDraftAdjustments(state.guide).needsReview) {
        void prepareTeamFromConversation();
        break;
      }
      const wishes=(state.guide?.messages??[]).filter(m=>m.role==='user').map(m=>m.text).join(' ').toLowerCase();
      let firstTeam=[];
      void mutate('confirmFundDraft', { draftId: id }, {
        reset: true, message: t('团队已入驻。', 'Your team has moved in.'),
        complete: next => {
          selectedRunId=undefined;proMode=false;showRecruit=false;
          const created=next.funds.find(f=>f.id===next.createdFundId);
          if(created){
            const namedRank=member=>{const name=member.name.toLowerCase(),offset=wishes.indexOf(name);return offset<0?Number.MAX_SAFE_INTEGER:offset};
            const ordered=created.team.filter(m=>m.role!=='manager').sort((a,b)=>namedRank(a)-namedRank(b));
            firstTeam=[...ordered,...created.team.filter(m=>m.role==='manager')].map(m=>m.id);
            announceHire(created.id,firstTeam);
          }
          const target=officeHash(next.createdFundId ?? next.selectedFundId);
          if (location.hash === '#/fund') history.pushState({},'',target);
          else history.replaceState({},'',target);
          entryLocation=location.hash;
        },
        afterRender:()=>{
          window.scrollTo(0,0);
          (app.querySelector('.office-manager-desk #studio-chat') || main).focus({preventScroll:true});
          firstTeam.forEach(highlightPlacement);
        }
      });break;
    }
    case 'review-team':
      void mutate('runScenario', { fundId: fund.id, scenarioId: fund.scenarioId, provider: state.provider?.committeeEnabled ? 'committee' : 'harnessrouter' }, {
        afterRender: () => jumpTo('studio-meeting'),
      });
      requestAnimationFrame(()=>app.querySelector('#studio-meeting')?.scrollIntoView({block:'center'}));
      break;
    case 'catalog-section': enterWorkspace('lab', {group:id === 'persona' ? 'people' : 'markets'}); break;
    case 'catalog-open': enterWorkspace('lab', {catalogId:id}); break;
    case 'catalog-back': enterWorkspace('lab'); break;
    case 'catalog-backtest': void mutate('catalogBacktest', { catalogId: id }); break;
    case 'catalog-sell': void mutate('catalogSell', { catalogId: id }); break;
    case 'studio-jump': jumpTo(id); break;
    case 'ask-teammate': {
      if (!fund) break;
      selectMember(fund, id);
      break;
    }
    case 'recommend-team': recommendTeam(); break;
    case 'use-team-template': useTeamTemplate(id); break;
    case 'open-crew-chat': openDeskComposer();break;
    case 'return-manager': {
      const manager = portfolioManager(fund);
      if (manager) selectMember(fund, manager.id);
      break;
    }
    case 'ask-manager-update': {
      const manager = portfolioManager(fund);
      const form = button.closest('#studio-chat')?.querySelector('form[data-form="chat"]');
      if (!manager || !form || !state.provider?.chatEnabled || form.elements.memberId.value !== manager.id) break;
      const prompt = t('我的基金现在怎么样？','How is my fund doing?');
      const record = fund.runs?.[0];
      void mutate('sendChat', {fundId:fund.id, memberId:manager.id, provider:'harnessrouter', message:prompt,
        ...(record ? {runId:record.id, studioReview:true} : {})}, {scrollChat:true});
      break;
    }
    case 'show-crew-space': {
      jumpTo('studio-floor');
      break;
    }
    case 'ask-first-duty': {
      const form=button.closest('#studio-chat')?.querySelector('form[data-form="chat"]');
      if(form){form.elements.message.value=t('按我们约定的职责，你会先核对什么？需要我提供哪些资料？','For your assignment, what would you check first and what information do you need from me?');form.requestSubmit();}
      break;
    }
    case 'visit-desk':
    case 'select-member': if (fund) selectMember(fund, id); break;
    case 'hire': {
      const member = CANDIDATES.find((candidate) => candidate.id === id);
      if (fund && member) void mutate('hireMember', { fundId: fund.id, memberId: id }, {
        quiet: true, message: `${member.name} joined the team.`, complete: () => announceHire(fund.id,[id]),
        focus: `[data-action="select-member"][data-id="${CSS.escape(id)}"]`,
        afterRender: () => {
          highlightPlacement(id);
          if (matchMedia('(max-width: 560px)').matches) jumpTo('studio-chat');
        },
      });
      break;
    }
    case 'assign': if (fund) assignMember(fund, id, desk); break;
    case 'dismiss': if (fund) void mutate('removeMember', { fundId: fund.id, memberId: id }, {
      quiet: true, message: 'Teammate removed.', focus: '[data-action="select-member"][aria-pressed="true"]',
    }); break;
    case 'select-strategy':
      selectedStrategy = id;
      render({ focus: `[data-action="select-strategy"][data-id="${CSS.escape(id)}"]` });
      break;
    case 'run-shared':
      void mutate('runShared', { strategyId: selectedStrategy ?? state.strategies[0]?.id, scenarioId: id, provider: 'replay' }, {
        message: 'Shared replay completed.', focus: '[data-action="run-shared"]',
      });
      break;
    case 'toggle-shared-follow': {
      const follow = state.sharedFollows?.[id];
      if (!follow) break;
      const status = follow.status === 'active' ? 'paused' : 'active';
      void mutate('setSharedFollowStatus', { strategyId: id, status }, {
        quiet: true, message: status === 'paused' ? 'Following paused.' : 'Following resumed.', focus: '[data-action="toggle-shared-follow"]',
      });
      break;
    }
    case 'backtest':
      void mutate('backtest', { strategyId: id }, { message: 'Backtest completed.', focus: '[data-action="backtest"]' });
      break;
    case 'select-run':
      selectedRunId = id;
      render({ focus: `[data-action="select-run"][data-id="${CSS.escape(id)}"]` });
      break;
  }
});

app.addEventListener('input', (event) => {
  if (event.target.tagName === 'TEXTAREA') {
    event.target.form?.classList.toggle('has-transcript', Boolean(event.target.value.trim()));
    composerDrafts.set(composerKey(event.target.id), event.target.value);
    if(event.target.id==='guide-message')writeGuideDraft(event.target.value);
  }
  if (event.target.id === 'style-brief') {
    app.querySelector('#template-suggestion')?.replaceChildren();
    const announcement = app.querySelector('#template-announcement');
    if (announcement) announcement.textContent = '';
  }
  const form = event.target.closest('[data-form="replay"]');
  if (form && draft) snapshotDraft(form);
});

document.addEventListener('change', (event) => {
  if (event.target.name === 'interface-language') chooseLanguage(event.target.value);
  if (event.target.name === 'narration-speed') saveNarrationSpeed(event.target.value);
});

app.addEventListener('change', (event) => {
  if(event.target.matches('[data-draft-target]')){
    const button=event.target.closest('.formation-recruit').querySelector('button');
    const swap=Boolean(event.target.value);
    button.dataset.action=swap?'replace-draft-seat':'add-draft-seat';
    button.textContent=swap?t('替换候选人','Replace teammate'):t('加入蓝图','Add to proposal');
    return;
  }
  const control = event.target;
  if (control.id === 'studio-chat-provider') {
    const note = control.form.querySelector('.studio-provider-note');
    if (note) note.hidden = control.value !== 'harnessrouter';
  }
  if (control.dataset.control === 'scenario') {
    snapshotDraft(control.form);
    render({ focus: '#replay-scenario' });
  } else if (control.dataset.control === 'fund') {
    void mutate('selectFund', { fundId: control.value }, {
      reset: true, focus: '#fund-selector', complete: () => { selectedRunId = undefined; location.hash=officeHash(control.value); },
    });
  } else if (control.dataset.control === 'fund-template') {
    const template = state.teamTemplates?.find(({ id }) => id === control.value);
    const note = app.querySelector('#fund-template-note');
    if (note) note.innerHTML = renderTemplateNote(template);
  } else if (control.dataset.control === 'provider') {
    const note = control.form.querySelector('.provider-note');
    if (note) note.hidden = control.value !== 'committee';
  }
});

app.addEventListener('submit', (event) => {
  const form = event.target;
  const type = form.dataset.form;
  if (!type) return;
  event.preventDefault();
  if (type === 'fee') { updateFeeEstimate(form); return; }
  if (activeAction) return;
  const fund = currentFund();
  const fields = new FormData(form);
  if (type === 'lobby-guide') {
    const message=String(fields.get('message')||'').trim();
    if (!message) return;
    lastLobbyIdea=message;
    entryDraft=message;
    entryIssue='';
    history.pushState({...history.state,entryStep:'waiting'},'',location.href);
    void mutate('concierge',{message},{
      complete:()=>{
        if (page()==='home' && entryStep()==='waiting') history.replaceState({...history.state,entryStep:'reply'},'',location.href);
      },
      restore:()=>{
        if(page()!=='home' || entryStep()!=='waiting') return;
        entryIssue=errorMessages?.[voiceLanguage] || error;
        history.replaceState({...history.state,entryStep:'type'},'',location.href);
        entryFocus='#lobby-message';
        render();
      }
    });
    return;
  }
  if (type === 'studio-onboard') {
    const message = fields.get('message')?.trim();
    const localRoster=state.studioFormationVersion>=3&&state.guide?.draft&&spokenDraftChange(message,state.guide.draft.roster);
    if (!message||form.querySelector('[data-voice-target][aria-pressed="true"]')) return;
    if(!state.provider?.chatEnabled&&!localRoster){const field=form.elements.message;field.setCustomValidity(t('连接 Maya 后可讨论其他问题，也可以在候选人才中选择。','Connect Maya to discuss other questions, or choose from the candidate desk.'));field.reportValidity();field.setCustomValidity('');return;}
    stopSpeaking();
    writeGuideDraft(message);
    const draftKey=composerKey('guide-message');
    pendingDesignMessage=message;
    form.elements.message.value = '';
    composerDrafts.delete(draftKey);
    void mutate('designConversation', { message, language: voiceLanguage, provider: state.provider?.chatEnabled?'harnessrouter':'replay' }, {
      complete: () => { pendingDesignMessage='';writeGuideDraft(''); },
      restore: () => {
        pendingDesignMessage='';
        composerDrafts.set(draftKey,message);
        const input=app.querySelector('#guide-message');
        if(input && composerKey(input.id)===draftKey && !input.value.trim()) {
          input.value=message;
          input.form?.classList.add('is-typing','has-transcript');
          input.focus();
        }
      },
    }).then(ok=>{
      const guide=state?.guide;
      if(ok && page()==='fund' && !state.studioFormationVersion && !defersTeam(message) &&
        ((guide?.phase==='ready' && legacyDraftAdjustments(guide).needsReview) || (guide?.phase!=='ready' &&
          (wantsTeamPreview(message) || (investmentTurns(guide).length>=2 && !userTurns(guide).some(turn=>defersTeam(turn.text))))))) {
        void prepareTeamFromConversation();
      }
    });
    return;
  }
  if (type === 'catalog-buy') { void mutate('catalogBuy', { catalogId: form.dataset.id || form.dataset.catalogId, amount: Number(fields.get('amount')) }); return; }
  if (type === 'catalog-chat') {
    const message = fields.get('message')?.trim();
    const input = form.elements.message;
    if (input) input.value = '';
    if (input?.id) composerDrafts.delete(composerKey(input.id));
    if (message) void mutate('catalogChat', { catalogId: form.dataset.id || form.dataset.catalogId, message, provider: 'harnessrouter' }, {
      restore: () => { const next = app.querySelector('#catalog-message'); if (next) next.value = message; },
    });
    return;
  }
  if (type === 'follow-shared') {
    const initialCash = fields.get('initialCash');
    void mutate('followShared', { strategyId: form.dataset.strategyId, initialCash: Number(initialCash) }, {
      quiet: true, message: 'Your paper follow account is open.', focus: '[data-action="toggle-shared-follow"]',
      restore: () => {
        const next = app.querySelector('[data-form="follow-shared"]');
        if (!next) return;
        next.closest('details').open = true;
        next.elements.initialCash.value = initialCash;
        next.elements.initialCash.focus({ preventScroll: true });
      },
    });
    return;
  }
  if (type === 'market-check') {
    ticker = fields.get('symbol').trim().toUpperCase();
    void checkConnection('market');
    return;
  }
  if (type === 'create-fund') {
    const name = fields.get('name').trim();
    const mandate = fields.get('mandate').trim();
    if (!name) { form.querySelector('[name="name"]').focus(); return; }
    const templateId = fields.get('templateId');
    const payload = { name, ...(mandate ? { mandate } : {}), ...(templateId ? { templateId } : {}) };
    void mutate('createFund', payload, {
      quiet: true, reset: true, message: 'Your paper fund is ready.', focus: '#fund-selector',
      complete: (next) => { showCreate = false; selectedRunId = undefined; location.hash=officeHash(next.selectedFundId); },
      restore: () => {
        const next = app.querySelector('[data-form="create-fund"]');
        if (!next) return;
        next.elements.name.value = name;
        next.elements.mandate.value = mandate;
        if (templateId && next.elements.templateId) {
          next.elements.templateId.value = templateId;
          next.elements.templateId.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
    });
    return;
  }
  if (!fund) return;
  const fundId = fund.id;
  switch (type) {
    case 'replay': {
      snapshotDraft(form);
      const { mandate, scenarioId, maxWeightPercent, provider, permissions } = draft;
      const save = event.submitter?.value === 'save';
      const allowedSymbols = [...new Set(permissions.symbols.toUpperCase().split(/[\s,]+/u).filter(Boolean))];
      const payload = { fundId, mandate, scenarioId, maxWeightPercent: Number(maxWeightPercent), permissions: {
        allowBuy: permissions.allowBuy, allowSell: permissions.allowSell, allowedSymbols,
      } };
      if (!save) payload.provider = provider;
      void mutate(save ? 'updateFund' : 'runScenario', payload, {
        message: save ? 'Fund brief saved.' : 'Paper review completed.', focus: save ? '[data-form="replay"] button[value="save"]' : null,
        afterRender: () => { if (!save && page() === 'office') jumpTo('decision-trace'); },
      });
      break;
    }
    case 'schedule': {
      const frequency = fields.get('frequency');
      void mutate('setSchedule', { fundId, frequency, enabled: frequency !== 'manual' }, {
        quiet: true, message: 'Replay schedule saved.', focus: frequency === 'manual' ? null : '#replay-frequency',
      });
      break;
    }
    case 'duty': {
      const duty = fields.get('duty').trim();
      if (!duty) { form.elements.duty.focus(); return; }
      void mutate('updateMember', { fundId, memberId: fields.get('memberId'), duty }, {
        quiet: true, message: 'Responsibilities saved.', focus: '#studio-duty',
        restore: () => { const next = app.querySelector('[name="duty"]'); if (next) next.value = duty; },
      });
      break;
    }
    case 'chat': {
      const message = fields.get('message').trim();
      const memberId = fields.get('memberId');
      const provider = 'harnessrouter';
      if (!message || !state.provider?.chatEnabled || !fund.team.some(person=>person.id===memberId && (person.role==='manager' || person.desk!=='bench'))) { form.elements.message.focus(); return; }
      const draftKey = composerKey('studio-chat-message');
      form.elements.message.value = '';
      composerDrafts.delete(draftKey);
      const cited = fund?.runs?.find(run => run.id === questionRunId);
      const personalManager = !fund?.replica && fund?.team?.some(member => member.id === memberId && member.role === 'manager');
      const record = cited ?? (personalManager ? fund?.runs?.[0] : null);
      void mutate('sendChat', { fundId, message, memberId, provider, ...(record ? {runId:record.id,studioReview:personalManager} : {}) }, {
        complete:()=>{questionRunId=undefined;},
        scrollChat: true, focus: '#studio-chat-message', errorFocus: '#studio-chat-message',
        restore: () => {
          composerDrafts.set(draftKey,message);
          const field = app.querySelector('#studio-chat-message');
          if (field?.dataset.composerKey === draftKey && !field.value.trim()) field.value = message;
        },
      });
      break;
    }
  }
});

function setDropTarget(zone) {
  if (dropTarget === zone) return;
  dropTarget?.classList.remove('is-drop-target');
  dropTarget = zone;
  dropTarget?.classList.add('is-drop-target');
}

app.addEventListener('dragstart', (event) => {
  const member = event.target.closest('[data-drag-member],[data-drag-candidate]');
  if (!member || activeAction || !event.dataTransfer || (member.closest('[data-office-room]') && !member.hasAttribute('data-drag-candidate'))) return;
  movingFundId = currentFund()?.id;
  movingMember = member.dataset.dragMember || member.dataset.dragCandidate;
  app.classList.add('crew-dragging');
  event.dataTransfer.setData('text/plain', movingMember);
  event.dataTransfer.effectAllowed = 'move';
});

app.addEventListener('dragover', (event) => {
  const zone = event.target.closest('[data-desk-drop]');
  if (!movingMember || movingFundId!==currentFund()?.id || !zone || activeAction) { setDropTarget(null); return; }
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  setDropTarget(zone);
});

app.addEventListener('dragleave', (event) => {
  if (dropTarget && !dropTarget.contains(event.relatedTarget)) setDropTarget(null);
});

app.addEventListener('dragend', () => { app.classList.remove('crew-dragging');movingMember = null; movingFundId=null; setDropTarget(null); });
app.addEventListener('drop', (event) => {
  const zone = event.target.closest('[data-desk-drop]');
  const fund = currentFund();
  if (!zone || !movingMember || !fund || fund.id!==movingFundId || activeAction) return;
  event.preventDefault();
  const memberId = movingMember;
  movingMember = null;
  movingFundId = null;
  setDropTarget(null);
  const desk=zone.dataset.deskDrop;
  if (!fund.team.some(member=>member.id===memberId)) {
    void mutate('hireMember',{fundId:fund.id,memberId,desk},{complete:()=>announceHire(fund.id,[memberId]),afterRender:()=>highlightPlacement(memberId)});
  } else assignMember(fund,memberId,desk);
});

window.addEventListener('popstate',()=>{
  if (entryLocation !== location.hash) {
    renderWorkspaceNavigation();
    return;
  }
  if(page()==='home') {
    const previous=app.querySelector('[data-entry="browse"]') && app.querySelector('#entry-sheet .ge-choice') ? 'browse' : 'talk';
    entryFocus=entryStep()==='home' ? '[data-entry="'+previous+'"]' : '';
    if(entryStep()==='waiting' && !activeAction) history.replaceState({...history.state,entryStep:state?.lobbyGuide ? 'reply' : 'type'},'',location.href);
  }
  render();
});
function renderWorkspaceNavigation() {
  const previousRoute=entryLocation.split('?')[0];
  const previousFund=new URLSearchParams(entryLocation.split('?')[1]).get('fund');
  const leftWallet = previousRoute === '#/portfolio' && page() !== 'portfolio';
  entryLocation=location.hash;
  normalizeStudioLocation();
  const openingOffice=page()==='office' && (previousRoute!=='#/office' || previousFund!==routeParams().get('fund'));
  selectedRunId=undefined;
  questionRunId=undefined;
  proMode=false;
  showRecruit=false;

  if (page() !== 'lab') {
    const target = new URL(location.href);
    for (const key of ['catalog', 'group']) target.searchParams.delete(key);
    if (target.href !== location.href) history.replaceState(history.state, '', target);
  }
  error = '';
  feedback = '';
  showCreate = false;
  if ((!state || openingOffice || (leftWallet && ['office','fund','fund-record'].includes(page()))) && !activeAction) {
    void refresh({openingOffice});
    return;
  }
  render();
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', event => {
  // A browser history traversal may also deliver hashchange after popstate.
  if (event.isTrusted && entryLocation === location.hash) return;
  renderWorkspaceNavigation();
});

window.addEventListener('online', () => {
  if (page()==='fund' && state && !activeAction) void refresh();
});

function membershipDestination(){
  const params=new URL(location.href).searchParams;
  const view=params.get('purchase')==='orders'?'orders':'account',cadence=params.get('cadence')==='yearly'?'yearly':'monthly';
  return '/membership.html?view='+view+'&step=purchase&cadence='+cadence+'&lang='+encodeURIComponent(voiceLanguage);
}
void loadAccount().then(() => refresh()).then(()=>{
  const params=new URL(location.href).searchParams;
  if(params.get('auth')!=='membership')return;
  if(accountUser||params.get('purchase')!=='orders')location.replace(membershipDestination());
  else openSheet('login');
});
