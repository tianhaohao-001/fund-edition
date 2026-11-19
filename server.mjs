import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { explainDecision, validBuffettQuestion } from './core/buffett-followup.mjs';
import { planResearchReview, reviewHistoricalResearch } from './core/historical-review.mjs';
import { actForward, viewForward } from './core/fund-operator-service.mjs';
import {createWatchWorker} from './core/watch-worker.mjs';
import {createWatchSources} from './core/watch-sources.mjs';
import { studioReview } from './core/studio-review.mjs';
import { ForwardError } from './core/fund-operator-ledger.mjs';
import { AccountError } from './core/accounts.mjs';
import * as portfolioService from './core/portfolio-account.mjs';
import { conciergeReply, researchDraft, researchIntent, hiringIntent, proposeHire } from './core/concierge.mjs';
import { beginHistoricalFund, runHistoricalAllocation, HistoricalOrderError } from './core/historical-portfolio.mjs';
import { resolveResearchTarget, runReplicaStudy } from './core/replica.mjs';
import { researchBrief } from './web/strategy-playbook.mjs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT_VERSION, evaluateRun, SCENARIOS } from './core/engine.mjs';
import { ManagerUnavailable, proposeWithHarness, providerStatus } from './core/manager.mjs';
import { proposeWithCommittee, selectCommittee, SHARED_SPECIALISTS } from './core/committee.mjs';
import { proposeTeamReply, replayTeamReply, officeWatchBrief, assignmentIntent, proposeAssignment } from './core/team-coach.mjs';
import { adjustDraftRoster, requestedDraftChange, designConversationTurn, newGuide, proposeCatalogReply, managerOnlyBlueprint, prepareTeamBlueprint } from './core/conversation.mjs';
import { MAX_TEAM_SIZE } from './core/staffing.mjs';
import { openStore, SessionConflict } from './core/store.mjs';
import { beginStudioTrial, setStudioInterest, studioMembership, changeSimulatedMembership, MembershipError } from './core/membership.mjs';
import { personalGoodsLinks } from './core/invoice-membership.mjs';
import { BillingError, createStripeBilling } from './core/stripe-billing.mjs';
import {createPayPalBilling} from './core/paypal-billing.mjs';
import {testCheckout,testOwner,TEST_PATHS} from './core/checkout-test.mjs';
import { backtestStrategy, FOLLOWER_ACCOUNTS, STRATEGIES } from './core/strategies.mjs';
import { AlpacaConnectionError, connectionStatus, loadMarketSnapshot, loadPaperAccount } from './core/connections.mjs';
import { createMarketReference, describeIntraday, referenceSymbol } from './core/market-freshness.mjs';
import { BrokerError, createBroker } from './core/broker.mjs';
import { CANDIDATES, DEFAULT_TEAM } from './web/team.mjs';
import { TEAM_TEMPLATES } from './web/team-templates.mjs';
import { CATALOG, findCatalog, catalogBacktest } from './core/catalog.mjs';
import { localVoiceStatus, replyVoiceLanguages, synthesizeManagerReply, streamManagerReply, transcribeLocalWave, transcribeMobileAudio, VoiceUnavailable } from './core/local-voice.mjs';
import { selectedLanguage } from './core/language.mjs';
import { createMobileSessions, MobileSessionError } from './core/mobile-session.mjs';

const ROOT = fileURLToPath(new URL('./', import.meta.url));
const {PortfolioError}=portfolioService;
const WEB = resolve(ROOT, 'web');
const SCENARIO_IDS = new Set(SCENARIOS.map(({ id }) => id));
const DESKS = new Set(['management', 'research', 'risk', 'execution', 'bench']);
const FREQUENCIES = { hourly: 60 * 60_000, daily: 24 * 60 * 60_000 };
const MAX_RUNS = 30;
const MAX_FUNDS = 12;
const MAX_BODY_BYTES = 16_384;
const COOKIE = 'fundroom_session_v1';
const BROKER_COOKIE = 'fundroom_broker_operator_v1';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_:.\-]{0,119}$/u;
const LOOPBACK = ['127.0.0.1', 'localhost', '::1'];
const PREVIEW_APIS = new Set(['/api/health', '/api/state', '/api/action', '/api/voice/status', '/api/voice/transcribe', '/api/voice/reply', '/api/auth/session', '/api/auth/register', '/api/auth/login', '/api/auth/logout', '/api/team/activity']);
PREVIEW_APIS.add('/api/buffett/ask');
PREVIEW_APIS.add('/api/market/reference');
PREVIEW_APIS.add('/api/fund-operator');
PREVIEW_APIS.add('/api/studio-review');
PREVIEW_APIS.add('/api/studio-watch');
PREVIEW_APIS.add('/api/membership');
PREVIEW_APIS.add('/api/membership/orders');
for(const path of TEST_PATHS)PREVIEW_APIS.add(path);
PREVIEW_APIS.add('/api/portfolio');
PREVIEW_APIS.add('/api/portfolio/claim');
PREVIEW_APIS.add('/api/broker-demo');
const BILLING_PATHS = new Set(['/api/billing/checkout','/api/billing/portal','/api/billing/cancel','/api/billing/webhook','/api/billing/paypal/webhook']);
const LOCAL_STATUS_READS = new Set(['/api/health', '/api/voice/status', '/api/auth/session']);
const LOCAL_WORKSPACE_READS = new Set(['/api/state', '/api/portfolio', '/api/team/activity', '/api/studio-watch']);
// Guests may develop their own paper workspace. Each mutation below still
// resolves its fund, seat, draft and receipt inside the session cookie's scope.
const guestPaperFields = {
  designConversation:['message','provider'], prepareTeamStudio:[], prepareSoloStudio:[],
  adjustDraftRoster:['draftId','operation','memberId','candidateId'],
  resetDesignConversation:[], confirmFundDraft:['draftId'], selectFund:['fundId'],
  hireMember:['fundId','memberId','desk'], removeMember:['fundId','memberId'],
  updateMember:['fundId','memberId','desk','duty','expectedDesk'], confirmHire:['fundId','draftId'],
  confirmAssignment:['fundId','memberId','draftId'],
  sendChat:['fundId','memberId','message','provider','runId','studioReview'],
  runScenario:['fundId','scenarioId','provider'], reviewResearch:['catalogId','retry'],
  concierge:['message','catalogId'], prepareResearch:['message','catalogId'], confirmResearch:['draftId','createFund'],
  catalogChat:['catalogId','message','provider'], catalogBacktest:['catalogId'],
  catalogBuy:['catalogId','amount'], catalogSell:['catalogId']
};
function guestPaperAction(body) {
  if (!Object.hasOwn(guestPaperFields,body.action)) return false;
  const fields=guestPaperFields[body.action];
  return Object.keys(body).every(key=>['action','requestId','language'].includes(key)||fields.includes(key)) &&
    (!['runScenario','sendChat'].includes(body.action)||
      (UUID.test(body.fundId)&&typeof body.requestId==='string'&&REQUEST_ID.test(body.requestId)));
}

function isDirectLoopback(request) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)
    && !['forwarded', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-port', 'x-real-ip'].some(name => name in request.headers);
}

// This value partitions quotas only. Authentication and broker access still use
// their own checks. Railway's edge-only topology is attested by the launcher.
export function requestQuotaAddress(request, railwayHost) {
  const peer = request.socket.remoteAddress ?? 'unknown';
  if (!railwayHost || request.headers.host !== railwayHost ||
      request.headers['x-forwarded-host'] !== railwayHost || request.headers['x-forwarded-proto'] !== 'https') return peer;
  const address = request.headers['x-real-ip'];
  if (typeof address !== 'string' || address.includes('%')) return peer;
  const family = isIP(address);
  if (family === 4) return address;
  if (family === 6) return new URL('http://[' + address + ']').hostname.slice(1, -1);
  return peer;
}

function isLocalPreview(request, authority, pathname) {
  // Codex and SSH port forwards preserve the browser's local Host and Origin.
  const match = /^(?:localhost|127\.0\.0\.1|\[::1\]):([1-9]\d{0,4})$/u.exec(authority);
  if (!match || Number(match[1]) < 1024 || Number(match[1]) > 65535 || !isDirectLoopback(request)) return false;
  if (pathname.startsWith('/api/')) return PREVIEW_APIS.has(pathname);
  return pathname !== '/broker.html';
}
const MIME = {
  css: 'text/css; charset=utf-8', html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  ico: 'image/x-icon', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml',
  woff2: 'font/woff2', jpg: 'image/jpeg', jpeg: 'image/jpeg', wav: 'audio/wav',
  webmanifest: 'application/manifest+json',
};

class HttpError extends Error {
  constructor(status, message, code = 'invalid-request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(400, `${label} must be between 1 and ${maxLength} characters.`);
  }
  return value.trim();
}

function actionLanguage(value, fallback = 'zh-CN') {
  try { return selectedLanguage(value, fallback); } catch {
    throw new HttpError(400, 'Choose zh-CN or en-US.', 'invalid-language');
  }
}

function errorPayload(message, code) {
  const catalogEnglish = {
    '请选择目录中的基金。': 'Choose a fund from the catalog.',
    '导入文件需要 source 和 4–3000 项 prices，每项包含 date 与正数 close。': 'Provide a source and 4–3000 prices, each with a date and a positive close.',
    '净值日期必须递增，价格需在 $0.01–$1,000,000 之间。': 'Dates must increase and prices must be between $0.01 and $1,000,000.',
    '价格样本导致金额超出精确模拟范围。': 'These prices exceed the precise range of the paper simulator.',
    '模拟基金账户不匹配。': 'This paper account does not match the selected fund.',
    '需要有效的交易编号。': 'Provide a valid transaction ID.',
    '模拟买入金额为 $10–$10,000，最多两位小数。': 'Paper purchases must be $10–$10,000 with up to two decimal places.',
    '模拟现金不足。可先卖出持有份额。': 'Insufficient paper cash. You can sell held units first.',
    '该金额不足以形成模拟份额。': 'This amount is too small to buy paper units.',
    '当前没有可卖出的模拟份额。': 'There are no paper units to sell.',
  }[message];
  const chinese = {
    'guest-chat-limit':'你已用完 8 次访客对话。登录即可继续，这条话会留在草稿里。',
    'guest-voice-limit':'访客听写额度已用完。可改用文字，或登录继续。',
    'guest-onboarding-capacity':'访客体验今天暂时满额。可稍后再试或登录，你的草稿会保留。',
    'sign-in-required':'请登录后进行这项操作。',
    'studio-trial-ended': '工作室试用已结束。可查看会员方案；历史记录、持仓和回执仍可查看。',
    'invalid-email': '请输入有效邮箱。', 'invalid-password': '密码长度需为 12 至 128 个字符。',
    'auth-failed': '邮箱或密码未能通过验证。', 'registration-unavailable': '未能用这些信息创建账户，可以尝试登录。',
    'auth-limit': '登录尝试过于频繁，请稍后再试。', 'auth-changed': '账户状态已更新，请刷新后继续。',
    'research-draft-changed': '研究方案已更新，请核对最新方案。', 'historical-order': '暂时无法执行此历史模拟操作，请检查研究区间及授权。',
    'hire-draft-changed': '招聘提案已更新，请核对当前候选人。', 'research-target': '请输入目录中可识别的一只基金，例如 VWELX。',
    'broker-operator-only': '此信息仅向本机券商操作员开放。',
    'broker-demo-input': '请选择演示券商。此表单只接受模拟连接选项。',
    'broker-demo-changed': '当前账户或连接已更新。请刷新后再确认。',
    'invalid-language': '请选择简体中文或 English。',
    'manager-unavailable': 'AI 连接暂时不可用。请检查连接后重试，或在 Pro 中明确选择离线回放。',
    'manager-capacity': 'AI 正在处理其他请求，或已达到本小时调用额度。请稍后重试。',
    'desk-changed': '这位同事已换岗。请刷新查看当前工位。',
    'request-id-conflict': '此请求编号已用于另一项操作，请刷新后重试。',
    'draft-changed': '蓝图已更新，请查看最新版本后确认。',
    'state-conflict': '工作区刚有更新，请刷新后重试。',
    'voice-unavailable': '语音识别暂时不可用，请重试或改用文字。',
    'session-required': '请重新打开工作区后继续。',
    'untrusted-origin': '请从此工作区页面发起操作。',
    'connection-error': '外部连接暂时不可用，请检查配置后重试。',
    'internal-error': '本次操作未能完成，请稍后重试。',
    'mobile-session-required': '请重新配对此设备后继续。',
    'mobile-pairing-disabled': '这台电脑尚未启用手机配对。',
    'mobile-pairing-expired': '配对码已过期或已使用，请在电脑上生成新码。',
    'mobile-pairing-invalid': '配对码不正确。',
    'mobile-pairing-limit': '配对尝试次数已达上限，请在电脑上生成新码。',
  }[code] ?? '请求未能通过检查，请检查输入后重试。';
  return { error: message, code, messages: { 'zh-CN': catalogEnglish ? message : chinese, 'en-US': catalogEnglish ?? message } };
}

