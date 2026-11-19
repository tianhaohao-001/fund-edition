# Alpaca 单用户交易控制台

`/broker.html` 提供独立的 Alpaca Paper 和 Alpaca Live 交易操作。它直接使用本机配置对应的个人 Alpaca 账号。My Fund 的模拟组合、Strategy Lab 的共享组合和定时回放使用各自的内部账本。

## 启用

1. 在交易电脑本机启动 Fundroom，保留默认 loopback 监听。浏览器使用该电脑的 `http://127.0.0.1:3000/broker.html`。公开回放实例禁用券商操作。
2. 在交易电脑的进程环境或本机 `.env` 配置 `ALPACA_DATA_KEY_ID`、`ALPACA_DATA_SECRET_KEY` 和 `ALPACA_DATA_FEED`。可选实时 IEX 或 SIP，权限需要由 Alpaca 账户提供。IEX 只代表单一交易所。 [Alpaca 报价接口](https://docs.alpaca.markets/us/reference/stocklatestquotesingle-1)
3. 生成 32 字节随机操作口令，并放入本机配置的 `FUNDROOM_BROKER_OPERATOR_TOKEN`。下列命令生成 Base64URL 字符串。控制台使用口令验证每个请求。

   ```powershell
   node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

4. 按环境选择下列配置。所有登录凭据留在该电脑。纸账户、实盘、行情使用不同的密钥。

   | 用途 | 环境变量 |
   | --- | --- |
   | Alpaca Paper | `ALPACA_PAPER_TRADING_ENABLED=true`、`ALPACA_PAPER_TRADING_KEY_ID`、`ALPACA_PAPER_TRADING_SECRET_KEY`、`ALPACA_PAPER_ALLOWED_SYMBOLS`、`ALPACA_PAPER_MAX_ORDER_USD` |
   | Alpaca Live | `ALPACA_LIVE_TRADING_ENABLED=true`、`ALPACA_LIVE_TRADING_KEY_ID`、`ALPACA_LIVE_TRADING_SECRET_KEY`、`ALPACA_LIVE_ALLOWED_SYMBOLS`、`ALPACA_LIVE_MAX_ORDER_USD` |
   | 独立券商日志 | `FUNDROOM_BROKER_DB_PATH`，默认 `.fundroom/broker-v1.sqlite` |

   允许名单用逗号分隔，例如 `SPY,NVDA`。限额至少为 1 美元，Paper 上限可设到 25,000 美元，Live 上限可设到 10,000 美元。每次启动按新配置判断可用模式。

5. 打开控制台，输入操作口令，先选择 **Paper · simulated brokerage** 验证接口。启用 Live 后，平台会显示 **Live · real money**，确认词与 Paper 各自独立。带实盘交易功能的商业多用户部署还需要正式账户授权流程、Alpaca 准入与适用许可。 [Alpaca Connect OAuth](https://docs.alpaca.markets/us/docs/using-oauth2-and-trading-api)

## 下单与回执

- 只接受已启用名单内的美国股票或 ETF、整股、常规时段 DAY 限价单。Fundroom 在预览及确认时读取当前 Alpaca 账户、交易时钟、资产、未结订单和独立实时报价。买入受现金、购买力和限额限制。卖出要求券商账号处于 long-only 模式，并受可用持仓和限额限制。卖出实际成交额按市场执行，可能因价格改善超过按限价或预览报价计算的金额。 [Alpaca 订单参数和状态](https://docs.alpaca.markets/us/reference/postorder) · [Alpaca 账户配置模型](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/trading/models.py)
- 预览有效期两分钟。确认需要输入页面显示的完整操作词。报价价格、账号或订单状态变化需要重新预览。撤销也需要预览与自己的确认词。
- 点击 **Refresh broker status** 查询 Alpaca。若请求结果不明确，日志保留 client order ID。按该 ID 在 Alpaca 核对后刷新回执。未解决的提交会锁定该环境里同一账号的新提交，避免重复下单。撤销收到 Alpaca 接受响应后仍要等最终回执。 [按客户端编号查单](https://docs.alpaca.markets/us/reference/getorderbyclientorderid) · [订单撤销响应](https://docs.alpaca.markets/us/reference/deleteorderbyorderid-1)

## 验收状态

`node --test --test-isolation=none test/broker.test.mjs` 使用注入的 Alpaca 替身，核对默认禁用、跨环境与同源隔离、预览更改、下单与撤销、重复按键、网络歧义和重启恢复。测试不会访问券商网络。真实 Paper 回执、真实 Live 订单、OAuth 用户登录、入金和多券商连接尚未验收。

## 网页用户账户与机主券商权限

网页登录恢复当前用户的模拟工作区。要读机主的 Alpaca Paper 账户概要，必须从本机用独立操作员口令，在请求头 `X-Fundroom-Broker-Token` 中传递 `FUNDROOM_BROKER_OPERATOR_TOKEN`。普通注册、经理建议、历史持仓和工作室授权均不能提交券商订单。只有本机独立控制台在已配置的环境内具有预览和显式确认路径。账户与历史组合示例见 [账户及模拟账本](accounts.md)。

