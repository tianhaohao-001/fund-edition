# 主动基金的研究方法与证据

市场目录包含九只基金。每只基金的机构档案给独立 AI 研究席、风险席和经理席分配不同职责。三个席位都可以接受单独的 HarnessRouter 调用。研究席与风险席先并行质询同一份带时标证据，经理再读取两个席位实际交回的意见。服务保留真实调用回执、缺席和未成功状态。固定规则核验在本地完成，模型调用数为零。

## 研究范围

| 对象 | 组合实验和比较基准 | 档案中的研究范围与数据缺口 |
| --- | --- | --- |
| VWELX | 季初恢复 65% VYM、35% VCIT，对照同季 VWELX 净值总回报 | 样本前招募书规定股票区间。独立代理不覆盖原经理个股选择。研究席复核授权，风险席分析留出偏离。 |
| PSTKX | 买入 VOO，对照同年机构份额税前总回报 | 仅衡量权益贝塔。抵押品、期货基差、融资与逐券债券账本缺失。经理区分证券敞口与债券超额。 |
| ARKK | 平均两期披露的五只股票权重，用下一期同五只股票检验 | SEC 报告期与可见时刻分离。风险席核算重合及残差。未披露余额不能当成现金。 |
| FCNTX | 公开月末净值实验使用过去三个价格，在下一观察点成交 | 另以发行人披露的六只股票作为独立选股研究池。研究员关注公司盈利；净值实验不能代替选股证据。 |
| AGTHX | 按成长、周期和反转研究分部，以原份额总回报比较 | 有同期汇总持仓子集，缺各经理分部权重。风险席去除重叠敞口。 |
| JEPI / JEPQ | 将股息、ELN 票息、期权结算分账，分别与基金分配再投资净值比较 | 只开放 VOO 或 QQQ 的独立股票代理。研究席核对票据条款，风险席核对对手、上行封顶和流动性。缺票据及历史双边报价。 |
| BOND | 以久期、利差、提前还款和现金流重建债券组合 | 缺逐券历史及报价。不能生成逐券委托。 |
| IVOL | 分别重建 TIPS 现金流和曲线期权损益，比较 IVOL 含分配净值 | 缺场外历史合约、波动率曲面、报价及资金成本。不能生成期权头寸。 |
| 五种人物方法 | Buffett 价值、Lynch 盈利验证、Dalio 风险配置、Wood 技术采用、Gill 偿债估值 | 各有独立研究和反证职责。真实个人长期组合、既定权重和同期投资全集均未随档案提供。 |

组合规则、交易成本、基准、机构来源、逐标的准入与禁止敞口均可从基金详情的研究折叠栏或本地脚本检查。公开档案验证日为 2026-11-18。报告日期、资料核对日期和决策可见时间用途不同。历史实验使用各自冻结的输入和样本前授权。当前档案只支持核对日后使用；动态网页未披露精确发布日期时保留空值。

## 可执行接口

`strategyMandate(catalogId, language)` 从 [strategy-playbook.mjs](../web/strategy-playbook.mjs) 返回版本 1 JSON。语言支持 `en-US` 和 `zh-CN`。

- `catalogId`、`ticker`、`manager` 和 `sources` 标识对象、公开管理团队与 URL。人物条目的经理始终为独立 AI 研究组。
- `referenceDate` 为选定材料所述日期，`verifiedAt` 为档案核对日。`universe.allowedSymbols` 限定研究标的，`scope` 解释是原持仓子集、独立代理或空池。`blockedExposures` 列出缺证据的工具与风险。研究池本身不构成交易许可。
- `roles.research/risk/manager` 为当前策略任务。其中经理评估新证据、调仓或观望。`rule` 为历史实验或待验证的方法。`cost`、`benchmark`、`missing` 分别给出费用口径、比较对象和数据缺口。
- `runReplicaStudy(id).playbook` 返回 `{version,catalogId,scope,checks,modelCalls}`。`scope` 取 `matched-returns`、`sampled-holdings`、`nav-price`、`documents`。每项检查带 `id/status/detail/observed`，其中 `observed` 按实际实验给出时点和样本量。`full-replication` 对当前 14 项均为 `blocked`。
- `researchBrief(study,language)` 生成经理与团队共用的语言版本。旧版已保存研究缺少 `playbook` 时，会用相同独立规则补全检查。真实研究会议可引用 `research-method`、`coverage`、`sources`。只有存在已核验历史总回报时才提供 `holdout` 和 `deviations`。

## 验收

从项目根目录运行。前三项使用本地冻结数据。最后一项明确使用已配置的云端凭据并调用三个席位。

```powershell
node scripts/verify-strategy-methods.mjs
node --test --test-isolation=none test/strategy-playbook.test.mjs test/replica-study.test.mjs
node --test --test-isolation=none test/accounts.test.mjs
# 按 dev.ps1 配置 HarnessRouter 环境后
node scripts/verify-strategy-methods.mjs --hosted inflation-curve
```

2026-11-18 本地核验：VWELX 对齐 23 个留出季度，年化跟踪误差 5.9403%。PSTKX 对齐 5 个留出年度，年化跟踪误差 1.3912%。ARKK 的 2025-07-15 决策只使用此前公开的两期材料；第三期留出中，五项已知重合权重为 35.536752%，含未覆盖汇总类别的距离为 7.5783465 个百分点。该数值衡量持仓权重。FCNTX 以 12 个月末净值在价格实验中生成 8 笔模拟买卖。

同日 IVOL 的真实中文会议完成 3 次模型调用。研究席、风险席、经理回执依次为 `resp_80287e2870eb44caa27da2156973fe5f`、`resp_7de2e2d9a2a4490aafada025e4209f1e`、`resp_812d3de80926498ea60a735e5dfefdc1`。三席均引用资料覆盖与研究方法；经理报告历史场外条款和估值输入缺失，保持研究状态。此会议无账户变更。

## 来源

基金池原有来源与净值口径见[目录研究记录](catalog-research.md)。新增的独立选股子集分别取自富达和 Capital Group 的 2026-09-30 公开持仓，不按这些权重逆推历史交易。[Fidelity](https://fundresearch.fidelity.com/mutual-funds/view-all/316071109?documenttype=chm) · [Capital Group](https://www.capitalgroup.com/individual/investments/quarterlyholdings/agthx?fundGroupNumber=5)

JEPI 与 JEPQ 的股票范围及票据风险以管理人资料为依据。研究环境对其选择独立股票代理。IVOL 的曲线、波动率与对手风险来自管理人说明。[J.P. Morgan](https://am.jpmorgan.com/content/dam/jpm-am-aem/americas/us/en/literature/jepi-jepq-flyer.pdf) · [JEPQ](https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-nasdaq-equity-premium-income-etf-jepq-46654q203) · [Invesco QQQ](https://www.invesco.com/qqq-etf/en/about.html) · [IVOL](https://www.ivoletf.com/wp-content/uploads/2025/04/Q2-2025-IVOL-Presentation.pdf)