function cap(value) {
  if (typeof value === 'string' && value.trim()) value = Number(value);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new HttpError(400, 'The position limit must be between 0% and 100%.');
  }
  return value;
}

function scenarioId(value) {
  if (!SCENARIO_IDS.has(value)) throw new HttpError(400, 'Choose a known synthetic market scenario.');
  return value;
}

function inferCap(mandate) {
  const match = mandate.match(/(?:\b(?:at most|max(?:imum)?(?: position)?(?: weight)?|cap(?: at)?|up to|below)\s*|(?:上限(?:为)?|最多|不超过)\s*)(\d{1,3}(?:\.\d+)?)\s*%/iu);
  const amount = Number(match?.[1]);
  return Number.isFinite(amount) && amount <= 100 ? amount : 12;
}

function emptyPortfolio(initialCashCents = 1_000_000) {
  const initialCash = initialCashCents / 100;
  return {
    cash: initialCash, cashCents: initialCashCents, equity: initialCash, equityCents: initialCashCents,
    initialCash, initialCashCents, totalPnl: 0, totalPnlCents: 0,
    realizedPnl: 0, realizedPnlCents: 0, unrealizedPnl: 0, unrealizedPnlCents: 0,
    returnPercent: 0, positions: [],
  };
}

function readPermissions(value = {}, current = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Trading authorization must be an object.');
  const allowBuy = value.allowBuy ?? current.allowBuy ?? true;
  const allowSell = value.allowSell ?? current.allowSell ?? true;
  const allowedSymbols = value.allowedSymbols ?? current.allowedSymbols ?? [];
  if (typeof allowBuy !== 'boolean' || typeof allowSell !== 'boolean' || !Array.isArray(allowedSymbols) || allowedSymbols.length > 20) {
    throw new HttpError(400, 'Use buy and sell toggles and up to 20 eligible tickers.');
  }
  const symbols = allowedSymbols.map((symbol) => typeof symbol === 'string' ? symbol.trim().toUpperCase() : '');
  if (symbols.some((symbol) => !/^[A-Z][A-Z0-9.-]{0,9}$/u.test(symbol))) throw new HttpError(400, 'Use valid ticker symbols in the trading authorization.');
  return { allowBuy, allowSell, allowedSymbols: [...new Set(symbols)] };
}

function createFund(body = {}, index = 1) {
  const template = body.templateId ? TEAM_TEMPLATES.find(({ id }) => id === body.templateId) : null;
  if (body.templateId && !template) throw new HttpError(400, 'Choose a known team template.');
  const customMandate = body.mandate ?? body.prompt;
  const mandate = requiredText(customMandate ?? template?.mandate ?? 'Review durable growth in U.S. equities. Cap each position at 12%.', 'Mandate', 1500);
  const team = template ? template.roster.map(({ id, duty }) => ({ ...CANDIDATES.find((candidate) => candidate.id === id), duty })) : structuredClone(DEFAULT_TEAM);
  return {
    id: randomUUID(), name: requiredText(body.name ?? (index === 1 ? 'My First Fund' : `Fund ${index}`), 'Fund name', 80), mandate,
    maxWeightPercent: cap(body.maxWeightPercent ?? (customMandate ? inferCap(mandate) : template?.maxWeightPercent ?? inferCap(mandate))),
    scenarioId: scenarioId(body.scenarioId ?? template?.scenarioId ?? 'innovation-signal'),
    permissions: readPermissions(body.permissions), templateId: template?.id ?? null,
    team, chat: [], runs: [], portfolio: emptyPortfolio(), createdAt: new Date().toISOString(),
    schedule: { enabled: false, frequency: 'daily', nextRunAt: null, lastRunAt: null },
  };
}

function addStudioFund(data, fund) {
  const firstStudioFund = !data.funds.slice(1).some(existing => !existing.replica);
  const availableCash = portfolioService.bookFor(data).cashCents;
  fund.portfolio = emptyPortfolio(0);
  fund.studioCapital = {unitsMicros:0, netContributionsCents:0};
  data.funds.push(fund);
  data.selectedFundId = fund.id;
  if (!firstStudioFund || availableCash === 0) return null;

  const order = {requestId:randomUUID(), productId:'studio:' + fund.id, side:'buy', amountCents:availableCash};
  const receipt = portfolioService.placePortfolioOrder(data, order);
  return {requestId:order.requestId, signature:portfolioService.validatePortfolioOrder(order), run:{kind:'portfolio-order', receipt}};
}

function createState(language) {
  const fund = createFund();
  return {
    portfolioAccount: portfolioService.newPortfolioAccount(),
    funds: [fund], selectedFundId: fund.id, sharedRuns: [], sharedBooks: {}, sharedFollows: {}, backtests: {}, guide: newGuide(language),
  };
}

const lobbyStudy = backtestStrategy('innovation');
const lobbyPreview = {
  source: lobbyStudy.source, metrics: lobbyStudy.metrics,
  points: lobbyStudy.points.filter((_, index, bars) => index % 4 === 0 || index === bars.length - 1)
    .map(({ equity, benchmarkEquity }, index) => ({ index, equity, benchmarkEquity })),
  startingCash: lobbyStudy.startingCash, startDate: lobbyStudy.startDate, endDate: lobbyStudy.endDate,
};

function brokerDemoFor(data) {
  return data.brokerDemo ?? { provider:null, version:0 };
}

function presentStateSnapshot(data, provider, connections, membership, extras = {}) {
  return {
    membership, studioFormationVersion:3, studioTeamCapacity:MAX_TEAM_SIZE, brokerDemo:brokerDemoFor(data),
    contractVersion: CONTRACT_VERSION, provider, connections, scenarios: SCENARIOS, strategies: STRATEGIES, teamTemplates: TEAM_TEMPLATES,
    researchReviews: data.researchReviews ?? {}, lobbyPreview, lobbyGuide: data.lobbyGuide ?? null, researchDraft: data.researchDraft ?? null, researchStudies: data.researchStudies ?? {},
    funds: data.funds, selectedFundId: data.selectedFundId,
    studioAllocations: portfolioService.studioAllocations(data), portfolioCashCents: portfolioService.bookFor(data).cashCents,
    fund: data.funds.find((item) => item.id === data.selectedFundId) ?? null,
    followers: FOLLOWER_ACCOUNTS, sharedRuns: data.sharedRuns, sharedFollows: data.sharedFollows ?? {}, backtests: data.backtests, ...extras,
    guide: data.guide ?? newGuide(), catalog: CATALOG, catalogAccounts: portfolioService.catalogAccountViews(data), catalogBacktests: data.catalogBacktests ?? {}, catalogChats: data.catalogChats ?? {},
  };
}

function findFund(data, fundId = data.selectedFundId) {
  const fund = data.funds.find(({ id }) => id === fundId);
  if (!fund) throw new HttpError(404, 'That fund could not be found in this session.', 'fund-not-found');
  return fund;
}

function findStrategy(id) {
  const strategy = STRATEGIES.find((item) => item.id === id);
  if (!strategy) throw new HttpError(400, 'Choose a known strategy.');
  return strategy;
}

function changeSharedFollow(data, body) {
  const strategy = findStrategy(body.strategyId);
  const follows = data.sharedFollows ??= {};
  const current = follows[strategy.id];
  if (body.action === 'followShared') {
    if (current) throw new HttpError(409, 'A paper account already follows this strategy. Its balance is preserved.', 'shared-follow-exists');
    const { initialCash } = body;
    const cents = typeof initialCash === 'number' ? Math.round(initialCash * 100) : NaN;
    if (!Number.isFinite(initialCash) || cents < 10_000 || cents > 100_000_000 || cents / 100 !== initialCash) {
      throw new HttpError(400, 'Choose starting paper cash from $100 to $1,000,000, with up to two decimal places.');
    }
    const createdAt = new Date().toISOString();
    follows[strategy.id] = {
      id: randomUUID(), status: 'active', createdAt, statusChangedAt: createdAt,
      portfolio: emptyPortfolio(cents), history: [],
    };
    return;
  }
  if (!current) throw new HttpError(404, 'Open a paper account for this strategy first.', 'shared-follow-missing');
  if (!['active', 'paused'].includes(body.status)) throw new HttpError(400, 'Choose active or paused.');
  if (current.status !== body.status) {
    current.status = body.status;
    current.statusChangedAt = new Date().toISOString();
  }
}

function changeFund(fund, body) {
  if (body.name !== undefined) fund.name = requiredText(body.name, 'Fund name', 80);
  if (body.mandate !== undefined) fund.mandate = requiredText(body.mandate, 'Mandate', 1500);
  if (body.maxWeightPercent !== undefined) fund.maxWeightPercent = cap(body.maxWeightPercent);
  if (body.scenarioId !== undefined && !fund.replica) fund.scenarioId = scenarioId(body.scenarioId);
  if (body.permissions !== undefined) fund.permissions = readPermissions(body.permissions, fund.permissions);
}

function changeMember(fund, body) {
  if (body.action === 'hireMember') {
    const candidate = CANDIDATES.find(({ id }) => id === (body.memberId ?? body.member?.id));
    if (!candidate) throw new HttpError(400, 'Choose a candidate from the recruiting desk.');
    if (body.desk !== undefined && !DESKS.has(body.desk)) throw new HttpError(400, 'Choose a known desk.');
    if (!fund.team.some(({ id }) => id === candidate.id)) {
      if (fund.team.length>=MAX_TEAM_SIZE || fund.team.some(m=>m.name.toLowerCase()===candidate.name.toLowerCase())) throw new HttpError(409,'That seat cannot be added to this roster.');
      fund.team.push({ ...candidate, desk: body.desk ?? candidate.desk });
    }
    return;
  }
  const member = fund.team.find(({ id }) => id === body.memberId);
  if (!member) throw new HttpError(404, 'That member is not on this fund’s team.');
  if (body.action === 'removeMember') {
    if (member.role === 'manager') throw new HttpError(400, 'Keep the portfolio manager on the team.');
    fund.team = fund.team.filter(({ id }) => id !== member.id);
    return;
  }
  if (body.duty !== undefined) {
    member.duty = requiredText(body.duty, 'Responsibilities', 500);
    delete member.assignmentDraft;
  }
  if (body.desk !== undefined) {
    if (!DESKS.has(body.desk)) throw new HttpError(400, 'Choose a known desk.');
    if (body.expectedDesk !== undefined && body.expectedDesk !== member.desk && body.desk !== member.desk) {
      throw new HttpError(409, 'This teammate has already moved. Refresh to see the current desk.', 'desk-changed');
    }
    member.desk = body.desk;
  }
}

function recordChat(fund, message, member, advice) {
  const timestamp = new Date().toISOString();
  fund.chat = [...fund.chat, { id: randomUUID(), role: 'user', text: message, timestamp, recipient: member.name, memberId: member.id }, {
    id: randomUUID(), role: 'assistant', name: member.name, memberId: member.id,
    ...advice, timestamp,
  }].slice(-50);
}

function updateSchedule(fund, action) {
  if (typeof action.enabled !== 'boolean') throw new HttpError(400, 'Schedule enabled must be true or false.');
  const frequency = action.frequency ?? fund.schedule.frequency;
  if (action.enabled && !Object.hasOwn(FREQUENCIES, frequency)) throw new HttpError(400, 'Choose an hourly or daily interval.');
  fund.schedule = {
    enabled: action.enabled,
    frequency: Object.hasOwn(FREQUENCIES, frequency) ? frequency : fund.schedule.frequency,
    nextRunAt: action.enabled ? new Date(Date.now() + FREQUENCIES[frequency]).toISOString() : null,
    lastRunAt: fund.schedule.lastRunAt,
  };
}

function captureAsyncLock(locks, key, callback) {
  const run = (locks.get(key) ?? Promise.resolve()).catch(() => {}).then(callback);
  locks.set(key, run);
  const clear = () => { if (locks.get(key) === run) locks.delete(key); };
  run.then(clear, clear);
  return run;
}

function chooseProvider(requested, available) {
  requested ??= available.mode;
  if (!['replay', 'harnessrouter', 'committee'].includes(requested)) throw new HttpError(400, 'Choose Replay, the HarnessRouter manager, or the AI committee.');
  if (requested !== 'replay' && !available.enabled) {
    throw new ManagerUnavailable('HarnessRouter is unavailable for this app instance. Choose Replay to run locally.');
  }
  return requested;
}

