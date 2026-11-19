// These are Fundroom research protocols. Original fund methodologies and primary sources live in catalog-data.mjs.
const bi = (zh, en) => ({ zh, en });
function protocol(name, research, risk, rule, missing, cost, benchmark) {
  return { name, seats:{ research, risk, manager:rule }, rule, missing, cost, benchmark };
}

const equityCosts = bi('逐笔使用当日买卖价差、费用和换手；资料研究不产生费用估计。','Use contemporaneous spreads, fees and turnover per trade. A document study cannot estimate realized costs.');
const personaBenchmark = bi('按独立规则事先选择股票总回报指数；没有该人物可核对的组合净值。','Predeclare an equity total-return benchmark for an independent rule. No verified personal portfolio NAV is supplied.');

function eln(index) {
  return protocol(
    bi(index+' 股票与期权收入',index+' equity and option income'),
    bi('分别核对股票篮子、每张 ELN 的名义本金、行权价、期限和结算条款。','Reconcile the equity basket and each ELN’s notional, strike, expiry and settlement terms.'),
    bi('按发行人分组做交易对手压力测试，再比较跳涨时的上行截断。','Stress counterparty concentration by issuer and the upside cap during an index rally.'),
    bi('按披露日后可得的股票权重和 ELN 条款分别估值，合并股息、票息和结算现金流。','Value the disclosed equity weights and ELNs separately once available, then combine dividends, coupons and settlements.'),
    bi('缺逐期公开可见的 ELN 条款、历史期权报价和可复核的场外票据估值。','Missing point-in-time ELN terms, historical option quotes and verifiable OTC note marks.'),
    bi('需要历史双边报价、展期价差及票据流动性折价。','Requires historical bid/ask, roll spreads and a note liquidity haircut.'),
    bi('比较本基金含分红净值；'+index+' 总回报衡量股票机会成本。','Compare reinvested fund NAV. '+index+' total return measures equity opportunity cost.')
  );
}

