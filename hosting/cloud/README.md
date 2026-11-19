# Fund Edition 云端运行包

把交付压缩包解到独立的空目录。目录顶层有 Dockerfile、railway.json、服务器入口及已编译的网站。云端直接运行 Node.js 24，家庭电脑可以关机。网页提供匿名访客、独立草稿、模拟基金与双语经理对话。

## 启动设置

| 设置 | 值和用途 |
| --- | --- |
| HTTPS 域名 | 设置 `FUNDROOM_PUBLIC_ORIGIN` 为最终域名的 HTTPS origin，例如 `https://fund.example.com`。Railway 也可自动读取它分配的 `RAILWAY_PUBLIC_DOMAIN`。 |
| 密钥 | 将本产品的 `HARNESSROUTER_API_KEY` 填入云供应商的服务器 Secret。应用已固定 Fundroom 的 Harness 和 DeepSeek 模型。 |
| 数据 | 在 `/data` 挂载一块专属持久卷，运行一个实例。模拟空间、账号和会话保存在这个卷中。 |
| 网络 | 负载均衡器终止 HTTPS，将流量转发到容器的 `PORT`。服务监听 `0.0.0.0`，镜像默认端口为 3000。 |
| 健康检查 | `GET /healthz` 验证迁移后的 SQLite 库可读，返回 `{"ready":true}`。 |
| 模型额度 | 服务器环境变量 `FUNDROOM_MODEL_30D_LIMIT` 默认为 300。值为 0 时暂停新模型任务。公开示例和私人对话使用同一份持久计数，同时最多 4 个任务。 |
| 设备听写流量 | `FUNDROOM_DEVICE_DOWNLOAD_MIB_PER_MONTH` 默认 4096，在 UTC 自然月内按每次可选模型文件下载的完整体积预留。重复下载与中断会消耗预留额度。影片、网页、计算和数据库仍计入平台用量。 |

在 Railway 上使用解压目录作为唯一部署源，选择已有或新建的单实例服务，启用公共 HTTPS 域名，并在首次启动前配置密钥和持久卷。若平台以 root 挂载卷，可按官方文档设置 `RAILWAY_RUN_UID=0`。启动器会先处理 `/data` 的写权限，再降为镜像中的 node 用户运行应用。费用取决于平台当前计划与使用量。[Railway 卷权限](https://docs.railway.com/volumes) · [Railway 健康检查](https://docs.railway.com/deployments/healthchecks)

## 运行与核验

已有 Docker 主机可以从解压目录构建镜像。在启动 shell 环境中提供密钥和正式域名，再由既有 HTTPS 反向代理连接本机端口。

```sh
docker build -t fund-edition-direct .
docker run -d --name fund-edition-direct -p 127.0.0.1:3000:3000 --mount source=fund-edition-data,target=/data --env FUNDROOM_PUBLIC_ORIGIN --env HARNESSROUTER_API_KEY fund-edition-direct
```

打开正式域名下的 `/studio`，以新访客选择一条建议，再追问一次。核对两条不同的 HarnessRouter 回执，立即刷新检查同一会话和空草稿。重启云实例后，再从同一浏览器打开会话确认持久卷生效。健康检查本身不会向模型发请求。

Linux 云包使用浏览器朗读、随站首问录音及兼容设备的按需本地听写。它运行模拟基金，券商下单入口关闭。桌面启动检查只能验证应用本身，Railway 的 0.5 GB Linux 配额、并发峰值和实际月用量仍需在授权部署后测量。

项目根目录运行 `node scripts/package-direct-cloud.mjs` 可从源码重建。提供 `--worker` 加已验收的编译文件路径可封装正式发布所用的同一份网站成品。输出为 `release/cloud/fund-edition-direct.tgz`。

审阅中使用 `--candidate` 生成单独的 `release/cloud/local-candidate-not-approved/fund-edition-candidate.tgz`。该目录仅供本地验收，尚未获准发布。发布前应在云账户核对适用的月用量硬限及告警，按计划验证到 HarnessRouter 的出站 HTTPS、持久卷、备份恢复和入口层防护。[Railway 费用控制](https://docs.railway.com/pricing/cost-control)