function operationSignature(body, legacyLanguage = null) {
  // Language changes the next reply, never the identity of an existing operation.
  const fields = [body.action, body.fundId, body.strategyId, body.scenarioId, body.name, body.mandate, body.maxWeightPercent, body.provider, body.permissions, body.message, body.draftId, body.restart, legacyLanguage, body.catalogId, body.amount];
  if (body.action==='buffettExplanation') fields.push(body.runId,body.decisionId,body.language);
  if (body.action==='reviewResearch') fields.push(body.retry===true);
  if (body.action==='createFund') fields.push(body.prompt, body.templateId);
  if (body.action==='adjustDraftRoster') fields.push(body.operation,body.memberId,body.candidateId);
  if (body.action==='updateMember') fields.push(body.memberId,body.desk,body.expectedDesk,body.duty);
  if (['confirmResearch','confirmHire','confirmAssignment','sendChat'].includes(body.action)) fields.push(body.createFund, body.runId, body.memberId);
  if (body.action === 'sendChat' && body.studioReview === true) fields.push('closing-observation-v1');
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

function sameOperation(signature, body) {
  return [null, 'zh-CN', 'en-US'].some((language) => signature === operationSignature(body, language));
}

function responseHeaders(response, publicOrigin) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  response.setHeader('X-Frame-Options', 'DENY');
  if (publicOrigin?.startsWith('https://')) response.setHeader('Strict-Transport-Security', 'max-age=31536000');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers['content-type'] || '')) throw new HttpError(415, 'Use an application/json request body.');
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) throw new HttpError(413, 'The request is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'The request is too large.');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'The request body is not valid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Use a JSON object for this request.');
  return body;
}