export const STRATEGY_PROFILES = {
  wellington: protocol(
    bi('股息股票与投资级信用','Dividend equity and investment-grade credit'),
    bi('核对样本前招募书的股票授权区间以及同日基金和成分净值。','Verify the pre-sample equity mandate and aligned fund and sleeve NAV returns.'),
    bi('分离选股与信用风险，量化三条序列的留出期偏离。','Challenge stock selection and credit exposure using holdout deviations across all three series.'),
    bi('每季初按授权区间中点配置 65% VYM 和 35% VCIT。','Rebalance quarterly to 65% VYM and 35% VCIT, the midpoint of the disclosed equity range.'),
    bi('未提供经理逐笔证券选择和时机，无法验证完全复刻。','Security selection and manager timing are unavailable for full replication.'),
    bi('每次按实际成交金额扣 5 bp；使用含分配再投资净值。','Charge 5 bp per traded notional and use reinvested NAV returns.'),
    bi('VWELX 同季度净值总回报。','Same-quarter VWELX NAV total returns.')
  ),
  'stocks-plus': protocol(
    bi('股票贝塔与债券超额分解','Equity beta and bond alpha decomposition'),
    bi('读取样本前股票敞口授权，将 VOO 总回报与机构份额同年数据配对。','Pair VOO total returns with institutional-share years after verifying the original equity mandate.'),
    bi('区分股票敞口、抵押品收益和债券超额；检查年频跟踪误差。','Separate equity beta, collateral and bond alpha; test annual tracking error.'),
    bi('仅以 100% VOO 建立权益基准，主动债券与期货基差另行归因。','Use 100% VOO as an equity baseline. Attribute bond alpha and futures basis separately when data support it.'),
    bi('未载入逐日衍生品头寸、抵押品、融资和债券账本。','Daily derivative positions, collateral, financing and bond lots are unavailable.'),
    bi('VOO 开仓扣 5 bp；债券周转、融资和期货展期成本未计。','Charge 5 bp on the VOO opening trade. Bond turnover, financing and futures rolls are excluded.'),
    bi('PSTKX 机构份额年度税前总回报。','PSTKX institutional-share annual pre-tax total returns.')
  ),
  'ark-innovation': protocol(
    bi('创新持仓的滞后披露','Innovation holdings with disclosure lag'),
    bi('按 SEC 接受日后的保守可见时间选取披露，保持报告期与可见时间分离。','Separate report dates and availability, using a conservative time after SEC filing.'),
    bi('核对未披露权重与留出持仓重合度，禁止把残差当现金。','Measure uncovered weight and held-out overlap; never classify the undisclosed residual as cash.'),
    bi('对决策时已公开的最近两期五只样本持仓取均值，以下一期持仓盲评。','Average the five sampled holdings from the latest two available disclosures; compare with the next filing.'),
    bi('缺全量持仓、逐笔交易与成分收益，未生成净值。','Full holdings, trades and constituent returns are missing; no NAV is produced.'),
    bi('仅测权重距离；缺成交价差、逐笔交易与冲击。','Holdings distance only. Spreads, fills and market impact are unavailable.'),
    bi('下一期 N-PORT 的相同五项权重。','The same five holdings in the next N-PORT filing.')
  ),
  contrafund: protocol(
    bi('成长选股与价格诊断','Growth selection and NAV price diagnostic'),
    bi('核实原份额月末净值；将公司盈利事件和基金持仓作为独立证据。','Verify share-class month-end NAVs and distinguish company earnings evidence from fund holdings.'),
    bi('排除分配和拆分的混用，检查信号日期早于成交。','Check distribution/split treatment and require signal dates before fills.'),
    bi('价格诊断仅按过去三个月均值生成信号，在下一月末调整，限额 55%。','For the price diagnostic only, use the trailing three-observation mean and apply the 55% cap at the next month-end.'),
    bi('缺完整历史成分、逐时点盈利预期和分配再投资序列。','Missing complete historical constituents, point-in-time earnings expectations and reinvested distributions.'),
    bi('实验买卖各计 5 bp 点差，按不利方向取整到美分。','The diagnostic charges a 5 bp spread per side, rounded adversely to cents.'),
    bi('同月度持有 FCNTX 的价格实验；不代表基金总回报。','Buy-and-hold FCNTX over the same NAV prices, excluding distributions.')
  ),
  'capital-growth': protocol(
    bi('多经理成长组合','Multi-manager growth sleeves'),
    bi('将行业分部拆为结构成长、周期复苏和困境反转，记录当时公开的财报。','Classify structural growth, cyclical recoveries and turnarounds using filings available at each date.'),
    bi('去重不同分部的同名证券，检查盈利修复与估值依赖。','Net overlapping names across sleeves and challenge earnings recovery and valuation dependence.'),
    bi('只在分部持仓和资产份额已知时加权合并，对重叠证券计一次净交易。','Aggregate sleeves by disclosed capital weights only when sleeve holdings are known; net overlapping trades.'),
    bi('缺各经理分部持仓与权重、可见日期及含分配的份额序列。','Missing dated sleeve holdings and weights, visibility dates and the share-class total-return series.'),equityCosts,
    bi('AGTHX 同份额总回报；另列标普 500 总回报。','Same-class AGTHX total returns, with S&P 500 total return as a separate comparator.')
  ),
  'premium-income':eln('S&P 500'), 'nasdaq-income':eln('Nasdaq-100'),
  'active-bond':protocol(
    bi('久期、信用与抵押贷款','Duration, credit and mortgages'),
    bi('从逐券头寸提取关键期限久期、利差久期、息票和 MBS 提前还款。','Extract key-rate duration, spread duration, coupons and MBS prepayments from dated bond lots.'),
    bi('分别冲击收益率、信用和提前还款；检验曲率与流动性。','Stress rates, credit and prepayments separately, then examine convexity and liquidity.'),
    bi('用当日可买入的债券匹配关键期限与利差敞口，按付息和本金回收记账。','Match key-rate and spread exposures using investable bonds, then account for coupons and principal.'),
    bi('缺按券时间序列、应计息、历史买卖报价和提前还款输入。','Missing dated security-level positions, accrued interest, historical dealer quotes and prepayment inputs.'),
    bi('逐券计应计利息与买卖价差，展期按可成交报价。','Apply accrued interest and security-specific bid/ask; roll only on executable marks.'),
    bi('BOND 同日总回报，另列广义美国投资级债券指数。','Matched BOND total returns, with a broad US investment-grade bond comparator.')
  ),
  'inflation-curve':protocol(
    bi('TIPS 与曲线期权','TIPS and yield-curve options'),
    bi('核对抗通胀债券和场外曲线期权的期限、执行条件与权利金。','Verify inflation-linked bonds and OTC curve-option tenors, strikes and premiums.'),
    bi('分开冲击实际利率、曲线陡峭度和隐含波动率，并检查对手风险。','Stress real rates, curve slope and implied volatility separately, including counterparty exposure.'),
    bi('分开累计 TIPS 现金流和实际 OTC 合约损益，再按披露名义金额合并。','Accrue TIPS cash flows and actual OTC contract P&L separately, then aggregate by disclosed notional.'),
    bi('缺逐期合约、历史曲线波动率曲面、买卖报价与资金成本。','Missing period-specific contracts, historical curve volatility surfaces, bid/ask marks and funding.'),
    bi('需要 OTC 权利金、买卖价差、展期报价和 TIPS 应计额。','Requires OTC premiums, spreads, quoted rolls and TIPS accruals.'),
    bi('IVOL 分配再投资净值；TIPS 组合用于拆解期权增量。','IVOL reinvested NAV with a separate TIPS comparator to isolate the option sleeve.')
  )
};

