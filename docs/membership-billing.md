# 高级 AI 团队会员收款

## 访客测试付款

当所选期限已开通正式商品支付，价卡主按钮进入真钱购买，零扣款入口移到下方。沙盒通过专用测试账户验收，正式会员的购买和核对独立进行。

在正常会员价卡选择月期或年期，点「用 PayPal 测试付款」即可前往官方沙盒批准页。返回后可查看测试回执、到期日，回到「我的会员资格」仍可查看。遇到此前尚未完成的另一种期限，页面会列出原方案并提供撤换入口。无沙盒登录的演示可直接打开 `/checkout-test.html?mode=simulation`。页面显示「站内模拟」，由访客点击确认。测试订单使用独立 SQLite 表及专用 HttpOnly cookie。正式收款及已有账单从价卡下方的「正式购买与我的订单」进入。

要使用官方沙盒，在服务端设置同一 PayPal Sandbox REST 应用的 `FUNDROOM_PAYPAL_SANDBOX_CLIENT_ID`、`FUNDROOM_PAYPAL_SANDBOX_CLIENT_SECRET`。测试买家使用独立的沙盒 Personal 账号在 PayPal 批准一次性订单，返回本站后服务端提交 capture，并核验订单归属、金额、币种及完成状态。沙盒暂时不可用时可手动改选站内模拟。两种模式发放的测试权益均与正式会员独立。[PayPal Orders v2](https://developer.paypal.com/docs/api/orders/v2/) · [沙盒测试账户](https://developer.paypal.com/tools/sandbox/accounts/)

## 当前销售 · 个人 PayPal 一次购买

正式收款支持个人卖家提供的商品与服务收款地址。卖家在自己的 PayPal 账户确认商业收款可用后，将公开的 PayPal.Me 主页写入 Railway 私有服务配置 `FUNDROOM_PAYPAL_ME_GOODS_URL`。系统按所选期限预填 `9.99USD` 或 `99.99USD`。买家在官方页面选择「商品与服务」，如果仅有亲友方式就退出。使用固定价可复用商品时，分别设置 `FUNDROOM_PAYPAL_MONTHLY_GOODS_URL`、`FUNDROOM_PAYPAL_YEARLY_GOODS_URL`，值为两个不同的 PayPal 官方 `/ncp/payment/…` 商品链接。发布前逐一核实收款人、币种、金额、商品与商业付款选项。[PayPal.Me 金额和币种](https://www.paypal.com/us/cshelp/article/paypalme-frequently-asked-questions-help432) · [PayPal 商品支付链接](https://developer.paypal.com/api/payment-links-buttons/)

买家在本站登录、确认付款邮箱，立即取得订单号和 PayPal 付款入口。付款有备注栏时填本站 FE 订单号；没有备注栏时，买家可以在「我的正式订单」登记 PayPal 交易号。运营用私有终端 `show FE-…` 查看待核对交易，在本人 PayPal Activity 查验交易类别、收款人、付款邮箱、金额、币种和完成状态。没有 FE 备注时还须通过 PayPal 交易记录中的付款人联系方式独立确认具体订单，无法确认则保留待核对。只有私有 `paid FE-…` 能发放正式会员。一个 PayPal 交易号仅能入账一次。撤单前核对真实到账，发现延迟付款应在 PayPal 对账处理。正式链接变更或停用时旧单仍可登记已付款交易号，旧地址从订单隐藏。

买家和卖家看到的同笔交易号不同。运营可在自己的 PayPal Activity 搜索买家提供的交易号，打开匹配的入账记录，同时独立确认付款人和 FE 订单，再于私有终端记入卖家一侧的交易号用于去重。无法搜索到款项或无法把款项与 FE 订单对应时，订单继续等待核对。[PayPal 交易号对照说明](https://www.paypal.com/pn/cshelp/article/why-are-there-different-buyer-and-seller-transaction-ids-for-the-same-transaction-ts2265?locale.x=en_PN)

### 未配置所选期限直付时的专属付款单

高级 AI 团队通行证一次付清 **US$9.99／一个月**或 **US$99.99／一年**，期满后由买家自行决定是否再次购买。买家先登录、选择期限，再提交专属付款单申请。运营在 PayPal 手工开具单客账单并核实到账后，系统发放完整期限。无需 PayPal 商业 REST 凭据。完整 Railway 服务默认接收申请；设置 `FUNDROOM_INVOICE_ORDERS=false` 可停止新申请，已付权益继续有效。

### 私有运营台

在 **fund-edition / production / fund-edition-web** 的 Railway SSH 私有终端中操作，镜像工作目录为 `/app`，数据库位于专用卷 `/data/fund-edition.sqlite`。本机演练使用独立临时数据库。公网没有管理员发票或开通接口。下列命令只更新本站订单；发送付款单或退钱须另在本人 PayPal 官方账户中完成。

| 操作 | 命令 | 核对内容 |
| --- | --- | --- |
| 查待办 | `node core/manage-invoices.mjs list` | 只读列出订单号、周期、状态和撤单申请。 |
| 认领 | `node core/manage-invoices.mjs claim FE-…` | 成功认领后才开票。重复认领会提示按 FE 号到 PayPal 查找原单，避免开两张。 |
| 查看客户 | `node core/manage-invoices.mjs show FE-…` | 私下核对买家指定的 PayPal 账户邮箱，避免复制到截图、日志或群聊。 |
| 记录已发 | `node core/manage-invoices.mjs attach FE-…` | 核对客户、总额与币种，在本人 PayPal 给该客户开单次发票。注明 FE 订单号。输入单据引用和专属发票分享链接。使用商品与服务付款请求时，只输入请求引用，买家会在自己的 PayPal 活动中看到它。 |
| 核实开通 | `node core/manage-invoices.mjs paid FE-…` | 在本人 PayPal Activity 核对 Completed、正确收款人、与申请相同的实际付款邮箱、FE 订单号、发票或请求引用、商品与服务类型、手续费前的准确 USD 金额及唯一交易 ID。亲友转账、待处理、截图或通知邮件均不能开通。 |
| 关闭未付单 | `node core/manage-invoices.mjs void FE-…` | 先在 PayPal 查找并取消所有已发账单，确认未收款后再执行。买家在受理前可撤回申请，受理后可通过订单申请撤单。 |
| 登记退款 | `node core/manage-invoices.mjs refund FE-…` | 在 PayPal 确认已全额退款或撤销，再登记原支付引用与唯一退款记录。重试不会重复核销。部分退款不在这项自动时长调整之内。 |

买家必须使用所填邮箱对应的本人 PayPal 账户付款，这样运营能对照实际付款人。本站只在订单所属账号及授权运营私有终端展示单据信息，公开页面不列个人收款邮箱。发票链接仅允许指向 PayPal 官方专属发票页。[PayPal 开具及分享发票](https://www.paypal.com/us/cshelp/article/how-do-i-create-and-send-an-invoice-help319)

时长从人工核实到账时开始。若有试用或已付时长，新订单会从已有有效期末接续。月底日期按 UTC 日历截断。提前全退第一单时，其他尚未开始的已付卡会提前接续，完整保留购买的月／年时长。已经开始或过去的使用区间不重新计算。只有在本人账户 Activity 核实的实际付款才计入收入。

回归命令为 `node --test --test-isolation=none test/invoice-membership.test.mjs`。公网演练可创建及撤回团队自己的申请；这一过程不会创建外部发票或触发任何 PayPal 扣款。

## 旧版 PayPal 自动续费兼容接口

这里记录原有的商户订阅接口。个人 PayPal 一次性购买期限是独立的收款流程。此次兼容修复只在本地商户替身上验收，未启用生产收款。

PayPal 月付为 **US$9.99**，年付为 **US$99.99**，按所选周期续订。新访客可先和 Maya 对话。选择购买后登录并进入 PayPal 审核金额、周期与商户。商户资料、卡号和买家密码由 PayPal 处理。已有 Stripe 会员继续使用自己的账单门户。

在台式机 PowerShell 的共享项目根目录运行 `.\scripts\setup-paypal-merchant.ps1 -Mode live`。它在本机隐藏输入 PayPal Business 的 Live REST 应用 Client ID 与 Secret，检查或建立软件服务产品、两个月期/年期计划及验签通知监听器，并通过 Railway CLI 标准输入把六项变量写至 **fund-edition / production / fund-edition-web**。已存在并通过金额检查的计划可复用。脚本使用 `--skip-deploys`，不会购买会员、执行扣款或触发部署。仅在商户负责人确认要在 PayPal 建立这些商品和通知后运行。若在开发商户进行验证，替换为 `-Mode sandbox`。沙盒与实收分别使用各自应用及凭据。商户身份验证、银行绑定和条款由账户持有人处理。

环境变量为 `FUNDROOM_PAYPAL_MODE`、`PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET`、`PAYPAL_MONTHLY_PLAN_ID`、`PAYPAL_YEARLY_PLAN_ID` 和 `PAYPAL_WEBHOOK_ID`。使用既有计划时可预先在该次进程环境中填入两个 Plan ID。完整 Node 启动器只允许这六个 PayPal 配置字段，前端仅接收支付服务名称、是否沙盒以及会员期限。正式应用的回调 URL 为 `https://fund-edition-web-production.up.railway.app/api/billing/paypal/webhook`。独立静态展示不包含 PayPal 商户配置。

服务器核对 PayPal 通知签名、订阅归属和账单交易。会员从实际完成的本期 USD 收款开始生效。停止续费后可使用至已付期末。已验签的当前付款退款或撤销会立即收回权益，即使随后暂时无法查询订阅。待批准的订单可按原周期恢复，待 PayPal 将其标为已取消或过期后，可重新选择周期。跨环境账单各自隔离，沙盒权益仅供测试。

运行 `node --test --test-isolation=none test/paypal-billing.test.mjs` 可以在本地商户替身复验。实际商户验收还需使用自己的 PayPal Sandbox 应用、测试买家和商户通知投递记录。商家后台和 API 说明见 [PayPal Live 应用](https://developer.paypal.com/dashboard/applications/live)、[订阅 API](https://developer.paypal.com/docs/api/subscriptions/v1/)、[订阅事件](https://developer.paypal.com/docs/subscriptions/reference/webhooks/) 及 [通知验签](https://developer.paypal.com/api/rest/webhooks/rest/)。

## Stripe 月付

软件订阅标价为 **US$9.99／月**。本机 3386 使用隔离的模拟订单。独立 Node 服务提供 Stripe 托管结账和账单管理，静态 Sites 候选提供会员介绍。2026-11-18 的联调使用本地商户替身，实际收款为零。

## 商户联调

1. 在商户自己的 Stripe 测试环境创建固定单价的周期价格，使用 USD、999 美分、每月一次、按席计费类型为 licensed、数量一。使用专属价格，让旧订单与新价格可以分别对账。在 Customer Portal 开放付款方式更新、查看账单、期末取消，关闭更换套餐与数量调整。
2. 为独立 Node 服务配置 HTTPS 域名及专用持久化 SQLite 卷，启用 `FUNDROOM_PUBLIC_HOSTED=true` 和 `FUNDROOM_PUBLIC_ORIGIN=https://你的域名`。生产服务和测试服务各使用独立数据库。图库审阅配置继续使用模拟订单。
3. 从商户密钥存储注入 `FUNDROOM_STRIPE_MODE=test`、`STRIPE_SECRET_KEY`、`STRIPE_MONTHLY_PRICE_ID` 和 `STRIPE_WEBHOOK_SECRET`。同一实例用相同环境的密钥、Price 及通知签名密钥。服务端固定以 Stripe API 版本 `2024-06-20` 读取账单和银行卡扣款记录。
4. 在 Stripe Workbench 注册 `POST /api/billing/webhook`。订阅 `checkout.session.completed`、`invoice.paid`、`invoice.payment_failed`、`customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted`、`charge.refunded`、`charge.dispute.created` 和 `charge.dispute.closed`。反向代理应保留原始请求正文与 Stripe-Signature。
5. 以两个测试账户走完结账、刷新、取消、恢复与付款失败。核对 Portal 只展示当前账号，模拟或测试订单不能给已过期的生产团队延长模型访问。服务器验证已付账单后显示有效期，未到账时仍可从资格页打开账单。只有产品负责人批准收费与发布后，才在正式商户、正式价目与正式卷上重新配置 live 模式，并用该商户完成独立验收。

访客可以先与 Maya 对话。直到进入真实收款步骤，服务才要求登录以便跨设备找回账单。回到站内的成功页只触发核对。订阅、账单明细与银行卡收款必须对应本站同一账户、商品、金额、币种、月份及有效期。Webhook 验签后的通知驱动服务查询当前商户状态，乱序通知不会将旧付款恢复为有效资格。对已取消、欠款、争议或退款的账户，仍保留自己的账单入口。测试商户的资格限于测试展示。

## 本地回归

运行 `node --test --test-isolation=none test/stripe-billing.test.mjs`。其测试数据与网络均独立于商户。完整发布前再运行仓库全套测试，同时核对 Stripe Workbench 的成功投递和真实测试商户账单，这两项须使用商户自己的环境完成。

商户配置及事件字段见 [Stripe Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions)、[订阅通知](https://docs.stripe.com/billing/subscriptions/webhooks)、[客户门户](https://docs.stripe.com/customer-management) 和 [固定 API 版本的账单对象](https://docs.stripe.com/api/invoices/object?api-version=2024-06-20)。
