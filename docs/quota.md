# 额度、用量与套餐结构

插件的使用量数据有两个来源，回答的是两个不同的问题：

| 来源 | 回答什么 | 需要凭据 | 代码 |
| --- | --- | --- | --- |
| 本地账本 | 经本插件的请求，哪个模型花了多少 token、折合多少钱 | 不需要 | `src/usage-ledger.ts`、`src/ledger-store.ts` |
| 订阅额度 | OpenDesign 侧真实的 5 小时 / 7 天窗口还剩多少 | 需要（`vela` 或控制台会话） | `src/vela-billing.ts`、`src/usage.ts` |

前者是「我能操作的」，后者是「我实际被扣的」。两者不可互推，所以分开显示，不合并成一个数字。

## 套餐结构说明

Go 档月费 $10，官方宣传「每月最高额度 $120」。实际生效的是两个滚动窗口：

| 窗口 | 额度上限 | 折算美元 |
| --- | --- | --- |
| 5 小时（18,000 秒） | 50,000 credits | $5 |
| 7 天（604,800 秒） | 150,000 credits | $15 |

换算率是 10,000 credits = $1。这个率由两个窗口独立印证（50,000/5 与 150,000/15 都等于 10,000），也和 `billing summary` 在同一时期返回的 `creditsPerUsd` 一致。

**结论：$120 是宣传口径的上限，月额度按周窗口的费率用不满。**

一个 7 天窗口给 $15，一年 52 周约 4.3 周/月，四周左右合计约 $65，只有宣传值的一半多。这不是插件算错，也不是网关的 bug——$120 是官方宣传值，真正的约束是 5 小时和 7 天这两个窗口。截图里「月总额度 $X / $120」之所以有富余，是因为分母用了宣传值，而实际流速被周窗口卡住。

因此插件**不做月消耗外推**。从周窗口线性推算月消耗只会报出约一半的宣传额度，看起来像还有大量余量，实际那个余量永远拿不到。插件只回答能操作的问题：照当前速度，这个窗口会不会在重置前用完。

引用代码里的原话（`src/client/usage-format.ts` 中 `daysToExhaust` 的注释）：

> A monthly projection from weekly windows is not just imprecise, it is misleading: Go grants $15 per week and advertises $120 per month, but 4.3 weeks of $15 is $65, so a linear projection reports roughly half the advertised cap and reads as unused headroom that the weekly window will never allow.

## 额度读取

### 通道一：`vela`（推荐）

勾选「使用本机 OpenDesign 的登录凭证读取额度」后启用。插件不存任何凭据，直接复用桌面端的登录态。

查找顺序（`src/vela-locate.ts`）：

1. 环境变量 `OPENDESIGN_VELA_PATH` 指向的路径（存在即用）；
2. 官方安装目录：

   | 平台 | 路径 |
   | --- | --- |
   | Windows | `%LOCALAPPDATA%\Programs\Open Design\resources\open-design\bin\vela.exe` |
   | macOS | `/Applications/Open Design.app/Contents/Resources/open-design/bin/vela` |
   | Linux | `~/.local/share/open-design/bin/vela` |

3. `PATH` 里的 `vela`。

官方安装目录优先于 `PATH`：只有它共享桌面端的登录态，`PATH` 里的可能是无关程序。候选目录刻意列得很短——这个模块会执行它找到的东西。

读取流程（`src/vela-billing.ts`）：

1. `vela team-projects list` 拿当前工作空间 ID（`billing summary` 不带这个字段，`funding-check` 又必须显式给）。配置里填了形如 24 位小写字母数字的 ID 时直接用配置值。
2. `vela billing funding-check --workspace-id <id> --format json` 拿 `codingPlan.windows`，每个窗口含 `usedCredits`、`limitCredits`、`remainingCredits`、`resetsAt`、`durationSeconds`。
3. 尝试 `vela billing summary` 与 `vela billing workspace-snapshot` 补钱包余额与 credits 汇率。这两个命令从 2026-10-19 起返回 403，失败时回退到文档常量 `FALLBACK_CREDITS_PER_USD = 10000`，而不是把每个窗口的金额留成无单位的 credits。

`vela` 是官方私有命令行，不是公开契约。所以每次读取都逐字段校验：

- 必填字段缺失的窗口被丢弃，不补 0；
- 一个窗口都没有时整次读取判为失败；
- 失败以带 `error` 的快照返回，页面显示失败原因，不是静默空白，也不是 0%。

调用超时 15 秒，窗口隐藏。

### 通道二：控制台会话