function persona(name, research, risk, rule, missing, benchmark = personaBenchmark) {
  return protocol(name,research,risk,rule,missing,equityCosts,benchmark);
}

Object.assign(STRATEGY_PROFILES,{
  buffett:persona(bi('企业价值与安全边际','Business value and margin of safety'),
    bi('用当时财报区分维持性资本开支与可分配盈利。','Separate maintenance capex from distributable earnings using then-available filings.'),
    bi('挑战护城河、估值折现率与资本密集度。','Challenge moat durability, discount rates and capital intensity.'),
    bi('只有具备可复核现金流范围和预先设定安全边际时才形成候选清单。','Form an independent watchlist only from verifiable cash-flow ranges and a predeclared margin of safety.'),
    bi('缺带披露时间的财报面板、估值假设和独立样本。','Missing point-in-time financials, valuation assumptions and an independent test set.')),
  lynch:persona(bi('熟悉的生意与盈利验证','Familiar businesses and earnings validation'),
    bi('将消费观察与财报中的收入、存货和盈利相核对。','Check observations about a business against reported revenue, inventory and earnings.'),
    bi('检验扩张能否兑现及成长放缓后的估值。','Challenge rollout economics and valuation if growth slows.'),
    bi('把观察转为待验证假设，只有同期盈利与资产负债表支持时进入候选。','Convert observations into hypotheses; require contemporaneous earnings and balance-sheet support before watchlisting.'),
    bi('缺带时标的观察、盈利、当时基准成分与样本外结果。','Missing dated observations, earnings, historical universe and holdout results.')),
  dalio:persona(bi('增长与通胀环境的风险配置','Risk allocation across growth and inflation regimes'),
    bi('分离增长与通胀意外，估计各资产风险暴露。','Separate growth and inflation surprises and estimate exposure by asset.'),
    bi('压力测试资产相关性同时上升以及杠杆资金成本。','Stress simultaneous correlation increases and leverage funding.'),
    bi('只用当时可见的宏观版本和协方差估计各资产风险贡献，再约束杠杆。','Estimate risk contributions using vintage macro data and lagged covariance, subject to a leverage cap.'),
    bi('缺宏观历史版本、同期多资产总回报与可借资金报价。','Missing macro vintages, matched multi-asset total returns and borrowing quotes.'),
    bi('预先指定的无杠杆多资产基准；未提供私人组合记录。','Predeclared unlevered multi-asset comparator; no private portfolio track record.')),
  'cathie-wood':persona(bi('技术成本与商业化','Technology costs and commercialization'),
    bi('追踪技术成本曲线与采用率，并连接到企业收入。','Link dated technology cost curves and adoption to company revenue.'),
    bi('压低采用率与毛利率，测试估值和集中度。','Stress adoption, margins, valuation and concentration.'),
    bi('用有时标的技术假设构建多情景候选；持仓验证与 ARKK 独立。','Build scenario-based candidates from timestamped technology assumptions, separately from the ARKK holdings study.'),
    bi('缺历史技术预测版本、企业情景与预先锁定权重。','Missing vintage technology forecasts, company scenarios and ex-ante weights.')),
  'keith-gill':persona(bi('反向价值与偿债能力','Contrarian value and solvency'),
    bi('按公开财报重建现金、债务期限与稀释情景。','Reconstruct cash, debt maturities and dilution from public filings.'),
    bi('优先检验破产、稀释、流动性和幸存者偏差。','Test insolvency, dilution, liquidity and survivorship bias first.'),
    bi('给悲观和复苏情景分别估值，仅在财务证据可审计时列为案例。','Value downside and recovery scenarios separately; retain a case only with auditable financial evidence.'),
    bi('公开证词是单一个案，缺预先登记的候选全集与长期样本。','Public testimony is one case; a preregistered universe and long history are missing.'))
});
