const SUPPORTED = new Set(['zh-CN', 'en-US']);

export function selectedLanguage(value, fallback = 'zh-CN') {
  if (value === undefined) return SUPPORTED.has(fallback) ? fallback : 'zh-CN';
  if (!SUPPORTED.has(value)) throw new RangeError('Choose zh-CN or en-US.');
  return value;
}

export function replyLanguageInstruction(language) {
  const target = selectedLanguage(language) === 'zh-CN' ? 'Simplified Chinese (zh-CN)' : 'US English (en-US)';
  return `The user selected ${target}. Write every new user-facing answer, summary and reconsideration in ${target}, even when the question, documents or earlier messages use another language. Preserve JSON keys, enum values, ticker symbols, names and cited evidence identifiers. Do not rewrite or translate earlier conversation records.`;
}
