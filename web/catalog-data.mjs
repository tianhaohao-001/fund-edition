import { CATALOG_EN } from './catalog-copy.mjs';
import { MORE_MARKETS, MORE_PERSONAS } from './catalog-subjects.mjs';
const RESEARCH_DATE = '2026-11-17';

const equityTeam = [
  { role: '基金经理', name: '组合负责人', duty: '结合证据与反证提出组合目标，解释取舍。' },
  { role: '研究员', name: '基本面研究', duty: '研究竞争优势、增长质量与估值，不将价格上涨当作基本面。' },
  { role: '风险官', name: '独立风险', duty: '挑战集中度、回撤和假设，保留拒绝执行权。' },
  { role: '交易员', name: '执行与对账', duty: '校验价格、现金和成交，逐笔保存模拟回执。' },
];

export const CATALOG = Object.freeze([
  {
    id: 'ark-innovation', section: 'market', ticker: 'ARKK', name: '创新前沿', reference: 'ARK Innovation ETF', category: '主动成长', color: '#6278e8', mark: 'AK', risk: '高波动', researchStatus: '持仓抽样已核',
    summary: '从颠覆性技术出发，把长期增长叙事交给证据与估值检验。',
    mandate: '研究 ARKK 公开的颠覆式创新流程。将技术采用、商业化、现金流与估值分别交给研究席，经理综合提出有边界的多头目标。不得声称掌握 ARK 的私有决策。',
    approach: ['主题研究寻找技术成本下降和采用拐点。', '公司研究检验市场空间、护城河与商业化。', '风险席独立检查估值、集中度和证据缺口。'],
    limitations: '已核三期 SEC 文件中的五项持仓。该抽样比较衡量公开持仓接近程度，尚未验证整只基金的交易或回报复制。',
    assets: { value: 6_123_000_000, asOf: '2026-10-31', label: '原基金净资产' },
    selection: '规模型主动基金选集；原基金公开净资产约 61.23 亿美元。',
    team: equityTeam, model: 'growth', allocation: 45,
    sources: [
      { title: 'ARKK 基金目标与风险', url: 'https://www.ark-funds.com/funds/arkk' },
      { title: 'ARK 官方基金规模 · 2026-10-31', url: 'https://www.ark-funds.com/our-etfs' },
      { title: 'ARK 公开投资流程', url: 'https://www.ark-invest.com/investment-process' },
    ],
  },
  {
    id: 'contrafund', section: 'market', ticker: 'FCNTX', name: '卓越企业', reference: 'Fidelity Contrafund', category: '主动大盘成长', color: '#368c76', mark: 'FC', risk: '权益风险', researchStatus: '公开净值可重算',
    summary: '寻找市场尚未充分认识的企业价值，关注盈利质量与长期成长。',
    mandate: '以 Fidelity Contrafund 公开的大盘成长与自下而上研究流程为研究对象，关注企业盈利、竞争位置、估值和组合集中度。公开净值实验仅检验一个透明的趋势规则，不能代表其经理实际操作。',
    approach: ['研究企业的盈利增长和竞争位置。', '比较价格与研究结论中的长期价值。', '组合经理根据证据强弱和风险预算分配资本。'],
    limitations: '提供 Fidelity 公开月末净值的价格序列实验。月频结果未计分红、资本利得分配和税费；不是原基金的总收益或 AI 复刻验证。',
    assets: { value: 182_573_420_000, asOf: '2026-09-30', label: '原组合净资产' },
    selection: '规模型主动基金选集；Fidelity 披露组合净资产约 1,825.73 亿美元。',
    team: equityTeam, model: 'quality', allocation: 55,
    sources: [
      { title: 'Fidelity 基金资料与月末净值', url: 'https://fundresearch.fidelity.com/mutual-funds/view-all/316071109' },
      { title: 'Fidelity 组合规模 · 2026-09-30', url: 'https://fundresearch.fidelity.com/mutual-funds/composition/316071109' },
    ],
  },
  {
    id: 'premium-income', section: 'market', ticker: 'JEPI', name: '股息与期权收入', reference: 'JPMorgan Equity Premium Income ETF', category: '主动期权收益', color: '#4b6aa8', mark: 'JP', risk: '期权与上行限制', researchStatus: '方法研究',
    summary: '研究低波动股票与期权收入之间的取舍，关心收入从何而来。',
    mandate: '研究 JEPI 公开的低波动股票和期权收入框架。明确股票、ELN、对手方、收益分配和上涨机会损失的风险。当前样例没有实现 ELN 的实际定价，不能声称复制其收入或分红。',
    approach: ['股票席研究低波动与基本面质量。', '衍生品席解释期权收入与被放弃的上行。', '风险席检视 ELN 对手方、流动性与损失情景。'],
    limitations: '模拟引擎目前使用有上行限制的合成收入情景，没有真实 ELN、真实派息或税务建模。',
    assets: { value: 46_150_000_000, asOf: '2026-10-30', label: '原基金净资产' },
    selection: '规模型主动 ETF；J.P. Morgan 公开规模约 461.5 亿美元。',
    team: [...equityTeam.slice(0, 2), { role: '衍生品研究', name: '期权结构', duty: '解释上行限制、隐含波动与 ELN 对手方风险。' }, ...equityTeam.slice(2)], model: 'income', allocation: 55,
    sources: [{ title: 'J.P. Morgan JEPI 策略、规模与风险', url: 'https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-equity-premium-income-etf-46641q332/' }],
  },
  {
    id: 'active-bond', section: 'market', ticker: 'BOND', name: '主动债券', reference: 'PIMCO Active Bond ETF', category: '主动核心债券', color: '#597a96', mark: 'BD', risk: '利率与信用', researchStatus: '方法研究',
    summary: '把久期、收益率曲线和信用分开研究，为组合寻找债券的角色。',
    mandate: '研究 PIMCO BOND 公开的主动核心债券方法。区分利率久期、曲线、信用利差与流动性风险。合成债券代理没有逐券现金流或实际衍生品，不能承诺资本保全。',
    approach: ['宏观席提出利率与经济情景。', '债券席比较久期、信用和行业配置。', '风险席检查利率跃迁与流动性压力。'],
    limitations: '债券情景是有利率敏感性的合成代理；尚未导入原基金逐券持仓、现金流和信用历史。',
    assets: { value: 9_085_000_000, asOf: '2026-10-31', label: '原基金净资产' },
    selection: '主动债券特色；PIMCO 官方核心债券页披露约 90.85 亿美元。',
    team: [{ role: '基金经理', name: '固收组合', duty: '综合利率与信用观点。' }, { role: '宏观研究', name: '利率与曲线', duty: '检验经济与通胀情景下的久期风险。' }, { role: '信用研究', name: '信用质量', duty: '比较利差、违约和流动性。' }, ...equityTeam.slice(2)], model: 'bond', allocation: 70,
    sources: [{ title: 'PIMCO 核心债券与 BOND 规模', url: 'https://www.pimco.com/us/en/investment-strategies/core-bonds' }, { title: 'PIMCO BOND 官方说明', url: 'https://www.pimco.com/us/en/investment-strategies/etfs' }],
  },
  {
    id: 'inflation-curve', section: 'market', ticker: 'IVOL', name: '通胀与曲线', reference: 'Quadratic IVOL ETF', category: '主动通胀策略', color: '#af7b4d', mark: 'IV', risk: '衍生品与曲线', researchStatus: '方法研究',
    summary: '研究 TIPS 与利率曲线期权，理解通胀预期、实际利率和期权成本。',
    mandate: '研究 IVOL 公开的 TIPS 与利率曲线期权框架，分别解释 CPI、实际利率、曲线斜率、隐含波动和期权时间损耗。曲线趋平或波动下降可能亏损，不能把通胀对冲称为保险。',
    approach: ['宏观席区分实际通胀与市场通胀预期。', '衍生品席研究曲线形状与长期权成本。', '风险席检验曲线趋平、波动下降和对手方风险。'],
    limitations: '情景实验没有实际 OTC 期权定价、曲线曲面或对手方数据；不能作为 IVOL 复制结果。',
    selection: '特色方法选集；主动 TIPS 与 OTC 利率期权提供与权益成长不同的研究对象。',
    team: [{ role: '基金经理', name: '宏观组合', duty: '协调通胀与曲线观点。' }, { role: '宏观研究', name: '通胀研究', duty: '区分 CPI、预期通胀与实际利率。' }, { role: '衍生品研究', name: '曲线期权', duty: '检验曲线、波动与期权损耗。' }, ...equityTeam.slice(2)], model: 'inflation', allocation: 50,
    sources: [{ title: 'IVOL 官方策略与风险', url: 'https://www.ivoletf.com/' }, { title: 'IVOL 2026 年度股东报告 · SEC', url: 'https://www.sec.gov/Archives/edgar/data/1547576/000182912626006165/kraneshares_ncsr.htm' }],
  },
  {
    id: 'buffett', section: 'persona', ticker: 'VALUE', name: '奥马哈价值派', reference: 'Buffett 公开理念启发', category: '价值与耐心', color: '#ba9254', mark: 'WB', risk: '估值与集中度', researchStatus: 'AI 风格角色',
    summary: '把股票看成企业的一部分。先谈生意，再谈价格，留出安全边际。',
    mandate: '你是以 Warren Buffett 公开股东信为灵感创作的 AI 价值派角色，不是 Warren Buffett 本人。研究能力圈、经营质量、长期现金流和买入价格。保持耐心，面对不知道的生意可以不行动，不编造私人持仓、本人意见或保证收益。',
    approach: ['能力圈席解释生意如何赚钱。', '护城河席寻找可持续竞争优势。', '估值席要求价格相对价值留出余地。'],
    limitations: '创作型 AI 角色，未获本人或 Berkshire 背书。样例收益来自透明合成规则，不能称为 Buffett 历史业绩。',
    team: [{ role: '基金经理', name: '价值派经理', duty: '以公开理念启发的角色解释经营与价格。' }, { role: '企业研究', name: '能力圈研究', duty: '识别可理解的生意与竞争优势。' }, { role: '估值研究', name: '安全边际', duty: '挑战现金流与估值假设。' }, ...equityTeam.slice(2)], model: 'value', allocation: 35,
    sources: [{ title: 'Berkshire 1992 年股东信', url: 'https://www.berkshirehathaway.com/letters/1992.html' }, { title: 'Berkshire 2010 年股东信', url: 'https://www.berkshirehathaway.com/letters/2010ltr.pdf' }],
  },
  {
    id: 'lynch', section: 'persona', ticker: 'DISCOVER', name: '街角发现者', reference: 'Peter Lynch 公开理念启发', category: '熟悉的生意', color: '#619b7c', mark: 'PL', risk: '研究与成长落空', researchStatus: 'AI 风格角色',
    summary: '从熟悉的产品发现线索，再用盈利、负债和估值验证这个故事。',
    mandate: '你是以 Peter Lynch 公开投资理念启发的 AI 研究角色，不是本人。从日常消费发现线索，随后核实财务、竞争、增长和价格。不能把使用过产品等同于值得买入，不编造本人观点或投资回报。',
    approach: ['观察席从生活中找研究线索。', '财务席核实增长、负债与经营质量。', '估值席挑战故事是否已计入价格。'],
    limitations: '创作型 AI 角色，非本人、非背书。情景表现只来自模拟规则。',
    team: [{ role: '基金经理', name: '发现派经理', duty: '把熟悉的线索交给扎实研究。' }, { role: '观察研究', name: '生活观察', duty: '从产品和行业中形成可检验问题。' }, { role: '财务研究', name: '盈利验证', duty: '核实增长质量、债务与估值。' }, ...equityTeam.slice(2)], model: 'growth', allocation: 40,
    sources: [{ title: 'Fidelity 对 Lynch 研究理念的说明', url: 'https://www.fidelity.com/viewpoints/active-investor/trading-guide-managing-investment-risks-and-opportunities' }],
  },
  {
    id: 'dalio', section: 'persona', ticker: 'BALANCE', name: '四季平衡师', reference: 'Ray Dalio 公开理念启发', category: '宏观与分散', color: '#7379bb', mark: 'RD', risk: '相关性与杠杆', researchStatus: 'AI 风格角色',
    summary: '先想经济会经历哪些天气，再讨论哪些风险需要彼此平衡。',
    mandate: '你是以 Ray Dalio 公开的多经济环境分散理念启发的 AI 宏观角色，不是本人或 Bridgewater。讨论增长与通胀上升和下降的环境、风险贡献、相关性与压力情景。当前演示无杠杆，不声称实现 Bridgewater 的私有 All Weather 策略。',
    approach: ['宏观席列出增长与通胀的多种组合。', '配置席比较资产在不同环境的反应。', '风险席检验相关性改变与分散失效。'],
    limitations: '创作型 AI 角色，非本人或 Bridgewater 产品。合成模型无杠杆、没有复现私有风险平价系统。',
    team: [{ role: '基金经理', name: '平衡派经理', duty: '综合多个经济环境的风险。' }, { role: '宏观研究', name: '四季情景', duty: '研究增长和通胀的变化。' }, { role: '配置研究', name: '风险平衡', duty: '分析相关性、分散与压力。' }, ...equityTeam.slice(2)], model: 'balanced', allocation: 65,
    sources: [{ title: 'Bridgewater · All Weather Story', url: 'https://www.bridgewater.com/research-and-insights/the-all-weather-story' }],
  },
  ...MORE_MARKETS,
  ...MORE_PERSONAS,
].map(item => {
  const people = {
    buffett: ['Warren Buffett','沃伦·巴菲特'], lynch: ['Peter Lynch','彼得·林奇'], dalio: ['Ray Dalio','瑞·达利欧'],
  };
  const person = people[item.id];
  const officialName = item.section === 'market'
    ? (item.officialName ?? (item.ticker === 'IVOL' ? 'Quadratic Interest Rate Volatility and Inflation Hedge ETF' : item.reference))
    : undefined;
  return Object.freeze({
    ...item, officialName, personName:item.personName ?? person?.[0], personNameZh:item.personNameZh ?? person?.[1],
    researchedAt:RESEARCH_DATE, localized:item.localized ?? { 'en-US': CATALOG_EN[item.id] },
  });
}));

export const FCNTX_MONTHLY = Object.freeze([
  ['2025-09-30', 24.76], ['2025-10-31', 25.01], ['2025-11-30', 24.99],
  ['2025-12-31', 24.31], ['2026-01-31', 24.77], ['2026-02-28', 24.48],
  ['2026-03-31', 22.96], ['2026-04-30', 25.28], ['2026-05-31', 26.22],
  ['2026-06-30', 26.80], ['2026-07-31', 25.93], ['2026-08-31', 26.85],
].map(([date, close]) => Object.freeze({ date, close })));

export function findCatalog(id) {
  return CATALOG.find(item => item.id === id);
}
