# 正式网址独立验收

## v22 · 公网设备听写

正式部署 `appgdep_6afe0c2a5cd88191a02d26c98dfce2bb` 已在原域名启用中英文设备听写。打开页面不请求识别模型。用户选择设备听写后，首次读取约 55 MB 静态资源，可中途取消。浏览器在本设备处理录音，随后显示可校对的文字。转写文字会自动保存为这位访客的草稿，发送给实时经理需要用户另点发送。浏览器缓存策略会影响下次下载量。

独立验收在正式站用 Windows Edge 的录音输入取得中英文非空结果，并验证了文字可编辑、可以保存，识别期间没有上传音频。中文专有名词和金融术语出现过近音错字。Windows WebKit 另行验证了同域模型在该引擎的解码；实体 iPhone 的麦克风、扬声器及性能仍待实机检验。同一测试出口在密集的无痕首访后遇到访客签发限流，已有访客会话可以继续使用。当前 Sites 的实时经理请求仍需独立云应用从服务器直连 HarnessRouter。[正式工作室](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/studio?lang=zh-CN) · [中文验收](../release/review-web/qa-maya-voice/v22-production/device-zh.json) · [英文验收](../release/review-web/qa-maya-voice/v22-production/device-en.json) · [WebKit 验收](../release/review-web/qa-maya-voice/v22-production/webkit-device-engine.json)

## v20 · Maya 的第一问

11 月 18 日正式站已发布 `appgdep_6afe084efaec8191965f338b05b70017`。匿名进入工作室时 Maya 先问「你想让自己的基金投资什么？」，随后出现麦克风和两条推荐回答。开场可点播中文或英文音频，口述完成后可校对文字。正式域复验中文音频返回 HTTP 206 及 audio/wav。当前公开会话返回 `agentReady=false` 和 `provider-direct-server-required`。公开版能保存草稿，听写依赖浏览器的服务；界面分别说明了这些状态。[打开工作室](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/studio?lang=zh-CN) · [公网会话状态](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/api/session)

独立应用服务器上，未登录访客点建议、等待回答、追问和立即刷新均已验证。两轮都有真实模型回执，刷新后旧稿已清，能从新建议继续；中英文测试音频也能转写、提交、生成答复及音频。实体 iPhone 与外网直连仍待验收。[两轮问答与回访](../release/review-web/qa-maya-voice/direct/visitor.json) · [双语识别和答复音频](../release/review-web/direct-voice-acceptance.json)

## v19 · Fund Edition 你的 AI 投资团队

v19 的发布号为 `appgdep_6afe02da2da4819193b362a950a71a0f`。移动宽度的无声实录长 56.27 秒，先展示投资人切换、已录对谈、研究基金，随后进入 Maya 工作室并恢复草稿。公开文件与共享原件的 SHA256 一致。已在 390×844 浏览器打开并从 0.66 秒拖动至 38.26 秒，通过分段播放校验。[观看实录](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/fund-edition-salon.mp4) · [最终浏览器回归](../release/review-web/qa-fund-edition-salon/final/journeys-hosted.json) · [播放核对](../release/review-web/qa-fund-edition-salon/online-playback.json)

本轮界面已部署到原网址，首次发布号为 `appgdep_6afe01ba6f7481919aa18348ca0cd855`。公网首屏可独立进入「自建 AI 基金」和「挑选 AI 基金」。基金馆同屏呈现名家风格与主动基金；可切换五位投资人的方法，浏览九只基金。巴菲特的互动历史对谈有中英文各三份实际模型回执。任意新问题在台式机的直连工作室可用。[公开基金馆](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/funds?lang=zh-CN) · [公开巴菲特专场](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/funds?lang=zh-CN&id=buffett) · [正式域连续操作核对](../release/review-web/qa-fund-edition-salon/public/journeys-hosted.json)

## 基金班底 / Fund Editions

目前线上为 v17，发布号 `appgdep_6afd9376537c8191a17333097ba6b4ce`。在正式域录制的 49.8 秒无声实录从双入口开始，依次展示个人草稿、研究席的异议、经理持现、独立模拟账本与 VWELX 对照资料。完整视频在公网用手机宽度实际播放并跳转到 34.86 秒。远端完整 SHA256 与共享原件一致，旧视频和已有链接通过核对。[观看公开实录](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/fund-editions-tour.mp4) · [视频播放与拖动](../release/review-web/qa-fund-editions/online-editions-playback.json) · [正式域文件校验](../release/review-web/qa-fund-editions/http-source-v17.json)

原正式网址已上线双入口。开发总监从公网首页实际进入两条路径，见到可匿名保存草稿的工作室、已录团队审议，以及将 VWELX 放在首行的基金研究目录。首批更新编号为 `appgdep_6afd920b7d048191b73ec05b3cd481d6`。中英文独立验收含 1440×900、1280×800、390×844、320×568 及浏览器实际放大 200%。手机画面来源为窄屏的桌面浏览器。[打开正式站](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/) · [浏览器验收](../release/review-web/qa-fund-editions/dual-entries.json) · [访客草稿与会议](../release/review-web/qa-fund-editions/recorded-studio.json)

