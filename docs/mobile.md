# 移动客户端与语音

Morrowfolio 的网页适配桌面与手机，PWA 提供主屏幕图标和独立窗口。原生客户端工程位于 `mobile/`，使用 React Native 与 Expo，当前按用户要求只推进 **iPhone / iPad**；Android 开发与打包暂缓。iOS 代码、JavaScript bundle、浏览器组件预览与已签名 IPA、iPhone 实机验收分别记录，不能互相替代。

## 普通语音体验

从大厅进入我的工作室后，经理头像和第一个问题先出现。点击大麦克风开始，点击同一按钮停止。识别完成后转写进入可修改区域，用户确认内容后发送给 Agent。这样可以全程不使用键盘，也保留修改误识别文字的入口。回答旁的朗读按钮使用浏览器语音合成。

语音识别与 AI 回复各自有状态。没有模型连接时，会明确显示连接准备提示，不把固定话术当作真实 Agent 回复。录音不会自行确认建基金，也不会发出证券订单。音频识别与账户执行使用独立的接口。

## 本机 Whisper 识别

Windows 演示机已使用 Python 3.13，识别运行时为 `faster-whisper==1.2.1`，模型为官方 Systran `faster-whisper-small`，CPU int8。新电脑按以下命令准备。

```powershell
.\setup-voice.ps1
```

