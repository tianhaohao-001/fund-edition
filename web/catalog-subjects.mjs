// Additional public research subjects. Names identify the source, and the fund
// allocations below belong exclusively to the separate synthetic catalog sandbox.
const equitySeats = [
  ['研究员','企业研究','比较盈利、现金流和估值。','Analyst','Company research','Compare earnings, cash flow and valuation.'],
  ['风险官','独立风控','检验集中度和反方证据，记录否决。','Risk officer','Independent risk','Test concentration and counterevidence, and record vetoes.'],
  ['交易员','模拟执行','核对模拟价格、授权与成交回执。','Trader','Simulated execution','Reconcile simulated prices, authorization and fills.'],
];
function team(manager, specialist, english) {
  return [
    ['基金经理',manager[0],manager[1],'Manager',manager[2],manager[3]], specialist, ...equitySeats,
  ].map(row=>english?{role:row[3],name:row[4],duty:row[5]}:{role:row[0],name:row[1],duty:row[2]});
}
function subject(meta, zh, en, manager, specialist, sources) {
  const makeCopy = (data,isEnglish) => ({
    name:data[0], category:data[1], risk:data[2], researchStatus:data[3], summary:data[4], mandate:data[5], approach:data[6],
    limitations:data[7], selection:data[8], team:team(manager,specialist,isEnglish),
  });
  return {
    ...meta, ...makeCopy(zh,false), sources:sources.map(([title,,url])=>({title,url})),
    localized:{'en-US':{...makeCopy(en,true), reference:meta.officialName || meta.personName,
      assetLabel:'Original fund assets across share classes',sourceTitles:sources.map(([,title])=>title)}},
  };
}
export const MORE_MARKETS = [
  subject(
    {id:'stocks-plus',section:'market',ticker:'PSTKX',officialName:'PIMCO Stocks PLUS Bond Alpha Fund Institutional Class',reference:'PIMCO Stocks PLUS Bond Alpha Fund Institutional Class',mark:'PS',color:'#4e6981',model:'quality',allocation:65},
    ['股票敞口与债券增强','主动增强股票','权益、抵押品与融资','独立股票敞口对照','用独立标普500 ETF 检查股票基准能解释多少原基金回报。','研究曾名 StocksPLUS 的基金。样本前文件通常维持接近100%股票指数敞口，抵押品组合主动管理。用VOO的总回报隔离股票敞口，报告与机构份额的真实差异。',
      ['锁定样本前已有的权益敞口范围。','仅用独立VOO作为股票代理，不调用目标基金定权。','用十份逐年SEC披露检查历史表现及债券、融资等未解释部分。'],
      '单只ETF无法重建债券选券、期货基差和融资。后五年仅五个观测，年度回撤未捕捉年内损失。','特色方法样本，筛选依据为发行人在2006和2015年已披露的股票敞口及主动固收组合。'],
    ['Equity beta and bond alpha','Enhanced equity','Equity, collateral and financing','Independent equity beta baseline','Test how much of the original fund’s performance is explained by an independent S&P 500 ETF.','Study the fund formerly called StocksPLUS. Its public mandate sought index exposure near NAV plus active collateral management. Isolate equity exposure with VOO total returns and measure the residual against Institutional Shares.',
      ['Freeze the pre-sample equity mandate.','Use independent VOO without feeding the target into portfolio weights.','Check ten annual SEC filings and explain the residual exposure.'],
      'An equity ETF misses active credit, futures basis and financing. Five annual holdout observations hide intrayear drawdowns.','Distinctive method selected for its published equity-exposure and collateral architecture in 2006 and 2015.'],
    ['跨资产经理','将股票敞口与附加收益分开说明。','Cross-asset manager','Separate market exposure from additional returns.'],
    ['抵押品研究','融资与基差','解释主动债券与期货可能如何产生差异。','Collateral analyst','Financing and basis','Explain independent credit and futures risks.'],
    [['样本前PIMCO授权','Pre-sample PIMCO mandate','https://www.sec.gov/Archives/edgar/data/810893/000119312515265584/d933724d497k.htm'],['2026年正式名称及份额','2026 name and share class','https://www.sec.gov/Archives/edgar/data/810893/000119312526321567/d140919d497k.htm']]
  ),
  subject(
    {id:'wellington',section:'market',ticker:'VWELX',officialName:'Vanguard Wellington Fund Investor Shares',reference:'Vanguard Wellington Fund Investor Shares',
      mark:'VW',color:'#337c71',model:'balanced',allocation:65,assets:{value:120_350_000_000,asOf:'2026-09-30',label:'原基金全部份额净资产'}},
    ['惠灵顿股债配置','主动平衡','股债相关性','独立成分留出对照',
      '用公开的股债区间，检验两只独立 ETF 能跟踪这只主动基金多远。',
      '从2014年招募说明书提取股票60%–70%的区间，以股息股票与投资级公司债代理主动配置。研究组用当期两只ETF回报独立计价，最后才加入VWELX进行比较。',
      ['从样本前公开授权得到配置上下限。','季度间保留持仓漂移，季初按65/35再平衡。','报告留出期跟踪误差、收益差和股债单袖套对照。'],
      '两个指数袖套无法重建基金的选股、国债配置和期限结构；季度数据遗漏期内回撤。回测方法是事后设计并按日期留出。当前聊天的分析另行记录。',
      '2026年9月基金全部份额净资产1,203.50亿美元，其中 Investor 份额123.05亿美元。'],
    ['Wellington allocation','Active balanced','Stock–bond correlation','Independent sleeve holdout',
      'Test how well two independent ETFs track this active balanced fund under its public stock and bond ranges.',
      'Extract the 60–70% equity range from the 2014 prospectus. Price an independent dividend-stock and corporate-credit proxy, then join VWELX returns for evaluation.',
      ['Read a mandate published before the sample.','Allow quarterly drift and reset to 65/35.','Report held-out error, cumulative gap and standalone sleeve returns.'],
      'Two ETFs miss active security selection, Treasuries and duration management. Quarterly marks miss intraperiod losses. The design is retrospective with a time holdout. Current manager discussions are recorded separately.',
      'September 2026 total assets across share classes were $120.350bn, including $12.305bn in Investor Shares.'],
    ['配置经理','将区间转为可检验的组合。','Allocation manager','Translate the range into a testable portfolio.'],
    ['固收研究','信用与久期','检验公司债代理与基金实际信用、久期配置的偏差。','Credit analyst','Credit and duration','Challenge the proxy against the fund’s credit mix and duration.'],
    [['2014 年基金招募说明书','2014 SEC prospectus','https://www.sec.gov/Archives/edgar/data/105563/000093247114005019/sp21032014.htm'],['Vanguard 基金资料与季度回报','Vanguard profile and quarterly returns','https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/investment-profiles/0021.pdf']]
  ),
  subject(
    {id:'nasdaq-income',section:'market',ticker:'JEPQ',reference:'JPMorgan Nasdaq Equity Premium Income ETF',officialName:'JPMorgan Nasdaq Equity Premium Income ETF',mark:'JQ',color:'#506498',model:'income',allocation:55,assets:{value:42_490_000_000,asOf:'2026-10-30',label:'原基金净资产'}},
    ['纳指期权收入','主动权益收益','期权与科技集中','方法研究','研究纳指股票敞口与卖出期权如何改变现金收入和上涨空间。','将美国大型成长股配置和纳斯达克期权敞口拆解；说明ELN对手方、波动率与上涨封顶的权衡。',
      ['审查权益组合和纳指的风格偏差。','拆解期权收益、波动率与ELN结构。','在急涨、急跌两种情景下质疑收入可持续性。'],
      '缺少历史逐笔ELN条款和专有配置模型。合成实验仅展示上行受限情景，未验证真实分配或基金跟踪。','发行人披露2026年10月30日资产424.9亿美元。'],
    ['Nasdaq option income','Active equity income','Options and tech concentration','Method research','Study how Nasdaq stock exposure and calls change income and upside.',
      'Separate the large-cap growth portfolio from Nasdaq call exposure, counterparty risk, volatility and upside given up.',
      ['Measure equity style drift.','Describe option income, volatility and ELNs.','Stress income under rallies and selloffs.'],
      'Historical ELN terms and proprietary weights are absent. The synthetic capped-upside scenario cannot establish real distributions or tracking.','Issuer assets were $42.49bn on October 30, 2026.'],
    ['收益经理','解释权益风险和收入的取舍。','Income manager','Explain equity risk versus income.'],
    ['衍生品研究','期权结构','核查估值、波动和ELN对手方。','Derivatives analyst','Options structure','Review valuation, volatility and ELN counterparties.'],
    [['摩根资产管理 · 规模与资料','J.P. Morgan fund assets and facts','https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-nasdaq-equity-premium-income-etf-jepq-46654q203'],['投资方法','Portfolio construction','https://am.jpmorgan.com/content/dam/jpm-am-aem/americas/us/en/literature/fund-story/STO-JEPQ.pdf']]
  ),
  subject(
    {id:'capital-growth',section:'market',ticker:'AGTHX',reference:'The Growth Fund of America',officialName:'American Funds The Growth Fund of America Class A',mark:'AG',color:'#497d72',model:'growth',allocation:60,assets:{value:353_072_100_000,asOf:'2026-08-31',label:'原基金全部份额净资产'}},
    ['美国成长组合','主动成长','成长估值与经理分歧','方法研究','对照传统成长、周期复苏与困境反转三类投资理由。','研究 Capital Group 公开的灵活成长方法。分别审查成长股、周期股及复苏标的，独立挑战企业的资本需求与估值。',
      ['把候选标的分为成长、周期与反转。','对盈利增长和再投资需求做交叉检验。','组合席衡量共同风险和经理分歧。'],
      '公开资料未给出各位经理每次目标权重。合成情景不含原基金交易、A份额销售费用或真实收益。','发行人披露2026年8月31日全基金资产3,530.721亿美元。'],
    ['American growth portfolio','Active growth','Valuation and manager dispersion','Method research','Compare growth, cyclical recovery and turnaround investment cases.','Study Capital Group’s flexible growth approach by separating structural growth from cyclicality and turnarounds; challenge capital needs and valuation.',
      ['Classify opportunities by the source of growth.','Challenge reinvestment and earnings quality.','Check shared risk across manager sleeves.'],
      'Public evidence lacks each manager’s full decisions. The synthetic scenario omits actual trades, Class A sales charges and historical fund returns.','The issuer reported $353.0721bn across the fund on August 31, 2026.'],
    ['成长组合经理','比较不同风险来源。','Growth manager','Compare distinct risk drivers.'],
    ['行业研究','周期与反转','检验短期复苏能否产生可持续现金。','Sector analyst','Cycles and recoveries','Test whether the recovery can sustain cash flow.'],
    [['Capital Group 基金资料','Capital Group fund profile','https://www.capitalgroup.com/individual/investments/mutual-funds/details/agthx']]
  ),
];

