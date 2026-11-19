# Fund Edition 网页云运行包

这个包运行与本机完整版相同的 `web/`、`server.mjs` 和 `core/*.mjs`。两个入口分别是 `/studio` 和 `/funds`。从名家风格基金进入巴菲特，可逐期核对历史模拟决策、独立成交和证据，再问当期的 AI 经理。

## 运行

需要 Node.js 24、一个固定的 HTTPS 地址和单实例专属持久卷。解压后的目录可直接执行 `node start.mjs`，也可用随附的 Dockerfile 构建。容器工作目录为 `/app`，使用非特权用户 node。挂载卷的属主要允许 UID 1000 写入。自托管应由 HTTPS 反向代理转发至服务，并保留浏览器 Host。容器的 `PORT` 默认 3000，`GET /healthz` 读取 SQLite 确认就绪。持久卷需包括数据库与同目录的 SQLite WAL 文件。用 SQLite 在线备份或停服后备份整个卷。

| 服务器变量 | 用途 |
| --- | --- |
| `FUNDROOM_PUBLIC_ORIGIN` | 唯一 HTTPS 来源，如 `https://fund.example.org`。也支持平台提供的 `RAILWAY_PUBLIC_DOMAIN`。 |
| `FUNDROOM_HR_KEY` | 通过托管平台的私有 Secret 注入本产品专属密钥。空值时仍可看网页、研究档案及使用明确标示的情景演示，在线模型显示未连接。 |
| `FUNDROOM_DB_PATH` | 默认 `/data/fund-edition.sqlite`。部署到本地已有服务旁须指定单独文件。 |
| `FUNDROOM_MODEL_30D_LIMIT` | 全站滚动 30 天任务上限，默认 300。置零即暂停新模型调用。重启后保留计数。 |
| `FUNDROOM_HOURLY_AI_TASKS` | 全站滚动一小时上限，默认 40。 |
| `FUNDROOM_AI_CONCURRENCY` | 同时允许的会话任务，默认 2。 |
| `FUNDROOM_GUEST_AI_DAILY_LIMIT` | 匿名对话全站日上限，默认 80。每个访客另有 8 次，每网络每日 24 次。 |
| `FUNDROOM_RAILWAY_EDGE_ONLY` | 默认关闭，使用直连地址限流。在 Railway 控制台确认本环境只有本站服务、公共入口只有平台生成的 HTTPS 域名、TCP 代理为零后，可显式设为 `true`。此时经所配域名进入的请求按平台提供的客户端地址分配额度。 |

Railway 的公开 HTTP 边缘会覆盖 `X-Real-IP`，私网和 TCP 流量会跳过这一步。在增加其他私网服务、TCP 代理或更换入口前，先关闭上述开关。未满足启动或请求条件时，服务仍按直连地址限流；全站模型预算独立计算。 [Railway 公网请求头](https://docs.railway.com/networking/public-networking/specs-and-limits) · [Railway 入口的可信范围](https://station.railway.com/questions/need-authoritative-client-ip-proxy-tru-090eac86)

两个基金入口均使用模拟账户。部署入口不接收家庭交易账户、券商或支付密钥，只向应用传递上表设置和固定的基金 Harness。会员功能展示产品计划；此包不收款。语音依赖客户端支持和权限，启动器不调用桌面语音进程。账户、访客、注册后的草稿、模拟记录、模型额度及回执存于同一专属 SQLite 卷。

本地重建命令为 `node scripts/package-full-cloud.mjs`，输出到 `release/cloud/full-web/`。包内 `manifest.json` 列出应用文件的 SHA-256。核验脚本解包运行并重启独立监听实例，验证真实完整站点的静态、来源限制、访客、持久化和模型额度。托管平台接入、域名证书和公网浏览器录音需在指定域名验证。
