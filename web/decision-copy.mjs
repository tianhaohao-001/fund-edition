import { getLanguage } from './i18n.mjs';

export function known(value) {
  const entries = {
    'AI demand accelerates': 'AI 需求加速', 'Valuation needs more evidence': '估值仍需更多证据', 'Growth thesis breaks': '成长逻辑转弱',
    'Strong thesis, stale quote': '逻辑看好，报价过期', 'After the close': '收盘之后', 'Quote unavailable': '报价不可用', 'Broad market rebounds': '大盘反弹',
    'Fundroom synthetic market replay': '合成市场回放', 'Morrowfolio synthetic market replay': '合成市场回放',
    'Synthetic market replay': '合成市场回放', 'Independent paper order policy': '独立模拟订单规则', 'Portfolio settings and mandate': '组合设置与基金授权',
    'Replay strategy rule': '回放策略规则', 'User mandate': '用户授权', 'HarnessRouter specialist': 'HarnessRouter 专业席位',
    'HarnessRouter suggestion': 'HarnessRouter 成员建议', 'HarnessRouter manager': 'HarnessRouter 基金经理', 'Guided replay': '显式引导示例',
    'Deterministic replay': '确定性离线回放', 'Manager proposal': '经理提案', 'Unavailable': '不可用',
    'Normalized demand growth': '标准化需求增长', 'Modeled five-year annualized return': '模型五年年化回报假设', 'Strategy return hurdle': '策略回报门槛',
    'Replay bid / ask': '回放买价 / 卖价', 'Replay quote age': '回放报价年龄', 'Effective single-position cap': '有效单一持仓上限',
    'Mandate permissions': '授权权限', 'Proposal format': '提案格式', 'Ticker coverage': '标的覆盖', 'Target position limit': '目标持仓上限',
    'Market session': '交易时段', 'Bid and ask': '双边报价', 'Quote freshness': '报价新鲜度', 'Cash available': '可用现金',
    'Shares available': '可用股数', 'Post-order position limit': '成交后持仓上限', 'Whole-share sizing': '整股数量', 'Order eligibility': '订单资格',
    'bullish': '看多', 'bearish': '看空', 'neutral': '中性', 'caution': '谨慎', 'ready': '就绪', 'pass': '通过', 'block': '拦截', 'skipped': '跳过',
    'Orders restricted for this scenario': '此情景下禁止下单', 'Buys permitted · Sells permitted': '允许买入 · 允许卖出',
    'Buys restricted · Sells permitted': '禁止买入 · 允许卖出', 'Buys permitted · Sells restricted': '允许买入 · 禁止卖出',
    'The proposal has a supported action and target.': '提案包含支持的操作和目标权重。', 'The manager proposal could not be validated.': '经理提案未通过检查。',
    'The proposal names a ticker outside this replay.': '提案标的超出本回放范围。', 'A hold does not place an order.': '持有决定不生成订单。',
    'The mandate permits this action.': '账户授权允许此操作。', 'The mandate blocks this action.': '账户授权禁止此操作。',
    'Regular replay session is open.': '回放常规交易时段开放。', 'Regular replay session is closed.': '回放常规交易时段已关闭。',
    'Both sides of the replay quote are available.': '合成报价的买卖两边均可用。', 'There is no valid bid and ask.': '没有有效的双边报价。',
    'No quote was available to time.': '没有可用于计时的报价。', 'Cash stays nonnegative after the order.': '下单后现金保持非负。',
    'The order exceeds available cash.': '订单金额超过可用现金。', 'The order leaves a nonnegative position.': '下单后股数保持非负。',
    'The order exceeds shares held.': '卖出数量超过已有持仓。', 'There is no long position in this ticker.': '账户没有该标的多头持仓。',
    'The target is too small for one share.': '目标权重不足以容纳一整股。', 'The existing whole-share position needs no order at this target.': '当前整股持仓已接近目标，无需新订单。',
  };
  if (getLanguage() === 'en-US') return value;
  if (Object.hasOwn(entries, value)) return entries[value];
  if (typeof value !== 'string') return value;
  return value.replace(/^(\d+) seconds$/u, '$1 秒')
    .replace(/^(.+) is covered by this replay\.$/u, '$1 在此回放覆盖范围内。')
    .replace(/^Proposed target ([\d.]+)% · Effective cap ([\d.]+)%\.$/u, '建议目标 $1% · 有效上限 $2%。')
    .replace(/^Quote age ([\d.]+) seconds · Maximum ([\d.]+) seconds\.$/u, '报价年龄 $1 秒 · 上限 $2 秒。')
    .replace(/^The order stays within the ([\d.]+)% cap\.$/u, '成交后持仓保持在 $1% 上限内。')
    .replace(/^The order would exceed the ([\d.]+)% cap\.$/u, '成交后持仓将超过 $1% 上限。');
}

export function executionReason(execution) {
  const reasons = {
    'filled': '已按合成双边报价完成模拟成交。', 'manager-hold': '经理决定持有，本轮不下单。', 'already-at-target': '现有整股持仓已接近目标，无需调仓。',
    'invalid-proposal': '经理提案未通过格式检查。', 'symbol-mismatch': '提案标的不在此回放覆盖范围内。', 'mandate-restricted': '账户授权禁止此订单。',
    'target-over-limit': '建议目标超过有效持仓上限。', 'market-closed': '当前回放常规交易时段已结束。', 'quote-missing': '缺少有效的合成买卖报价。',
    'quote-stale': '回放报价已过期。', 'no-holdings': '账户没有可卖出的该标的持仓。', 'target-below-one-share': '在目标权重内无法分配一整股。',
    'cash-insufficient': '可用现金不足。', 'shares-insufficient': '模拟器禁止卖空。', 'position-over-limit': '成交后持仓将超过有效上限。',
  };
  return getLanguage() === 'zh-CN' ? reasons[execution?.code] || execution?.reason || '暂无执行记录。' : execution?.reason || 'No execution recorded.';
}
