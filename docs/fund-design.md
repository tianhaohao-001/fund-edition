# Fundroom 的基金组织设计

## My Fund：专业意见、投资决定、执行三条边界

用户是基金授权人。用自己的语言写目标，再确认标的范围、单一持仓上限和是否允许买入等明确约束。Team Studio 的角色和职责可以调整，交易授权由基金规则单独保存。经理根据有时间和来源的意见提出 `BUY`、`SELL` 或 `HOLD` 及目标权重；规则引擎检查授权、报价、时段、现金、持仓和下单后的集中度，保存成交或拒绝的理由。任何模型输出或聊天室文本都不能直接提交订单。

| 席位 | 每次审议的产物 | 权限边界 |
| --- | --- | --- |
| 投资经理 | 目标权重、核心理由、什么证据会改变决定 | 提案 |
| 投资研究 | 投资论点、最佳反证、证据来源和时间 | 提供材料 |
| 组合构建 | 仓位备选、现金与集中度影响 | 建议仓位 |
| 独立风险 | 授权、下行情景及集中度的异议 | 质疑提案，硬规则由引擎实施 |
| 执行 | 报价新鲜度、价差和可成交条件 | 评估执行，模拟账本记账 |

分工借鉴 BlackRock 的独立 Risk and Quantitative Analysis 职能、其公开的组合构建流程及 Vanguard 对产品风险和绩效的持续复核。主题研究预设参考 ARK 公布的主题筛选、公司分析和估值流程，角色与策略文本均由 Fundroom 编写。 [BlackRock 投资风险声明](https://www.blackrock.com/gls-download/literature/publication/blk-investment-risks-statement.pdf) · [BlackRock SMA 披露](https://www.blackrock.com/us/individual/literature/forms/sma-form-adv-part-2a-bim-brochure-master.pdf) · [Vanguard 投资流程](https://corporate.vanguard.com/content/corporatesite/us/en/corp/about-our-funds/how-we-invest/investment-story.html) · [ARK 投资流程](https://helpcenter.ark-funds.com/arks-investment-process)

不同编制启动不同的审议。**Growth research** 对比需求和估值，**Index allocation** 用宽基 ETF 检查权重和现金留存，**Drawdown defense** 对比持有、减仓和退出，**Value Steward** 聚焦现金流和安全边际。一句投资思路可以匹配预设并预览岗位，用户选用后再创建基金。预设定义初始授权与职位任务，用户可继续调整。同一合成情景用不同的明确上限运行，市场证据一致，授权、风控和账本结果可对照。

## Strategy Lab：共享研究与独立账本

每次共享回放只生成一份经理提案。三个示例组合和该会话启用的个人跟随账户各按现金和持仓实施。暂停保留原账本且跳过该账户的本次回放，恢复沿用余额与历史。继续做真实基金风格研究时，增加三项互相独立的职责。

| 职责 | 交付 | 发现问题时 |
| --- | --- | --- |
| 披露数据 | 每条不可变证据的 `reportDate`、`publicAt`、`sourceId`、版本、标识和已知覆盖范围 | 拒绝把未公开、缺失或未经核验的记录用于当时的决定 |
| 策略研究 | 可复现的规则、参数、样本内冻结日期、样本外目标权重 | 用按时间切分的留出段重跑，披露换手与交易假设 |
| 偏离审查 | 对同一时点、同一可比标的与真实参考的持仓重合、单期权重偏差、回报差、回撤与误差分解 | 覆盖不足就暂停发布，保留差异与已知盲点 |

验证顺序是先冻结假设、再按 `publicAt ≤ 决策时间` 重放、再与留出样本比较。补报只从公开那一刻生效，收益对比使用同一回报口径，另列费用、换手、滑点及现金。若缺少可比持仓或收益，显示覆盖率和缺项。N-PORT 结构化集来自 SEC 已公开的申报，公开时点和报告期并不等价，SEC 也曾延长变更生效日期。13F 有申报时滞与覆盖限制。持仓只是可观察结果，不能还原当事人的全部信息与意图。当前 Lab 的三套曲线是合成对照。 [SEC N-PORT 数据集](https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets) · [SEC N-PORT 生效延期](https://www.sec.gov/file/ic-35538) · [SEC 13F FAQ](https://www.sec.gov/rules-regulations/staff-guidance/frequently-asked-questions-about-form-13f) · [CFA Institute 收益归因](https://rpc.cfainstitute.org/research/foundation/2019/performance-attribution)

**当前 ARKK 研究样本。** Lab 读取三份 SEC N-PORT 的五项固定持仓，权重沿用占基金净资产的分母。选择决策时点后，仅使用当时可用的披露生成模型权重，并取下一期合格报告作留出，展示重合与权重偏差。案例用申报日后的 UTC 中午作为可见时间代理。该样本只能检验披露流程和五项持仓差异，完整基金的权重或收益复现仍需覆盖更广的数据与真实市场回报。 [三份来源与样本](../web/replication-cases.mjs)

## 产品取舍与商业验证

2026-11-18 的网页版采用首支自建模拟基金确认后七天试用、到期保留账本及可撤回意向。会员价、人物研究、拟议真实资产费率与券商合作的假设、来源和盈亏平衡条件见[商业模型与敏感度](revenue-model.md)。

Composer 已提供自然语言构建策略、可视化编辑和回测。Fundroom 首先验证另一件事：用户能否通过更改一条授权规则，追到具体的证据、经理决定和执行结果。试用时记录能否独立找到成交或拦截原因，以及是否再次试验。比赛优先展示这条因果链和一次真实 HarnessRouter 的经理审议。 [Composer 功能说明](https://help.composer.trade/article/108-create-with-ai)

0.50% 只用于试算。1,000 个账户、平均 $2,000、年费 0.50% 对应 $10,000 年毛收入；共享研究与模型调用按策略发生，账户服务、执行、行情和合规成本仍要计入。Wealthfront 公开自动投资费率为每年 0.25%，所以 0.50% 不能宣传为最低。先验证独立研究和模拟审议是否值得付费。真实资金业务的法律、券商、隐私、账户授权与持续风险管理要求要按拟议业务另行核实。 [Wealthfront 定价](https://www.wealthfront.com/pricing) · [SEC 自动投资顾问指引](https://www.sec.gov/im-guidance-2017-02.pdf)
