# 四种基金对话的速度与内容验收

2026 年 11 月 18 日太平洋时间，本机应用通过正式 HarnessRouter 和同一 DeepSeek Flash 模型，对四道固定问题各做两次。首发与候选各八个真实回答，包含倒序运行。使用同一份 2017 历史决议、Wellington 研究、访客意图和员工职责。每次使用独立请求号。计时从角色函数接到问题开始，到收齐并验证可展示的回答结束。客户端绘制、语音起声和网络首个 token 单独衡量。

| 对话及实际问题 | 首发两次 / 秒 | 候选两次 / 秒 | 人工核对 |
| --- | --- | --- | --- |
| Maya · 用模拟盘研究消费股现金流，先暂停买卖，请谁做什么 | 13.93、16.42 | 7.81、8.97 | 候选点名 Jules，区别可持续现金流与一次性改善，保留待确认的人事与买卖边界。 |
| 企业研究员 · 买进零售企业前，入职第一项工作是什么 | 9.96、15.69 | 7.58、7.85 | 从岗位职责提出核对库存与经营现金流。回答标明当前没有特定标的资料，买入仍暂停。两次完整回答变短，英文首句仍可能较长。 |
| Wellington 研究经理 · 股债怎样配比，遗漏什么 | 16.96、13.67 | 8.70、8.32 | 两次均辨明 65/35 研究代理、NAV 总回报和未覆盖的主动选股或择时。 |
| 巴菲特风格经理 · 这次为何只投两成 | 29.52、22.83 | 9.43、9.70 | 两次都从对应会议引用经营、估值和风险证据，指出维护性资本支出未披露，完整保留原决议与实盘外的独立模拟成交。 |

在这组小样本中，完整回答耗时中位数从 **16.05 秒降至 8.51 秒**。以字符计的回答长度中位数从 431.5 降至 225，首句长度中位数从 156.5 降至 76.5。结果来自四个场景和一个网络环境；在线负载、用户问题和语言都会改变等待时间。应用在完整答复通过检查后再显示正文。

## 改动与退回

对口头问答采用供应商按请求设置的 `reasoning.effort=none`，由应用传递本工作区、岗位和选定决议的上下文，提示先说直接答案。发送给目录经理的材料去除了重复的语言表和美术字段。成交授权、盲测投委会和前向投资决策继续使用原先的独立研究工作流。目录问答补上了与访客和请求绑定的幂等键。

前两个候选加入供应商用户 ID 后触发了长期记忆工具，部分响应返回 `incomplete` 与函数调用；系统拒收，未把失败当成回答。HarnessRouter 的技术说明指出 API key 请求省略 `user` 会关闭长期记忆。入选路径据此不传用户 ID 或上轮供应商响应号，仍拒收工具和外部注释。[HarnessRouter 请求参数](https://harnessrouter.ai/docs/request-options) · [记忆作用域](https://github.com/HarnessRouter/harnessrouter/blob/main/docs/self-hosting-guide.md#memories)

另一个候选虽然快，却将 Wellington 的含分配再投资净值研究称为价格回报。修订后以这只基金的实际研究口径为准，重新执行同题两次，并用[原策略规则](../web/strategy-playbook.mjs)核对两次正式结果。表内目录数据使用修订后的两次测量，前三个未采用的候选记录同时保留。

## 复核

从项目根运行 `node scripts/check-role-responses.mjs baseline` 或 `node scripts/check-role-responses.mjs candidate`。两者都需要服务器授权的 Harness 凭据，前者会从冻结的首发包解出原代码。可加 `--reverse` 倒序或 `--role=catalog` 单独回归一席。

- 首发原始回答：[正序](../release/review-web/role-response-checks/baseline-1795059283987.json) · [倒序](../release/review-web/role-response-checks/baseline-1795059699338.json)。
- 入选候选、含逐问用时与真实回执：[倒序](../release/review-web/role-response-checks/candidate-1795059665819.json) · [正序](../release/review-web/role-response-checks/candidate-1795059771483.json)。这两份记录中的目录答复已退回，最终采用[目录复核一](../release/review-web/role-response-checks/candidate-1795059828937.json)与[目录复核二](../release/review-web/role-response-checks/candidate-1795059837906.json)。
- 拒收与中间试验：[low + 供应商记忆](../release/review-web/role-response-checks/candidate-1795059404608.json) · [none + 供应商记忆](../release/review-web/role-response-checks/candidate-1795059506313.json) · [短首句提示调整前](../release/review-web/role-response-checks/candidate-1795059599315.json)。
