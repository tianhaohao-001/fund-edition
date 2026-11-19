# Fund Edition 部署与双机交接

完整网页版已于 2026 年 11 月 18 日太平洋时间在 Railway 上线。公众可从手机或电脑的浏览器匿名进入，家庭台式机可以关机。主站提供 Maya 建团、员工对话及巴菲特历史逐笔答疑，模型请求由云端服务器送往 HarnessRouter。[公网主站](https://fund-edition-web-production.up.railway.app/) · [创建团队](https://fund-edition-web-production.up.railway.app/studio) · [基金馆](https://fund-edition-web-production.up.railway.app/funds)

## 11 月 18 日晚更新

Railway 在原域、原卷部署了券商授权演示、连接页明暗配色和 Maya 的全员建团方案。部署编号为 `abc74e2a-9575-4056-8098-a4df142e1c64`。归档 SHA-256 为 `657cacf862a29907401f16acf3663138942335573d2875beb597be3d5abb6fe5`。切换前已做 SQLite 一致性备份并验证加密副本可恢复。切换后同一测试访客的三支基金、八张历史回执及 10,000 美元模拟现金摘要完全一致。[部署核对](../release/review-web/broker-demo/release/deployment.json)

新访客可从组合或连接页选择 Alpaca、IBKR，阅读开户链接与实盘 API 使用指引，练习确认及解除模拟连接。浏览器的两次写请求只带工作区标识、版本与券商选择。真实资金与交易权限维持关闭。Maya 收到投资意图后直接展示所有拟聘人员与职责，确认才建基金。[公开组合](https://fund-edition-web-production.up.railway.app/portfolio?lang=zh-CN) · [模拟连接验收](../release/review-web/broker-demo/release/production-journeys.json) · [建团验收](../release/review-web/maya-team-formation/single-step/acceptance.json)

当晚后续更新了空名单的处理。当前部署为 `fa66e49c-3e39-4b94-a7f4-e3b5cdcd3311`，归档 SHA-256 为 `dd6947024ac3f66e9f6eb9d756bf23bbb92038662581f1f49617deb6b4921876`。公网同一位访客说「我想找现金流持续增长的企业」，看到 Maya、Jules、Avery 三位完整分工。改口只要 Maya 后，名单只留经理。两次真实回复后均待用户确认，刷新仍保留选择。[生产经理回执](../release/review-web/maya-team-formation/single-step/production-staffing-intent.json) · [最终版本和旧账核对](../release/review-web/maya-team-formation/single-step/staffing-deployment.json)

## 独立云应用和费用

模拟组合钱包与长版英文开发手记于 2026 年 11 月 18 日在原服务和原卷上线。本次部署为 `321eb4f4-b8c7-482a-ba34-de40453345f5`。正式站已用二期访客验证原 ARKK 的份额、现金与回执可查，并在新钱包验证四只模拟基金的认购、跨页面重试、赎回及访客独立性。完整发行包、升级前一致性备份与复验记录见[三期部署单](../release/review-web/portfolio-account/railway/deployment.json)。[打开模拟组合](https://fund-edition-web-production.up.railway.app/portfolio) · [阅读英文手记](https://fund-edition-web-production.up.railway.app/build-log.html)

生产服务使用一个 Node.js 24 容器和挂载在 `/data` 的 500 MB Railway 卷。邮箱账户、访客的模拟团队、对话、额度及回执都随卷保留。Railway 的构建器需要在平台挂载卷，Dockerfile 中加入 `VOLUME` 会使构建失败。应用以 UID 1000 运行。管理面板使用本站独立凭据 `FUNDROOM_HR_KEY`。不要将运行凭据或数据库放入发布包。

2026 年 11 月 18 日的办公室版本在首发同一域名和卷上发布，部署号为 `f19fa22d-d14a-4094-9d62-516676d19383`。该版完整归档的 SHA-256 为 `d90a273c650945463d551b099ae8f0a2df4841f53f087091527774d5657299f1`。发布前制作了 SQLite 在线一致性备份，核验了卷内快照和桌面加密副本。普通应用回滚优先切换至首发应用包并保留当前卷。数据库恢复至旧时点会覆盖之后的业务记录，应先保存当前账本并确认恢复范围。[版本与备份位置](../release/review-web/public-release/phase2-office/deployment.json) · [双语开发手记](https://fund-edition-web-production.up.railway.app/build-log.html)

在公网已取得 Maya、已入职员工和巴菲特风格经理的独立模型回执。容器重启后，同一访客能取回原来的三人模拟团队、对话和 10,000 美元模拟现金；另一位访客看不到该基金。两种语言分别在手机宽度和桌面宽度测试。[公网双语浏览器记录](../release/review-web/public-release/railway-production-journeys.json) · [公网重启、隔离和回执核查](../release/review-web/public-release/railway-live-persistence.json)

上线当天的账户为零付费试用，未绑定支付方式，起始赠金 5 美元，最长 30 天。Railway 表示赠金额度先耗尽也会结束试用；应在到期前从 Plans 确认正式 Free 方案并完成切换，复验独立卷和公网接口。保留账本前先做一致性备份和恢复测试；官方说明试用创建的卷可能在赠金到期后 30 天删除。运行时模型用量另受 HarnessRouter 和本站限额约束。[Railway 免费方案与卷保留政策](https://docs.railway.com/pricing/free-plan)

Railway 的正式 Free 方案含每月 1 美元资源额度和 0.5 GB 持久卷，额度耗尽会暂停至下一周期。该方案支持服务空闲后休眠并在下一次请求唤醒。全天无人值守的行情轮询需要单独评估持续运行成本。[Railway 官方定价](https://railway.com/pricing) · [Railway 公网访问](https://docs.railway.com/networking/public-networking) · [HarnessRouter 运行职责](https://harnessrouter.ai/docs/host-app-vs-runtime-agent)

## 早期部署记录

2026 年 11 月 18 日发布 v17，发布号 `appgdep_6afd9376537c8191a17333097ba6b4ce`，发布提交 `2a664f3d2319eee2ad159d9b0eb4ec5184c4cafc`。[正式网址](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/) · [49.8 秒正式手机宽度实录](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/fund-editions-tour.mp4)

当前双入口网页复用已收藏的 Sites 网址和原访客库。台式机完整应用继续使用 3365。权威源码、素材、需求与验收原件均在 `C:\Users\rocks\Documents\Codex\Projects\shared-workspace\Fundroom`。笔记本可通过 `codex-home` 使用台式机正本；本次台式机反连接笔记本的 SSH 超时，笔记本独立离线副本的同步未验实。[正式站状态与截图](public-release-status.md) · [本机应用](http://127.0.0.1:3365/)

## 上一版桌边接待

2026-11-18 03:16 太平洋时间，公开站已更新桌边接待界面与实录。首页可以进入自建基金工作室或基金策略目录。手机交互实录长 9.33 秒，来自正式网址的 390 像素宽浏览器；独立桌边视觉短片长 6.72 秒。三段影片均支持浏览器拖动播放。发布号为 `appgdep_6afd8902d4c881919c38c6226f657283`。[打开网站](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/) · [9.33 秒手机交互实录](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/reception-live.mp4) · [6.72 秒桌边视觉](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/reception.mp4) · [75 秒比赛导览](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/tour.mp4)

## 2026-11-18 Agent 后端发布

[公网工作室](https://morrowfolio-team-studio.wavyboot13.chatgpt.site) 使用 Sites 与 D1。服务端机密字段 `FUNDROOM_HR_KEY` 保存独立可撤销的 Fundroom Sites Runtime v1.4 密钥，范围为发起人已确认的现有默认工作区，内含另一个旧加密回测项目。供应商对 Sites 中介路径返回 HTTP 403 与 insufficient_scope，要求应用服务器直连。网站已停止这条路径的模型调用，可保存访客自由草稿、播放有日期和真实回执的历史问答。[机密绑定](../release/review-web/sites-runtime-secret-status.json) · [访客与录制实测](../release/review-web/online-drafts-and-recordings.json)

工作区已部署 **Fundroom Team Runtime v1.4**，配置标识为 `chrn_642e1a7bf73e478686a90bb77fda796a`。它在 HarnessRouter Cloud 上以 Pi 驱动 DeepSeek V4.1 Flash。每次请求传入当前席位、语言与输出结构。设计访谈、研究席、风控席以及基金经理因此各自完成自己的任务。已从云端管理 API 读回配置并核对持久指令。四种内置工具全部由运行时强制禁用，配置中没有券商凭据、外部工具或数据库连接。云配置每次任务的费用上限为 0.03 美元。[本地部署规格](../core/harness-profile.json) · [云端配置核对](../release/review-web/cloud-profile-v14.json)

台式机的 [v1.4 本地审阅网页](http://127.0.0.1:3347/) 对应独立 SQLite 库 `.fundroom/hosted-cloud-review-v14.sqlite`。在项目目录执行 `.\dev.ps1 -CloudReview` 可启动同样的实例。网页、账户、市场数据、授权及模拟执行继续运行在台式机。两项券商下单开关均关闭。原 3331 进程继续提供先前的现场会话；浏览器在两个端口共用主机名时，账户资料和记录仍按各自的数据库保管。[平台职责说明](https://harnessrouter.ai/docs/host-app-vs-runtime-agent)

旧云配置 `chrn_600b0d5821df4138aed948db2fb86428` 保留在同一工作区。它面向旧版合成情景的 BUY / SELL / HOLD 提案。需要重放旧发布时，可在独立 PowerShell 窗口设置 `$env:HARNESSROUTER_HARNESS_ID` 为该值，选择独立回放库并启动；清除此覆盖后启动器默认使用 v1.4。Windows 凭据桥只向官方 HTTPS 服务的这两个项目配置提供已有项目凭据。自行安装时，服务器可用自己的 Workspace API key 和已授权的配置标识覆盖默认设置。[官方托管 Agent 管理 API](https://harnessrouter.ai/docs/harnesses-api)

发布后以真实 Edge 新访客分别从 Studio 输入投资想法、在 BOND 运营页召集三席。三个不同云回执签出持仓不动的决定。随后问经理“买入了吗”，经理引用实际模拟账户的 10,000 美元现金和零订单；另一个访客的账户没有该决定，跨账户追问返回 HTTP 409。用例从页面提交，未调用券商。[真实浏览器和云端回执](../release/review-web/cloud-runtime-v14.json)

## 正式手机浏览器入口

[打开产品](https://morrowfolio-team-studio.wavyboot13.chatgpt.site) 后选择 [我的基金工作室](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/studio) 或 [主动基金研究](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/funds)。[互动导览](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/judges.html) 和 [75 秒双语字幕 MP4](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/tour.mp4) 可匿名查看。Sites 独立托管这些地址，家庭台式机关机后也可以打开。

公网版按浏览器的 90 天安全 Cookie 建立访客空间，并用 D1 保存会话和已确认的团队。后期可用 Sites 的 ChatGPT 身份认领访客记录。服务按访客和站点限制模型请求数；打开静态首页无需创建访客。11 月 18 日 02:48 太平洋时间，总监复查生产会话接口返回 guest=true 和 managerAvailability.state=temporarily-unavailable。供应商拒绝托管平台中介转发，需由获支持的应用服务器直连。网站保留草稿并如实提示当前状态；能独立查阅的有目录、历史研究和已生成的演示回执。台式机 3365 有实际模型、持久模拟盘和更多运营功能。

### 在家打开实时经理

在台式机打开[完整产品](http://127.0.0.1:3365/)。若已关闭，从共享项目目录运行 `.\dev.ps1 -LatestReview` 并保留窗口。此应用服务器直连比赛工作区。3365 只在本机监听，台式机开机本身不会让这条网址变成公网网址。

### 从手机访问家庭服务器

11 月 18 日重新验收了专用应用。独立 HTTPS 测试中，匿名访客点一条建议和继续追问，两轮都收到 HarnessRouter 回执；立即刷新仍能续聊。另以中英文合成录音验证了 Whisper 听写与对应模型答复的有声 WAV。实体 iPhone 的收音和播放仍待实测。同日 12:18 PT 核对台式机在线，Funnel 尚无节点权限，3348 未监听。此前自动审批以 `blocked by policy` 拒绝在 3348 启动常驻进程，未给出更细原因。外网接入还需要完成节点授权、启动该专用应用并在外网验证。[访客两轮实测](../release/review-web/qa-maya-voice/direct/visitor.json) · [双语音频与模型回执](../release/review-web/direct-voice-acceptance.json)

独立应用提供相同网页、两条 Agent 旅程、每位访客各自的长期模拟空间及电子邮箱账户。它的 SQLite 库、Sites 的 D1 草稿以及台式机完整审阅账本各自保存。独立应用已验证邮箱注册和登录、匿名草稿认领、另一设备登录恢复、真实三轮 Studio 和 BOND 问答。[直连应用验收](../release/review-web/direct-application-acceptance.json)

独立应用报告可识别及可朗读的语言。浏览器可从同源 `/api/voice/status` 读取这些能力，再把用户录下的最长 30 秒单声道 WAV 交给 `/api/voice/transcribe`。工作区使用完即删除临时录音，用户核对文字后才会发送给 Maya。设备无法朗读时，`/api/voice/reply` 可按当前访客的议题和模型回执朗读已生成的回答。每位访客每小时可使用 24 次服务器语音操作，全站每小时上限为 120 次。Sites 单独运行时提供浏览器语音能力，访客的麦克风权限和浏览器识别服务决定能否听写。

2026 年 11 月 18 日在台式机隔离服务上，两个独立的匿名访客分别走通了中文和英文的语音上传、Whisper 转写、HarnessRouter 回答与答复朗读。音源是系统合成的两句测试录音。两次模型回执、逐字转写和输出音频长度见[双语语音验收](../release/review-web/direct-voice-acceptance.json)。独立应用的公网入口仍需按下列步骤启用并从公网实测。

支持设备听写的网页会在 `/api/voice/status` 提供 `deviceDictation`。用户点选「在此设备听写」后，浏览器首次加载约 54.5 MB 的运行库和中英共用模型。设备端使用单线程 WASM、Transformers.js 2.17.2、ONNX Runtime Web 1.14.0 和固定提交的多语 Whisper Tiny。仅识别 Worker 的响应策略允许 WASM。首次下载经过 SHA-256 校验，后续可使用浏览器的本地缓存。录音仅在识别 Worker 内推理，用户可在发送前改正听错的人名、基金名和代码。Edge 在第二次启动时复用了缓存，Windows 版 WebKit 在相同测试中再次请求了资产。[Edge 识别验收](../release/review-web/qa-maya-voice/device-engine.json) · [WebKit 识别验收](../release/review-web/qa-maya-voice/device-engine-webkit.json) · [文件版本与校验值](../web/device-dictation-files.mjs) · [许可证](../web/device-dictation-licenses.txt)

1. 在本人浏览器打开 Tailscale CLI 为这台电脑返回的[官方 Funnel 启用页](https://login.tailscale.com/f/funnel?node=nzJGuuqsW321CNTRL)。管理员核对设备与授权范围。最近的桌面查询仍显示 `No serve config`。
2. 在台式机 PowerShell 打开共享项目目录，运行下方独立产品启动命令并保留窗口。首次构建需要 Node 24、pnpm 和网络。已有 Windows 凭据桥将本项目凭据交给应用服务器。手机浏览器不会收到该密钥。
3. 在官方 Funnel 设置中核对台式机 HTTPS 443 的目标为 `http://127.0.0.1:3348`，用 `tailscale funnel status` 查看实际公网网址。手机切到移动数据，打开该网址，发送自选问题并核对模型回执；完成后才算公网实时模式验收通过。[Tailscale 官方文档](https://tailscale.com/kb/1223/funnel)

```powershell
.\scripts\start-direct.ps1 -PublicOrigin 'https://desktop-dhgo2co.tailad8e4a.ts.net'
```

此前工具环境为回环 3348 启动正式后台进程时，自动审批返回 `blocked by policy`，没有给出更细理由。此处保留维护命令。正式 3348 尚未启动，旧计划任务没有更改；3331、3347、3365 继续用于本机审阅。

## 本机演示

源码需要 Node.js 24 或更新版，SQLite 为 Node 内置能力。Windows 的真实 Agent 演示使用已设比赛凭据的用户账户运行 `dev.ps1`，默认桥接 Hosted Agent。台式机当前完整演示使用 `.\dev.ps1 -LatestReview`，仅本机 3365，保存至独立的 `.fundroom/product-review-v16.sqlite`，关闭券商下单及公网模式。`-LiveHarness` 仍可使用，`-Offline` 显式关闭模型。其他电脑可从 `.env.example` 配置自己的 HarnessRouter 环境，再启动 `node --env-file-if-exists=.env server.mjs`。实际凭据只留在该机器。 [启动说明](../README.md)

普通引导、员工聊天、基金问答默认调用 HarnessRouter，普通审议默认调用多席投委会。缺少配置时明确报连接未准备或 503，不自动改成固定回复。专业模式可显式选择离线示例回放。可以设置 `FUNDROOM_HOURLY_AI_TASKS` 和 `FUNDROOM_AI_CONCURRENCY` 限制预算与并发，默认本机分别为 100 个模型任务每小时和 2 个并发流程。

本机语音依赖独立准备，源码交付带 `setup-voice.ps1`，不带 Python 包或模型。 [移动与语音](mobile.md)

## 容器

Dockerfile 以 Node 官方 24 系列镜像为基础，使用非 root 的 node 用户。`.dockerignore` 按启动所需文件限制构建上下文。此开发环境没有 Docker CLI，本轮只静态检查配置，未声称镜像已经构建。 [官方 Node 镜像定义](https://github.com/docker-library/official-images/blob/master/library/node)

```powershell
docker build --tag morrowfolio-preview .
docker run --rm --name morrowfolio-preview --publish 127.0.0.1:3000:3000 --mount type=volume,source=morrowfolio-preview,target=/data --env FUNDROOM_PUBLIC_ORIGIN=http://127.0.0.1:3000 morrowfolio-preview
```

当前 Dockerfile 的 `FUNDROOM_PUBLIC_DEMO=true` 用于公开静态研究和合成数据预览，关闭托管模型、服务器语音、券商和计划任务。因此这条容器命令不能作为完整语音 Agent 演示的替代。完整实时模型演示在本机配置实例中进行。后续公开真实 AI 服务还需要部署身份认证、配额和受控的模型访问。源码不会为公开访问默认放开这些能力。

## 手机与跨机器访问

PWA 和语音需要可信来源。桌面本机可以用 localhost，真实手机的远端服务需可信 HTTPS。源码已经做 1440、390、320 CSS 像素的隔离 Edge 验收，不能将浏览器设备模拟写成实体 iOS 或 Android 验收。

双机共享源码位于台式机 `C:\Users\rocks\Documents\Codex\Projects\shared-workspace\Fundroom`。笔记本通过 Codex 的 `codex-home` 进入该共享项目。若通过 SSH 转发访问台式机的本地实例，可以在笔记本运行。

```powershell
ssh -NT -o ExitOnForwardFailure=yes -L 127.0.0.1:3365:127.0.0.1:3365 codex-home
```

保持转发运行，在笔记本打开 `http://127.0.0.1:3365/#/`。具体端口以正在运行的实例为准。分别在两台机器启动时，凭据、识别器缓存和 SQLite 账本各自隔离。活动数据库不作跨主机文件同步。

## 发布清单

受控交付包含 `core`、`web`、`test`、`docs`、`server.mjs`、`dev.ps1`、`setup-voice.ps1`、README、AGENTS、样例配置、容器配置和安全的旧源码归档。新目录、语音 worklet、角色画像、目录计算模块和所有 PNG 图标必须在清单中。

交付排除实际 `.env`、密钥、私钥、账户数据库、录音、模型缓存、Python/npm 依赖、私有运行日志、`.git` 和开发验收脚本。发布前为共享目录中的旧源码做可回退快照，核对未知修改后再按清单同步。同步后逐项比较 SHA-256，并从共享目录重新运行完整测试和短时健康检查。

## 检查命令

```powershell
node --test --test-isolation=none test/*.test.mjs
```

首页、`/api/health`、`/api/state`、PWA 清单和所有 ES 模块应返回成功。真实模型验证另外记录 response ID；券商替身测试、模拟成交和真实订单分别记录。比赛提交和公开产品链接以实际门户或部署证据为准。 [构建记录](build-log.md)
# Apple 客户端交付补充

`mobile/` 为 iPhone/iPad 原生 React Native / Expo 工程。依赖安装、免费 Expo Go 同账号登录、仅手机 API 的私人 HTTPS 网关及 iOS 导出步骤见 [mobile/README](../mobile/README.md)。Android 构建已暂缓。

完整源码包保留锁文件和可复算脚本，不含 `node_modules`、系统 SDK、生成的 Android 工程、`.expo` 用户态、真实 `.env`、会话令牌、模型、录音、日志或活动 SQLite。iOS Hermes 及必要资源另包交付，明确不是签名 IPA。依赖、模型与凭据由每台电脑独立准备；源码发布不自动开启任何公网服务，也不执行收费 EAS 构建。

根 `.easignore` 是未来 EAS 上传时的排除边界；它已检查隐藏配置、运行态、音频与生成物的排除，并保留移动源码及其纯数据依赖。本轮没有登录 EAS 或上传源码。

## 11 月 18 日更新 · 正式公开展馆与完整应用

**Sites v23 已在正式域发布。** 独立浏览器以中英文逐一打开巴菲特四场会议，核对前三场持现、第四场 20% 目标仓位及下一交易日独立模拟成交。这个地址能打开历史证据和模拟执行记录，服务的在线经理状态为 `agentReady=false`。[正式展馆](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/funds?lang=zh-CN&id=buffett) · [双语现场记录](../release/review-web/public-release/sites-live-v23.json)

**完整网页使用独立 Node 应用包。** 运行 `node scripts/package-full-cloud.mjs` 生成 `release/cloud/full-web/fund-edition-web.tgz`，再运行 `node scripts/check-full-cloud.mjs`。启用服务器专属密钥后，追加 `--live` 可核对一次真实经理回执与重启后的额度。检查器从 tgz 解包并逐项比对当前源码。旧的 `release/cloud/fund-edition-direct.tgz` 运行专用 Sites 前端壳，不能替换完整版。完整包有自己的 `/studio` 和 `/funds`，须在实际部署后以其 HTTPS 地址复验。[生产设置](../hosting/cloud/full/README.md) · [完整包现场检查](../release/cloud/full-web/verification-live.json)

**在同一域名更新。** 保留固定 HTTPS 来源、现有服务器 Secret 和专属持久卷。部署前记录当前镜像或包哈希，对数据库做 SQLite 在线备份或在停服后备份整个卷，包括 WAL。归档新版包和验收记录，单实例停旧起新，将同一卷挂回 `/data`。此处会有短暂切换时间。先检查 `/healthz`、原浏览器会话和既有基金，再对两个入口和一笔历史经理问答做实测。回退时先停止新实例，切回先前镜像并接回同一卷；如果本轮有不兼容的数据迁移，则同时恢复升级前备份，并单独核对切换后新增的记录。保留域名即可保留同一浏览器的登录和访客 cookies。

**11 月 18 日晚生产验收。** 完整应用现已运行在 Railway 的固定 HTTPS 域。首发包 SHA-256 为 `05cc7a6e60e5370f57ff1e771d6da6bbdf74de47dd0865860f506b16cc42b962`。它从已验归档只移除平台不接受的 Dockerfile `VOLUME` 声明，专用卷由 Railway 挂载到 `/data`。公网的新访客已实际向 Maya 和新入驻的研究员发问，并就第四场巴菲特决议收到三条当期依据。重启生产容器后，同一浏览器的团队、模拟账本、聊天和原决议问答回执均可恢复。[正式工作室](https://fund-edition-web-production.up.railway.app/studio?lang=zh-CN) · [正式基金展馆](https://fund-edition-web-production.up.railway.app/funds?lang=zh-CN) · [公网访客验收](../release/review-web/public-release/railway-production-journeys.json) · [生产重启与回执](../release/review-web/public-release/railway-live-persistence.json)



**11 月 18 日晚，正式工作室增加服务器盯盘。** 自建基金确认后会归档首次实际观察。美东每日 08:30 检查新闻，常规交易日开盘后按基金的 30、60 或 120 分钟设置观察，遇早收市提前停止。已有基金先建立基线。页面关闭后服务照常运行。每次记录包括关注标的、来源、发布时间、参考价的新旧、与前一期的变化、实际模型回执或规则说明。模型每日额度和会员资格会影响经理解释，公开新闻与参考观察继续保留。当前依据 2026–2028 年纽约交易所日历，公开报价只用于模拟研究。切换后以原访客核对三只基金、八笔原有模拟订单和现金，摘要与升级前一致。[线上工作室](https://fund-edition-web-production.up.railway.app/studio?lang=zh-CN) · [锁包和线上资源](../release/review-web/studio-watch/production/deployment.json) · [关闭浏览器后的实际记录](../release/review-web/studio-watch/production/offscreen-journey.json) · [交易所日历](https://www.nyse.com/markets/hours-calendars)



**11 月 18 日晚，固定期限会员上线。** 在原网址选择一个月 US$9.99 或一年 US$99.99，登录后可申请一次专属付款单。运营以 PayPal 正式活动记录核实单次到账后开通，到期由用户决定是否再买。生产复验从正常页面申请年卡、刷新后读取、在买家账号撤回，并用另一访客检查私密性；没有向外发送付款单或收取款项。原生产卷上的只读运营台已实际运行。先在项目的 production 服务打开 Railway SSH，进入 /app 并运行 `node core/manage-invoices.mjs list`，再按运营手册认领和核对具体订单。[线上会员](https://fund-edition-web-production.up.railway.app/membership.html?view=account&lang=zh-CN) · [运营手册](membership-billing.md) · [线上购买流程](../release/review-web/member-access/production/purchase-journey.json) · [同卷运营台](../release/review-web/member-access/production/private-queue-list.json)



**22:33 PST，官方测试买家走通 PayPal Sandbox。** 正式站的测试专页提供两种方式。PayPal 官方沙盒将买家转到 sandbox.paypal.com，回站后由服务器核对捕获回执才开通测试权益；站内模拟可由没有测试买家账号的人直接体验。正式验收有一笔 US$9.99 的虚拟月付完成捕获。测试权益和收据使用单独的浏览器身份及数据表，普通会员页可回看有效期。隐私报告只留正式沙盒捕获回执的 SHA-256。真钱付款继续走单次申请与商户到账核对。[官方沙盒入口](https://fund-edition-web-production.up.railway.app/checkout-test.html?mode=sandbox&lang=zh-CN) · [站内模拟入口](https://fund-edition-web-production.up.railway.app/checkout-test.html?mode=simulation&lang=zh-CN) · [沙盒捕获凭证](../release/review-web/checkout-test/production/sandbox-captured.json) · [公网双语体验](../release/review-web/checkout-test/production/public-checkout.json)



**22:43 PST，六人工作室投入使用。** 正式站从默认三席出发，用中文提出“再加两个人，一个看宏观，一个看债券”，再从候选中邀请交易执行专家。确认前仍保留创始人指定的现金流策略、原三人的职责和模拟资金，刷新草稿后登记的六人全部可在办公室选中。宏观研究员 Nora 通过 HarnessRouter 就收益率曲线作答，引用了当前模拟基金的持仓与交易限制。升级前的模拟资金与此前官方沙盒付款的测试通行证经读取原卷核实仍在。[正式工作室](https://fund-edition-web-production.up.railway.app/studio?lang=zh-CN) · [六人团队及对话证据](../release/review-web/team-size/production/six-staff-journey.json)

