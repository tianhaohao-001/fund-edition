# Fund Edition

Build an AI investment team with Maya, or explore a team based on a public active-fund strategy or an investor's published approach. The demo uses paper capital.

- [Live app](https://fund-edition-web-production.up.railway.app/?lang=en-US)
- [Product demo](https://drive.google.com/file/d/1shUxdwTaNweiTXO8s1uUFtd0Wd2M6eV5/view)
- [Implementation journal](https://fund-edition-web-production.up.railway.app/build-log.html?lang=en-US)

## Run locally

Use Node.js 24. The main server uses Node's built-in modules and SQLite.

~~~sh
node --env-file-if-exists=.env server.mjs
~~~

Open http://127.0.0.1:3000. Use .env.example as a template and supply your own HarnessRouter credentials for AI responses. Deterministic replay is a separate explicit option. The journal records the current custom-team blueprint failure, data coverage and monitoring limits.

## Verify

~~~sh
node --test --test-isolation=none test/*.test.mjs
~~~

The web product is in web/, the backend and execution modules are in core/, and server.mjs connects them. The data/ folder holds historical input fixtures. The hosting/ folder contains cloud adapters. The mobile/ folder contains the earlier mobile source and its own package manifest. Runtime databases, credentials, recordings and private release material are outside this source snapshot.

The remaining project notes below retain the original development and setup information.

---

# Fund Edition · 你的 AI 投资团队

**生产站与参赛开发手记**　[实时 Maya 工作室](https://fund-edition-web-production.up.railway.app/studio?lang=zh-CN) · [基金展馆](https://fund-edition-web-production.up.railway.app/funds?lang=zh-CN) · [中文图文手记](https://fund-edition-web-production.up.railway.app/build-log.html?lang=zh-CN) · [English build journal](https://fund-edition-web-production.up.railway.app/build-log.html?lang=en-US) · [日志原稿与复核记录](docs/devlog/README.md)。下方保留历次审阅和早期发布记录。

**我的工作室**列出你创建的基金。第一次进入时，Maya 会问你想研究什么。试着说「让 Jess 跟踪存货，再找一位风控员」。确认团队名单后，你会直接进入这只基金的办公室，在那里能看资金和盯盘记录，也能点工位找同事讨论。下次回到工作室，可以选一只已有基金，或与 Maya 创建另一只。[进入我的工作室](https://fund-edition-web-production.up.railway.app/studio?lang=zh-CN)

新访客有 **100,000 美元模拟资金**。确认第一只自建基金时，投资组合里的全部可用现金会投入该基金。如果先在基金展馆投资了一部分，首只自建基金就从剩余现金起步。在「我的投资组合」可以再领取 100,000 美元模拟资金，选择投入另一只自建基金或跟投展馆里的基金。领取金额记入本金，投资盈亏单独计算。

**巴菲特风格基金的历史会议与成交已可逐笔审阅。** 打开「挑选 AI 基金 → 名家风格基金 → 巴菲特」。经营研究员和估值风控员分别提交意见，再由基金经理决定仓位。团队根据当时公开的 12 项财务摘要和已知行情，在 2017 年只决定 AutoZone（AZO）与现金之间的配置。四场会议产生十二份 HarnessRouter 回执。前三场持现，第四场设定 20% 目标，10 月 2 日按 595.65 美元模拟买入 3.355997 股，费用 1 美元。点开该笔可查看各席原文、来源、独立审校并追问经理。[打开逐笔审阅](http://localhost:3395/?lang=zh-CN&catalog=buffett#/lab) · [研究规程](docs/buffett-paper-protocol.md) · [数据与全部会议档案](web/data/buffett-ai-study.json)

双方从 10,000 美元开始，年末团队权益 10,387.36 美元（+3.87%），同一可成交开盘投入后持有的基准为 8,937.06 美元（−10.63%）。样本为事后选取的一家公司和一个年度，缺少 11 月 8 日收盘，未估算额外滑点和税费。其他四位人物保留原情景规则说明，原公开站和此前审阅包对应各自发行时的功能。

**与 Maya 聊到建团。** 在基金工作室说一个投资想法，Maya 会带出相应岗位，可以继续修改，也可以确认后去工位见人。3395 对应当前完整审阅服务，重新启动用 `.\dev.ps1 -BuffettReview`。3394 保留原访客会话。两份真实浏览器记录演示了未填期限及风险时从谈话进入岗位，与确认后员工的第一段答复。[新版工作室](http://localhost:3395/?lang=zh-CN#/fund) · [英文三席实录](release/review-web/maya-team-formation/en-US-3395.json) · [旧工作室里的定制岗位](release/review-web/maya-team-formation/en-US-3394.json)

**11 月 18 日桌面审阅入口是本机 3386。** 在共享项目根目录运行 `.\dev.ps1 -GalleryReview` 可重开审阅站。页头可直接切换中文和英文。大厅有可暂停的逐根 K 线，Maya 接受访客提问。基金馆提供五种名家风格的情景净值、九只主动基金的研究，以及两项可复核的历史对照。高级 AI 团队会员每月 US$9.99，本机支持零扣款模拟结账，可在设置查看资格。公开网址仍提供此前的版本。[动景大厅](http://127.0.0.1:3386/?lang=zh-CN&lobby=motion#/) · [静景大厅](http://127.0.0.1:3386/?lang=zh-CN&lobby=static#/) · [见 Maya](http://127.0.0.1:3386/?lang=zh-CN#/fund) · [巴菲特风格档案](http://127.0.0.1:3386/?lang=zh-CN&catalog=buffett#/lab) · [VWELX 历史对照](http://127.0.0.1:3386/?lang=zh-CN&catalog=wellington#/lab) · [会员权益](http://127.0.0.1:3386/membership.html?lang=zh-CN) · [我的会员资格](http://127.0.0.1:3386/membership.html?lang=zh-CN&view=account)

[打开网页](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/) · [56 秒正式网页实录](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/fund-edition-salon.mp4) · [走进巴菲特风格专场](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/funds?lang=zh-CN&id=buffett) · [在台式机与 AI 自由对话](http://127.0.0.1:3365/)

公网可匿名进入工作室和基金目录，听 Maya 的第一问，用中英文口述、校对并保存草稿。设备听写由访客主动启用，首次约下载 55 MB。当前 Sites 显示实时经理暂不可用。独立应用已验证匿名两轮 HarnessRouter 实时对话，并备好无需家庭电脑的云运行包。部署到 Railway 尚需开通云账号。[正式站独立验收](docs/public-release-status.md) · [独立云部署与费用](docs/deployment.md) · [云运行包](release/cloud/fund-edition-direct.tgz) · [模拟账本的两个引擎互相对账](docs/execution-audit.md)

首页提供「自建 AI 基金」和「挑选 AI 基金」。自建工作室由 Maya 接待；基金馆展示名家风格基金，以及 AI 如何根据公开资料重建热门主动基金的策略。中英文共用 Fund Edition 字标，首次出现时带「你的 AI 投资团队」或 Your AI investment team。[产品需求文档](docs/product-requirements.md) · [当前品牌用词](docs/brand.md)

这是一款用自然语言组建基金团队、研究主动投资策略的 AI 产品。用户可以走两条独立路径。

- **自建 AI 基金 / Build an AI fund**。先和基金经理 Maya 聊一个想法，再确认团队蓝图。雇用员工、点击工位找不同角色讨论，召集团队审议，检查模拟账户如何执行。普通入口以语音为主，明确的仓位、标的和回放设置收在专业模式。
- **挑选 AI 基金 / Explore AI funds**。从巴菲特、达利欧等人的投资方法入手，跟研究角色聊一个具体问题；或者选择真实基金，对照公开策略、规则组合和已知局限。完整本机应用另提供独立模拟盘。

旧演示包及网址保留 Morrowfolio，代码目录和环境变量沿用 Fundroom，现有书签与模拟账本继续有效。下列设计样机是历史审阅记录；当前网页以「打开审阅」中的公网实站和台式机入口为准。专任 UI 设计总监维护[网页视觉与交互规范 v2](docs/design/visual-language.md)。[可点击设计样机](release/design-review/index.html)从与 Maya 对话开始，支持分步组队、会议交接与基金研究。可分别审阅[桌面接待](release/design-review/v2-home-1440.png)、[窄屏接待](release/design-review/v2-home-390.png)、[团队会议](release/design-review/v2-studio-1440.png)、[基金研究](release/design-review/v2-funds-1440.png)和[实际控件计数](release/design-review/v2-control-audit.json)。真实模型、注册与交易在下方功能演示服务上验收。

**打开审阅。** [台式机完整产品](http://127.0.0.1:3365/) · [本机评委导览](http://127.0.0.1:3365/judges.html) · [公开手机网页](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/) · [75 秒中英字幕演示](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/tour.mp4)。本机工作室支持七天模拟试用、回看本人账本及向 Maya 追问。基金广场提供九只市场基金和五种人物方法，运行当期团队与历史对照时分别保存回执。此次匿名公网站点验证时间与实际可用功能见[正式服务复验](docs/product-acceptance.md#正式服务复验) 和[正式网址独立验收](docs/public-release-status.md)。

网页右上角可明确选择 **中文 / English**。选择会在当前设备记忆，并应用到工作室、基金广场、研究工具、安装帮助及连接页面；新发出的 AI 请求和语音也使用所选语言。切换只更新界面，不提交草稿、不重新买入或确认团队。历史聊天、用户名称和导入的原始研究资料保留原文。[双语行为与验收](docs/language.md)

本机 3386 的会员结账可模拟开通、取消和恢复续订。独立 Node 服务允许访客先与 Maya 对话八次，购买会员时再登录。它提供可配置的 Stripe Checkout 和账单管理，需商户测试环境联调后才能启用收款。Sites 构建提供权益介绍。演示订单实际扣款为零。[会员收款接入](docs/membership-billing.md) · [访客与会员独立验收](release/review-web/qa-membership-3386/independent.md) · [Maya 同址真实对话验收](release/review-web/qa-maya-voice/gallery-3386/verification.md)

## 启动现场演示

台式机现场演示从[双入口大厅](http://127.0.0.1:3365/#/)开始。选「自建 AI 基金」见 Maya，或选「挑选 AI 基金」与名家风格 AI 对谈、研究市场基金。笔记本的 SSH 转发、隔离实例与源码位置见[双机交接](docs/continue-on-laptop.md)。从普通访客到模拟账本的实测结果见[产品验收](docs/product-acceptance.md)。

若现场服务已停止，请在权威台式机项目根目录使用 PowerShell、Node.js 24 或更新版启动。

~~~powershell
.\dev.ps1 -LatestReview
~~~

此启动方式仅监听本机 3365，使用独立持久数据库 `.fundroom/product-review-v16.sqlite`，关闭券商 Paper 和 Live 下单。Windows Credential Manager 桥接为 Node 子进程提供已配置的 HarnessRouter 凭据。开发用 `.\dev.ps1` 默认监听本机 3000、使用独立默认账本。`-LiveHarness` 保留兼容。

端口 3331、3347 与 3365 分别用于此前的现场会话、云运行验证和旧演示。审阅当前网页、试用和会员流程请使用 3386。

另一台机器或没有该凭据时，参考 `.env.example` 在本机单独配置 `HARNESSROUTER_API_KEY`、`HARNESSROUTER_HARNESS_ID` 和 `FUNDROOM_ENABLE_HARNESS=true`。已有 `.env` 优先于 Windows 桥接。随后运行 `node --env-file-if-exists=.env server.mjs`。普通对话默认使用 HarnessRouter，配置缺失或失败会明确提示连接问题。离线规则回放必须显式选择 `provider: replay`，不会作为真实 Agent 回复自动出现。

没有本机凭据且只需查看网页时，可以运行 `dev.ps1 -Offline`，阅读基金目录和运行价格计算。引导、成员对话与基金经理问答需要模型连接。普通团队审议默认独立调用投委会各席与经理，最终由规则引擎检查和记账。模拟行情与模型来源各自可见。

## 三分钟体验

**直接试一次招人。** 在[工作室](https://fund-edition-web-production.up.railway.app/studio?lang=zh-CN)告诉 Maya「建一个五年期模拟基金，小林看财报，阿杰做风险研究」。核对名单并点「确认蓝图，雇用团队」。建好后点「招募员工」可一次提出多个岗位，点工位上的姓名可单独提问或调整职责。「先和 Maya 建基金，再招人」可以从只有经理的团队开始。每只基金最多 24 人，含 Maya。[实测的建团与招聘流程](release/review-web/team-staffing/verification.md)

1. 从大厅点击 **见见基金经理**，说出自己的投资想法，“我想长期研究科技公司，投资五年，风险平衡”。可以修改转写后发送，也可以改用文字。
2. 经理逐步整理目标、期限和风险。确认屏会列出团队职责、资金划拨规则与模拟交易授权。点 **确认蓝图，雇用团队** 后才创建基金。尚未确认的方案可以继续修改，旧方案不会被误用。
3. 在基金办公室点工位找同事，或打开招募面板雇用新成员、分配工作。讨论形成建议。正式授权需要单独确认。
4. 点 **召集团队，模拟审议**，查看研究与反对意见、经理目标、独立风控和实际模拟成交。专业模式保留回放情景与明确的交易限制。
5. 通过 **查看复刻策略** 打开目录，进入 VWELX。研究完成后，明确确认建盘，检查自己的 VYM 65% 与 VCIT 35% 两笔模拟配置。逐季推进历史回放，核对授权、费用与余额。两种成分以基日100的总回报单位计价。
6. 进入 PSTKX，核对主动策略的公开股票敞口与独立 VOO 的年度留出对照。人物区可选择 Warren Buffett、Peter Lynch、Ray Dalio、Cathie Wood 或 Keith Gill 的公开理念研究团队，直接向经理提问。
7. 可以先用访客身份试用，再用邮箱和密码注册保存模拟盘。同一台服务上，从另一个浏览器登录即可恢复；独立运行的另一个服务实例持有自己的本地数据库。

市场区有九个公开研究对象：ARKK、FCNTX、JEPI、BOND、IVOL、VWELX、JEPQ、AGTHX 和 PSTKX。VWELX 有23个季度的留出验证和可建仓的历史回放。PSTKX 有五个年度的留出验证，两边都使用税前含分配再投资的基金净值总回报。FCNTX 另有12个月末净值的价格规则实验，ARKK 有公开持仓抽样；通用价格沙盒在其余条目使用明确标注的合成情景。经理私有交易和扣除未来平台费的真实业绩仍有待验证。[来源、研究结果与复算命令](docs/catalog-research.md)

## 语音与客户端

Maya 的当前中文声线为普通话女声，英文为 Maple；两种开场录音直接随网页提供。3386 保留原审阅记录并在本机合成完整回复。独立审阅实例 3394 使用自己的访客记录和模拟账本，支持按句开始播放。笔记本可按安装说明配置相同音色。[听中文](release/review-web/maya-new-voice/maya-zh.wav) · [听英文](release/review-web/maya-new-voice/maya-en.wav) · [分句朗读审阅](http://localhost:3394/?lang=zh-CN#/fund) · [语音配置与实测](docs/maya-narration.md)

网页支持桌面和手机布局。语音优先使用本机已经准备好的识别器，也可使用浏览器提供的语音识别。转写先进入可修改的输入区，用户发送后才交给 Agent。回答可以选择朗读，录音和识别都能停止。

Windows 本机可使用 **Whisper small / CPU int8** 或系统已安装的语言识别器。模型和 Python 依赖放在用户本机缓存，不跟源码共享。完整的安装、验证、隐私和浏览器支持说明见 [移动与语音说明](docs/mobile.md)。

应用提供 PWA 清单、主屏幕图标和独立窗口模式，离线页不缓存聊天、账户或订单。本轮集中处理网页。`mobile/` 保留此前的 React Native / Expo iPhone 与 iPad 工程。原生开发、签名打包和实体设备验收暂缓，等网页设计获认可再推进。[原生工程交接](mobile/README.md)

## 数据与执行

| 能力 | 当前实现 |
| --- | --- |
| AI 对话 | 通过 HarnessRouter 调用配置模型，保留响应来源与回执。普通入口失败不会悄悄换为固定回答。 |
| 多席投委会 | 在岗研究、组合、风险、执行席各自给出结构化意见，经理综合。模型输出始终是执行层的输入。 |
| 工作室账本 | SQLite 会话隔离、整数金额、订单去重、回放持久化。合成行情的买入用 ask，卖出用 bid。 |
| 我的投资组合 | 统一记录可用模拟现金、自建基金与展馆基金的持仓、入金和申赎。每笔基金交易保留净值来源、日期及成交记录。 |
| 个人历史复刻盘 | 确认 VWELX 提案后可获得自己的两项成分持仓。独立风控逐笔核对授权，终点只估值。个人账本与目录的模拟份额沙盒分开。 |
| 研究团队 | 历史曲线由冻结数据和透明规则重算；现场研究审阅通过 HarnessRouter 分派给研究和风险席，再由经理总结，并保存实际完成或失败的回执。 |
| 历史资料研究 | ARKK 的五项抽样持仓可按披露时点与留出报告比较。FCNTX 公开月末价格实验可重算，也可在浏览器本地导入价格 JSON。 |
| 原共享策略引擎 | 保留一次提案、多个独立示例和个人跟随账本、暂停与恢复接口，供专业研究与后续扩展。 |
| 券商连接 | Alpaca 行情、Paper 读取与手动 Paper/Live 控制台。普通演示只保留连接入口，实际交易模式独立配置、默认关闭。 |

默认账本为 `.fundroom/fundroom-v1.sqlite`，可通过 `FUNDROOM_DB_PATH` 指向持久卷，或传 `:memory:` 做临时验收。代码与配置不读取旧私人交易系统的生产账本。旧 Work 源码保存在 `archive/work-v0`，不参与当前运行。

## 开发、测试与交付

```powershell
node --test --test-isolation=none test/*.test.mjs
```

独立 GUI 验收使用隔离 Edge 与精确的 1440、390、320 CSS 像素视口，完成两条产品旅程并检查截图、横向溢出与控制台异常。浏览器模型替身用于稳定地验证界面行为，真实模型请求与语音识别另有证据记录。[构建与验收记录](docs/build-log.md)

| 职责 | 交付 |
| --- | --- |
| 开发总监 | 范围、品牌和体验取舍、接口分工、迭代审查、放行与双机交接 |
| 工作室工程 | 新大厅、角色空间、招募、自然对话、语音主操作、专业模式与响应布局 |
| Agent 与语音工程 | 引导草案、模型协议、投委会、成员与基金问答、本机语音与预算 |
| 市场与策略工程 | 品牌、主动基金选集、人物风格、官方资料、净值实验与基金模拟份额 |
| 独立验收 | API、会话和执行隔离、错误恢复、真实模型/音频证据、界面回归与交付哈希 |

双机共享目录是台式机 `C:\Users\rocks\Documents\Codex\Projects\shared-workspace\Fundroom`。笔记本从 Codex 的 **codex-home → shared-workspace → Fundroom** 进入同一份源码。分别启动时保留各自的凭据、模型缓存和账本。不要把 `.env`、密钥、音频、日志、模型文件或活动数据库当作源码同步。[部署与交接](docs/deployment.md)

比赛要求与公开演示仍按赛事证据逐项核对。[比赛核对](docs/competition.md) · [基金组织设计](docs/fund-design.md) · [券商配置](docs/broker.md)
