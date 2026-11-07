# 额度、用量与套餐结构

插件的使用量数据有两个来源，回答的是两个不同的问题：

| 来源 | 回答什么 | 需要凭据 | 代码 |
| --- | --- | --- | --- |
| 本地账本 | 经本插件的请求，哪个模型花了多少 token、折合多少钱 | 不需要 | `src/usage-ledger.ts`、`src/ledger-store.ts` |
| 订阅额度 | OpenDesign 侧真实的 5 小时 / 7 天窗口还剩多少 | 需要（`vela` 或控制台会话） | `src/vela-billing.ts`、`src/usage.ts` |

前者是「我能操作的」，后者是「我实际被扣的」。两者不可互推，所以分开显示，不合并成一个数字。

## 套餐结构说明

Go 档月费 $10。官方[额度页](https://open-design.ai/model-credits/)给它的两个滚动窗口标了美元价，插件实际读到的是 credit 上限：

| 窗口 | 额度上限（`vela` 读数） | 官方页标价 |
| --- | --- | --- |
| 5 小时（18,000 秒） | 50,000 credits | $18 |
| 7 天（604,800 秒） | 150,000 credits | $55 |

两侧口径不同，这是本节唯一需要说清的事。页面把 5 小时窗口标成 $18、7 天标成 $55，而 `vela` 报的是 50,000 / 150,000 credits；相除得到 2,727–2,778 credits/美元，与插件采用的 10,000 差约 3.7 倍。

**为什么仍然用 10,000。** 三个证据指向它，只有一个指向页面数字：

- `billing summary` 在 2026-10-19 还答得出来时，直接报过 `creditsPerUsd: 10000`。
- 拿一串 DeepSeek 调用的 credit 增量除以它们的公开价成本（再乘额度页给的倍率），五次采样落在 **10,067–11,880**：flash 171 credits / $0.0317、60 / $0.0056，eco 101 / $0.0086、33 / $0.0032，glm-5.3-flash 94 / $0.0079。
- 两个窗口在 10,000 下互相印证（50,000/10,000 = $5，150,000/10,000 = $15），比例 3:1，与页面的 18:55 ≈ 3.06:1 吻合——两套数字的**比例**一致、**绝对值**差一个常数。

所以插件采用实测率，页面的美元标价只当参考。页面的 $220/月与 $55/周自洽（4 × 55 = 220），这反过来说明**页面的美元是另一种计价口径**，而不是 `vela` 的 credit 数算错了。

**结论：窗口的 credit 数字是硬约束，「月总额度」是宣传口径。** 插件按 10,000 credits/美元把窗口读数折成美元，所以设置页「月总额度 $X / $220」的百分比会偏低约 3.7 倍——百分比被低估，窗口读数本身准确。

因此插件**不做月消耗外推**。窗口是硬上限，一个月最多就是这四个窗口之和，线性外推到超过它的数字没有意义。插件只回答能操作的问题：照当前速度，这个窗口会不会在重置前用完。

引用代码里的原话（`src/client/usage-format.ts` 中 `daysToExhaust` 的注释）：

> A monthly projection from the recurrent windows is not just imprecise, it is misleading: the windows are hard caps, so the sum of them over a month is what a subscription can ever spend, and a projection that exceeds it reads as spendable headroom that does not exist.

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

价格来自官方公开价目表的基础档（`src/pricing.ts` 的 `BASE_PRICES`，快照日期 2026-11-07，与线上 41 条一一对应），按每百万 token 计：

```
成本 = 输入 token × input + 输出 token × output
     + 缓存读 token × cacheRead + 缓存写 token × cacheWrite
```

两条必须说清的局限：

1. **只有基础档**。线上接口有 9 条带 `longContext` 阶梯（例如 `gpt-6.1-terra` 在 272,000 输入 token 之上价格翻倍），而 `ModelPrice` 没有第二个档位的字段，所以这些模型按基础价记录。超出阶梯阈值的长上下文请求会被低估。因此每份报告都标 `pricedAs: 'base-tier'`，而不是当作账单呈现。
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
| 输入框胶囊 | `5h 62% · 7d 88%`：两个窗口的剩余百分比，按最差窗口着色；点开是明细面板 |
| 订阅额度 | 每个窗口一条：标签、重置倒计时、进度条（按**剩余**百分比绘制）、剩余百分比、剩余/总额金额（按 credits 折算） |
| 速率提示 | 「照此速率约 N 天用完」，只在已消耗时给出；零消耗时报「0 天」会被误读成立刻耗尽 |
| 钱包 | 余额、周期结束日、「额度用尽后按量付费」 |
| 本地用量 | 近 30 天请求数、估算金额、每模型 token 与金额 |
| 已扣与实测 | 本周期已扣多少美元、经本插件多少美元——只陈述两个独立事实，**不给比值** |

最后一条的理由写在 `QuotaCard.tsx` 的注释里：计划侧数字覆盖整个窗口的所有客户端，实测侧只覆盖本插件服务的请求，两者相除得到的是「插件承担了多小一部分流量」，不是任何计价差异。早期版本显示过 141.9x 这种比值，它不说明任何真实信息。

进度条按剩余百分比绘制，因为 OpenDesign 控制台本身报「剩余 88%」；用已用占比绘制会让同一数据在两个界面呈现相反的观感。配色阈值：剩余 ≤ 25% 变黄，≤ 5% 变红。

窗口标签由 `durationSeconds` 反推（18,000 秒 → 「5 小时」，604,800 秒 → 「7 天」），不硬编码，套餐改窗口长度时描述自动跟随。胶囊里为省地方用缩写（`5h` / `7d`），规则同一套，见 `compactWindowLabel`。

## 输入框胶囊

会话输入框右侧常驻一枚胶囊（宿主 slot `conversation.input.right`），由 `src/client/UsagePill.tsx` 实现。

- **数据来源**：宿主本来就把每轮读数写进配置的 `usageJson`，胶囊只解析这份文档。它不自己轮询、不开第二条传输，所以不增加请求。
- **显示条件**：当前会话选中的是本插件的模型、插件启用、`composerUsage` 打开、且至少有一个窗口报了可用的百分比。没有读数时整枚胶囊不渲染，不留空壳。
  - 模型这一条不是装饰：别的 provider 花的是另一份额度，把自己的数字摆在别人的请求旁边会误导。判定读的是会话的模型目录（`modelDirectories.directoryFor(sessionId)`）的当前选择，选择别的模型时胶囊消失、换回来立刻恢复。
  - 该服务只在需要时注入，缺失时不注册胶囊而设置页照常可用——一个可选界面不该拖垮修配置的入口。
- **着色**：取两个窗口里最差的那个，沿用设置页同一组阈值（≤ 25% 黄，≤ 5% 红）。
- **面板**：点开显示每窗口的进度条、剩余金额、重置倒计时，以及钱包余额与「读取于」时间；数据过期（上次读取失败）时会明说，不给陈旧数字装新。
- **刷新**：面板里的按钮写 `refreshNonce`，宿主观测到变化就立刻读一次。这与设置页的刷新按钮是同一条路径，没有第二套机制。
