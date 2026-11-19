import { narrationSpeed } from './voice.mjs';
import { t } from './i18n.mjs';
export { entryShell as newLobby } from './guided-entry.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);

export function speechPreference() {
  try { return localStorage.getItem('morrowfolio.read-aloud') === 'true'; } catch { return false; }
}

export function readingControl() {
  return `<button class="speech-switch" type="button" data-action="read-preference" aria-pressed="${speechPreference()}">${t('自动朗读', 'Read replies')} <span>${speechPreference() ? t('开', 'On') : t('关', 'Off')}</span></button>`;
}

export function researchPrompt(draft, busy) {
  if (!draft) return '';
  return `<section class="research-prompt" aria-live="polite"><div><small>${t('待确认的研究方案', 'Research brief to review')}</small><h3>${escape(draft.ticker)} · ${escape(draft.name)}</h3><p>${t('让研究团队检查已公开资料，并列出可比较的数据和缺口。', 'Ask the team to examine public evidence and identify comparable data and gaps.')}</p></div><button class="button button--primary" type="button" data-action="confirm-research" data-id="${escape(draft.id)}" ${busy ? 'disabled' : ''}>${t('确认并运行研究', 'Confirm and run study')} →</button>${draft.ticker === 'VWELX' ? `<button class="button" type="button" data-action="create-replica" data-id="${escape(draft.id)}" ${busy?'disabled':''}>${t('用 $10,000 模拟资金建立复刻基金','Create a $10,000 paper replica fund')}</button>`:''}</section>`;
}

export function accountPanel({user, mode, pending=false}) {
  if (user) return `<h2>${t('我的账户','My account')}</h2><p class="account-email">${escape(user.email)}</p><p>${t('工作室、讨论记录和模拟组合保存在这个账户中。','Your studios, conversations and paper portfolios are saved in this account.')}</p><a class="button button--primary" href="#/portfolio" data-dismiss-dialog>${t('查看我的组合','View my portfolio')}</a><button type="button" data-auth="logout" class="account-link">${t('退出登录','Sign out')}</button>`;
  const register = mode === 'register';
  return `<h2>${register ? t('创建账户','Create an account'):t('欢迎回来','Welcome back')}</h2><p>${t('用邮箱保存你的工作室和模拟投资组合。','Use your email to save your studios and paper portfolios.')}</p>
  <form data-auth-form="${register?'register':'login'}"><label>${t('邮箱','Email')}<input name="email" type="email" autocomplete="username" required maxlength="254"></label>
  <label>${t('密码','Password')}<input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="${register?'12':'1'}" maxlength="128" required></label>${register?`<small>${t('使用 12–128 个字符。','Use 12–128 characters.')}</small>`:''}
  <p class="auth-error" role="alert"></p><button type="submit" class="button button--primary" ${pending?'disabled':''}>${register?t('创建账户','Create account'):t('登录','Sign in')}</button></form>
  <button class="account-link" data-auth="${register?'login':'register'}" type="button">${register?t('已有账户？登录','Already registered? Sign in'):t('还没有账户？注册','New here? Create an account')}</button>`;
}

export function menuPanel(user) {
  return `<h2>${t('工作空间','Workspace')}</h2><div class="sheet-links"><button type="button" data-auth="login">${escape(user?.email || t('登录或创建账户','Sign in or create account'))}<span>↗</span></button><a href="#/portfolio" data-dismiss-dialog>${t('模拟组合','Paper portfolio')}<span>→</span></a><a href="#/connections" data-dismiss-dialog>${t('连接与数据源','Connections and data sources')}<span>→</span></a></div>
  <div class="sheet-links"><a href="/membership.html?view=account&amp;lang=${t('zh-CN','en-US')}">${t('我的会员资格','My membership')}<span>→</span></a></div>
  ${readingControl()}<label class="narration-speed-setting">${t('朗读速度','Reading speed')}<select name="narration-speed">${[[.9,t('慢速','Slower')],[1,t('标准','Standard')],[1.12,t('轻快','Brisk')]].map(([rate,name])=>`<option value="${rate}" ${rate===narrationSpeed()?'selected':''}>${name} · ${rate}×</option>`).join('')}</select></label>`;
}
