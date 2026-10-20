# OpenDesign Go for DSH

在 DSH 里使用 OpenDesign Go 订阅的 12 个模型：推理走 OpenAI Chat Completions 协议，额度、用量和多账号都在设置页里。

## 关于作者

交易员，业余写工具。这个插件起源于我自己拿 DeepSeek 做量化策略研究和复盘时的需要。

| 平台 | 地址 |
| --- | --- |
| 知乎 | [勇者别嚣张](https://www.zhihu.com/people/yong-zhe-bie-xiao-zhang) |
| YouTube | [@valortrader](https://www.youtube.com/@valortrader) |
| B站 | [勇者别嚣张的交易室](https://space.bilibili.com/10323235) |
| 微信公众号 | 勇者别嚣张的交易室 |

## 功能

| 功能 | 说明 |
| --- | --- |
| 接入 Go 套餐 | 注册一个 `dsh-opendesign-go` provider，提供 Design Plan 的 12 个模型 |
| 用量统计 | 记录每次经本插件发出的请求，按模型汇总输入/输出/缓存 token，并按各厂商公开单价估算成本 |
| 额度读取 | 勾选后调用本机 OpenDesign 桌面端自带的 `vela` 命令行，读取真实的 5 小时 / 7 天额度窗口 |
| 多账号 | 每个账号对应一份独立的 OpenDesign 订阅，每份一把 API Key；可开启失败自动切换 |
| 每模型参数 | 为单个模型覆盖上下文窗口与 `max_tokens` 上限 |
| 模型开关 | 取消勾选的模型不出现在会话的模型选择器里 |
| 图片输入 | 声明了 `image` 模态的模型可以接收图片；文本模型收到的是占位文本 |

所有用量数字都标注了口径。金额按官方公开价目表的**基础档**估算，超出阶梯阈值的长上下文请求会被低估；这不是账单，实际扣费以 OpenDesign 控制台为准。

多账号的要点：每个账号对应**一份独立的订阅**。同一工作空间内的多把 Key 共享同一份额度，所以多账号的意义是「多买几份 Go」，不是把一份订阅拆成多把钥匙。

## 安装

这是 DSH 插件，需要 DSH 桌面端 `>= 0.2.0-rc.1`（见 `package.json` 的 `engines`）。

**从 GitHub 直接安装**，在 DSH 桌面端的插件管理界面里填：

```
github:EliteOtaku/dsh-opendesign-go
```

装完重启桌面端，在设置里打开「OpenDesign Go」分区。

构建产物 `lib/` 已提交到仓库，所以 GitHub 安装不需要在本机构建。这一点是刻意的：装包时不能假设用户有构建环境。

**非桌面端 profile**（例如 `web`）也可以用命令行：

```bash
dsh plugin --profile web add github:EliteOtaku/dsh-opendesign-go
```

> 桌面端的 `desktop` profile 由 Electron 应用独占管理：依赖和 `dsh.profile.bundles` 条目是分开落地的，命令行 `dsh plugin add` 只写其中一部分，结果通常是一半安装（启动报 `cannot resolve profile bundle`，或者插件静默不加载）。所以 desktop profile 请用插件管理界面，不要用命令行。

## 配置

配置写在插件自己的 profile 条目 `opendesign-go` 下，命名空间为 `llm-opendesign-go`。所有字段都是 `volatile()` 引用，改完即时生效，不需要重启。

设置页直接可改的是：启用开关、额度来源、账号列表（含每账号的 `workspaceId`）、模型开关、每模型参数、对账基准。其余字段（`apiKeyEnv`、`baseURL`、`requestTimeoutMs`、`streamIdleTimeoutMs`、`autoSwitch`、`sessionRef`、`workspaceId`、`planOverrides`、`recoveredEnabled`、`recoveredProviders`）目前需要编辑 profile 条目的 config 块。

| 配置项 | 默认值 | 用途 |
| --- | --- | --- |
| `enabled` | `true` | 关闭后插件提供的模型从会话选择器中移除 |
| `apiKeyEnv` | `OPENDESIGN_API_KEY` | 凭据引用名。插件按这个名字向 DSH 凭据服务（或启动环境变量）取 API Key，配置里不放密钥明文 |
| `accounts` | `[]` | 账号列表，每项含 `id`、`name`、`apiKeyEnv`、可选 `workspaceId`。第一项是当前账号，顺序即故障切换顺序；上限 20 个 |
| `autoSwitch` | `false` | 开启后，当前账号遇到凭据被拒或额度耗尽时按列表顺序尝试下一个账号 |
| `useVelaCredential` | `false` | 用本机 OpenDesign 桌面端的登录态读取额度，无需另填凭据 |
| `sessionRef` | `''` | 使用控制台会话读取额度时的凭据引用名（`OPENDESIGN_SESSION`）。仅在不用 `vela` 且需要控制台通道时填写 |
| `workspaceId` | `''` | 控制台通道的工作空间 ID；`vela` 通道会自动探测，一般留空 |
| `baseURL` | `https://amr-link.open-design.ai/v1` | 推理网关基址。不能带查询串或片段，末尾斜杠会被去掉 |
| `requestTimeoutMs` | `1800000` | 单次请求的总超时（30 分钟） |
| `streamIdleTimeoutMs` | `300000` | 流式读取的空闲超时声明值。当前实现只用 `requestTimeoutMs` 判定超时 |
| `enabledModelsJson` | `''` | 启用的模型 ID 数组（JSON 字符串）。空值表示全部启用 |
| `modelParamsJson` | `''` | 每模型参数覆盖（JSON 字符串），形如 `{"kimi-k2.7-code":{"contextWindow":262144,"maxTokens":131072}}` |
| `planOverrides` | `''` | 套餐额度覆盖，格式 `go:150,plus:200`。只改额度上限，不改月费 |
| `alignBaselineJson` | `''` | 对账基准点（JSON），由设置页的「对齐当前周期」写入 |
| `recoveredEnabled` | `false` | 是否从本机会话日志补算未经本插件的 OpenDesign 调用 |
| `recoveredProviders` | `''` | 补算时计入的 provider 名，逗号分隔；空值用 `opendesign,dsh-opendesign-go` |

另外三个字段 `usageJson`、`reportJson`、`diagnosticsJson` 是插件写入的缓存与诊断信息，设置页只读，不建议手改。

完整的字段语义、取值约束和示例见 [docs/configuration.md](docs/configuration.md)。

### 凭据

API Key 保存在 DSH 凭据服务里，设置页只显示引用名，不回显已保存的密钥。首次使用时有两种方式：

- 在设置页的「账号」卡片里添加账号，Key 由插件自动分配引用名（`OPENDESIGN_ACCOUNT_<n>`）；
- 或在启动环境里设置 `OPENDESIGN_API_KEY`，用默认引用名。

### 额度读取

勾选「使用本机 OpenDesign 的登录凭证读取额度」后，插件会查找本机 OpenDesign 桌面端自带的 `vela`：

- Windows：`%LOCALAPPDATA%\Programs\Open Design\resources\open-design\bin\vela.exe`
- macOS：`/Applications/Open Design.app/Contents/Resources/open-design/bin/vela`
- Linux：`~/.local/share/open-design/bin/vela`

也支持环境变量 `OPENDESIGN_VELA_PATH` 指定路径。查找顺序是：环境变量 → 官方安装目录 → `PATH`。官方安装目录优先于 `PATH`，因为只有它共享桌面端的登录态。

`vela` 是官方私有命令行，不是公开契约。插件会校验它输出的每个字段：格式变了就显示失败原因，不会给出一个看似正常的错误数字。

详见 [docs/quota.md](docs/quota.md)。

## 模型

Go 套餐授予 12 个 Design Plan 模型。默认参数取自各厂商文档，可在设置页逐项覆盖。

| 模型 | ID | 上下文 | 输出上限 | 图片输入 |
| --- | --- | --- | --- | --- |
| DeepSeek V4.1 Flash | `deepseek-v4.1-flash` | 1,000,000 | 384,000 | 支持 |
| DeepSeek V4 Flash | `deepseek-v4-flash` | 1,000,000 | 384,000 | — |
| DeepSeek V4 Flash Vision Exp | `deepseek-v4-flash-vision-exp` | 1,000,000 | 384,000 | 支持 |
| DeepSeek V4 Pro | `deepseek-v4-pro` | 1,000,000 | 384,000 | — |
| Claude Haiku 5.5 | `claude-haiku-5.5` | 1,000,000 | 128,000 | 支持 |
| GPT-6 Luna | `gpt-6-luna` | 1,050,000 | 128,000 | 支持 |
| GLM-5.3 Flash | `glm-5.3-flash` | 1,000,000 | 128,000 | 支持 |
| GLM-5.3 Flash-X | `glm-5.3-flashx` | 1,000,000 | 128,000 | 支持 |
| Kimi K2.7 Code | `kimi-k2.7-code` | 262,144 | 262,144 | 支持 |
| MiMo V2.6 Flash | `mimo-v2.6-flash` | 1,000,000 | 128,000 | 支持 |
| MiMo V2.6 Pro | `mimo-v2.6-pro` | 1,000,000 | 128,000 | 支持 |
| Hunyuan H4 Preview | `hy4-preview` | 1,000,000 | 64,000 | — |

说明：

- `deepseek-v4-flash` 与 `deepseek-v4-flash-vision-exp` 是已退役的 ID，网关仍路由到 V4.1-Flash，因此沿用 V4.1-Flash 的参数。
- 覆盖值的允许范围：上下文窗口 1,000–10,000,000，输出上限 1–1,000,000。越界会被拒绝并提示，不会静默截断。
- 请求没有显式给出 `maxTokens` 时，插件用上表的输出上限作为 `max_tokens`；留空即沿用这个默认值。
- 思考等级统一提供 `minimal` / `low` / `medium` / `high`，默认 `medium`。网关对这四个值都接受，但不公布每模型的差异。
- **「图片输入」一列取自 `src/model-params.ts` 的 `MODEL_DEFAULTS`**，厂商文档是唯一依据。会话选择器和请求门控都读这张表，因此列表里显示的图片能力与实际能否发送图片一致。文本模型收到图片时会得到占位文本，不会把图片字节发给网关。

更多细节见 [docs/models.md](docs/models.md)。

## 套餐结构说明

Go 档月费 $10，官方宣传「每月最高额度 $120」。实际约束是两个滚动窗口：

| 窗口 | 额度 | 折算 |
| --- | --- | --- |
| 5 小时 | 50,000 credits | $5 |
| 7 天 | 150,000 credits | $15 |

（credits 与美元的换算是 10,000 credits = $1。）

这两个窗口决定了月额度按周窗口的费率用不满：一个 7 天窗口 $15，四周左右合计约 $65，离宣传的 $120 还差一半。**这不是插件或网关的 bug**，是套餐本身的结构——$120 是宣传口径的上限，实际可用量由 5 小时和 7 天两个窗口共同约束。

插件不预测月消耗，只回答能操作的问题：「照当前速度，这个窗口会不会在重置前用完？」从周窗口线性外推月消耗只会报出约一半的宣传额度，看起来像有富余，实际并不存在。

## 文档

- [配置项参考](docs/configuration.md)
- [模型与参数](docs/models.md)
- [额度、用量与套餐结构](docs/quota.md)
- [开发与排障](docs/development.md)

## License

MIT，见 [LICENSE](LICENSE)。Copyright (c) 2026 EliteOtaku。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
