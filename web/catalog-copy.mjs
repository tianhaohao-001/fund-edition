// First-party copy only. Public citations, imported research and chat history stay intact.
const equityTeam = [
  { role: 'Fund manager', name: 'Portfolio lead', duty: 'Combine evidence and counterarguments into portfolio targets and explain the trade-offs.' },
  { role: 'Research analyst', name: 'Fundamental research', duty: 'Study competitive advantages, growth quality and valuation without treating a rising price as a fundamental.' },
  { role: 'Risk officer', name: 'Independent risk', duty: 'Challenge concentration, drawdowns and assumptions, with the power to reject execution.' },
  { role: 'Trader', name: 'Execution and reconciliation', duty: 'Validate prices, cash and fills, and retain every simulated receipt.' },
];

export const CATALOG_EN = {
  'ark-innovation': {
    name: 'Innovation Frontier', category: 'Active growth', risk: 'High volatility', researchStatus: 'Holdings sample checked',
    summary: 'Start with disruptive technology, then put its long-term growth story to the test with evidence and valuation.',
    mandate: 'Study ARKK’s public disruptive-innovation process. Assign technology adoption, commercialization, cash flow and valuation to research seats; the manager combines them into bounded long-only targets. Do not claim access to ARK’s private decisions.',
    approach: ['Theme research looks for falling technology costs and adoption inflections.', 'Company research tests market size, competitive advantages and commercialization.', 'Independent risk checks valuation, concentration and missing evidence.'],
    limitations: 'Five holdings have been checked across three SEC filings. This sample measures similarity to publicly disclosed holdings; it does not validate replication of the whole fund’s trades or returns.',
    selection: 'A selection of substantial active funds; disclosed original fund net assets were approximately $6.123 billion.',
    assetLabel: 'Original fund net assets', team: equityTeam,
    sourceTitles: ['ARKK objectives and risks', 'ARK official fund assets · 2026-10-31', 'ARK public investment process'],
  },
  contrafund: {
    name: 'Exceptional Businesses', category: 'Active large-cap growth', risk: 'Equity risk', researchStatus: 'Public NAV can be recalculated',
    summary: 'Look for company value the market has yet to recognize, with an emphasis on earnings quality and long-term growth.',
    mandate: 'Study Fidelity Contrafund’s public large-cap growth and bottom-up research process: earnings, competitive position, valuation and concentration. The public NAV experiment tests a transparent trend rule, not the manager’s actual trades.',
    approach: ['Study earnings growth and competitive position.', 'Compare the market price with researched long-term business value.', 'Allocate capital according to the strength of the evidence and the risk budget.'],
    limitations: 'A price-series experiment uses Fidelity’s public month-end NAVs. Monthly results exclude dividends, capital-gain distributions and taxes; they are neither the original fund’s total return nor validation of AI replication.',
    selection: 'A selection of substantial active funds; Fidelity disclosed approximately $182.573 billion in portfolio net assets.',
    assetLabel: 'Original portfolio net assets', team: equityTeam,
    sourceTitles: ['Fidelity fund information and month-end NAV', 'Fidelity portfolio assets · 2026-09-30'],
  },
  'premium-income': {
    name: 'Equity and Option Income', category: 'Active option income', risk: 'Options and limited upside', researchStatus: 'Method research',
    summary: 'Study the trade-off between lower-volatility equities and option income, and ask where the income comes from.',
    mandate: 'Study JEPI’s public lower-volatility equity and option-income framework. Explain equities, ELNs, counterparties, distributions and forgone upside. The current example does not price actual ELNs and cannot claim to replicate its income or dividends.',
    approach: ['Equity research studies lower volatility and fundamental quality.', 'Derivatives research explains option income and the upside given up.', 'Risk reviews ELN counterparties, liquidity and loss scenarios.'],
    limitations: 'The engine uses a synthetic income scenario with capped upside. Actual ELNs, distributions and tax effects are not modeled.',
    selection: 'A substantial active ETF; J.P. Morgan disclosed approximately $46.15 billion in assets.',
    assetLabel: 'Original fund net assets',
    team: [...equityTeam.slice(0, 2), { role: 'Derivatives analyst', name: 'Option structures', duty: 'Explain upside limits, implied volatility and ELN counterparty risk.' }, ...equityTeam.slice(2)],
    sourceTitles: ['J.P. Morgan JEPI strategy, assets and risks'],
  },
  'active-bond': {
    name: 'Active Bonds', category: 'Active core bonds', risk: 'Interest rates and credit', researchStatus: 'Method research',
    summary: 'Study duration, the yield curve and credit separately to understand the role of bonds in a portfolio.',
    mandate: 'Study PIMCO BOND’s public active core-bond approach. Separate duration, the yield curve, credit spreads and liquidity risk. The synthetic bond proxy has no security-level cash flows or actual derivatives and cannot promise capital preservation.',
    approach: ['Macro research proposes interest-rate and economic scenarios.', 'Bond research compares duration, credit and sector allocation.', 'Risk tests sudden rate changes and liquidity stress.'],
    limitations: 'The bond scenario is a synthetic proxy sensitive to interest rates. Original security-level holdings, cash flows and credit histories have not been imported.',
    selection: 'A distinctive active-bond approach; PIMCO’s official core-bond page disclosed approximately $9.085 billion.',
    assetLabel: 'Original fund net assets',
    team: [{ role: 'Fund manager', name: 'Fixed-income portfolio', duty: 'Combine interest-rate and credit views.' }, { role: 'Macro analyst', name: 'Rates and curve', duty: 'Test duration risk across economic and inflation scenarios.' }, { role: 'Credit analyst', name: 'Credit quality', duty: 'Compare spreads, default risk and liquidity.' }, ...equityTeam.slice(2)],
    sourceTitles: ['PIMCO core bonds and BOND assets', 'PIMCO official BOND information'],
  },
  'inflation-curve': {
    name: 'Inflation and the Curve', category: 'Active inflation strategy', risk: 'Derivatives and the curve', researchStatus: 'Method research',
    summary: 'Study TIPS and yield-curve options to understand inflation expectations, real yields and option costs.',
    mandate: 'Study IVOL’s public TIPS and yield-curve option framework. Distinguish CPI, real rates, curve slope, implied volatility and option time decay. A flattening curve or falling volatility can cause losses; an inflation hedge is not insurance.',
    approach: ['Macro research separates realized inflation from market expectations.', 'Derivatives research studies curve shape and long-option costs.', 'Risk tests flattening curves, falling volatility and counterparties.'],
    limitations: 'The scenario does not price actual OTC options or use a yield-curve surface or counterparty data. It is not an IVOL replication result.',
    selection: 'A distinctive method: active TIPS and OTC rate options offer a research subject different from growth equities.',
    team: [{ role: 'Fund manager', name: 'Macro portfolio', duty: 'Coordinate inflation and yield-curve views.' }, { role: 'Macro analyst', name: 'Inflation research', duty: 'Separate CPI, expected inflation and real interest rates.' }, { role: 'Derivatives analyst', name: 'Curve options', duty: 'Test the curve, volatility and option decay.' }, ...equityTeam.slice(2)],
    sourceTitles: ['IVOL official strategy and risks', 'IVOL 2026 annual shareholder report · SEC'],
  },
  buffett: {
    name: 'Omaha Value', reference: 'Inspired by Buffett’s public ideas', category: 'Value and patience', risk: 'Valuation and concentration', researchStatus: 'AI style character',
    summary: 'Treat a share as part of a business. Discuss the business first, then the price, and leave a margin of safety.',
    mandate: 'You are an AI value-investing character inspired by Warren Buffett’s public shareholder letters, not Warren Buffett. Study the circle of competence, business quality, long-term cash flows and purchase price. Be patient and willing to abstain from unfamiliar businesses. Do not invent private holdings, personal views or guaranteed returns.',
    approach: ['Circle-of-competence research explains how the business earns money.', 'Moat research looks for durable competitive advantages.', 'Valuation research requires room between the price and estimated value.'],
    limitations: 'A fictional AI character with no endorsement from Warren Buffett or Berkshire. Example returns come from transparent synthetic rules, not Buffett’s historical performance.',
    selection: 'An AI style character created from public investment ideas.',
    team: [{ role: 'Fund manager', name: 'Value manager', duty: 'Use a character inspired by public ideas to explain businesses and prices.' }, { role: 'Business analyst', name: 'Circle of competence', duty: 'Identify understandable businesses and competitive advantages.' }, { role: 'Valuation analyst', name: 'Margin of safety', duty: 'Challenge cash-flow and valuation assumptions.' }, ...equityTeam.slice(2)],
    sourceTitles: ['Berkshire 1992 shareholder letter', 'Berkshire 2010 shareholder letter'],
  },
  lynch: {
    name: 'Everyday Discoverer', reference: 'Inspired by Peter Lynch’s public ideas', category: 'Familiar businesses', risk: 'Research and growth shortfalls', researchStatus: 'AI style character',
    summary: 'Find leads in familiar products, then test the story against earnings, debt and valuation.',
    mandate: 'You are an AI research character inspired by Peter Lynch’s public investment ideas, not Peter Lynch. Find leads in everyday consumption, then verify finances, competition, growth and price. Using a product does not make its stock a good investment. Do not invent his personal views or investment returns.',
    approach: ['Observation research finds leads in everyday life.', 'Financial research verifies growth, debt and business quality.', 'Valuation research challenges whether the story is already in the price.'],
    limitations: 'A fictional AI character, neither the person nor an endorsement. Scenario performance comes only from simulated rules.',
    selection: 'An AI style character created from public investment ideas.',
    team: [{ role: 'Fund manager', name: 'Discovery manager', duty: 'Put familiar leads through rigorous research.' }, { role: 'Observation analyst', name: 'Everyday observation', duty: 'Turn products and industries into testable questions.' }, { role: 'Financial analyst', name: 'Earnings validation', duty: 'Verify growth quality, debt and valuation.' }, ...equityTeam.slice(2)],
    sourceTitles: ['Fidelity on Lynch’s research approach'],
  },
  dalio: {
    name: 'Four Seasons Balance', reference: 'Inspired by Ray Dalio’s public ideas', category: 'Macro and diversification', risk: 'Correlation and leverage', researchStatus: 'AI style character',
    summary: 'Consider the different economic seasons before deciding which risks need to balance one another.',
    mandate: 'You are an AI macro character inspired by Ray Dalio’s public ideas about diversification across economic environments, not Ray Dalio or Bridgewater. Discuss rising and falling growth and inflation, risk contributions, correlation and stress. This demo uses no leverage and does not claim to implement Bridgewater’s private All Weather strategy.',
    approach: ['Macro research maps combinations of growth and inflation.', 'Allocation research compares assets across economic environments.', 'Risk tests changing correlations and failed diversification.'],
    limitations: 'A fictional AI character, not Ray Dalio or a Bridgewater product. The synthetic model uses no leverage and does not reproduce a private risk-parity system.',
    selection: 'An AI style character created from public investment ideas.',
    team: [{ role: 'Fund manager', name: 'Balance manager', duty: 'Combine risks across multiple economic environments.' }, { role: 'Macro analyst', name: 'Four-season scenarios', duty: 'Study changes in growth and inflation.' }, { role: 'Allocation analyst', name: 'Risk balance', duty: 'Analyze correlation, diversification and stress.' }, ...equityTeam.slice(2)],
    sourceTitles: ['Bridgewater · The All Weather Story'],
  },
};