async function readVoiceRecording(request) {
  if (request.headers['content-type'] !== 'audio/wav') throw new HttpError(415, 'Record mono PCM WAV audio.');
  const limit = 960_044;
  if (Number(request.headers['content-length']) > limit) throw new HttpError(413, 'Voice messages may be up to 30 seconds.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Voice messages may be up to 30 seconds.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function readCookie(request) {
  const value = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  const id = value?.slice(COOKIE.length + 1) ?? '';
  return UUID.test(id) ? id : null;
}

function readBrokerCookie(request) {
  const value = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${BROKER_COOKIE}=`));
  const id = value?.slice(BROKER_COOKIE.length + 1) ?? '';
  return UUID.test(id) ? id : null;
}

async function serveAsset(request, response, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'Method not allowed.');
  if (!/^\/[A-Za-z0-9_.\-/]*$/u.test(pathname)) throw new HttpError(404, 'Page not found.');
  // Public links from earlier editions still open the same application shell.
  const applicationEntry = pathname === '/' || /^\/(?:studio|funds|team|portfolio)\/?$/u.test(pathname);
  const target = resolve(WEB, `.${applicationEntry ? '/index.html' : /^\/checkout-test\/?$/.test(pathname)?'/checkout-test.html':pathname}`);
  const mime = pathname === '/data/buffett-ai-study.json' ? 'application/json; charset=utf-8' : MIME[target.split('.').at(-1)];
  if (!target.startsWith(WEB + sep) || !mime) throw new HttpError(404, 'Page not found.');
  let asset;
  try { asset = await readFile(target); } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') throw new HttpError(404, 'Page not found.');
    throw error;
  }
  response.writeHead(200, { 'Content-Type': mime, 'Content-Length': asset.length });
  response.end(request.method === 'HEAD' ? undefined : asset);
}

function addressConfig(env) {
  const host = (env.FUNDROOM_HOST || env.HOST || '127.0.0.1').trim();
  const port = Number(env.FUNDROOM_PORT || env.PORT || 3000);
  const publicHosted = env.FUNDROOM_PUBLIC_HOSTED === 'true';
  const previewOnly = env.FUNDROOM_PUBLIC_DEMO === 'true';
  if (publicHosted && (previewOnly || (!LOOPBACK.includes(host) && !(host==='0.0.0.0' && env.FUNDROOM_CLOUD_CONTAINER==='true')))) {
    throw new Error('Hosted public access requires a dedicated loopback origin behind HTTPS.');
  }
  const publicDemo = previewOnly || publicHosted;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid Fundroom port.');
  if (!LOOPBACK.includes(host) && !publicDemo) throw new Error('A non-loopback bind requires FUNDROOM_PUBLIC_DEMO and an explicit public origin.');
  let publicOrigin = null;
  if (publicDemo) {
    const url = new URL(env.FUNDROOM_PUBLIC_ORIGIN || '');
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && !publicHosted && [...LOOPBACK, '[::1]'].includes(url.hostname)))) {
      throw new Error('The public demo requires an HTTPS origin.');
    }
    publicOrigin = url.origin;
  }
  return { host, port, publicDemo, publicHosted, publicOrigin };
}

export async function createApp({ env = process.env, fetchImpl = fetch, membershipBilling } = {}) {
  const { host, port, publicDemo, publicHosted, publicOrigin } = addressConfig(env);
  const railwayQuotaHost = publicHosted && env.FUNDROOM_CLOUD_CONTAINER === 'true' && env.FUNDROOM_RAILWAY_EDGE_ONLY === 'true'
    ? new URL(publicOrigin).host : null;
  const simulation = !publicDemo && !publicHosted && LOOPBACK.includes(host) && env.FUNDROOM_MEMBERSHIP_SIMULATION === 'true';
  const manualOrders=env.FUNDROOM_INVOICE_ORDERS==='true';
  const goodsLinks=manualOrders?personalGoodsLinks(env):{};
  const membershipFor = (data, workspace, enforceAccess=false) => {
    const processor=processorFor(workspace);
    const pass=store.invoices.active(workspace);
    const recurring=enforceAccess&&processor?.testMode?null:processor?.subscriptionFor(workspace);
    const base=studioMembership(data, Date.now(), {simulation:simulation&&!manualOrders,live:processor?.configured===true,verifiedSubscription:pass??recurring});
    if(manualOrders||pass||store.invoices.hasOrders(workspace))return {...base,checkoutMode:'one-time',billingProvider:'paypal-manual',acceptsOrders:manualOrders,
      directPaymentTerms:Object.keys(goodsLinks),paymentType:'one-time',existingRecurring:!processor?.testMode&&Boolean(recurring),legacyProvider:processor?.provider??(processor?'stripe':null),billingTestMode:false};
    return {...base,
      billingProvider:processor?.provider??(processor?'stripe':null),billingTestMode:processor?.testMode===true,
      hasBillingAccount:processor?.hasCustomer?.(workspace)===true,pendingCadence:processor?.pendingCadence?.(workspace)??null};
  };
  const presentState = (workspace, data, provider, connections, extras) => presentStateSnapshot(data, provider, connections, membershipFor(data,workspace), extras);
  const configuredPath = env.FUNDROOM_DB_PATH || (publicHosted ? '.fundroom/hosted-public.sqlite' :
    publicDemo ? '.fundroom/fundroom-public-v1.sqlite' : '.fundroom/fundroom-v1.sqlite');
  const database = configuredPath === ':memory:' ? configuredPath : resolve(ROOT, configuredPath);
  if (['.fundroom/demo.sqlite', '.fundroom/live-demo.sqlite'].some((previous) => resolve(ROOT, previous).toLowerCase() === database.toLowerCase())) {
    throw new Error('Choose a database separate from the archived Fundroom accounts.');
  }
  const provider = providerStatus(env, publicDemo && !publicHosted);
  if (provider.enabled) {
    provider.committeeEnabled = true;
    provider.chatEnabled = true;
  }
  const brokerPath = database === ':memory:' ? ':memory:' : resolve(ROOT, env.FUNDROOM_BROKER_DB_PATH || '.fundroom/broker-v1.sqlite');
  const replayPaths = [database, ...['demo.sqlite', 'live-demo.sqlite', 'fundroom-v1.sqlite', 'fundroom-public-v1.sqlite']
    .map((filename) => resolve(ROOT, '.fundroom', filename))].map((path) => path.toLowerCase());
  const broker = createBroker({
    env, fetchImpl, database: brokerPath,
    local: !publicDemo && LOOPBACK.includes(host) && (brokerPath === ':memory:' || !replayPaths.includes(brokerPath.toLowerCase())),
  });
  const voice = await localVoiceStatus(env, publicDemo && !publicHosted);
  const narrationLanguages = publicDemo && !publicHosted ? [] : await replyVoiceLanguages(env);
  Object.assign(voice,{replyPlayback:narrationLanguages.length>0,replyLanguages:narrationLanguages});
  const connectionConfig = { ...connectionStatus(env), broker: broker.status, voice };
  const readMarketReference = createMarketReference({ fetchImpl });
  const store = openStore(database,portfolioService);
  const checkoutTest=testCheckout({records:store.testCheckout,env,fetchImpl});
  const billing=simulation ? null : (membershipBilling ?? (publicHosted ? createStripeBilling({env,records:store.billing,origin:publicOrigin,fetchImpl}) : null));
  const paypal=!simulation&&publicHosted?createPayPalBilling({env,records:store.paypal,origin:publicOrigin,fetchImpl}):null;
  // A customer with an existing card billing profile must keep its billing history and portal.
  const processorFor=workspace=>billing?.hasCustomer?.(workspace)?billing:paypal??billing;
  const mobile = createMobileSessions({ enabled: !publicDemo && LOOPBACK.includes(host) && env.FUNDROOM_MOBILE_ENABLED === 'true', code: env.FUNDROOM_MOBILE_PAIR_CODE });
  const locks = new Map();
  const requestLimits = new Map();
  const providerCalls = [];
  let providerInFlight = 0;
  const hourlyTaskBudget = Math.min(500, Math.max(0, Number(env.FUNDROOM_HOURLY_AI_TASKS ?? 100) || 0));
  const monthlyTaskBudget = Math.min(25000, Math.max(0, Number(env.FUNDROOM_MODEL_30D_LIMIT ?? 300) || 0));
  const hostedConcurrency = Math.min(4, Math.max(1, Number(env.FUNDROOM_AI_CONCURRENCY) || 2));
  const guestDailyLimit = Math.min(500,Math.max(0,Number(env.FUNDROOM_GUEST_AI_DAILY_LIMIT ?? 80) || 0));
  function reserveGuest(owner,request,kind) {
    const network=createHash('sha256').update('fundroom-network:'+new Date().toISOString().slice(0,10)+':'+requestQuotaAddress(request, railwayQuotaHost)).digest('hex');
    const result=store.reserveGuestUse(owner,network,kind,kind==='chat'?guestDailyLimit:guestDailyLimit*2);
    if(result==='sign-in')throw new HttpError(401,kind==='chat'?'You have used your eight guest turns. Sign in to continue. Your draft stays in this tab.':'Guest dictation limit reached. Type your reply or sign in to continue.',kind==='chat'?'guest-chat-limit':'guest-voice-limit');
    if(result==='capacity')throw new HttpError(429,'Guest capacity has been reached. Try later or sign in. Your draft stays in this tab.','guest-onboarding-capacity');
  }
  let voiceInFlight = false;
  let narrating = false;
  let scheduleTimer;
  let scheduleGeneration = 0;
  let closed = false;
  const watch=createWatchWorker({journal:store.watch,readOwner:id=>store.read(id),membership:membershipFor,provider,env,fetchImpl,budget:withHostedBudget,
    readSources:createWatchSources({fetchImpl,readReference:readMarketReference,cache:store.watch.cache}),enabled:env.FUNDROOM_WATCH_ENABLED==='true'});

  async function withHostedBudget(taskCount, run, reserveGuestTurn) {
    const hourAgo = Date.now() - 3_600_000;
    while (providerCalls[0] < hourAgo) providerCalls.shift();
    if (providerCalls.length + taskCount > hourlyTaskBudget || providerInFlight >= hostedConcurrency) {
      throw new HttpError(429, 'A hosted review is in progress or the hourly task limit has been reached. Try again later or choose Replay.', 'manager-capacity');
    }
    if (publicHosted && !store.reserveHostedModelUse(taskCount,hourlyTaskBudget,monthlyTaskBudget,reserveGuestTurn)) {
      throw new HttpError(429,'The site model budget has been reached. Please try later.','manager-capacity');
    }
    if (!publicHosted) reserveGuestTurn?.();
    providerInFlight += 1;
    providerCalls.push(...Array(taskCount).fill(Date.now()));
    try {
      return await run();
    } finally {
      providerInFlight -= 1;
    }
  }

  async function requestManager(mode, input, reserveGuestTurn) {
    const committee = mode === 'committee';
    const specialistCount = committee ? selectCommittee(input.preview.reviews).length : 0;
    if (committee && specialistCount === 0) {
      throw new ManagerUnavailable('Assign at least one active specialist or choose the single manager or Replay.');
    }
    const propose = committee ? proposeWithCommittee : proposeWithHarness;
    return withHostedBudget(specialistCount + 1, () => propose(input, { env, fetchImpl }),reserveGuestTurn);
  }

  async function sendTeamChat(fund, body, workspace, reserveGuestTurn) {
    const message = requiredText(body.message, 'Message', 800);
    const language = actionLanguage(body.language, /[\u3400-\u9fff]/u.test(message) ? 'zh-CN' : 'en-US');
    const mode = body.provider ?? 'harnessrouter';
    if (!['replay', 'harnessrouter'].includes(mode)) throw new HttpError(400, 'Choose Replay or HarnessRouter for teammate chat.');
    const activeTeam = fund.team.filter(({ role, desk }) => role === 'manager' || desk !== 'bench');
    const lowered = message.trimStart().toLowerCase();
    const member = body.memberId !== undefined
      ? activeTeam.find(({ id }) => id === body.memberId)
      : activeTeam.find(({ name }) => lowered.startsWith(name.toLowerCase()) && /^[,，:：]/u.test(lowered.slice(name.length).trimStart())) ?? activeTeam.find(({ role }) => role === 'manager') ?? activeTeam[0];
    if (!member) throw new HttpError(400, 'Choose a teammate who is assigned to a desk.');
    const run = body.runId ? fund.runs.find(r => r.id === body.runId) : fund.runs[0];
    if (body.runId && !run) throw new HttpError(404, 'This receipt was not found in the selected fund.');
    const scenario = run?.scenario ?? SCENARIOS.find(({ id }) => id === fund.scenarioId);
    if (mode === 'harnessrouter' && !provider.chatEnabled) throw new ManagerUnavailable('Hosted teammate chat is unavailable. Choose Replay to continue offline.');
    if (mode==='harnessrouter' && member.role!=='manager' && assignmentIntent(message)) {
      const result=await withHostedBudget(1,()=>proposeAssignment({member,message,language,idempotencyKey:body.requestId && fund.id+':'+body.requestId},{env,fetchImpl}),reserveGuestTurn);
      member.assignmentDraft=result.draft;
      recordChat(fund,message,member,result.advice);
      return;
    }
    if (mode === 'harnessrouter' && member.role === 'manager' && hiringIntent(message)) {
      const candidates = CANDIDATES.filter(c => c.role !== 'manager' && !fund.team.some(m => m.id === c.id));
      const result = await withHostedBudget(1, () => proposeHire({ message,language,candidates,team:fund.team,
        idempotencyKey:body.requestId && `${fund.id}:${body.requestId}` }, {env,fetchImpl}),reserveGuestTurn);
      fund.hiringDraft = result.draft;
      recordChat(fund,message,member,result.advice);
      return;
    }
    const closeObservation = mode === 'harnessrouter' && body.studioReview === true && !fund.replica
      ? await studioReview({workspace, fund, journal:store.studioMarks, readReference:readMarketReference}) : null;
    const watchBrief = member.role === 'manager' && !body.runId && !fund.replica
      ? officeWatchBrief(watch.view(workspace, fund), language) : null;
    const advice = mode === 'harnessrouter'
      ? await withHostedBudget(1, () => proposeTeamReply({ member, message, fund, scenario, run, watch:watchBrief, closeObservation, language, idempotencyKey:body.requestId && `${fund.id}:${body.requestId}` },  { env, fetchImpl }),reserveGuestTurn)
      : replayTeamReply({fund, member, message, run, watch:watchBrief, language, selectedReceipt:Boolean(body.runId)});
    recordChat(fund, message, member, { ...advice, ...(run ? { runId:run.id } : {}) });
  }

  async function runFund(accountId, fund, body, origin = 'manual', activity, reserveGuestTurn) {
    const inputs = {
      scenarioId: body.scenarioId ?? fund.scenarioId,
      mandate: fund.mandate, maxWeightPercent: fund.maxWeightPercent,
      team: fund.team, portfolio: fund.portfolio, permissions: fund.permissions,
    };
    const preview = evaluateRun(inputs);
    const selectedProvider = chooseProvider(body.provider, provider);
    const idempotencyKey = createHash('sha256').update(`${accountId}:${body.requestId}`).digest('hex');
    const emit = activity?.emit ?? (()=>{});
    if(selectedProvider==='harnessrouter') emit({actor:'manager',stage:'started',text:fund.mandate,source:'HarnessRouter'});
    const hosted = selectedProvider !== 'replay' ? await requestManager(selectedProvider, {
      preview, emit, mandate: fund.mandate, manager: fund.team.find(({ role }) => role === 'manager'), idempotencyKey, language: body.language,
    },reserveGuestTurn) : null;
    if (hosted && selectedProvider === 'harnessrouter') emit({actor:'manager',stage:'completed',text:hosted.proposal.summary,source:'HarnessRouter',responseId:hosted.harness.responseId});
    if(hosted) emit({actor:'manager',recipient:'engine',stage:'handoff',text:hosted.proposal.summary,source:'HarnessRouter',responseId:hosted.harness.responseId});
    emit({actor:'engine',stage:'started',text:body.language==='en-US'?'Checking mandate, cash and replay quote.':'核查授权、现金及模拟报价。',source:'Simulation engine'});
    const review = hosted ? evaluateRun({ ...inputs, managerProposal: hosted.proposal }) : preview;
    emit({actor:'engine',stage:'completed',text:review.execution.reason,source:'Simulation engine'});
    const run = {
      ...review, id: randomUUID(), requestId: body.requestId, fundId: fund.id,
      createdAt: new Date().toISOString(), provider: selectedProvider, origin, language: actionLanguage(body.language, 'en-US'),
      ...(hosted ? { harness: hosted.harness } : {}),
      ...(hosted?.reviews ? { reviews: hosted.reviews } : {}),
      ...(hosted?.unconsulted ? { unconsulted: hosted.unconsulted } : {}),
    };
    fund.portfolio = run.portfolio;
    if (run.execution.status === 'filled') fund.studioBookChangedAt = run.createdAt;
    fund.runs = [run, ...fund.runs].slice(0, MAX_RUNS);
    return run;
  }

  async function runShared(accountId, data, body) {
    const strategy = findStrategy(body.strategyId);
    const id = scenarioId(body.scenarioId ?? strategy.scenarioId);
    const selectedProvider = chooseProvider(body.provider, provider);
    const inputs = {
      scenarioId: id, mandate: strategy.mandate, maxWeightPercent: strategy.maxWeightPercent, mode: 'shared',
      ...(selectedProvider === 'committee' ? { team: SHARED_SPECIALISTS } : {}),
    };
    const preview = evaluateRun(inputs);
    if (preview.scenario.symbol !== strategy.symbol) throw new HttpError(400, `${strategy.name} uses ${strategy.symbol} replay scenarios.`);
    const idempotencyKey = createHash('sha256').update(`${accountId}:${body.requestId}`).digest('hex');
    const hosted = selectedProvider !== 'replay' ? await requestManager(selectedProvider, { preview, mandate: strategy.mandate, idempotencyKey, language: body.language }) : null;
    const baseDecision = preview.decision;
    const replayDecision = baseDecision.action === 'BUY' ? {
      ...baseDecision, targetWeightPercent: strategy.maxWeightPercent,
      summary: `${strategy.name} publishes a ${strategy.maxWeightPercent}% target for ${strategy.symbol} in this eligible research scenario.`,
    } : baseDecision;
    const proposal = hosted?.proposal ?? replayDecision;
    const books = data.sharedBooks[strategy.id] ??= {};
    const followers = FOLLOWER_ACCOUNTS.map(({ id, name, cash }) => {
      const outcome = evaluateRun({ ...inputs, portfolio: books[id] ?? { cash, positions: [] }, managerProposal: proposal });
      books[id] = outcome.portfolio;
      return { id, name, cash, execution: outcome.execution, portfolio: outcome.portfolio, policy: outcome.policy };
    });
    const runId = randomUUID();
    const createdAt = new Date().toISOString();
    const ownAccount = data.sharedFollows?.[strategy.id];
    if (ownAccount?.status === 'active') {
      const outcome = evaluateRun({ ...inputs, portfolio: ownAccount.portfolio, managerProposal: proposal });
      ownAccount.portfolio = outcome.portfolio;
      ownAccount.history = [{
        runId, createdAt, scenarioId: preview.scenario.id,
        action: proposal.action, symbol: proposal.symbol, targetWeightPercent: proposal.targetWeightPercent,
        execution: outcome.execution, equity: outcome.portfolio.equity,
      }, ...ownAccount.history].slice(0, MAX_RUNS);
      followers.push({
        id: ownAccount.id, name: 'Your paper account', personal: true,
        cash: outcome.portfolio.initialCash, execution: outcome.execution, portfolio: outcome.portfolio, policy: outcome.policy,
      });
    }
    const run = {
      ...preview, id: runId, requestId: body.requestId, strategyId: strategy.id,
      createdAt, provider: selectedProvider, language: actionLanguage(body.language, 'en-US'),
      decision: { ...proposal, source: hosted ? 'HarnessRouter' : 'Deterministic replay' },
      policy: followers[0].policy, execution: followers[0].execution,
      portfolio: followers[0].portfolio, followers,
      ...(hosted ? { harness: hosted.harness } : {}),
      ...(hosted?.reviews ? { reviews: hosted.reviews } : {}),
      ...(hosted?.unconsulted ? { unconsulted: hosted.unconsulted } : {}),
    };
    data.sharedRuns = [run, ...data.sharedRuns].slice(0, MAX_RUNS);
    return run;
  }

  function armSchedule() {
    clearTimeout(scheduleTimer);
    const generation = ++scheduleGeneration;
    if (closed || publicDemo) return;
    const next = store.nextRun();
    if (!next) return;
    const delay = Math.max(0, Date.parse(next.nextRunAt) - Date.now());
    scheduleTimer = setTimeout(async () => {
      try {
        await captureAsyncLock(locks, next.sessionId, async () => {
          if (closed) return;
          const current = store.read(next.sessionId);
          const fund = current?.data.funds.find(({ id }) => id === next.fundId);
          if (!fund?.schedule.enabled || fund.schedule.nextRunAt !== next.nextRunAt) return;
          const requestId = `schedule:${fund.id}:${Date.parse(next.nextRunAt)}`;
          const run = await runFund(next.sessionId, fund, { requestId, provider: 'replay' }, 'schedule');
          const timestamp = Date.now();
          fund.schedule.lastRunAt = new Date(timestamp).toISOString();
          fund.schedule.nextRunAt = new Date(timestamp + FREQUENCIES[fund.schedule.frequency]).toISOString();
          store.save(next.sessionId, current.revision, current.data, { requestId, signature: 'scheduled-replay', run });
        });
      } catch (error) {
        if (!(error instanceof SessionConflict)) console.error('Fundroom scheduled replay failed:', error.name);
      } finally {
        if (!closed && generation === scheduleGeneration) {
          // Avoid repeatedly retrying a failed schedule in the same event loop turn.
          scheduleTimer = setTimeout(armSchedule, 1_000);
          scheduleTimer.unref();
        }
      }
    }, delay);
    scheduleTimer.unref();
  }

  function requireTrustedRequest(request, pathname) {
    const address = server.address();
    const expectedPort = typeof address === 'object' && address ? address.port : port;
    const localHosts = LOOPBACK.map((name) => `${name === '::1' ? '[::1]' : name}${expectedPort === 80 ? '' : `:${expectedPort}`}`);
    const authority = request.headers.host?.toLowerCase();
    const preview = !publicDemo && !localHosts.includes(authority) && isLocalPreview(request, authority, pathname);
    if (!localHosts.includes(authority) && !preview && (!publicOrigin || authority !== new URL(publicOrigin).host)) {
      throw new HttpError(403, 'This host is not allowed.', 'untrusted-host');
    }
    // Allow visitors to follow a shared link to the static welcome page.
    // API and broker traffic still needs to originate in Fundroom.
    if (['GET', 'HEAD'].includes(request.method)) {
      if(['/', '/index.html'].includes(pathname))return;
      if(['/membership.html','/checkout-test','/checkout-test/','/checkout-test.html','/judges.html','/build-log.html','/fund-operator.html','/studio','/studio/','/funds','/funds/','/team','/team/','/portfolio','/portfolio/'].includes(pathname) && request.headers['sec-fetch-mode']==='navigate' &&
        (!request.headers['sec-fetch-dest'] || request.headers['sec-fetch-dest']==='document'))return;
    }
    const origin = request.headers.origin;
    // Stripe posts a signed raw body without browser credentials or Origin.
    if(((billing && pathname==='/api/billing/webhook')||(paypal && pathname==='/api/billing/paypal/webhook'))
      && request.method==='POST' && !origin && !request.headers['sec-fetch-site'])return;
    if (preview && request.method === 'POST' && origin !== `http://${authority}`) {
      throw new HttpError(403, 'Preview actions must come from the displayed preview origin.', 'untrusted-origin');
    }
    if ((origin && origin !== publicOrigin && origin !== `http://${authority}`) || ['cross-site', 'same-site'].includes(request.headers['sec-fetch-site'])) {
      throw new HttpError(403, 'Requests must come from this workspace origin.', 'untrusted-origin');
    }
    if (publicDemo && request.method === 'POST' && origin !== publicOrigin) {
      throw new HttpError(403, 'Public demo actions require the configured origin.', 'untrusted-origin');
    }
  }

  function requireLocalBrokerRequest(request) {
    if (publicDemo || !isDirectLoopback(request)) {
      throw new HttpError(403, 'Broker operations require a direct connection to this computer.', 'broker-local-only');
    }
    if (request.method === 'POST' && request.headers.origin !== `http://${request.headers.host}`) {
      throw new HttpError(403, 'Broker operations must come from this workspace origin.', 'untrusted-origin');
    }
  }

  function limitRequest(request, sessionId, pathname) {
    if (!publicDemo) return;
    const now = Date.now(), minute = Math.floor(now / 60_000);
    let localRead = request.method === 'GET' && LOCAL_STATUS_READS.has(pathname);
    if (request.method === 'GET' && LOCAL_WORKSPACE_READS.has(pathname) && sessionId) {
      const workspaceId = auth.authenticate(sessionId)?.workspaceId ?? (!auth.isPrivateWorkspace(sessionId) ? sessionId : null);
      // Unknown sessions may create a workspace. Keep those requests in the original quota.
      localRead = Boolean(workspaceId && store.read(workspaceId));
    }
    const prefix = localRead ? 'read:' : '';
    const quotas = [
      { key: `${prefix}ip:${requestQuotaAddress(request, railwayQuotaHost)}`, maximum: localRead ? 360 : 120 },
      ...(sessionId ? [{ key: `${prefix}session:${sessionId}`, maximum: localRead ? 180 : 30 }] : []),
    ];
    const limited = message => Object.assign(new HttpError(429, message, 'rate-limit'), {
      retryAfter: Math.max(1, Math.ceil(((minute + 1) * 60_000 - now) / 1000)),
    });
    if (requestLimits.size > 4096) {
      for (const [key, value] of requestLimits) if (value.minute !== minute) requestLimits.delete(key);
    }
    for (const { key, maximum } of quotas) {
      if (!requestLimits.has(key) && requestLimits.size >= 8192) throw limited('The public demo is busy.');
      const value = requestLimits.get(key);
      if (!value || value.minute !== minute) requestLimits.set(key, { minute, count: 1 });
      else if (++value.count > maximum) {
        throw limited('Try again after the current request window.');
      }
    }
  }

  function setBrowserCookie(response, token, maxAge = 2592000) {
    response.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${publicOrigin ? '; Secure' : ''}`);
  }

  const auth = store.accounts;

  async function accessAccount(request, response, pathname) {
    const cookie = readCookie(request);
    const signedIn = auth.authenticate(cookie);
    if (pathname === '/api/auth/session' && request.method === 'GET') return sendJson(response, 200, { user: signedIn?.user ?? null });
    if (request.method !== 'POST' || !['/api/auth/register','/api/auth/login','/api/auth/logout'].includes(pathname)) {
      throw new HttpError(404, 'That account route was not found.');
    }
    if (request.headers.origin !== (publicOrigin ?? `http://${request.headers.host}`)) {
      throw new HttpError(403, 'Account changes require the same origin.', 'untrusted-origin');
    }
    const input = await readBody(request);
    if (pathname === '/api/auth/logout') {
      auth.revoke(cookie);
      setBrowserCookie(response, '', 0);
      return sendJson(response, 200, {user:null});
    }
    if (signedIn) throw new HttpError(409, 'You are already signed in. Sign out first.', 'auth-changed');
    const guestId = cookie && !auth.isPrivateWorkspace(cookie) && store.read(cookie) ? cookie : null;
    if (!guestId && publicDemo && pathname === '/api/auth/register' && store.count() >= 2000) {
      throw new HttpError(503, 'The public demo reached its workspace limit.', 'demo-capacity');
    }
    const result = await auth.enter(pathname.endsWith('/register') ? 'register':'login', input, {
      ip:requestQuotaAddress(request, railwayQuotaHost), guestId, initialState:()=>createState(actionLanguage(input.language)),
    });
    setBrowserCookie(response, result.token);
    return sendJson(response, 200, {user:result.user});
  }

  function session(request, response, language) {
    const cookie = readCookie(request);
    const registered = auth.authenticate(cookie);
    const workspaceId = registered?.workspaceId ?? (cookie && !auth.isPrivateWorkspace(cookie) ? cookie : null);
    const existing = workspaceId ? store.read(workspaceId) : null;
    if (existing) return { id: workspaceId, ...existing };
    if (request.method !== 'GET') throw new HttpError(401, 'Reload the workspace to start a session.', 'session-required');
    if (publicDemo && store.count() >= 2000) throw new HttpError(503, 'The public demo reached its session limit.', 'demo-capacity');
    const id = randomUUID();
    const saved = store.create(id, createState(language));
    setBrowserCookie(response, id);
    return { id, ...saved };
  }

  async function performAction(sessionId,body,authorizeCommit,reserveGuestTurn) {
    authorizeCommit?.();
    const tracked=['runScenario','reviewResearch'].includes(body.action) && typeof body.requestId === 'string' && REQUEST_ID.test(body.requestId) && !body.requestId.startsWith('schedule:');
    if (!tracked || store.readReceipt(sessionId,body.requestId)) return performActionInner(sessionId,body,authorizeCommit,undefined,reserveGuestTurn);
    const activity=store.activity.start(sessionId,body.requestId,body.action,operationSignature(body));
    if(!activity) throw new HttpError(409,'A different or concurrent task is using this request ID.','request-id-conflict');
    try {
      const result=await performActionInner(sessionId,body,authorizeCommit,activity,reserveGuestTurn);
      activity.finish(result.researchReviews?.[body.catalogId]?.status && body.action==='reviewResearch' ? result.researchReviews[body.catalogId].status:'complete');
      return result;
    } catch(error) {
      const snapshot=activity.snapshot('failed');
      for(const started of snapshot?.events.filter(e=>e.stage==='started') ?? []) {
        if (!snapshot.events.some(e=>e.actor===started.actor && ['completed','failed','skipped'].includes(e.stage))) {
          activity.emit({actor:started.actor,stage:'failed',text:body.language==='en-US'?'This assignment stopped without a usable result.':'该任务结束时未得到可用结果。',source:started.source});
        }
      }
      activity.emit({actor:'coordinator',stage:'failed',text:body.language==='en-US'?'The task ended without a committed outcome.':'本轮任务未提交结果。',source:'Coordinator'});
      activity.finish('failed');
      throw error;
    }
  }

  async function performActionInner(sessionId, body, authorizeCommit, activity, reserveGuestTurn) {
    authorizeCommit?.();
    if (body.language !== undefined) actionLanguage(body.language);
    const stored = store.read(sessionId);
    if (!stored) throw new HttpError(401, 'The workspace session changed. Reload the page.', 'session-required');
    const { data, revision } = stored;
    function requireStudioAccess() {
      if (membershipFor(data,sessionId,true).status === 'expired') {
        throw new HttpError(402, 'Your Studio trial has ended. See membership options. Your holdings and decision records remain available.', 'studio-trial-ended');
      }
    }
    let extras = {};
    let entry = null;
    let openingOrder = null;
    let scheduleChanged = false;
    const extended = ['concierge','prepareResearch','confirmResearch','reviewResearch','confirmHire','confirmAssignment'].includes(body.action) ||
      (['sendChat','updateMember'].includes(body.action) && body.requestId !== undefined);
    if (body.action==='buffettExplanation') {
      const signature=operationSignature(body);
      const previous=store.readReceipt(sessionId,body.requestId);
      if(previous && signature!==previous.signature)throw new HttpError(409,'This request ID is already in use.','request-id-conflict');
      if(previous)return presentState(sessionId,data,provider,connectionConfig,previous.run.result);
      const archive=await readFile(resolve(WEB,'data','buffett-ai-study.json'),'utf8').catch(()=>null);
      if(!archive)throw new HttpError(503,'The historical record is unavailable.');
      const run=JSON.parse(archive);
      const decision=run.id===body.runId && run.decisions.find(d=>d.id===body.decisionId);
      if(!decision)throw new HttpError(404,'Unknown historical decision.');
      if(!provider.chatEnabled)throw new ManagerUnavailable('The live archive reviewer is unavailable.');
      extras.buffettReply=await withHostedBudget(1,()=>explainDecision({decision,message:body.message.trim(),language:body.language,
        idempotencyKey:sessionId+':'+body.requestId},{env,fetchImpl}),reserveGuestTurn);
      entry={requestId:body.requestId,signature,run:{kind:'buffett-explanation',result:extras}};
    } else if (extended) {
      if (typeof body.requestId !== 'string' || !REQUEST_ID.test(body.requestId) || body.requestId.startsWith('schedule:')) {
        throw new HttpError(400, 'Provide a unique request ID.');
      }
      const signature = operationSignature(body);
      const previous = store.readReceipt(sessionId,body.requestId);
      if (previous && !sameOperation(previous.signature,body)) throw new HttpError(409, 'This request ID is already in use.', 'request-id-conflict');
      if (previous) return presentState(sessionId,data,provider,connectionConfig,previous.run.result ?? {});
      const language = actionLanguage(body.language);
      if (['sendChat','confirmHire','confirmAssignment','updateMember'].includes(body.action)) {
        const fund = findFund(data,body.fundId);
        if (body.action === 'sendChat') {
          if (!fund.replica && body.provider !== 'replay') requireStudioAccess();
          await sendTeamChat(fund,body,sessionId,reserveGuestTurn);
        }
        else if (body.action==='updateMember') changeMember(fund, body);
        else if (body.action==='confirmAssignment') {
          const seat=fund.team.find(m=>m.id===body.memberId);
          const plan=seat?.assignmentDraft;
          if (!plan || plan.id!==body.draftId) throw new HttpError(409,'Review the current assignment before saving.');
          seat.duty=plan.duty;
          if (plan.title) seat.title=plan.title;
          delete seat.assignmentDraft;
        } else {
          const draft = fund.hiringDraft;
          const hires=draft?.hires ?? (draft?.candidateId?[{...CANDIDATES.find(c=>c.id===draft.candidateId),duty:draft.duty,desk:draft.desk}]:[]);
          if (!draft || body.draftId !== draft.id || !hires.length || fund.team.length+hires.length>MAX_TEAM_SIZE ||
              hires.some(h=>!h.id || fund.team.some(m=>m.id===h.id || m.name.toLowerCase()===h.name.toLowerCase()))) {
            throw new HttpError(409,'Review the latest staffing proposal before hiring.','hire-draft-changed');
          }
          fund.team.push(...hires);
          fund.hiringDraft = null;
        }
      } else if (body.action === 'reviewResearch') {
        const study = data.researchStudies?.[body.catalogId];
        if (!study || !['historical-proxy','method-only'].includes(study.status)) throw new HttpError(400,'Complete a research study before requesting a team review.');
        if(!provider.chatEnabled) throw new ManagerUnavailable('The historical research team requires a configured HarnessRouter.');
        const plan=planResearchReview(study,language,body.retry===true ? data.researchReviews?.[study.catalogId] : null);
        const review = await withHostedBudget(plan.taskCount,()=>reviewHistoricalResearch({study,language,plan,idempotencyKey:`${sessionId}:${body.requestId}`,emit:activity.emit},{env,fetchImpl}),reserveGuestTurn);
        review.activity=activity.snapshot(review.status);
        data.researchReviews??={};
        data.researchReviews[study.catalogId]=review;
      } else if (body.action === 'confirmResearch') {
        const draft = data.researchDraft;
        if (!draft || draft.id !== body.draftId) throw new HttpError(409,'Review the current research proposal.','research-draft-changed');
        const study = runReplicaStudy(draft.catalogId);
        const receipt = {...study, completedAt:new Date().toISOString()};
        data.researchStudies ??= {};
        if (body.createFund === true) {
          let fund = data.funds.find(f => f.replica?.catalogId === study.catalogId);
          if (!fund) {
            if (data.funds.length >= MAX_FUNDS) throw new HttpError(400,'Workspace fund limit reached.');
            const name = study.ticker + (language === 'zh-CN' ? ' · 历史模拟基金' : ' historical paper fund');
            fund = createFund({ name, mandate:draft.request }, data.funds.length+1);
            fund.team.push({ ...CANDIDATES.find(c => c.id === 'leah-kim') });
            const tasks = language === 'zh-CN'
              ? {manager:'解释公开资料、季度权重与每张模拟回执。', research:'核对发布方季度总回报与历史数据出处。', quant:'按固定权重计算研究单位及季度调整。', risk:'核查跟踪误差、样本边界、集中度与授权。', trader:'按历史观察点核对研究单位、成本与持仓。'}
              : {manager:'Explain the public evidence, allocation and recorded paper fills.', research:'Verify the issuer quarterly total returns and their sources.', quant:'Compute fixed sleeve weights and quarterly adjustments.', risk:'Challenge tracking error, sample limitations and limits.', trader:'Reconcile historical unit quantities, costs and holdings.'};
            for (const teammate of fund.team) teammate.duty = tasks[teammate.role] ?? teammate.duty;
            beginHistoricalFund(fund,study);
            const run = runHistoricalAllocation(fund,study,body.requestId,language);
            extras.run = run;
            data.funds.push(fund);
          }
          data.selectedFundId=fund.id;
          extras.createdFundId=fund.id;
          if (data.guide) data.guide={...data.guide,phase:'created',draft:null,fundId:fund.id};
        }
        data.researchStudies[study.catalogId]=receipt;
        data.researchDraft=null;
      } else {
        const message = requiredText(body.message,'Message',800);
        const target = resolveResearchTarget(body.catalogId ?? message);
        if (body.action === 'concierge') {
          const previousTarget = data.lobbyGuide?.catalogId ? findCatalog(data.lobbyGuide.catalogId) : null;
          data.lobbyGuide = await withHostedBudget(1,()=>conciergeReply({message,language,target,previousTarget,lastReply:data.lobbyGuide,
            idempotencyKey:`${sessionId}:${body.requestId}`},{env,fetchImpl}),reserveGuestTurn);
          if (data.lobbyGuide.fundAction === 'history') {
            const item = findCatalog(data.lobbyGuide.catalogId);
            if (item && !(/审阅|评审|review/iu.test(message) && data.researchStudies?.[item.id])) data.researchDraft=researchDraft(item,message);
          }
        } else {
          if (!target) throw new HttpError(400,'Select a recognized research target, such as VWELX.','research-target');
          data.researchDraft=researchDraft(target,message);
        }
      }
      entry = {requestId:body.requestId,signature,run:{kind:'workspace',result:extras}};
    } else if (['designConversation','adjustDraftRoster','prepareSoloStudio','prepareTeamStudio','resetDesignConversation','confirmFundDraft'].includes(body.action)) {
      if (typeof body.requestId !== 'string' || !REQUEST_ID.test(body.requestId) || body.requestId.startsWith('schedule:')) {
        throw new HttpError(400, 'Provide a unique request ID for this conversation step.');
      }
      const signature = operationSignature(body);
      const previous = store.readReceipt(sessionId, body.requestId);
      if (previous && !sameOperation(previous.signature, body)) throw new HttpError(409, 'This request ID was already used for another conversation step.', 'request-id-conflict');
      if (previous) return presentState(sessionId,data, provider, connectionConfig, previous.run.result ?? {});
      if (body.action === 'resetDesignConversation' || (body.restart === true && !body.message?.trim())) {
        data.guide = newGuide(body.language);
      } else if (body.action === 'prepareTeamStudio') {
        if (data.guide?.phase === 'created') throw new HttpError(409,'This team already has a paper fund.', 'draft-changed');
        data.guide=prepareTeamBlueprint(data.guide ?? newGuide(body.language), body.language);
      } else if (body.action === 'prepareSoloStudio') {
        data.guide=managerOnlyBlueprint(data.guide??newGuide(body.language),body.language);
      } else if (body.action === 'adjustDraftRoster') {
        try {data.guide=adjustDraftRoster(data.guide, {draftId:body.draftId,operation:body.operation,memberId:body.memberId,candidateId:body.candidateId},body.language);}
        catch(error){if(error.code==='draft-changed')throw new HttpError(409,error.message,error.code);throw error;}
      } else if (body.action === 'designConversation') {
        if (body.provider !== 'replay') requireStudioAccess();
        const message = requiredText(body.message, 'Message', 800);
        const mode = body.provider ?? 'harnessrouter';
        if (!['replay', 'harnessrouter'].includes(mode)) throw new HttpError(400, 'Choose the guided walkthrough or the hosted manager.');
        const guide = body.restart ? newGuide(body.language) : data.guide ?? newGuide();
        const rosterChange=requestedDraftChange(guide,message);
        if (mode === 'harnessrouter' && !provider.chatEnabled && !rosterChange) throw new ManagerUnavailable('The hosted guide is unavailable. You can continue with the clearly labelled guided walkthrough.');
        const target = researchIntent(message) && resolveResearchTarget(message);
        const wantsReplica = /复刻|仿造|复制|replicat(?:e|ion)|recreat(?:e|ion)/iu.test(message);
        if (target && (target.section === 'market' || wantsReplica)) {
          const language = actionLanguage(body.language, /[\u3400-\u9fff]/u.test(message) ? 'zh-CN' : 'en-US');
          const answer = mode === 'harnessrouter'
            ? await withHostedBudget(1, () => conciergeReply({ message, language, target, lastReply:null,
              idempotencyKey:`${sessionId}:${body.requestId}` }, {env,fetchImpl}),reserveGuestTurn)
            : {text: language === 'zh-CN' ? `请确认 ${target.ticker} 的历史研究方案。` : `Review the historical research proposal for ${target.ticker}.`, source:'Guided replay'};
          const timestamp = new Date().toISOString();
          data.researchDraft = researchDraft(target,message);
          data.guide = { ...guide, phase:'discovery', draft:null, language, messages:[...guide.messages,
            {id:randomUUID(),role:'user',text:message,timestamp},
            {id:randomUUID(),role:'assistant',name:'Maya',...answer,timestamp}].slice(-24) };
        } else {
          const turn = () => designConversationTurn({ guide, message, language: body.language, hosted: mode === 'harnessrouter', idempotencyKey: `${sessionId}:${body.requestId}` }, { env, fetchImpl });
          data.guide = mode === 'harnessrouter' && !rosterChange ? await withHostedBudget(1, turn,reserveGuestTurn) : await turn();
        }
      } else {
        const guide = data.guide;
        if (guide?.phase !== 'ready' || !guide.draft || guide.draft.id !== body.draftId) {
          throw new HttpError(409, 'The blueprint changed. Review the latest version before confirming.', 'draft-changed');
        }
        if (data.funds.length >= MAX_FUNDS) throw new HttpError(400, `A session can create up to ${MAX_FUNDS} funds.`);
        const fund = createFund(guide.draft, data.funds.length + 1);
        fund.team=guide.draft.roster.map(seat=>({...CANDIDATES.find(candidate=>candidate.id===seat.id),...seat}));
        requireStudioAccess();
        beginStudioTrial(data);
        openingOrder = addStudioFund(data, fund);
        data.guide = { ...guide, phase: 'created', fundId: fund.id };
        extras.createdFundId = fund.id;
      }
      entry = { requestId: body.requestId, signature, run: { kind: 'conversation', result: extras } };
    } else if (['catalogChat', 'catalogBacktest', 'catalogBuy', 'catalogSell'].includes(body.action)) {
      const item = findCatalog(body.catalogId);
      if (!item) throw new HttpError(400, 'Choose a fund from the research catalog.');
      if (typeof body.requestId !== 'string' || !REQUEST_ID.test(body.requestId) || body.requestId.length > 100 || body.requestId.startsWith('schedule:')) {
        throw new HttpError(400, 'Provide a unique request ID for this catalog action.');
      }
      const signature = operationSignature(body);
      const previous = store.readReceipt(sessionId, body.requestId);
      if(previous?.run.kind==='portfolio-order'&&sameOperation(previous.signature,body))
        return presentState(sessionId,data,provider,connectionConfig,{portfolioReceipt:previous.run.receipt});
      if(['catalogBuy','catalogSell'].includes(body.action)&&(!previous||previous.run.kind==='portfolio-order')){
        const buying=body.action==='catalogBuy',amountCents=Math.round(body.amount*100);
        if(buying&&(!Number.isFinite(body.amount)||body.amount<10||body.amount>10000||amountCents/100!==body.amount))
          throw new HttpError(400,'Enter a USD amount from $10 to $10,000, with at most two decimals.','catalog-order-rejected');
        const order={requestId:body.requestId,productId:'catalog:'+item.id,side:buying?'buy':'sell',
          ...(buying?{amountCents}:{})};
        const {receipt}=store.orderPortfolio(sessionId,order,{legacy:true});
        const current=store.read(sessionId);
        if(!current)throw new HttpError(401,'The workspace session changed. Reload the page.','session-required');
        return presentState(sessionId,current.data,provider,connectionConfig,{portfolioReceipt:receipt});
      }
      if (previous && !sameOperation(previous.signature, body)) throw new HttpError(409, 'This request ID was already used for another catalog action.', 'request-id-conflict');
      if (previous) return presentState(sessionId,data, provider, connectionConfig, previous.run.result ?? {});
      if (body.action === 'catalogChat') {
        const message = requiredText(body.message, 'Message', 800);
        const mode = body.provider ?? 'harnessrouter';
        if (!['replay', 'harnessrouter'].includes(mode)) throw new HttpError(400, 'Choose the hosted research manager or the study walkthrough.');
        if (mode === 'harnessrouter' && !provider.chatEnabled) throw new ManagerUnavailable('The research manager is unavailable. Please use the study walkthrough or retry.');
        const history = data.catalogChats?.[item.id] ?? [];
        const language = actionLanguage(body.language, /[\u3400-\u9fff]/u.test(message) ? 'zh-CN' : 'en-US');
        const zh = language === 'zh-CN';
        const localized = item.localized?.[language];
        const result = data.researchStudies?.[item.id] ?? runReplicaStudy(item.id);
        const brief = researchBrief(result,language);
        const study = { ...item, ...localized, researchBrief:brief };
        const advice = mode === 'harnessrouter'
          ? await withHostedBudget(1, () => proposeCatalogReply({ entry: study, message, history, language, idempotencyKey:sessionId+':'+body.requestId }, { env, fetchImpl }),reserveGuestTurn)
          : { text: zh || localized
            ? `${study.summary} ${brief.rule} ${brief.checks.map(c=>c.detail).join(' ')} ${zh ? '这是依据公开资料整理的示例讲解。' : 'This is an offline walkthrough based on public research.'}`
            : `This is an offline study walkthrough of ${item.reference || item.ticker || item.id}. Review its published research sources, assumptions and limits in the fund study. It does not place an order or change any account.`, language, source: 'Study walkthrough' };
        const timestamp = new Date().toISOString();
        data.catalogChats ??= {};
        data.catalogChats[item.id] = [...history,
          { id: randomUUID(), role: 'user', text: message, timestamp },
          { id: randomUUID(), role: 'assistant', name: `${study.name} · AI`, ...advice, timestamp },
        ].slice(-30);
      } else if (body.action === 'catalogBacktest') {
        data.catalogBacktests ??= {};
        data.catalogBacktests[item.id] = catalogBacktest(item.id);
        extras.catalogBacktest = data.catalogBacktests[item.id];
      }
      entry ??= { requestId: body.requestId, signature, run: { kind: 'catalog', result: extras } };
    } else if (['runScenario', 'runShared'].includes(body.action)) {
      if (typeof body.requestId !== 'string' || !REQUEST_ID.test(body.requestId) || body.requestId.startsWith('schedule:')) throw new HttpError(400, 'Provide a unique request ID for the replay.');
      const signature = operationSignature(body);
      const previous = store.readReceipt(sessionId, body.requestId);
      if (previous && !sameOperation(previous.signature, body)) throw new HttpError(409, 'This request ID was already used for a different replay.', 'request-id-conflict');
      if (previous) return presentState(sessionId,data, provider, connectionConfig, { run: previous.run });
      let run;
      if (body.action === 'runScenario') {
        const fund = findFund(data, body.fundId);
        changeFund(fund, body);
        if (fund.replica) {
          activity?.emit({actor:'engine',stage:'started',text:body.language==='en-US'?'Applying authorized historical sleeve allocation.':'按已授权的历史权重核算研究单位。',source:'Historical simulation engine'});
          run = runHistoricalAllocation(fund,data.researchStudies?.[fund.replica.catalogId],body.requestId,actionLanguage(body.language));
          activity?.emit({actor:'engine',stage:'completed',text:run.execution.reason,source:'Historical simulation engine'});
        } else {
          if ((body.provider ?? provider.mode) !== 'replay') requireStudioAccess();
          run = await runFund(sessionId, fund, body, 'manual', activity,reserveGuestTurn);
        }
      } else {
        run = await runShared(sessionId, data, body);
      }
      if (activity) run.activity=activity.snapshot('complete');
      entry = { requestId: body.requestId, signature, run };
      extras = { run };
    } else if (body.action === 'createFund') {
      if (body.requestId !== undefined) {
        if (typeof body.requestId !== 'string' || !REQUEST_ID.test(body.requestId) || body.requestId.startsWith('schedule:')) {
          throw new HttpError(400, 'Provide a unique fund creation request ID.');
        }
        const previous = store.readReceipt(sessionId, body.requestId);
        if (previous) {
          if (!sameOperation(previous.signature,body)) throw new HttpError(409,'This request ID is already in use.','request-id-conflict');
          return presentState(sessionId,data,provider,connectionConfig,previous.run.result);
        }
      }
      requireStudioAccess();
      if (data.funds.length >= MAX_FUNDS) throw new HttpError(400, `A session can create up to ${MAX_FUNDS} funds.`);
      const fund = createFund(body, data.funds.length + 1);
      beginStudioTrial(data);
      openingOrder = addStudioFund(data, fund);
      extras.createdFundId = fund.id;
      if (body.requestId) entry = {requestId:body.requestId, signature:operationSignature(body), run:{kind:'workspace',result:extras}};
    } else if (body.action === 'setMembershipInterest') {
      if (typeof body.interested !== 'boolean') throw new HttpError(400, 'Choose whether to register interest.');
      setStudioInterest(data, body.interested);
    } else if (body.action === 'backtest') {
      const strategy = findStrategy(body.strategyId);
      const backtest = backtestStrategy(strategy.id);
      data.backtests[strategy.id] = backtest;
      extras = { backtest };
    } else if (['followShared', 'setSharedFollowStatus'].includes(body.action)) {
      changeSharedFollow(data, body);
    } else {
      const fund = findFund(data, body.fundId);
      switch (body.action) {
        case 'selectFund': data.selectedFundId = fund.id; break;
        case 'updateFund': changeFund(fund, body); break;
        case 'hireMember':
        case 'updateMember':
        case 'removeMember': changeMember(fund, body); break;
        case 'sendChat':
          if (!fund.replica && body.provider !== 'replay') requireStudioAccess();
          await sendTeamChat(fund, body,sessionId);
          break;
        case 'setSchedule':
          if (fund.replica && body.enabled) throw new HistoricalOrderError('Advance historical quarters explicitly in this study.');
          if (publicDemo && body.enabled) throw new HttpError(400, 'Open the local app to schedule synthetic replays.');
          updateSchedule(fund, body);
          scheduleChanged = true;
          break;
        default: throw new HttpError(400, 'Unknown workspace action.');
      }
    }
    authorizeCommit?.();
    store.save(sessionId, revision, data, entry, openingOrder);
    if (scheduleChanged) armSchedule();
    if(extras.createdFundId||body.action==='createFund')watch.wake();
    return presentState(sessionId,data, provider, connectionConfig, extras);
  }

  const server = createServer({ requestTimeout: 20_000, headersTimeout: 15_000 }, async (request, response) => {
    responseHeaders(response, publicOrigin);
    try {
      const { pathname, searchParams } = new URL(request.url, 'http://localhost');
      if (publicHosted && pathname==='/healthz' && ['GET','HEAD'].includes(request.method)) {
        store.count();
        return sendJson(response,200,{ready:true});
      }
      requireTrustedRequest(request, pathname);
      if (publicHosted && (pathname === '/broker.html' || (pathname.startsWith('/api/') && !PREVIEW_APIS.has(pathname) && !((billing||paypal) && BILLING_PATHS.has(pathname))))) {
        throw new HttpError(404, 'This route is not available on the public site.');
      }
      if (!pathname.startsWith('/api/')) return await serveAsset(request, response, pathname);
      if (pathname === '/api/review/fund-bars') {
        const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/iu.test(request.headers.host || '');
        if (request.method !== 'GET' || env.FUNDROOM_REVIEW_MARKET !== 'true' || publicDemo || publicHosted || !localHost || !isDirectLoopback(request)) {
          throw new HttpError(404, 'Page not found.');
        }
        const file = new URL('./.fundroom/market-review/etf-bars.json', import.meta.url);
        const archive = await readFile(file, 'utf8').catch(() => null);
        if (!archive) throw new HttpError(404, 'Historical sample unavailable.');
        response.setHeader('Cache-Control','private, no-store');
        return sendJson(response, 200, JSON.parse(archive));
      }
      limitRequest(request, readCookie(request), pathname);
      if(TEST_PATHS.has(pathname)){
        const action=pathname.split('/').at(-1),origin=publicOrigin??'http://'+request.headers.host;
        if(request.method!==(action==='state'?'GET':'POST'))throw new HttpError(405,'Method not allowed.');
        if(request.method==='POST'&&request.headers.origin!==origin)throw new HttpError(403,'Use the test checkout.','untrusted-origin');
        const owner=testOwner(request,response,origin.startsWith('https:'));
        const input=request.method==='POST'?await readBody(request):{mode:searchParams.get('mode')};
        return sendJson(response,200,await checkoutTest.run(action,owner,input,origin));
      }
      if(pathname==='/api/membership/orders'){
        if(request.method!=='POST')throw new HttpError(405,'Method not allowed.');
        if(request.headers.origin!==(publicOrigin??'http://'+request.headers.host))throw new HttpError(403,'Use the membership page.','untrusted-origin');
        const account=auth.authenticate(readCookie(request));
        if(!account)throw new HttpError(401,'Sign in to see your private orders.','billing-login-required');
        const body=await readBody(request);
        if(body.action==='withdraw')return sendJson(response,200,{order:store.invoices.withdraw(account.workspaceId,body.orderId)});
        if(body.action==='requestCancellation')return sendJson(response,200,{order:store.invoices.askToCancel(account.workspaceId,body.orderId)});
        if(body.action==='reportReceipt')return sendJson(response,200,{order:store.invoices.reportReceipt(account.workspaceId,body.orderId,body.transactionId)});
        if(!manualOrders||body.action!=='request')throw new HttpError(400,'One-time orders are not currently open.','invoice-unavailable');
        if(processorFor(account.workspaceId)?.subscriptionFor(account.workspaceId))throw new HttpError(409,'Manage your existing membership before purchasing a pass.','invoice-recurring');
        return sendJson(response,200,{order:store.invoices.request(account.workspaceId,body,Date.now(),goodsLinks)});
      }
      if(BILLING_PATHS.has(pathname)) {
        if(!billing&&!paypal)throw new HttpError(404,'Billing is not configured.','billing-unavailable');
        if(request.method!=='POST')throw new HttpError(405,'Method not allowed.');
        if(pathname==='/api/billing/webhook'||pathname==='/api/billing/paypal/webhook') {
          const paypalEvent=pathname==='/api/billing/paypal/webhook';
          const processor=paypalEvent?paypal:billing;
          if(!processor)throw new HttpError(404,'Billing is not configured.','billing-unavailable');
          const chunks=[];
          let bytes=0;
          for await(const chunk of request) {
            bytes+=chunk.length;
            if(bytes>131072)throw new HttpError(413,'The notification is too large.');
            chunks.push(chunk);
          }
          await processor.webhook(Buffer.concat(chunks),paypalEvent?request.headers:request.headers['stripe-signature']);
          return sendJson(response,200,{received:true});
        }
        if(request.headers.origin!==(publicOrigin??'http://'+request.headers.host))throw new HttpError(403,'Use the membership page.','untrusted-origin');
        const account=auth.authenticate(readCookie(request));
        if(!account)throw new HttpError(401,'Sign in to subscribe or manage billing.','billing-login-required');
        const body=await readBody(request);
        const processor=processorFor(account.workspaceId);
        if(manualOrders&&pathname==='/api/billing/checkout')throw new HttpError(409,'Choose a one-time membership pass.','invoice-one-time');
        if(pathname==='/api/billing/cancel'){
          if(!processor.cancel||body.confirm!==true)throw new HttpError(400,'Confirm the cancellation.','billing-confirm-required');
          await processor.cancel(account.workspaceId,{onlyPending:body.onlyPending===true});
          return sendJson(response,200,{ok:true});
        }
        if(processor.provider!=='paypal'&&body.cadence==='yearly'&&pathname==='/api/billing/checkout')throw new HttpError(400,'This billing profile supports monthly card billing.','billing-plan');
        const result=pathname==='/api/billing/checkout'?await processor.checkout(account.workspaceId,body.language,body.cadence):await processor.portal(account.workspaceId,body.language);
        return sendJson(response,200,result);
      }
      if (pathname === '/api/membership') {
        if (!['GET','POST'].includes(request.method)) throw new HttpError(405,'Method not allowed.');
        const owner=session(request,response);
        if (request.method==='GET') {
          await processorFor(owner.id)?.refresh?.(owner.id);
          const account=auth.authenticate(readCookie(request));
          return sendJson(response,200,{membership:membershipFor(owner.data,owner.id),workspaceHome:'/#/fund',
            orderAccount:account?{email:account.user.email,orders:store.invoices.orderList(account.workspaceId,goodsLinks)}:null});
        }
        if (!simulation || !isDirectLoopback(request) || request.headers.origin!=='http://'+request.headers.host) throw new HttpError(403,'Demo checkout is only available in the local review.','simulation-unavailable');
        const body=await readBody(request);
        const membership=await captureAsyncLock(locks,owner.id,()=>{
          const current=store.read(owner.id);
          changeSimulatedMembership(current.data,body);
          store.save(owner.id,current.revision,current.data);
          return membershipFor(current.data,owner.id);
        });
        return sendJson(response,200,{membership,workspaceHome:'/#/fund'});
      }
      if(pathname==='/api/broker-demo'){
        if(!['GET','POST'].includes(request.method)) throw new HttpError(405,'Method not allowed.');
        const owner=session(request,response);
        if(request.method==='GET') return sendJson(response,200,brokerDemoFor(owner.data));
        const body=await readBody(request);
        if(!body || Array.isArray(body) || Object.keys(body).some(key=>!['provider','workspaceRef','expectedVersion'].includes(key)) ||
            !['alpaca','ibkr',null].includes(body.provider) || typeof body.workspaceRef!=='string' ||
            !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion<0) {
          throw new HttpError(400,'Choose a supported demo broker. Only simulation settings are accepted.','broker-demo-input');
        }
        const result=await captureAsyncLock(locks,owner.id,()=>{
          // Recheck the active login after a queued workspace mutation.
          const active=session(request,response);
          const current=brokerDemoFor(active.data);
          if(active.id!==owner.id || active.data.funds[0].id!==body.workspaceRef ||
              (current.version!==body.expectedVersion && !(current.version===body.expectedVersion+1 && current.provider===body.provider))) {
            throw new HttpError(409,'Your workspace or connection changed. Reload before confirming.','broker-demo-changed');
          }
          if(current.provider===body.provider) return current;
          active.data.brokerDemo={provider:body.provider,version:current.version+1};
          store.save(active.id,active.revision,active.data);
          return active.data.brokerDemo;
        });
        return sendJson(response,200,result);
      }
      if(pathname==='/api/studio-watch'){
        if(!['GET','POST'].includes(request.method))throw new HttpError(405,'Method not allowed.');
        const {id,data}=session(request,response);
        const body=request.method==='POST'?await readBody(request):null;
        const fund=findFund(data,body?.fundId??searchParams.get('fund'));
        if(fund.id===data.funds[0].id||fund.replica)throw new HttpError(404,'Choose a founded Studio fund.','fund-not-found');
        if(body){
          if(Object.keys(body).some(k=>!['fundId','enabled','intervalMinutes'].includes(k))||!UUID.test(body.fundId)||
            (!Object.hasOwn(body,'enabled')&&!Object.hasOwn(body,'intervalMinutes'))||
            ('enabled' in body&&typeof body.enabled!=='boolean')||('intervalMinutes' in body&&![30,60,120].includes(body.intervalMinutes)))throw new HttpError(400,'Invalid watch preference.');
          store.watch.setPolicy(id,fund.id,body,Date.now());watch.wake();
        }
        const cursor=searchParams.get('before');
        if(cursor!==null&&(!/^\d{1,15}$/u.test(cursor)||Number(cursor)<=0))throw new HttpError(400,'Invalid history cursor.');
        return sendJson(response,200,watch.view(id,fund,cursor?Number(cursor):undefined));
      }
      if(pathname==='/api/portfolio/claim'){
        if(request.method!=='POST')throw new HttpError(405,'Method not allowed.');
        const body=await readBody(request);
        const {id}=session(request,response);
        return sendJson(response,200,store.orderPortfolio(id,body,{claim:true}));
      }
      if(pathname==='/api/portfolio'){
        if(!['GET','POST'].includes(request.method))throw new HttpError(405,'Method not allowed.');
        if(request.method==='GET'){
          const before=searchParams.get('before');
          if(before!==null&&!REQUEST_ID.test(before))throw new PortfolioError('portfolio-cursor','Invalid portfolio history cursor.',400);
          const {id}=session(request,response);
          return sendJson(response,200,store.readPortfolio(id,before));
        }
        const body=await readBody(request);
        const {id}=session(request,response);
        return sendJson(response,200,store.orderPortfolio(id,body));
      }
      const hostedGuest=publicHosted && request.method==='POST' && !pathname.startsWith('/api/auth/') && !auth.authenticate(readCookie(request));
      if (hostedGuest && !['/api/buffett/ask','/api/action','/api/fund-operator','/api/voice/transcribe','/api/voice/reply'].includes(pathname)) {
        throw new HttpError(401,'Sign in to use this workspace action.','sign-in-required');
      }
      if (pathname === '/api/fund-operator') {
        const {id,data} = session(request,response);
        if (request.method === 'GET') {
          return sendJson(response,200,viewForward(data,searchParams.get('fund'),actionLanguage(searchParams.get('lang') ?? undefined)));
        }
        if (request.method !== 'POST') throw new HttpError(405,'Method not allowed.');
        const body = await readBody(request);
        const cookie = readCookie(request);
        const authorize = () => {
          if (store.accounts.isPrivateWorkspace(id) && store.accounts.authenticate(cookie)?.workspaceId !== id) {
            throw new HttpError(401,'Your login ended before the action completed.','session-required');
          }
        };
        const result = await captureAsyncLock(locks,id,()=>actForward({id,body,language:actionLanguage(body.language),
          store,authorize,readReference:readMarketReference,
          budget:(tasks,run)=>withHostedBudget(tasks,run,hostedGuest?()=>reserveGuest(id,request,'chat'):undefined),
          provider,env,fetchImpl}));
        return sendJson(response,200,result);
      }
      if (pathname === '/api/team/activity' && request.method === 'GET') {
        const {id} = session(request,response);
        const requested=searchParams.get('requestId');
        if (!requested || !REQUEST_ID.test(requested)) throw new HttpError(400,'A valid request ID is required.');
        return sendJson(response,200,{activity: store.activity.read(id,requested)});
      }
      if (pathname.startsWith('/api/auth/')) return await accessAccount(request, response, pathname);
      if (pathname.startsWith('/api/mobile/')) {
        if (pathname === '/api/mobile/pair' && request.method === 'POST') {
          const body = await readBody(request);
          const language = actionLanguage(body.language);
          const pair = mobile.pair(body.code);
          store.create(pair.sessionId, createState(language));
          return sendJson(response, 200, { token: pair.token, expiresAt: pair.expiresAt });
        }
        const mobileSession = mobile.authorize(request.headers.authorization);
        if (pathname === '/api/mobile/state' && request.method === 'GET') {
          actionLanguage(searchParams.get('language') ?? undefined);
          return sendJson(response, 200, presentState(mobileSession.sessionId,store.read(mobileSession.sessionId).data, provider, connectionConfig));
        }
        if (pathname === '/api/mobile/action' && request.method === 'POST') {
          const body = await readBody(request);
          return sendJson(response, 200, await captureAsyncLock(locks, mobileSession.sessionId, () => performAction(mobileSession.sessionId, body)));
        }
        if (pathname === '/api/mobile/disconnect' && request.method === 'POST') {
          mobile.revoke(request.headers.authorization);
          return sendJson(response, 200, { disconnected: true });
        }
        if (pathname === '/api/mobile/voice/transcribe' && request.method === 'POST') {
          const language = actionLanguage(request.headers['x-voice-language'] ?? undefined);
          const mimeType = request.headers['content-type'];
          if (!['audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac'].includes(mimeType)) throw new HttpError(415, 'Record PCM WAV or AAC/M4A audio.');
          if (!voice.local) throw new VoiceUnavailable('The local Whisper recognizer is unavailable.');
          if (voiceInFlight) throw new HttpError(429, 'A voice message is being recognized. Please wait.', 'voice-capacity');
          voiceInFlight = true;
          try {
            const limit = mimeType === 'audio/wav' ? 960_044 : 4_000_000;
            if (Number(request.headers['content-length']) > limit) throw new HttpError(413, 'Keep recordings below 30 seconds and 4 MB.');
            const chunks = [];
            let length = 0;
            for await (const chunk of request) {
              length += chunk.length;
              if (length > limit) throw new HttpError(413, 'Keep recordings below 30 seconds and 4 MB.');
              chunks.push(chunk);
            }
            const audio = Buffer.concat(chunks);
            const result = mimeType === 'audio/wav'
              ? await transcribeLocalWave(audio, language, voice, { env })
              : await transcribeMobileAudio(audio, mimeType, language, voice, { env });
            return sendJson(response, 200, result);
          } finally { voiceInFlight = false; }
        }
        throw new HttpError(404, 'That mobile route was not found.');
      }
      if (pathname === '/api/health' && request.method === 'GET') {
        return sendJson(response, 200, { ok: true, contractVersion: CONTRACT_VERSION, provider, capabilities:{webAccounts:1,historicalFunds:1,concierge:1} });
      }
      if (pathname === '/api/state' && request.method === 'GET') {
        const language = actionLanguage(searchParams.get('language') ?? undefined);
        const { id,data } = session(request, response, language);
        return sendJson(response, 200, presentState(id,data, provider, connectionConfig));
      }
      if (pathname === '/api/studio-review' && request.method === 'GET') {
        const {id, data, revision} = session(request, response);
        const fund = findFund(data, searchParams.get('fund'));
        if (fund.replica) throw new HttpError(400, 'Use the historical fund study for this portfolio.');
        const cookie = readCookie(request);
        const checkCurrent = () => {
          if (store.accounts.isPrivateWorkspace(id) && store.accounts.authenticate(cookie)?.workspaceId !== id)
            throw new HttpError(401, 'Sign in again to see the fund.', 'session-required');
          if (store.read(id).revision !== revision)
            throw new HttpError(409, 'This fund changed while readings were loading.', 'fund-changed');
        };
        const result = await studioReview({workspace:id, fund, journal:store.studioMarks,
          readReference:readMarketReference, checkCurrent});
        checkCurrent();
        return sendJson(response, 200, result);
      }
      if (['/api/action','/api/buffett/ask'].includes(pathname) && request.method === 'POST') {
        const { id } = session(request, response);
        const body = await readBody(request);
        const explaining=pathname==='/api/buffett/ask';
        if(explaining){
          if(!validBuffettQuestion(body))throw new HttpError(400,'Invalid archived decision question.');
          body.action='buffettExplanation';
        } else if(body.action==='buffettExplanation')throw new HttpError(400,'Open the historical study to ask about a decision.');
        if(hostedGuest && !explaining && !guestPaperAction(body)) {
          throw new HttpError(401,'Sign in to use this workspace action.','sign-in-required');
        }
        const cookie = readCookie(request);
        const authorizeCommit = () => {
          if (store.accounts.isPrivateWorkspace(id) && store.accounts.authenticate(cookie)?.workspaceId !== id) {
            throw new HttpError(401,'Your login ended before the action completed.','session-required');
          }
        };
        const reserveGuestTurn=hostedGuest?()=>reserveGuest(id,request,'chat'):undefined;
        const result = await captureAsyncLock(locks,id,()=>performAction(id,body,authorizeCommit,reserveGuestTurn));
        return sendJson(response, 200, explaining ? result.buffettReply : result);
      }
      if (pathname === '/api/voice/status' && request.method === 'GET') {
        return sendJson(response, 200, voice);
      }
      if (pathname === '/api/voice/reply' && request.method === 'POST' && (!publicDemo || publicHosted)) {
        const owner=session(request,response);
        const input=await readBody(request);
        const fundTopic=typeof input.topic==='string'&&input.topic.startsWith('fund:')?input.topic.slice(5):null;
        if((input.topic!=='studio'&&(!fundTopic||!UUID.test(fundTopic)))||typeof input.responseId!=='string'||input.responseId.length>180||
            Object.keys(input).some(key=>!['topic','responseId'].includes(key)))throw new HttpError(400,'Choose an existing manager reply.');
        const fund=fundTopic?owner.data.funds?.find(f=>f.id===fundTopic):null;
        const messages=fundTopic?fund?.chat:owner.data.guide?.messages;
        const reply=messages?.find(m=>m.role==='assistant'&&m.id!=='welcome'&&m.responseId===input.responseId&&
          (!fundTopic||fund.team.some(member=>member.role==='manager'&&member.id===m.memberId)));
        if(!reply?.text)throw new HttpError(404,'Reply not found.');
        const language=reply.language || (/[㐀-鿿]/u.test(reply.text)?'zh-CN':'en-US');
        if(!narrationLanguages.includes(language))throw new VoiceUnavailable('Local narration is not installed.');
        if(narrating)throw new HttpError(429,'A reply is being narrated. Please try again.');
        if(hostedGuest)reserveGuest(owner.id,request,'voice');
        narrating=true;
        try {
          if(request.headers.accept==='application/vnd.fundroom.pcm-s16le'){
            const disconnect=new AbortController();
            response.once('close',()=>disconnect.abort());
            try{
              await streamManagerReply(reply.text,language,env,disconnect.signal,chunk=>{
                if(!response.headersSent)response.writeHead(200,{'Content-Type':'application/vnd.fundroom.pcm-s16le','Cache-Control':'private, no-store','X-Audio-Sample-Rate':'24000'});
                response.write(chunk);
              },request.headers['x-fundroom-reading-rate']);
              if(!response.destroyed)response.end();
            }catch(error){
              if(response.headersSent)response.destroy();
              else if(!response.destroyed)throw error;
            }
            return;
          }
          const audio=await synthesizeManagerReply(reply.text,language,env);
          response.writeHead(200,{'Content-Type':'audio/wav','Content-Length':audio.length,'Cache-Control':'private, no-store'});
          response.end(audio);
          return;
        } finally {narrating=false;}
      }
      if (pathname === '/api/voice/transcribe' && request.method === 'POST' && (!publicDemo || publicHosted)) {
        const owner=session(request, response);
        const language = actionLanguage(request.headers['x-voice-language'] ?? undefined);
        if (!voice.local) throw new VoiceUnavailable('No local recognizer is configured. Use the browser microphone service or text input.');
        if (voiceInFlight) throw new HttpError(429, 'A voice message is being recognized. Please wait.', 'voice-capacity');
        voiceInFlight = true;
        try {
          const recording=await readVoiceRecording(request);
          if(hostedGuest)reserveGuest(owner.id,request,'voice');
          const result = await transcribeLocalWave(recording, language, voice, { env });
          return sendJson(response, 200, result);
        } finally {
          voiceInFlight = false;
        }
      }
      if (pathname === '/api/market/reference' && request.method === 'GET') {
        const symbol = referenceSymbol(searchParams.get('symbol'));
        if (!symbol) throw new HttpError(400, 'Choose VWELX, VYM, VCIT or VOO.', 'unsupported-reference');
        return sendJson(response, 200, await readMarketReference(symbol));
      }
      if (pathname === '/api/market/snapshot' && request.method === 'GET' && !publicDemo) {
        session(request, response);
        return sendJson(response, 200, describeIntraday(await loadMarketSnapshot(searchParams.get('symbol'), { env, fetchImpl })));
      }
      if (pathname === '/api/paper/account' && request.method === 'GET' && !publicDemo) {
        requireLocalBrokerRequest(request);
        const supplied = request.headers['x-fundroom-broker-token'];
        const secret = env.FUNDROOM_BROKER_OPERATOR_TOKEN;
        if (!/^[A-Za-z0-9_-]{32,128}$/u.test(secret ?? '') || typeof supplied !== 'string' ||
            !timingSafeEqual(createHash('sha256').update(secret).digest(),createHash('sha256').update(supplied).digest())) {
          throw new HttpError(403,'This account snapshot is private to the local broker operator.','broker-operator-only');
        }
        session(request, response);
        return sendJson(response, 200, await loadPaperAccount({ env, fetchImpl }));
      }
      if (pathname === '/api/broker/status' && request.method === 'GET') {
        if (broker.status.enabled) {
          requireLocalBrokerRequest(request);
          if (!readBrokerCookie(request)) {
            response.setHeader('Set-Cookie', `${BROKER_COOKIE}=${randomUUID()}; Path=/api/broker; HttpOnly; SameSite=Strict; Max-Age=28800`);
          }
        }
        return sendJson(response, 200, broker.status);
      }
      if (pathname === '/api/broker/action' && request.method === 'POST') {
        requireLocalBrokerRequest(request);
        const id = readBrokerCookie(request);
        if (!id) throw new HttpError(401, 'Open the local broker console before requesting a broker action.', 'broker-session-required');
        const result = await broker.perform(id, await readBody(request), request.headers['x-fundroom-broker-token']);
        return sendJson(response, 200, result);
      }
      throw new HttpError(404, 'That API route was not found.');
    } catch (error) {
      if (response.destroyed) return;
      if (error.status === 429 && Number.isInteger(error.retryAfter)) response.setHeader('Retry-After', String(error.retryAfter));
      if (error instanceof AccountError || error instanceof BillingError || error instanceof HttpError || error instanceof PortfolioError) return sendJson(response, error.status, errorPayload(error.message, error.code));
      if (error instanceof ForwardError) return sendJson(response, error.status, errorPayload(error.message,error.code));
      if (error instanceof MembershipError) return sendJson(response,error.status,{error:error.message});
      if (error instanceof HistoricalOrderError) return sendJson(response, 409, errorPayload(error.message, 'historical-order'));
      if (error instanceof ManagerUnavailable) return sendJson(response, 503, errorPayload(error.message, 'manager-unavailable'));
      if (error instanceof SessionConflict) return sendJson(response, 409, errorPayload(error.message, 'state-conflict'));
      if (error instanceof AlpacaConnectionError) return sendJson(response, error.status, errorPayload(error.message, 'connection-error'));
      if (error instanceof BrokerError) return sendJson(response, error.status, errorPayload(error.message, error.code));
      if (error instanceof VoiceUnavailable) return sendJson(response, error.status, errorPayload(error.message, 'voice-unavailable'));
      if (error instanceof MobileSessionError) return sendJson(response, error.status, errorPayload(error.message, error.code));
      console.error('Fundroom request failed:', error.name);
      return sendJson(response, 500, errorPayload('The action could not be completed.', 'internal-error'));
    }
  });
  server.once('listening',()=>{armSchedule();watch.start();});
  server.once('close', () => { closed = true; clearTimeout(scheduleTimer); watch.stop(()=>store.close());broker.close(); });
  return { server, host, port };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, host, port } = await createApp();
  server.listen(port, host, () => {
    const displayHost = host === '::1' ? '[::1]' : host;
    console.log(`Fundroom listening on http://${displayHost}:${server.address().port}`);
  });
}
