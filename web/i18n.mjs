export const LANGUAGES = Object.freeze([
  Object.freeze({ id: 'zh-CN', label: '中文' }),
  Object.freeze({ id: 'en-US', label: 'English' }),
]);

const KEY = 'morrowfolio.language';
let language;

export function getLanguage() {
  if (language) return language;
  let saved;
  try { saved = globalThis.localStorage?.getItem(KEY); } catch { /* Storage may be disabled. */ }
  language = LANGUAGES.some(({ id }) => id === saved) ? saved : 'zh-CN';
  return language;
}

export function setLanguage(value) {
  if (!LANGUAGES.some(({ id }) => id === value)) throw new RangeError('Choose zh-CN or en-US.');
  language = value;
  try { globalThis.localStorage?.setItem(KEY, value); } catch { /* The current tab can still change language. */ }
  return language;
}

export function isChinese(value = getLanguage()) { return value === 'zh-CN'; }
export function t(zh, en, value = getLanguage()) { return isChinese(value) ? zh : en; }