公网可研究策略、查看录制会议与个人草稿。供应商要求应用服务器直连模型，任意新对话在台式机的完整工作室可用。两位隔离访客分别用中英文问 Maya 产品名称，获得正确品牌和独立回执。[工作室](http://127.0.0.1:3365/) · [中文回执](../release/review-web/editions/manager-brand-zh-CN.json) · [英文回执](../release/review-web/editions/manager-brand-en-US.json)

## 旧版桌边接待台

2026 年 11 月 18 日，正式 HTTPS 域上的接待版 `appgdep_6afd87cd59ac819190964edeaf0fe0ec`，功能、照片、玻璃按钮及动画均由独立发布岗在真实 Edge 中复验。测试覆盖 390 中文、1440 英文及 320 中文。手机宽度由 Windows 浏览器设置，实体 iPhone 的麦克风与扬声器尚待实测。[公开首页](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/) · [公开工作室](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/studio?lang=zh-CN) · [发现基金策略](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/funds?lang=zh-CN) · [台式机完整版本](http://127.0.0.1:3365/)

**最终公开发布。** 加入正式网站实录后的版本为 `appgdep_6afd8902d4c881919c38c6226f657283`。11:13 至 11:16 UTC 期间在 390 像素宽度直接打开并播放两段视频，9.333 秒实录实际从 0.21 秒跳到 6.53 秒。完整文件与原件 SHA256 一致，分段读取为 HTTP 206。再核对该版九只市场基金、五种人物方法；六个公开前端资源的哈希和已验资产一致。[播放正式站实录](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/reception-live.mp4) · [浏览器播放凭证](../release/review-web/qa-public-reception/online-live-playback.json) · [公开资源核对](../release/review-web/qa-public-reception/after-media-deploy.json)

**直接看实物。** [手机与桌面三屏实图](../release/review-web/qa-public-reception/public-review-three.png) · [390 首屏](../release/review-web/qa-public-reception/live-home-zh-390.png) · [390 工作室](../release/review-web/qa-public-reception/live-studio-zh-390.png) · [1440 英文大厅](../release/review-web/qa-public-reception/live-home-en-1440.png) · [1440 基金对照](../release/review-web/qa-public-reception/live-wellington-en-1440.png) · [320 基金目录](../release/review-web/qa-public-reception/live-markets-zh-320.png)

| 产品动作 | 独立观察结果 |
| --- | --- |
| 选择两条入口 | 从主页点 Maya，实际进入工作室；点击发现基金策略，实际打开九只市场基金，再进入 VWELX 的公开资料。同一目录另有五种人物方法。320 宽两条直接链接都可操作，文档无横向溢出。 |
| 看见人、按钮与过渡 | 拍摄时人物肤色、桌面木纹正常，玻璃按钮的透明处可见下方照片。对话按钮底层 alpha 为 0.204，背景模糊 10px，手机高 48px、桌面 53px、圆角 26px；手机首页照片圆角 31px，桌面约 48px。浏览器实际使用中文 Noto Sans SC、英文 Instrument Sans。 |
| 操作与减少动态 | 390 与 1440 从首页到工作室，跟踪证实原来的头像与控件是同一 DOM 对象，实际运行约 525ms 的缩放、位移；文案约 470ms 显现。320 开启减少动态后四个采样时点均无运行中动画，文字可直接编辑。键盘 Tab 切换有可见 2px 焦点。 |
| 麦克风被拒 | 浏览器权限明确设为拒绝后，显示可用文字的提示。用户选「用文字回答」后编辑框立即获得焦点。此版已移除未获得转写时的错误播报「核对文字后发送」。 |
| 不用登录，关页再回来 | 自拟问题写入私有 D1 草稿、在同页刷新恢复。关闭同身份全部标签后重新打开仍恢复，另一个全新浏览器会话在界面和草稿接口均空。读取此前问答也保留了本人草稿。 |
| 访客听到什么 | 公网明确显示实时经理暂不可用。录制的真实问答有时间、来源及回执，浏览器实际启动中文朗读。研究页通用案例现在明确标注 PIMCO BOND。公开页依然不能完成新的自由多轮 AI 对话。 |
| 能核对哪些投资数字 | VWELX 的规则组合是墨青实线、目标基金是灰色虚线，图注标示指数基值 100、日期及双方收益。23 季开源 bt 与规则盘结果可独立重算；同一项当期 AI 投委会有单独回执。[独立回测](../release/review-web/vwelx-bt-crosscheck.json) |
| 本机真实三轮 | 台式机 3365 的工作室接口上，新建访客连问五年期、经营现金流、反面证据和现金储备。第三轮正确引用了前两轮。三份真实 HarnessRouter 回执齐全，未确认建盘，账户数量、现金和持仓都保持原值。另一个新访客只见首次问候。[本机全三轮的问答与回执](../release/review-web/qa-public-final/local-dialogue.json) |

**线上短片与实站实录。** [接待短片](https://morrowfolio-team-studio.wavyboot13.chatgpt.site/reception.mp4) 文件为 390×844，浏览器测得 **6.716 秒**，全片可解码 54 帧。独立验收时专门在正式域另录了一段 **9.333 秒**的无声交互：进入工作室、保留草稿、刷新、查看有真实回执的已录示例、进入基金目录与 VWELX。共采集 121 张实际浏览器帧，依照时间轴编码并完整解码 140 帧。[9.333 秒独立实录的共享原件](../release/review-web/reception-live-mobile.mp4)。[接待短片播放与跳转](../release/review-web/qa-public-reception/online-playback.json) · [9.333 秒实录时间轴与哈希](../release/review-web/qa-public-reception/public-reception-video.json)

**原始证据与测试。** [浏览器、直达入口、播放来源、字形及指标](../release/review-web/qa-public-reception/independent-public.json) · [三宽度逐帧检查](../release/review-web/qa-public-reception/movie-trace.json) · [关页恢复与隔离](../release/review-web/qa-public-reception/closed-tab-isolation.json) · [录制问答原件](../release/review-web/public-recorded-examples.json)。从共享根运行 `node --test --test-isolation=none test/*.test.mjs`，25 个活动文件共 97 项通过。默认发现另含三项归档，共 100 项通过。另有上一个发布版的[实测原件](../release/review-web/qa-public-final/independent-public.json)记录了旧首页的不透明主控与不连续的头像切换，可用于复查改动。
