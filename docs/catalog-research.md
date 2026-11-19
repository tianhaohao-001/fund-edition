# AI 基金策略研究记录

## 挑选 AI 基金 · 2026 年 11 月 18 日

「名家风格基金」提供五席独立研究员。「热门主动基金」提供九个经筛选的研究对象。惠灵顿卡面的 65/35 是用于历史对照的研究组合设定。原基金的正式配置区间和实际历史净值在档案里单独列示。[基金目录](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/funds?lang=zh-CN)

巴菲特风格研究席使用公开股东信。为公网准备的两段对谈分别用新的中英文匿名访客通过台式机原有 `catalogChat` 调用 HarnessRouter，每段连续三问，围绕好生意的买入价格、安全边际和可推翻判断的证据。六条回答分别归档时间和模型回执。屏幕先展示编辑摘出的要点，展开可核对原文。访客推进时回放该语言的原场次。台式机连接的研究席允许自由输入和延续上一问，已用两条独立于录制的问题走完实际页面。[生成脚本](../scripts/record-salon-dialogue.mjs) · [问答与模型回执](../web/salon-recordings.mjs) · [浏览器实答](../release/review-web/strategy-salon/browser-two-turns.json) · [伯克希尔股东信](https://www.berkshirehathaway.com/letters/1992.html)

林奇、达利欧、伍德和吉尔的公开页均有两步编辑导读，注明方法资料来源。台式机的同一人物页另设自由对谈，实际回复有 HarnessRouter 回执。照片来自已核验的档案，均裁切为圆形。巴菲特采用美国国际贸易管理局 2015 年 SelectUSA 公务摄影（美国公有领域）；达利欧摄影署名 Harry Murphy / Web Summit via Sportsfile，伍德摄影署名 Steve Jurvetson，后两张授权为 CC BY 2.0。林奇与吉尔以姓名和研究笔记图符识别。[巴菲特原件与权属](https://commons.wikimedia.org/wiki/File:Warren_Buffett_at_the_2015_SelectUSA_Investment_Summit_(cropped).jpg) · [达利欧原片](https://www.flickr.com/photos/websummit/44858045925/) · [伍德原片](https://www.flickr.com/photos/jurvetson/52065327043/) · [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)

研究核对日期为 2026-11-17。目录是规模型主动基金与不同方法的精选样本。规模快照的日期并不一致，页面逐项显示，不据此声称零售用户购买人数排名。

## 市场基金研究对象

| 对象 | 纳入原因 | 可核对的规模与日期 | 当前计算范围 |
| --- | --- | --- | --- |
| ARKK | 颠覆式创新的主动权益样本 | 61.23 亿美元，2026-10-31 | 三期 SEC 披露的五项持仓抽样研究，另有合成情景规则实验 |
| FCNTX | 大规模主动大盘成长组合 | 1,825.7342 亿美元组合净资产，2026-09-30 | Fidelity 公开的 12 个历史月末净值可重算 |
| JEPI | 主动权益与期权收入 | 461.5 亿美元，2026-10-30 | 方法研究与有上行限制的合成代理，未实现实际 ELN |
| BOND | 主动核心债券方法 | 90.85 亿美元，2026-10-31 | 利率敏感的合成方法代理，未逐券建模 |
| IVOL | TIPS 与利率曲线期权特色方法 | 本轮未记录可靠同日规模 | 方法研究与通胀情景，未实现实际 OTC 期权定价 |
| VWELX | 历史悠久的主动股债配置 | 全基金1,203.50亿美元；Investor份额123.05亿美元，2026-09-30 | 43个真实共同季度；独立VYM和VCIT代理；用户可确认建立个人历史模拟组合 |
| JEPQ | 纳斯达克股票与期权收入 | 424.90亿美元，2026-10-30 | 方法研究；历史ELN估值及完整持仓缺失 |
| AGTHX | 大规模灵活成长基金 | 全基金3,530.721亿美元，2026-08-31 | 方法研究；三类成长来源及多经理组合 |
| PSTKX | 指数股票敞口叠加主动债券的特色策略 | 根据样本前公开授权入选 | 十个完整年度真实对照；2021–2025年留出五点；目前提供研究比较 |

发行人资料分别记载了 Wellington 的基金和份额净资产、JEPQ 的基金规模和 Growth Fund of America 的跨份额资产。规模仅作为关注度的一个可核对代理。当前没有可比较的散户购买人数或净申购排名。[Vanguard](https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/investment-profiles/0021.pdf) · [J.P. Morgan](https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-nasdaq-equity-premium-income-etf-jepq-46654q203) · [Capital Group](https://www.capitalgroup.com/individual/investments/mutual-funds/details/agthx)

## 两项独立成分对照

| 留出验证 | VWELX 股债配置代理 | PSTKX 股票敞口基线 |
| --- | --- | --- |
| 原基金份额 | Vanguard Wellington Investor | PIMCO Stocks PLUS Bond Alpha Institutional，原名 StocksPLUS |
| 信息时点与构造 | 2014-03-25 招募说明书给出60%–70%股票区间。取中点65%投资股息股票ETF VYM、35%投资中期投资级公司债ETF VCIT，每季初再平衡 | 2015-07-31 招募说明书描述通常接近净资产的标普500多头敞口。用独立ETF VOO 100%买入持有 |
| 数据 | 2016Q1–2026Q3，43个季度。2016–2020年20个季度作参考、之后全部23季留出 | 2016–2025年10个年度。2016–2020年作参考、2021–2025年五个年度留出 |
| 留出期代理 / 原基金 | +58.3587% / +65.0170% | +95.7085% / +88.2903% |
| 累计收益差、年化跟踪误差 | −6.6583个百分点，5.9403% | +7.4182个百分点，1.3912% |
| 同频回报相关性、代理观察点最大回撤 | 0.8333，14.6698% | 0.9996，18.1500% |
| 独立ETF本身的同期净值总回报 | VYM +99.8850%；VCIT +0.6707% | VOO +95.8064% |
| 每初始100美元的直接模拟交易费 | 0.07493美元 | 0.04998美元 |

两项实验都是以今天提出的假设做历史时间留出。前段和后段均全部保留，权重来自公开授权或它的中点，未用目标收益拟合权重。它们没有事前注册或独立前瞻业绩记录。VWELX 的主动选股、国债和按证券调整的久期无法由两个ETF重建。PSTKX 的五个年度说明基金有强市场敞口；估算债券超额、融资和期货基差需要更高频、独立的数据。五个年度和23个季度的相关性与误差不能直接排名。两套回撤只看观察点，可能漏掉年内或季内更深的损失。

研究单位以留出起点2020-12-31的100归一化。每期先按期初已确定的权重扣买卖金额各5基点费用，再将独立成分的当期已实现净值总回报用于估值。原基金总回报只送入评价端。均为美元、分配再投资、税前且已含各基金运作费用。点差/市场冲击用简单费率近似，未额外加入平台管理费或个人税。跟踪误差是各期收益差样本标准差，季频乘以2年化，年频直接计算。相关使用同期简单回报，累计差按两条复利曲线的收益百分点计算。

研究回放的资料、配置、风控、估值与评价席分别记为 source 或 rule，回测的模型调用数为0。用户发起的经理对话和实时研究审阅走 HarnessRouter，拥有独立回执。研究报告不会发出券商订单。VWELX 可由用户确认建立本人的模拟回放账本；PSTKX 可查看定量对照。

### 来源与重算

VWELX 取 Investor Shares 每季数据，ETF 取同日发行人季度净值总回报，并将每个完整年度的四季连乘与发行方年值交叉核对。固定输入见 [季度冻结数据](../web/catalog-vanguard-returns.mjs)，版本为2026-09-30官方资料快照。三份原始 PDF 的 SHA-256 前12位依次为 `0a03f827a848`、`d93512edb548`、`ce0ca9e62f61`；发行方滚动更新资料时可提供已保存的同版PDF。方法依据和价格表均可按来源复查。[SEC 样本前授权](https://www.sec.gov/Archives/edgar/data/105563/000093247114005019/sp21032014.htm) · [VWELX](https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/investment-profiles/0021.pdf) · [VYM](https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/investment-profiles/0923.pdf) · [VCIT](https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/investment-profiles/3146.pdf)

PSTKX 的十个值取自每年对应 SEC 497K，字段为 Institutional Class Return Before Taxes 的 1 Year，条目中含逐年原文链接；VOO 取同年基金净值年末列。最新文件披露的5年13.49%和10年14.42%年化，与十条记录独立复合相符。2026-08-01起使用新名。完整十年（含开仓费）的代理+296.6991%、基金+284.7527%。[十份逐年原始链接与数据](../web/catalog-stocksplus-returns.mjs) · [样本前授权](https://www.sec.gov/Archives/edgar/data/810893/000119312515265584/d933724d497k.htm) · [最新SEC核对](https://www.sec.gov/Archives/edgar/data/810893/000119312526321567/d140919d497k.htm) · [VOO](https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/investment-profiles/0968.pdf)

在共享项目根目录执行下列命令。前两条只需 Node 24+，第三条重新核对上游 PDF，需要 Python 与 pdfplumber。可选 `--pdf-dir` 接受保存为 `0021.pdf`、`0923.pdf`、`3146.pdf` 的三份原件。

```powershell
node --input-type=module -e "import {runReplicaStudy as run} from './core/replica.mjs'; for(const id of ['wellington','stocks-plus']) console.log(id,run(id).metrics);"
node --test --test-isolation=none test/replica-study.test.mjs test/replica-ledger.test.mjs
python scripts/verify-vanguard-returns.py
```

独立HTTP审计使用临时内存SQLite与明确的经理回复替身。从自然语言提议、用户确认到2026-09-30，共24条回执、46笔独立成分成交。初始现金10,000美元，第一次分配后权益9,995美元，所有观察点的现金、持仓、授权与费用可以逐笔对账。最后一期仅估值，期末资产15,835.89美元，累计直接费用7.48美元。超出样本返回409且账本不变。独立审计采用另一套闭式现金方程，由原始收益算得15,835.866美元，和实际账本相差约2.4美分，来自逐笔美分与百万分之一单位舍入。同期VWELX为16,501.70美元。[独立审计源码](../test/replica-ledger.test.mjs)

对应的一手资料保存在每个目录条目的 `sources`。ARK 官方基金表提供净资产，Fidelity 将组合净资产与份额净资产分开，J.P. Morgan 页面提供基金规模及风险，PIMCO 核心债券页提供 BOND 的规模，IVOL 的官方说明及 SEC 年报阐述方法和风险。

- [ARK 官方基金表](https://www.ark-funds.com/our-etfs)
- [Fidelity FCNTX 组合资料](https://fundresearch.fidelity.com/mutual-funds/composition/316071109)
- [J.P. Morgan JEPI](https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-equity-premium-income-etf-46641q332/)
- [PIMCO 核心债券](https://www.pimco.com/us/en/investment-strategies/core-bonds)
- [IVOL 官方说明](https://www.ivoletf.com/)
- [IVOL 2026 股东报告](https://www.sec.gov/Archives/edgar/data/1547576/000182912626006165/kraneshares_ncsr.htm)

## 历史净值实验

`web/catalog-data.mjs` 的 `FCNTX_MONTHLY` 存有 Fidelity 价格历史表的 2025-09 至 2026-08 月末净值，来源可从详情直接打开。12 个点依次为 24.76、25.01、24.99、24.31、24.77、24.48、22.96、25.28、26.22、26.80、25.93、26.85 美元。[原始月末价格表](https://fundresearch.fidelity.com/mutual-funds/view-all/316071109)

实验规则在观察完三个月后，把最新价格与这三个月的平均值比较。高于均值时下个观察点配置 55%，否则配置现金。买卖分别计 5 个基点点差，微份额和金额采用整数精算。同一价格买入持有作为参照。程序只用上一观察点信号，在下一观察点价格成交。

这是月频价格实验，不含分红、资本利得分配、现金利息、税或其他费用。月中路径没有被观察，最大回撤可能低估。实验收益不同于 Fidelity 披露的总收益，也没有验证复制该经理的实际持仓或操作。其他条目的默认曲线是透明生成的合成情景，页面标为合成方法实验。

用户也能在详情导入带 `source` 和递增 `date`、正数 `close` 的 JSON。导入计算完全在浏览器内进行，文件不会上传。该功能接受的是价格序列，不会凭价格反推出原基金经理的私人逻辑。

## 人物风格

奥马哈价值派、街角发现者和四季平衡师分别以 Buffett、Lynch、Dalio 的公开理念为创作依据。各自拥有不同职责的研究团队、不同样例配置上限与计算规则。聊天指令要求始终说明 AI 角色身份。没有真人背书、私有策略访问或历史业绩复现声明。

- [Berkshire 1992 年股东信](https://www.berkshirehathaway.com/letters/1992.html)
- [Fidelity 对 Lynch 研究理念的说明](https://www.fidelity.com/learning-center/trading-investing/fundamental-etfs)
- [Bridgewater · The All Weather Story](https://www.bridgewater.com/research-and-insights/the-all-weather-story)

另有人物 **Cathie Wood（凯茜·伍德）** 和网络创作者 **Keith Gill（基思·吉尔，Roaring Kitty）**。前者的研究出发点是技术成本曲线与企业商业化的交叉验证。后者的出发点是用公开财务数据质疑市场的一致悲观预期。其纳入依据分别为 ARK 公开投资流程和2021-02-18网络研究引发的国会听证。页面使用姓名和字母标记，没有采用权利未核实的真人肖像。五个角色均以独立AI研究身份呈现。[ARK 方法](https://www.ark-invest.com/investment-process) · [Gill 书面证词](https://democrats-financialservices.house.gov/uploadedfiles/hhrg-117-ba00-wstate-gillk-20210218.pdf) · [Fidelity 关于 Peter Lynch 的研究方法](https://www.fidelity.com/viewpoints/active-investor/trading-guide-managing-investment-risks-and-opportunities)

## 模拟份额账户

每个目录条目提供独立的 10,000 美元研究沙盒，便于比较方法，页面不合计为一项真实资产。模拟买入从该沙盒现金扣除，模拟卖出把持有份额返还为同一沙盒现金。执行使用明确注明日期的研究价格，不走券商或入金接口。服务器按浏览器会话持久化和去重。原先的 My Fund 与共享决策三账户继续使用自己的账本。

## 验证

`node --test --test-isolation=none test/catalog.test.mjs` 验证了全部条目的来源、可重算数据、下一观察点成交、非负现金、模拟现金守恒、重复请求、跨基金误用拒绝和导入日期校验。浏览器与服务端集成验收记录随最终交付补充。
