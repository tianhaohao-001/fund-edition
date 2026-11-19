export const TEAM_TEMPLATES = [
  {
    id: 'growth',
    label: 'Growth research',
    summary: 'Pressure-test technology demand and valuation before allocating capital.',
    mandate: 'Study durable growth in U.S. equities. Buy only when demand and valuation support the thesis. Cap each position at 12%.',
    maxWeightPercent: 12,
    scenarioId: 'innovation-signal',
    roster: [
      { id: 'maya-chen', duty: 'Weigh valuation and business evidence. Propose a target weight and name the fact that would overturn the decision.' },
      { id: 'theo-park', duty: 'Check adoption, competitive position and valuation. Cite dated evidence and the strongest evidence against the thesis.' },
      { id: 'leah-kim', duty: 'Compare the proposed weight with a smaller allocation or waiting. Explain how each would affect cash and concentration.' },
      { id: 'inez-rao', duty: 'Challenge the downside assumptions and check the proposed weight against the fund’s authorization.' },
      { id: 'eli-morgan', duty: 'Check quote age and spread. Explain how the proposed order could be simulated and when it should wait.' },
    ],
  },
  {
    id: 'index',
    label: 'Index allocation',
    summary: 'Use a broad U.S. equity ETF with a measured position size and a cash reserve.',
    mandate: 'Use SPY only for broad U.S. equity exposure. Preserve a cash reserve and cap the ETF position at 40%.',
    maxWeightPercent: 40,
    scenarioId: 'index-rebound',
    roster: [
      { id: 'maya-chen', duty: 'Compare holding cash with adding broad market exposure, and explain the selected target relative to the mandate.' },
      { id: 'theo-park', duty: 'Assess evidence for broad participation and distinguish it from a rally concentrated in a few names.' },
      { id: 'leah-kim', duty: 'Estimate how far the current allocation has drifted and compare the cash reserve under alternative target weights.' },
      { id: 'inez-rao', duty: 'Review the ETF’s equity exposure, available cash and mandate limit without treating diversification as a guarantee.' },
      { id: 'eli-morgan', duty: 'Review the ETF spread and quote freshness before describing an eligible simulated order.' },
    ],
  },
  {
    id: 'defensive',
    label: 'Drawdown defense',
    summary: 'Test when to cut existing exposure and how much cash to keep.',
    mandate: 'Prioritize capital preservation. Reduce existing exposure when the growth thesis breaks, and hold cash when evidence is weak. Cap each position at 8%.',
    maxWeightPercent: 8,
    scenarioId: 'de-risk',
    roster: [
      { id: 'maya-chen', duty: 'Review the case for reducing existing exposure and explain when waiting in cash would be appropriate.' },
      { id: 'theo-park', duty: 'Identify evidence that the thesis has broken and separate durable deterioration from short-term price movement.' },
      { id: 'leah-kim', duty: 'Compare holding, reducing and exiting. Explain the resulting exposure and the role of the cash reserve.' },
      { id: 'inez-rao', duty: 'Challenge optimistic assumptions, test the proposed allocation against the risk limit, and flag liquidity concerns.' },
      { id: 'eli-morgan', duty: 'Confirm current share availability and assess the bid and quote age before describing a simulated reduction.' },
    ],
  },
  {
    id: 'value',
    label: 'Value Steward',
    summary: 'Compare the price with a conservative estimate of business value. Wait in cash when the evidence is thin.',
    inspiration: 'An independent AI team inspired by the margin-of-safety principles discussed by Warren Buffett. No affiliation or performance claim.',
    inspirationUrl: 'https://www.berkshirehathaway.com/letters/1992.html',
    mandate: 'Study understandable businesses with durable cash generation. Buy only when price leaves enough room for uncertainty in estimated business value. Hold cash when the evidence is thin. Cap each position at 10%.',
    maxWeightPercent: 10,
    scenarioId: 'thin-evidence',
    roster: [
      { id: 'maya-chen', duty: 'Compare a conservative business value range with the quoted price. Explain the margin for error and why waiting in cash may be preferable.' },
      { id: 'jules-bennett', duty: 'Normalize the available cash generation assumptions and distinguish durable business economics from temporary earnings improvements.' },
      { id: 'leah-kim', duty: 'Compare small and zero allocations when valuation is uncertain. Show the implied concentration and remaining cash.' },
      { id: 'avery-khan', duty: 'Challenge the base valuation using a weaker cash flow scenario. Flag a value trap if the thesis depends on an unsupported recovery.' },
      { id: 'eli-morgan', duty: 'Check whether the synthetic bid and ask preserve the proposed valuation cushion and meet the replay execution rules.' },
    ],
  },
];

const styleSignals = [
  { id: 'value', words: /\b(?:buffett|benjamin graham|value (?:investing|investor|stocks)|intrinsic value|margin of safety|undervalued|cash flows?)\b|巴菲特|格雷厄姆|价值投资|价值派|内在价值|安全边际|低估|现金流/iu, reason: 'Your description calls for conservative valuation or room for error.' },
  { id: 'index', words: /\b(?:index(?:es)?|broad[- ]market|etfs?|passive|spy|voo|vti|s&p)\b|指数|宽基|被动/iu, reason: 'Your description calls for broad market exposure or index allocation.' },
  { id: 'defensive', words: /\b(?:drawdowns?|defen[cs]ive|preserv(?:e capital|ation)|protect capital|downside|low volatility|risk control|hold cash)\b|回撤|防守|防御|保本|低波动|保留现金|下行风险/iu, reason: 'Your description puts downside protection or cash reserves first.' },
  { id: 'growth', words: /\b(?:growth|innovation|technolog(?:y|ies)|momentum|adoption|accelerat\w*)\b|成长|增长|创新|科技|动量/iu, reason: 'Your description puts growth, adoption, or innovation first.' },
];

export function recommendTeamStyle(brief) {
  const text = String(brief ?? '').normalize('NFKC').trim();
  if (!text) return null;
  return styleSignals.find(({ words }) => words.test(text)) ?? {
    id: 'growth', reason: 'There’s no clear match yet. Growth research starts with a general team for business and valuation evidence.',
  };
}