脚本从 PyPI 安装依赖到 `%USERPROFILE%\.cache\morrowfolio-voice\python`，从 Hugging Face 官方模型仓库下载到同一目录下的 `models\small`。模型约 484 MB，安装时需要联网。识别时设置 `local_files_only=True`，不会在收到录音后偷偷下载模型。[faster-whisper 项目](https://github.com/SYSTRAN/faster-whisper) · [官方 small 模型](https://huggingface.co/Systran/faster-whisper-small)

可以把缓存放在别处。

```powershell
.\setup-voice.ps1 -VoiceHome 'D:\MorrowfolioVoice'
$env:FUNDROOM_VOICE_HOME = 'D:\MorrowfolioVoice'
$env:FUNDROOM_VOICE_PYTHON = 'C:\Path\To\python.exe'
.\dev.ps1 -LiveHarness
```

只在确有这个 Python 路径时设置 `FUNDROOM_VOICE_PYTHON`。默认使用 PATH 中的 `python`。模型、依赖和音频不放进源码交付包。另一台电脑需要独立安装或使用自己的浏览器语音能力。

启动后打开 `/api/voice/status`，本机 Whisper 就绪会显示 `local: true`、`engine: whisper-small` 和 `languages: [zh-CN, en-US]`。如果没有模型，Windows 会尝试已安装的系统语言识别器。也可用 `FUNDROOM_ENABLE_LOCAL_VOICE=false` 显式停用服务器本机识别。

网页录音编码为单声道 16kHz PCM WAV，最多 30 秒。服务器为一次识别创建临时目录，完成或失败均删除原音。音频处理在运行 Morrowfolio 服务的电脑上进行。如果手机访问这台电脑，原音会从手机传到该服务端，而不是留在手机处理。发送转写后，文字才交给配置的 HarnessRouter Agent。

## 浏览器识别与权限

没有本机识别器时，前端可使用浏览器的 SpeechRecognition 能力。不同浏览器和语言的支持各异，部分识别由浏览器供应商的在线服务处理。页面在开始录音时显示当前处理路径。没有支持或权限被拒时提供明确错误，可改用文字。[SpeechRecognition 参考](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)

麦克风需要安全来源。桌面 `http://localhost` 和 `http://127.0.0.1` 可作为本地来源。真实手机访问远端应用应使用可信 HTTPS，普通局域网 HTTP 地址通常不能使用麦克风。不要为测试关闭浏览器安全检查。

## 安装到设备

- 电脑 Edge 在菜单中选择应用，再选择安装 Morrowfolio。运行中的网页会在浏览器提供安装能力时显示安装按钮。
- Android Chrome 使用安装应用或添加到主屏幕。
- iPhone、iPad 在 Safari 的分享菜单选择添加到主屏幕。如果出现作为 Web App 打开选项，将其开启。

安装方式取决于浏览器和平台。Android 条目仅说明网页浏览器已有的安装方式，不表示原生 Android 继续开发。本轮实际验证了安装清单可加载、Edge 安装能力、独立离线提示和缓存边界，系统级安装确认与真实 iPhone/iPad 尚未实测。离线只展示提示页，聊天、账户与订单请求不会从缓存返回。

## 本轮验证范围

隔离 Edge 的 1440、390、320 CSS 像素视口跑完了两条产品旅程，没有横向溢出。大麦克风的聆听、停止、最终转写、校对和失败状态使用识别器替身验证。另使用合成语音 WAV，经隔离浏览器录音编码路径与真实本机 Whisper 识别，验证 HTTP 200 与转写返回。初轮样本出现同音错及句首误识；加入一秒开头静音后，最终样本完整识别为“我想创建一个长期投资的基金,关注科技公司,风险保持适中。”。这条样本不能作为识别准确率或真人麦克风验收。

本轮没有收集真人语音，没有改变用户普通浏览器的麦克风权限。实体麦克风、环境噪声、用户口音和真实移动设备的语音效果，需要现场分别核对。

## iOS 原生接口独立验收

当前用户使用普通 Apple ID，免费体验路线是：安装官方 Expo Go，电脑 Expo CLI 与手机 Expo Go 登录同一免费 Expo 账号，再打开开发工程。Expo 官方目前明确要求物理 iOS 设备上的 Expo Go 与 CLI 使用相同账号。服务端仍需单独建立安全的 HTTPS 连接，配对码只用于 Morrowfolio 后端；Expo 登录和基金会话不是同一个凭据。[Expo 官方启动说明](https://docs.expo.dev/get-started/start-developing/)

本轮不以付费 Apple Developer、IPA 或 TestFlight 作为已完成交付。电脑的本地服务不会因为写了这份操作说明而自动暴露公网。iPhone 上的权限弹窗、键盘和实际录音仍待登录后的设备验收。

原生工程已配置自有紫 M 图标、深靛启动屏及中英麦克风/私人网络说明。通过 Expo Go 体验时，手机桌面的宿主图标仍属于 Expo Go；这些品牌配置不能被描述成已安装的独立 Morrowfolio App。

手机通过一次性配对码取得限时 Bearer 会话。AI 密钥留在电脑，原生会话与网页模拟账本隔离，手机接口不提供券商下单。普通引导、成员与基金问答使用 HarnessRouter；离线示例仅能在专业模式显式选择。

独立临时服务验证了配对、蓝图修订、旧草案拒绝、确认幂等、雇用与任命、指定成员问答、多席模拟审议、跨语言重试、网页账本隔离及断开后的 401。模型为明确的测试替身，未调用真钱或付费模型。

另把 7.335 秒 AAC/M4A 合成录音发送到已配对的手机识别接口，经真实本机 Whisper 返回 HTTP 200，约 5.236 秒完成推理，工作区未改变且临时目录已清理。该样本把“适中”识别成“市中”，因此保留先校对再发送。此证据验证 M4A 上传与服务端解码，不代表 iPhone 麦克风、系统权限或真人识别已经验收。

原生 Studio 和 Team 组件另通过 `react-native-web` 在隔离 Edge 的 390/320 CSS 像素、两种语言下完成 28 项控件与布局检查：两轮引导、蓝图修改、确认、模拟审议理由、招募、候补限制、任命、职责保存和指定成员对话。预览明确标注服务替身，测试未触发真钱。纯录音生命周期回归覆盖权限、音频配置与准备期间取消、卸载后迟到的转写、成功或失败后的音频清理。
