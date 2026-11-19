import { isChinese } from './i18n.mjs';

// Translate authored assignments and statuses without rewriting free-form contributions.
const pairs = [
  ['Compare inflation, growth and central bank data with the fund’s assumptions. Flag the economic release most likely to change the thesis.','对照通胀、增长与央行数据，指出哪项经济数据最可能改变基金原有判断。'],
  ['Estimate how yield curve moves affect bond exposure. Separate interest rate sensitivity from issuer credit risk.','估算收益率曲线变化对债券敞口的影响，区分利率敏感度和发行人信用风险。'],
  ["Weigh the specialists’ evidence, set a target weight, and explain what would make you change the decision.", "权衡各席证据，确定目标权重，并说明什么情况会改变决定。"],
  ["Build an investment thesis from the available evidence. Compare the upside with the valuation and surface conflicting signals.", "依据现有证据建立投资理由，比较潜在收益与估值，指出相互矛盾的信号。"],
  ["Review concentration, downside and mandate limits. Flag when the portfolio should cut its exposure or skip a trade.", "核查集中度、下行风险及授权上限，说明何时应降低敞口或放弃交易。"],
  ["Check the quote age, spread, and trading session. Describe the conditions needed for an eligible paper order.", "核查报价时间、价差与交易时段，说明模拟订单可以执行的条件。"],
  ["Compare the proposed position with a smaller allocation or waiting. Explain how each choice changes cash and concentration.", "比较建议仓位、较小仓位与等待三种做法，说明对现金和集中度的影响。"],
  ["Track what could change the thesis and compare the evidence with current valuation assumptions.", "跟踪可能改变投资观点的因素，对照证据与当前估值假设。"],
  ["Stress the position against the replay scenarios and name the limit most likely to block an order.", "用回放情景检验持仓压力，指出最可能拦截订单的限制。"],
  ["Compare the expected fill with the proposal and flag market conditions that could delay the rebalance.", "比较预计成交与原提案，指出可能延缓再平衡的市场条件。"],
  ["Weigh valuation and business evidence. Propose a target weight and name the fact that would overturn the decision.", "权衡估值和经营证据，提出目标权重，说明哪项新事实会推翻决定。"],
  ["Check adoption, competitive position and valuation. Cite dated evidence and the strongest evidence against the thesis.", "核查产品采用情况、竞争地位和估值，引用带日期的证据并指出最有力的反方证据。"],
  ["Compare the proposed weight with a smaller allocation or waiting. Explain how each would affect cash and concentration.", "把建议权重与较低配置或等待比较，说明各方案对现金和集中度的影响。"],
  ["Challenge the downside assumptions and check the proposed weight against the fund’s authorization.", "质疑下行风险假设，并按基金授权检查建议权重。"],
  ["Check quote age and spread. Explain how the proposed order could be simulated and when it should wait.", "核查报价时间和价差，说明何时可以模拟下单、何时应等待。"],
  ["Compare holding cash with adding broad market exposure, and explain the selected target relative to the mandate.", "对比持有现金和增加大盘敞口，说明目标与授权的关系。"],
  ["Assess evidence for broad participation and distinguish it from a rally concentrated in a few names.", "判断市场上涨是否具有广度，区分普涨与少数股票驱动的上涨。"],
  ["Estimate how far the current allocation has drifted and compare the cash reserve under alternative target weights.", "估算当前配置偏移，比较不同目标权重下的现金储备。"],
  ["Review the ETF’s equity exposure, available cash and mandate limit without treating diversification as a guarantee.", "核查 ETF 股票敞口、可用现金及授权上限，并考虑分散配置后仍有的风险。"],
  ["Review the ETF spread and quote freshness before describing an eligible simulated order.", "在提出可执行的模拟订单前，检查 ETF 价差和报价时效。"],
  ["Review the case for reducing existing exposure and explain when waiting in cash would be appropriate.", "评估减仓理由，说明何时适合保留现金等待。"],
  ["Identify evidence that the thesis has broken and separate durable deterioration from short-term price movement.", "查找投资逻辑已失效的证据，区分长期恶化与短期价格波动。"],
  ["Compare holding, reducing and exiting. Explain the resulting exposure and the role of the cash reserve.", "比较持有、减仓和退出，说明剩余敞口与现金储备的作用。"],
  ["Challenge optimistic assumptions, test the proposed allocation against the risk limit, and flag liquidity concerns.", "检验乐观假设，核对风险限额，指出流动性问题。"],
  ["Confirm current share availability and assess the bid and quote age before describing a simulated reduction.", "确认可卖数量，检查买价和报价时间，再提出模拟减仓方案。"],
  ["Compare a conservative business value range with the quoted price. Explain the margin for error and why waiting in cash may be preferable.", "比较保守估值区间与报价，说明安全余量及等待的理由。"],
  ["Normalize the available cash generation assumptions and distinguish durable business economics from temporary earnings improvements.", "评估常态现金创造能力，区分可持续经营优势与暂时的盈利改善。"],
  ["Compare small and zero allocations when valuation is uncertain. Show the implied concentration and remaining cash.", "估值不确定时比较小额配置和空仓，列出对应集中度及剩余现金。"],
  ["Challenge the base valuation using a weaker cash flow scenario. Flag a value trap if the thesis depends on an unsupported recovery.", "用较弱现金流检验基础估值，指出依赖未经证实的复苏所带来的价值陷阱。"],
  ["Check whether the synthetic bid and ask preserve the proposed valuation cushion and meet the replay execution rules.", "核查合成买卖报价能否保留估值安全余量，并符合回放执行规则。"],
  ["Checking mandate, cash and replay quote.", "核查授权、现金及模拟报价。"],
  ["Applying authorized historical sleeve allocation.", "按已授权的历史权重核算研究单位。"],
  ["Synthesizing the independent reviews.", "综合独立席位的意见与分歧。"],
  ["One active seat per discipline was assigned; this teammate was not consulted.", "本期每项独立职责由一名在岗成员负责，这位成员未受委托。"],
  ["No usable review received.", "未收到可用意见。"],
  ["This assignment stopped without a usable result.", "该任务结束时未得到可用结果。"],
  ["The task ended without a committed outcome.", "本轮任务未提交结果。"],
  ["This seat did not return a usable response.", "该席未返回有效答复。"],
  ["No valid specialist output was available for synthesis.", "研究和风险席均无可用意见，本轮未启动经理汇总。"]
];
const chinese = new Map(pairs);
const english = new Map(pairs.map(([en, zh]) => [zh, en]));

export function teamSystemText(text) {
  return (isChinese() ? chinese : english).get(text) ?? text;
}
