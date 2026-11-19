# 编辑交接 · 如何让下一篇日志也经得起追问

长期协作原件是[这份原生 Google 文档](https://docs.google.com/document/d/1o1E0maBaRFWAcuD8p8u7A9dYQDTIMpSoCdCoO0VWT5Y/edit)。Drive 文档 ID 为 `1o1E0maBaRFWAcuD8p8u7A9dYQDTIMpSoCdCoO0VWT5Y`。两台电脑均从权威共享目录的本页进入。继续记录时先读现有文档，按版本和日期追加，保留协作者已有修改。更新本仓双语图文稿后运行 `python docs/devlog/render.py` 同步网页并重新核验两个语言、两个宽度。

主笔维护日期、决策、结果与原始产物的对应关系。模块负责人核技术表述，独立验收核“用户实际做成了什么”，总经理决定哪些结论可以对外使用。两稿采用太平洋日期，因此部分原始回执的 UTC 日期为 11 月 19 日，实际开发发生在当地 11 月 18 日晚。

## 每个职能组值得带走的一件事

| 负责人 | 事实与教训 | 下次如何检验 |
|---|---|---|
| 产品与用户行为 | 讲得清自己的投资目标，仍可能不知道下一步怎么从谈话走到招聘。创始人的真实试用帮我们发现了这段空白。 | 给新访客一个目标，从空会话开始，观察能否自行点到候选人、确认，并找到已聘员工。[候选人交互](../../release/review-web/maya-candidate-visual/zh-interaction.json) |
| 交互设计 | 建团按钮放得醒目，依然可能抢在 Maya 开口前打断对话。把人名、职责和修改入口放回用户实际说过的目标旁边。 | 分别用键盘和手机宽度，看完第一个候选人后换人，检查人数是否包含经理、能否回到正确工位。[版面实测](../../release/review-web/maya-candidate-visual/) |
| 语音与运营 | 实测曾把“风险适中”听成“风险事终”。同一次协作还发现“研究过去”和“让它决定下一期”会走进同一条路径。 | 允许校对，然后用两个意图都提到 VWELX 的问题分别测试历史研究与下一期委托。记下录音条件和浏览器，不推断所有口音或手机都已通过。[语音与路由](../../release/review-web/voice-and-routing.json) |
| 数据与会计 | 季报将上年现金流重新分类，单有日期过滤仍可能把定义不同的数相加。 | 对派生数列出全部期间、来源、披露时刻及公式，核对冻结数据包的指纹。遇缺失值如 11 月 8 日收盘保留缺口。[研究规程](../buffett-paper-protocol.md) |
| 基金研究与独立审校 | 四场共十二份真实模型回执。第三场的会计上下界和第四场英文估值倍数都需要校注。 | 从一笔成交逆查投票、当时原话、勘误与来源。原话保留，查不到的证据也要能说明范围。[公开档案](https://fund-edition-web-production.up.railway.app/data/buffett-ai-study.json) |
| 模拟执行 | 目标仓位与实际成交有不同的时点和权责。重复操作也容易让一笔意图记两次。 | 比对愿望仓位、成交日、可得价格、余额与交易费。关掉应用再发同一已完成请求，核对回执与账本。[执行对账](../execution-audit.md) |
| 安全与计费 | 首页能打开，并不证明没有串账或模型额度会在重启后继续生效。 | 建两个独立访客，一个确认后另一个不能读到其基金。把测试额度用完、重启、再发一次，区分已完成请求和新请求。[隔离包测试](../../release/cloud/full-web/verification-live.json) |
| 打包与发布 | 本机正在用的前端和云包曾各走自己的渲染入口。首发时 Railway 还拒绝了 Dockerfile 的磁盘声明。 | 比应用文件哈希、用独立解压的包启动；正式域核对真实问答；最后重启云容器并用原访客回看。[运行与回退手册](../deployment.md) · [公网持久化](../../release/review-web/public-release/railway-live-persistence.json) |
| 独立验收 | 有声音、能保存文字、后端返回 200 是三个局部测试。给新招的员工出一道新题，才把完整链条串起来。 | 保存访客旅程、语言、视口、失败和重试。区分真实模型回执、回放、替身、浏览器手机宽度与实体设备。[生产验收](../../release/review-web/public-release/railway-production-journeys.json) |

## 统计与版本

总经理按本项目主对话产生的直接子代理身份去重，同一位复工不重复计数。两种唯一身份口径均得到 46。前 45 席承担开发、研究和验收，第 46 席为开发日志主笔。统计只公开汇总；代理分批参加，不把累计数字写为同时在线的团队。历史实验的三位投资席与四轮会议产生的十二份模型回执另计。外部用户、付费和竞赛报名各需独立证据。

技术席与浏览器验收席分别审阅过工程细节。可据 [正式包的复现说明](../deployment.md) 启动产品。要独立复查历史实验，在共享源码根执行：

```sh
node scripts/run-buffett-study.mjs
node --test test/buffett-paper.test.mjs
```

现有归档允许离线复算四次决策所用的财务包、开盘成交和两本账的净值。另一个很有用的反例是一次 VWELX 投委会席位返回格式异常，系统保留失败记录并停止。[失败的一场](../../release/review-web/forward-hosted-incomplete.json)

## 下一次开发日志怎样接着写

每次版本发布或重要返工，主笔从已有记录补一条，包括“是谁在什么情境下遇到什么问题”“谁拥有修改、谁提供另一种判断”“原先哪一项验收不足”“复测得到了哪个可重看的结果”“哪项假设仍没验证”。公开段落使用真实公开链接、许可合适的图和匿名测试会话；失败证据与成功证据一起保留。下一篇的线索包括办公室入口和回答/语音延迟，待同一正式版本复测后再写数值。

## 11 月 18 日 19:59 PT · 第三期生产复测

独立验收用升级前那位访客重新打开正式站，原模拟账户中仍有 2.372735 份 ARKK 和 9,725 美元。另开的组合钱包起始 10,000 美元，购入两只自建基金、巴菲特风格基金与 ARKK 策略后余额 4,250 美元。原买入请求跨页面重试返回同一回执，订单计数仍为四笔。全部赎回后恢复 10,000 美元，余额和持仓份额均对齐；第二位访客无仓。先前的 HTTP 409 和总经理关于旧持仓的追问均保留在团队工作稿。[正式站升级验收记录](../../release/review-web/portfolio-account/railway/after-upgrade.json)

双语长稿亦已部署。Edge 在中文浏览器中直接打开公开链接得到英文，点击中文可切换。390 与 1440 像素宽度下均有十个有效章节锚点，正文三幅图按语言和宽度适配，十二份媒体均可解码。[交互验收](../../release/review-web/portfolio-wallet/production/journal-and-legacy-links.json) · [公开英文原稿](https://fund-edition-web-production.up.railway.app/build-log.html)

## 11 月 18 日深夜 · 付款与基金观察

公开正文只写个人账户有开具一次性付款单的能力，以及隔离演练中的月卡退款、年卡接续和两进程争取同一笔申请的结果。真实到账统计为本次核验零笔。核对资料见[账单操作与退款语义](../membership-billing.md)和[隔离退款回归测试](../../test/invoice-membership.test.mjs)。

正式站 AAPL 观察任务于太平洋时间 22:01:00.018 启动，访客的浏览器于 22:01:00.435 关闭，任务于 22:01:18.497 完成。四条新闻标题均带各自的发布时间，Maya 的完成状态与回执均已写入。22:01:27.041 同一访客再次打开工作室，模拟账本零单。[正式站关窗实测](../../release/review-web/studio-watch/production/offscreen-journey.json)

会员版本发布后，运维单独部署了这一篇手记。正式域英文和中文各十一章，各自的目录链接均可抵达新增一节；线上 HTML 的 SHA-256 与冻结稿一致。[双语正文回读与文件摘要](../../release/review-web/member-access/production/final-journal.json)


## 11 月 18 日 23:18 PT · 最终联审的编辑核对

本次在英文主稿及中文稿各追加四节，公开生成页每种语言从十一章增至十五章。新章节使用稳定锚点 `payment-entry`、`return-journeys`、`evidence-review`、`company-review`，分别加 `-en` 或 `-zh`。原稿和渲染脚本均在权威共享根维护。运行 `python docs/devlog/render.py` 重新生成 `web/build-log.html`。此时尚未由本分支部署。

| 可公开表述 | 核验依据 | 状态与限制 |
| --- | --- | --- |
| 普通首页到会员主价卡的月/年动作都能进入官方沙盒，金额分别为 9.99 和 99.99 美元 | `release/review-web/primary-checkout/production/home-to-sandbox.json`、`deployment.json` | 正式域旧访客、中390/月与英1440/年；这两次入口检查批准前取消。 |
| 月卡沙盒有供应商 capture 与测试权益 | `release/review-web/checkout-test/production/sandbox-captured.json` | 22:33 PT，scope 为 sandbox-only；真实收入零。年卡访客卡停在官方地址校验，不能记完成。 |
| 切语言后替换同事、前进后退、筛选和刷新行为正确 | `release/review-web/return-journeys/before.json`、`verified.json` | 本地 Edge 1440 英文和 WebKit 390 中文；最终记录为 23:10 PT，仍待合并生产回读。 |
| 公开日志跨站文档修复与注册时估值原子迁移 | `test/service.test.mjs`、`test/accounts.test.mjs`、`test/studio-review.test.mjs`，安全负责人已交接原主管 | 此稿写本地修后，生产响应头及迁移结果待统一发布验证；过去已丢估值不能凭此修复恢复。 |
| ARKK 五股估算43.12%、后续35.64%，惠灵顿23季规则零模型调用 | `release/review-web/final-fund-evidence/browser.json` | 界面路径用受控回复；ARKK只比权重，不能当策略回报；名家真实AI研究和情景规则各自有范围。 |
| 巴菲特末次仓位追问是真实公网模型调用 | `release/review-web/final-fund-evidence/railway-buffett-question.json` | 23:08 PT，HarnessRouter、deepseek-v4.1-flash、保存的真实回执；不代表所有基金或未来表现已验证。 |
| 五位专员在新分支同时工作，加主管共六席 | 主管 `collaboration.list_agents` 快照；`release/review-web/final-company-audit/branch-handoff.md` 另有记录席加入后的七席快照 | 本篇公开写已观测五专岗这一时刻，早期45仍是旧截止点累计，不推断100席满载。 |
| 普通持仓提问不再携带尚未执行的预设情景，部分响应体超时能结束等待 | `release/review-web/final-company-audit/dialogue.md`、`test/dialogue-reliability.test.mjs` | 15专项及196全套通过的共享快照；本机HTTP与受控回复，不给模型推理质量或真实网络延迟背书。 |
| 慢转写取消后重录不丢开头，错误可重试，旧回调不能混入新录音 | `release/review-web/final-company-audit/voice.md`、`voice-tests.txt`、`test/voice-recovery.test.mjs` | 24专项通过，事件与音频样例模拟；实体iPhone与主观音色未验。 |

编辑结构核对保存在 `release/review-web/final-company-audit/journal-checks.json`。新增章节均由主管逐段审阅。Edge 本地打开英文新增支付锚点并读到四节；随后浏览器工具调用被中断，主笔没有保存新的视觉截图。原样式与图版沿用，移动/桌面新正文的最终视觉回读交由统一发布验收。

正式 PayPal 商品入口的独立买家验收在本稿期间发现待付年单与月卡顶部价格可能不一致。该发现退回支付开发后，候选版保留原单期限/金额并隐藏错位付款入口，给出返回原订单。独立买家已双向点击复验年转月、月转年，切语言与刷新均保留一致金额；invoice专项3/3通过，证据为 `release/review-web/final-company-audit/buyer/local-yearly-change-term-en.jpg`、`local-monthly-change-term-zh.jpg` 和该组最终报告。正式商业付款仍未发生，部署后生产复验由原线程接续。
