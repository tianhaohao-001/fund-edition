# Maya 的中英文声音

Maya 的中文选用 Kokoro 的普通话女声 zf_006，语速系数 0.98。英文选用美式女声 af_maple，语速系数 0.99。中英文开场问题已分别制成 24 kHz 单声道录音。中文朗读会将 Maya 转成「玛雅」，页面拼写保持原样。两种候选声音使用相同台词进行对照，可直接试听。[中文成品](../release/review-web/maya-new-voice/maya-zh.wav) · [英文成品](../release/review-web/maya-new-voice/maya-en.wav) · [中文第二候选](../release/review-web/maya-new-voice/zh-b.wav) · [英文第二候选](../release/review-web/maya-new-voice/en-b.wav)

[语音审阅站](http://localhost:3394/?lang=zh-CN#/fund) 使用独立访客记录。点击 Maya 的扬声器即可朗读。工作室接待和建团后基金经理席的模型回复通过访客自己的会话、基金与已保存回执来取。浏览器把回执交给本站，服务端在自身 CPU 上合成声音。支持 Web Audio 的浏览器可边生成边听。点击停止或打开麦克风会结束播放。本地识别仍使用既有的 Whisper。原 3386 正在运行的服务也有新声开场及建团前 Maya 的完整录音，建团后其经理席使用已安装的设备语音。两个地址各有独立的审阅数据库。

独立 Node 云包安装同一套模型即可使用这组声音。仅有静态网页和 Worker 的部署可播放两段双语开场，后续优先选择设备安装的优质语音。浏览器没有相应音色时，回答保留文字。页面不会将聊天交给额外的在线语音服务。视口测试无法替代 iPhone 的扬声器听感。

## 在另一台电脑安装

使用笔记本连接台式机审阅服务时，模型由台式机运行。如果要在笔记本自己运行后端，在共享项目根目录使用 Python 3.13、PowerShell 执行：

```powershell
.\scripts\setup-narration.ps1
.\dev.ps1 -NarrationReview
```

安装脚本将固定版本的 sherpa-onnx 1.13.8 和模型放入用户缓存 `.cache/morrowfolio-voice`。下载的量化模型包约 147 MB，安装前会检查 SHA-256。开场录音已随项目分发。模型权重留在运行服务器，普通访客无需下载。服务与安装脚本可分别使用 `FUNDROOM_VOICE_HOME` 和 `-VoiceHome` 指向同一缓存。服务进程可通过 `FUNDROOM_VOICE_PYTHON` 指定 Python 解释器。

Kokoro v1.1-zh 模型标注 Apache-2.0，下载的模型包附有许可证。sherpa-onnx 使用 Apache-2.0。音色是通用合成研究音色。对应说话人编号分别为 8 和 0。[模型卡](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh) · [转换版本与音色表](https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese-English/kokoro-multi-lang-v1_1.html) · [sherpa-onnx 许可证](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE)