export function localizedCatalogEntry(item, language = 'zh-CN') {
  if (!item || language !== 'en-US') return item;
  const copy = item.localized?.['en-US'] ?? CATALOG_EN[item.id];
  if (!copy) return item;
  return {
    ...item, ...copy,
    assets: item.assets ? { ...item.assets, label: copy.assetLabel } : undefined,
    sources: item.sources.map((source, index) => ({ ...source, title: copy.sourceTitles[index] })),
  };
}

export function catalogSampleLabel(kind, language = 'zh-CN') {
  const labels = {
    historical: ['Fidelity 官方月末净值 · 价格实验', 'Fidelity official month-end NAV · price experiment'],
    synthetic: ['合成情景 · 方法实验', 'Synthetic scenario · method experiment'],
    imported: ['用户导入价格 · 本地计算', 'User-imported prices · local calculation'],
  };
  return (labels[kind] ?? labels.synthetic)[language === 'en-US' ? 1 : 0];
}

export function catalogAssumptions(item, language = 'zh-CN') {
  if (language !== 'en-US') return [
    `规则上限 ${item.allocation}%，${item.model === 'value' ? '偏离近期均值时提高样例配置' : item.model === 'bond' || item.model === 'balanced' ? '固定比例再平衡' : '高于过去均值时提高配置'}。这是公开可复算的实验规则。`,
    '只用上一观察点已经知道的价格产生信号，在下一观察点价格成交。月频样本按下月月末成交。',
    '买卖点差各按 5 个基点计算，再向不利方向取整到美分。现金不计利息，不含派息、资本利得分配、税和其他费用。',
    '收益为样本累计价格收益。观察点之间的波动未被捕捉，回撤可能被低估。',
    '这项规则实验衡量数据与方法；尚未验证复现原基金经理的交易或原基金总收益。',
  ];
  return [
    `Allocation cap: ${item.allocation}%. ${item.model === 'value' ? 'Increase the example allocation when prices move away from the recent mean' : item.model === 'bond' || item.model === 'balanced' ? 'Rebalance to a fixed proportion' : 'Increase allocation above the trailing mean'}. This is a public, reproducible experiment rule.`,
    'Generate signals using only prices known at the previous observation and fill at the next observation. Monthly samples fill at the following month-end.',
    'Apply a 5-basis-point spread on each buy and sell, then round adversely to cents. Cash earns no interest. Dividends, capital-gain distributions, taxes and other fees are excluded.',
    'Returns are cumulative sample price returns. Changes between observations are not captured and drawdowns may be understated.',
    'This rule experiment tests data and a method. Replication of the original manager’s trades or the fund’s total return has not been validated.',
  ];
}