export const MORE_PERSONAS = [
  subject(
    {id:'cathie-wood',section:'persona',ticker:'INNOVATION',reference:'Cathie Wood · ARK 公开研究流程',personName:'Cathie Wood',personNameZh:'凯茜·伍德',mark:'CW',color:'#7365a4',model:'growth',allocation:40},
    ['颠覆式创新研究室','主题创新','估值与集中','AI 风格角色','先研究成本曲线与采用速度，再检验具体公司的市场规模和估值。','作为受 Cathie Wood 和 ARK 公开方法启发的独立AI研究角色，自上而下提出技术主题，再自下而上检验公司、估值和风险；不得冒充真人、声称背书或掌握私人交易。',
      ['绘制成本下降与需求扩散假设。','用竞争、现金消耗和估值证伪叙事。','在不同采用时间表下质疑集中度。'],'公开流程无法说明每次调仓。情景收益属于独立AI角色。','公开关注依据为 ARK 的面向市场研究与投资者视频；不使用未经核实的粉丝数。'],
    ['Disruptive innovation studio','Thematic innovation','Valuation and concentration','AI style character','Start with technology costs and adoption, then test company opportunity and value.','An independent character inspired by publicly documented ARK research. Study top-down themes and bottom-up valuation. Never impersonate Cathie Wood or claim endorsement, private decisions or actual positions.',
      ['Map costs and adoption.','Test competition, cash burn and valuation.','Stress timing risk and concentration.'],'Public research does not disclose each trade. Scenario performance belongs to the independent style experiment.','Selection reflects ARK’s public research and investor videos. No unsourced audience count is used.'],
    ['创新研究经理','解释主题的关键可证伪假设。','Innovation manager','Identify falsifiable thematic assumptions.'],
    ['技术研究','成本与采用','分析成本下降与商业化速度。','Technology analyst','Cost and adoption','Study costs and commercialization.'],
    [['ARK 投资流程','ARK investment process','https://www.ark-invest.com/investment-process'],['ARK 创始人与投资团队','ARK founder and investment team','https://www.ark-invest.com/our-team']]
  ),
  subject(
    {id:'keith-gill',section:'persona',ticker:'DEEPVALUE',reference:'Keith Gill · Roaring Kitty 公开证词',personName:'Keith Gill',personNameZh:'基思·吉尔',mark:'KG',color:'#966744',model:'value',allocation:30},
    ['反向价值研究室','逆向研究','流动性与集中','AI 风格角色','从市场共识最悲观之处出发，用财务资料检验价格折让是否成立。','作为受 Keith Gill 公开证词启发的独立AI分析员，研究财报、估值折价和不利证据。不得冒充本人、号召抱团、编造交易或将一次案例当作普适策略。',
      ['用公开财务核实现况。','比较市场共识和潜在资产价值。','先写清楚破产、流动性与永久损失情形。'],'2021年证词是个案，其社媒活动无法产生可验证的长期基金业绩。','关注依据为公开网络创作者 Roaring Kitty 就其广受关注的公司研究向美国众议院作证（2021-02-18）。'],
    ['Contrarian value studio','Contrarian research','Liquidity and concentration','AI style character','Start with a bearish consensus and use financial evidence to test whether the discount is justified.','An independent analyst inspired by Keith Gill’s public testimony. Examine financial statements, discounted prices and counterevidence. Do not impersonate Gill, coordinate trading, fabricate holdings or generalize from one case.',
      ['Verify business finances from public records.','Contrast consensus and available asset value.','Model insolvency, liquidity and permanent loss.'],'The 2021 testimony describes a case study. Social attention does not establish a verifiable long-term fund record.','The online creator Roaring Kitty testified about his widely discussed stock research before the US House on February 18, 2021.'],
    ['逆向研究经理','分开公开事实和市场叙事。','Contrarian manager','Separate public facts from market narratives.'],
    ['反证研究','偿债与流动性','在估值前检查永久损失的可能。','Countercase analyst','Solvency and liquidity','Stress permanent impairment before valuing upside.'],
    [['2021 年 2 月美国众议院书面证词','US House written testimony · February 18, 2021','https://democrats-financialservices.house.gov/uploadedfiles/hhrg-117-ba00-wstate-gillk-20210218.pdf']]
  ),
];
