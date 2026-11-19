# Morrowfolio for iPhone and iPad

这是独立 React Native / Expo 58 客户端，使用原生 View、Text、Pressable、录音和系统 TTS；没有 WebView。当前原生交付目标仅 iPhone/iPad，Android 工具缓存和早前工程不再继续构建。

## 当前可验证范围

- Studio：自然对话、修改和确认蓝图、员工招募、岗位与职责设置、指定成员聊天、团队审议与独立模拟成交。
- Funds：市场基金/人物风格目录、官方资料、独立模拟买卖、价格实验、经理聊天。
- 中文 / English 本地记忆，历史聊天与账本不翻写；失败重试在切语言后仍使用同一操作编号。
- AAC/M4A 录音最多 30 秒，先转写、可编辑、用户确认才发送。取消、切语言、卸载会终止旧录音并清理文件。TTS 使用所选语言。
- SecureStore 保存 12 小时专用 Bearer 会话；配对码 5 分钟、最多 8 次、一次性。手机会话与网页/券商隔离；Harness 密钥始终留在电脑。

Windows 已验证 iOS Hermes JS 导出、TypeScript、后端与录音生命周期回归，以及相同组件的 RN Web 320/390/iPad 尺寸交互。真实 M4A 已通过本机 Whisper 解码和转写。RN Web 使用明确标注的服务替身，不能称为 iPhone、iOS 模拟器、真人录音或签名 IPA 验收。真实手机上的权限、音频与系统键盘仍需连接设备验证。

## 安装锁定的开发依赖

在本目录运行 `node scripts/bootstrap.mjs`。这只准备用户缓存中的 npm；不改系统 PATH 或注册表。随后用该命令输出的 npm 路径执行 `ci --no-audit --no-fund`。

```powershell
node scripts/bootstrap.mjs
$npm = Join-Path $env:USERPROFILE '.cache\morrowfolio-mobile\npm-12.2.2\package\bin\npm-cli.js'
node $npm ci --no-audit --no-fund
node node_modules/typescript/bin/tsc --noEmit
```

## 免费 Expo Go 开发体验

普通 Apple ID 可先走 Expo Go 开发体验，不需要把 TestFlight 当作前置条件。电脑 Expo CLI 和 iPhone/iPad Expo Go 必须登录**同一个 Expo 账号**。本机未预置 Expo 登录，脚本会打开官方浏览器登录；不要把账号密码发进聊天。

```powershell
# 只登录并核本地 bundle；未指定私网地址时不声称手机可达
.\start-ios.ps1

# 手机和电脑已在同一受控 LAN/Tailscale 后，再明确指定电脑的私网地址
.\start-ios.ps1 -PrivatePackagerHost <电脑私网IPv4>
```

手机打开 Expo Go 并登录同一账号，再扫描 CLI 二维码。开发 server 成功启动不等于手机已可打开。Expo Go 预览也不等于独立已签名 App。

## 手机到 AI 后端

`start-backend.ps1` 在独立 loopback 端口 3318 启用一次性配对，并通过正式 dev.ps1 保留已有 Harness/Whisper 配置，券商默认关闭。它在本机控制台显示配对码；不要把该码写入源码、日志或公开网址。

```powershell
.\start-backend.ps1
# 另一终端，仅开启 loopback 的移动接口网关
node scripts/mobile-gateway.mjs
```

网关默认 127.0.0.1:3320，只允许 `/api/mobile/pair`、`state`、`action`、`disconnect`、`voice/transcribe`；不转发网页、普通 API、券商、Cookie、跨站 Origin 或任意代理目的地址。它不会自行启用 Tailscale Serve、TLS、ACL 或公网隧道。

iPhone 不能把电脑 127.0.0.1 当成后端。可选方案是设备加入同一私人 Tailscale，再经明确授权的私人 HTTPS Serve 仅代理上述网关；或提供既有受控 HTTPS 反向代理。当前只读检查 Serve 配置为空，尚未启用任何手机 HTTPS 端点。没有配置前只能如实交付本地组件/导出验收，不能称完整真机 AI 链路已通。生产连接仅 HTTPS；不要把开发 HTTP 例外编入 release。

## iOS 导出和未来独立分发

```powershell
$env:EXPO_PUBLIC_PREVIEW = '0'
$env:EXPO_PUBLIC_ALLOW_LOCAL_HTTP = '0'
node node_modules/expo/bin/cli export --platform ios --output-dir dist-ios
```

`dist-ios` 是 JS/Hermes 和资源导出，**不是 IPA**。Expo 官方 prebuild 在 Windows 会跳过 iOS native 工程；未绕过该检查。将来可在 macOS/Linux 运行 `expo prebuild --platform ios --no-install`，或由 EAS 的 macOS 构建机按本仓库 Expo 配置生成原生工程（CNG）。本机没有 Xcode/Mac，也没有付费 Apple Developer 身份，尚未运行云构建、注册 EAS 项目或上传源码。

`eas.json` 已准备 iOS `simulator`、`preview`（内部签名）和 `production`（App Store/TestFlight）profile。后两者需有权创建签名凭据的 Apple Developer 身份；生产提交前还需实际 App Store Connect 应用和审查资料。不要把 Apple 私钥、Provisioning Profile 或 EAS token 放在 `.env.example` 或源码。

## 验证命令

根目录 `node --test`；本目录 `node node_modules/typescript/bin/tsc --noEmit` 和上述 iOS 导出。RN Web 组件预览使用 `EXPO_PUBLIC_PREVIEW=1`、`expo start --web --localhost --port 8085`，带服务替身和非设备验收水印；正式导出须为 `0`。

官方依据（2026-11-17 核查）：[Expo Go 同账号要求](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/)、[EAS 配置](https://docs.expo.dev/eas/json/)、[iOS 设备签名权限](https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/)、[内部测试分发](https://docs.expo.dev/build/internal-distribution/)。
