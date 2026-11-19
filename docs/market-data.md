# 基金研究中的日终数据

在网页的「基金广场」打开 VWELX 或 PSTKX，再展开「研究方法与公开来源」。VWELX 展示原基金的日终值。PSTKX 展示股票代理 VOO 的资料。中文、英文均可查看来源、定价日期、取数时间和发布进度。面板首次展开才发起读取，重新展开时依据有效期刷新。

## 数据来自哪里

| 记录 | 来源及口径 | 时间语义 |
| --- | --- | --- |
| VWELX 基金日终值 | [Nasdaq 公开的基金历史记录](https://www.nasdaq.com/market-activity/mutual-fund/vwelx/historical) 的 Close/Last | 公开记录对应的市场交易日 |
| VYM、VCIT、VOO 收盘价 | [Nasdaq ETF 历史记录，以 VOO 为例](https://www.nasdaq.com/market-activity/etf/voo/historical) 的 Close/Last | ETF 交易价格对应的收盘日 |
| 四支基金的发行方净值 | Vanguard 公开产品页的 navPrice、navPriceAsOfDate，以 [VWELX](https://investor.vanguard.com/investment-products/mutual-funds/profile/vwelx) 和 [VOO](https://investor.vanguard.com/investment-products/etfs/profile/voo) 为例 | 发行方发布的 NAV 日期，可能比交易所晚 |
| 已配置的 Alpaca 盘中行情 | 本机已有的 `GET /api/market/snapshot?symbol=…`，显示 bid/ask、报价时间和 IEX、SIP 或 delayed SIP 数据源 | 行情发生时刻及读取时刻。延时 SIP 单独标明。[Alpaca 数据源说明](https://docs.alpaca.markets/us/docs/historical-stock-data-1) |
| 复刻历史或情景回放 | 研究页逐期列出的发行人总回报来源，或明确标注的合成情景 | 研究窗口固定，以同一期两端点计算 |

## 只读接口与刷新

`GET /api/market/reference?symbol=VWELX` 接受 VWELX、VYM、VCIT、VOO。每条 observations 记录分别给出 provider、kind、sourceUrl、valueUsd、asOf、retrievedAt、attemptedAt、timeZone、marketSession、delayStatus、expectedAsOf、status、reason、error、cacheExpiresAt 和 executionEligible。时间戳是 UTC ISO 格式，日终定价日期属于纽约交易日。顶层复制最新日期的可用记录。同日优先成功刷新的来源；再并列时，共同基金优先发行方 NAV，ETF 优先交易所收盘价。展示区逐条列出两家来源，各保留自己的单位和时点。

| 状态 | 含义 |
| --- | --- |
| current | 该来源已经覆盖最近一次常规收盘 |
| stale | 来源日期早于最近收盘日；新一日刚收盘、发行人尚在计算净值也会出现该状态 |
| unverified | 保留的资料日期仍与最近收盘一致，本次刷新失败 |
| unknown | 日期超出已核对的交易日历，可读取来源原值 |
| unavailable | 该来源尚无可验证记录，数值和定价日期为空 |

按来源和代码合并并发请求。成功响应在进程内保留 10 分钟，失败后最多等 1 分钟再尝试；跨越收盘时点会触发新一期查询。上游故障、数据回退或格式变化时保留本进程上次成功取得的值及原始时间，重启后要重新取数。每个固定来源的服务器请求限时 8 秒，文档最多 1 MB，禁止重定向。只发送公共请求头。

纽约交易时段使用 IANA 时区和交易所正式公布的 2026–2028 休市及提前收市日。临时停市和后续年度需要更新该日历。公开日终资料仅供研究，每条记录的 executionEligible 均为 false。原有订单路径使用独立权限和更新的报价，执行校验包含时间戳、买卖盘、市场时钟和账户复核。[NYSE 交易日历](https://www.nyse.com/trade/hours-calendars)

## 复核方法

服务启动后可在 PowerShell 执行以下命令。将端口换为当前实例的端口。

```powershell
$report = Invoke-RestMethod 'http://127.0.0.1:3331/api/market/reference?symbol=VWELX'
$report.observations | Select-Object provider, kind, valueUsd, asOf, retrievedAt, expectedAsOf, status, error, executionEligible
node --test --test-isolation=none test/market-freshness.test.mjs
```

可演示当天日终值的验收条件是至少一条独立记录的 status 为 current，且 asOf 等于 expectedAsOf。旧值和故障应按上述状态如实显示。在同一有效期内打开两次，retrievedAt 应保持相同。实时源日后修订数据时，以各来源当时返回的日期和数值为准。

2026-11-18 03:11 ET 通过 Node 实取的样本如下，最近已完成交易日为 11 月 17 日。

| 代码 | Nasdaq 11 月 17 日日终数值（美元） | Vanguard 11 月 16 日 NAV（美元） |
| --- | ---: | ---: |
| VWELX | 45.82 | 46.13 |
| VYM | 161.18 | 162.93 |
| VCIT | 78.68 | 78.66 |
| VOO | 673.19 | 679.96 |

隔离实例的 Edge 桌面中文与窄屏英文验收分别打开 VWELX 和 VOO。展开前无取数，连续展开两次只产生一次网络请求，两个来源各自的日期和数值可见。