需要 `sessionRef`（默认引用名 `OPENDESIGN_SESSION`）+ `workspaceId`。默认关闭，因为控制台会话的权限远大于推理：它等于账号访问权，还会过期。

该通道只发两个 GET：

- `GET https://amr-api.open-design.ai/api/v1/workspaces/<id>/billing/coding-plan-usage`
- `GET https://amr-api.open-design.ai/api/v1/billing/summary?timeZone=Asia/Shanghai`

不写任何上游数据。失败一律降级成带 `error` 的快照，绝不阻塞推理。

## 本地用量账本

每次经本插件完成的调用都会记一行（`src/index.ts` 的 `recordUsage`）：

- 记录点在适配器，那里本来就拿到了精确的 token 用量，不需要事后扫会话；
- 存成 JSON Lines：`<DSH home>/dsh-opendesign-go/usage.jsonl`，中断最多损失最后一行，坏行跳过而不丢整段历史；
- 超过 4 MB 时重写压缩，超过 400 天的条目丢弃。

报告窗口是最近 30 天。每模型一行，按估算成本从高到低排序。

### 计价口径

价格来自官方公开价目表的基础档（`src/pricing.ts` 的 `BASE_PRICES`，快照日期 2026-10-19），按每百万 token 计：

```
成本 = 输入 token × input + 输出 token × output
     + 缓存读 token × cacheRead + 缓存写 token × cacheWrite
```

两条必须说清的局限：

1. **只有基础档**。公开接口不提供阶梯价，超出某模型阶梯阈值的长上下文请求会被低估。所以每份报告都标 `pricedAs: 'base-tier'`，而不是当作账单呈现。
2. **无价格的模型只计 token、不计金额**，并在报告里单列为 `unpricedCalls`。金额合计因此可能不完整，`unpricedCalls > 0` 时页面会写明。

这两点意味着：**这个金额不是账单，实际扣费以 OpenDesign 控制台为准。**

### 历史补算（默认关闭）

`recoveredEnabled` 打开后，插件扫描 `<DSH home>/sessions` 下的会话日志（zstd 多帧 JSONL），把未经本插件、但走同一订阅的调用补算进来，单列在报告的 `recovered` 字段里，**不并入** `calls`——两个总数回答不同问题，合并后的数字无法审计。

默认关闭的理由：这个扫描读遍本机所有会话。同一把 Key 被别的 agent 用过时结果偏低，多个工作空间共用时偏高，误差方向不确定。

补算结果在进程内缓存一次：扫描很贵（本机实测十几份日志、解压后数百 MB），而历史不会在进程运行期间变化，新调用由实时账本记录。

## 对账

「对齐当前周期」按钮会把当前最宽窗口的已用 credits 与本地实测成本记成基准点（`alignBaselineJson`）。之后页面显示**从该时刻起的增量**，并给出两者比值。

为什么需要基准点：套餐 credits 是窗口内累计值，包含本插件从未见过的流量（官方客户端、别的工具）；插件账本只覆盖自己服务的请求。只有从同一时刻起的增量才是两个来源在同一区间测得的同一量。

## 界面上的数字

| 位置 | 内容 |
| --- | --- |
| 订阅额度 | 每个窗口一条：标签、重置倒计时、进度条（按**剩余**百分比绘制）、剩余百分比、剩余/总额金额（按 credits 折算） |
| 速率提示 | 「照此速率约 N 天用完」，只在已消耗时给出；零消耗时报「0 天」会被误读成立刻耗尽 |
| 钱包 | 余额、周期结束日、「额度用尽后按量付费」 |
| 本地用量 | 近 30 天请求数、估算金额、每模型 token 与金额 |
| 已扣与实测 | 本周期已扣多少美元、经本插件多少美元——只陈述两个独立事实，**不给比值** |

最后一条的理由写在 `QuotaCard.tsx` 的注释里：计划侧数字覆盖整个窗口的所有客户端，实测侧只覆盖本插件服务的请求，两者相除得到的是「插件承担了多小一部分流量」，不是任何计价差异。早期版本显示过 141.9x 这种比值，它不说明任何真实信息。

进度条按剩余百分比绘制，因为 OpenDesign 控制台本身报「剩余 88%」；用已用占比绘制会让同一数据在两个界面呈现相反的观感。配色阈值：剩余 ≤ 25% 变黄，≤ 5% 变红。

窗口标签由 `durationSeconds` 反推（18,000 秒 → 「5 小时」，604,800 秒 → 「7 天」），不硬编码，套餐改窗口长度时描述自动跟随。
