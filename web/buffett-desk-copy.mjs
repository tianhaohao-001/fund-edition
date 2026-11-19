// Editorial abstracts of the signed meetings. The verbatim briefs remain accessible beside each abstract.
const meetings = {
  'buffett-review-1': {
    thesis: ['股价约为每股盈利的 18.9 倍。现金流支持盈利，但债务和维持业务所需的投资仍难估计，经理选择持现。', 'At 18.9 times earnings, cash generation supported the business. Debt and the cost of maintaining it left the manager unconvinced about the price.'],
    research: ['自由现金流代理接近净利，经营利润有现金支撑。', 'Cash left after capital spending was close to net income.'],
    risk: ['现金流代理收益率约 5.0%，维护支出和杠杆增加估值难度。', 'The cash-flow proxy yielded around 5.0%. Maintenance needs and leverage complicated valuation.'],
    manager: ['维持现金，等更清楚的安全边际。', 'Keep the cash until the margin of safety is clearer.'],
    caution: ['按现金流代理计算约 19.84 倍，按每股盈利计算约 18.89 倍。', 'The cash-flow proxy implied 19.84×, while earnings implied 18.89×.'],
  },
  'buffett-review-2': {
    thesis: ['经营现金流仍能覆盖资本支出。风控认可小额试仓，但经理认为约 5.2% 的现金流代理收益率还不足以确认安全边际。', 'Operating cash covered capital spending. Risk supported a small starter position, but the roughly 5.2% cash-flow proxy yield gave the manager too little confidence in a margin of safety.'],
    research: ['扣除资本支出后仍有约 11.24 亿美元现金流。', 'About $1.12 billion remained after capital spending.'],
    risk: ['支持小额试仓，指出长期债务约为现金流代理的 4.6 倍。', 'Supported a small position, with long-term debt at roughly 4.6 times the cash-flow proxy.'],
    manager: ['小仓位也需要可信估值，继续持现。', 'Even a small position needs a credible valuation. Stay in cash.'],
    caution: ['扣除全部资本支出所得的现金流，并不能确定所有者盈余的上限。', 'Cash flow after total capital spending cannot establish an upper bound for owner earnings.'],
  },
  'buffett-review-3': {
    thesis: ['股价跌至 570.46 美元，风控倾向分批建仓。经理认为偿债条件和业务所需的维持支出仍不够清楚，继续持现。', 'With shares at $570.46, risk favored buying in stages. The manager still lacked enough detail on debt servicing and maintenance investment and kept the cash.'],
    research: ['经营现金流约为资本支出的 2.8 倍。', 'Operating cash flow covered capital spending about 2.8 times.'],
    risk: ['倾向分批试仓，同时提醒团队注意杠杆和价格下跌。', 'Favored a staged entry while flagging leverage and the unexplained price drop.'],
    manager: ['价格下降，仍缺乏量化安全边际所需的证据。', 'A lower price still left the margin of safety unquantified.'],
    caution: ['原文把现金流代理说成所有者盈余的上限，方向有误。维持性投入和营运资本都影响估算。', 'The original briefs incorrectly called the cash-flow proxy an upper bound. Maintenance and working-capital needs both matter.'],
  },
  'buffett-review-4': {
    thesis: ['9 月 29 日收盘价约为每股盈利的 13.5 倍，经理愿意先投两成。同店销售只增长 0.5%，维持性投入仍不明确，余下八成保留为现金。', 'At the September 29 close the shares traded at about 13.5 times earnings. That justified a starter position, while 0.5% same-store sales growth and uncertain maintenance spending argued for keeping 80% in cash.'],
    research: ['初报每股盈利 44.07 美元，扣掉每股税务收益后估值约 13.8 倍。', 'Preliminary EPS was $44.07. Removing the tax benefit put the multiple near 13.8×.'],
    risk: ['现金流代理滞后一季，债务规模让满仓缺乏依据。', 'The cash-flow proxy was a quarter old. Debt made a full allocation hard to support.'],
    manager: ['价格可以尝试，但增长和维护支出仍需验证，先投两成。', 'The price supported a 20% position while growth and maintenance spending remained uncertain.'],
    caution: ['经理英文原文倒置了市盈率分子和分母。正确值为 595.11 美元 ÷ 44.07 美元，约 13.50 倍。', 'The manager’s English wording reversed the P/E ratio. The correct calculation is $595.11 divided by $44.07, or 13.50×.'],
  },
};

export function meetingCopy(id,lang) {
  const row=meetings[id];
  return row && Object.fromEntries(Object.entries(row).map(([key,pair])=>[key,pair[lang==='en-US'?1:0]]));
}
