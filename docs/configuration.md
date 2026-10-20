# 配置项参考

插件的配置挂在 profile 条目 `opendesign-go` 下，设置命名空间为 `llm-opendesign-go`。源码位置：`src/config.ts`（schema）、`src/config-contract.ts`（两端共用的类型）。

所有字段都声明了默认值，因此空配置也能加载。字段全部是 `volatile()` 引用，宿主提交一次修改后即时生效，不需要重启桌面端。

**设置页直接可改的字段**（客户端调用 `form.set` / `form.mutate` 的仅有这几处）：

| 字段 | 界面位置 |
| --- | --- |
| `enabled` | 「启用 OpenDesign Go」开关 |
| `useVelaCredential` | 「额度来源」开关 |
| `accounts` | 「账号」卡片：添加、移除、设为当前、更换 Key |
| `enabledModelsJson` | 「可用模型」每行勾选框 |
| `modelParamsJson` | 「可用模型」每行的「改参数」 |
| `alignBaselineJson` | 对账卡片的「对齐当前周期」按钮 |

**其余字段需要编辑 profile 条目的 config 块**：`apiKeyEnv`、`autoSwitch`、`sessionRef`、`workspaceId`、`baseURL`、`requestTimeoutMs`、`streamIdleTimeoutMs`、`planOverrides`、`recoveredEnabled`、`recoveredProviders`。它们都已被 schema 声明并参与运行时判定，只是客户端目前没有提供输入控件。

## 用户可配置字段

### 路由

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 关闭时撤销 provider 路由，模型从会话选择器消失。插件本身不卸载，设置页仍然可达 |
| `baseURL` | string | `https://amr-link.open-design.ai/v1` | 推理网关基址 |
| `requestTimeoutMs` | number | `1800000` | 单次请求总超时，覆盖建连到流式结束 |
| `streamIdleTimeoutMs` | number | `300000` | 流式读取空闲超时的声明值。当前实现只按 `requestTimeoutMs` 判定超时，此字段暂未参与判定 |

`baseURL` 的校验规则（`assertBaseURL`）：

- 必须是非空、绝对的 `http` / `https` URL；
- 不能带查询串（`?`）或片段（`#`）——适配器自己拼接 `/chat/completions`，带查询串会让请求目标静默变形，所以直接拒绝；
- 末尾斜杠会被去掉。

### 凭据与账号

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `apiKeyEnv` | string | `OPENDESIGN_API_KEY` | 当前账号的凭据引用名 |
| `accounts` | array | `[]` | 账号列表，见下 |
| `autoSwitch` | boolean | `false` | 失败时是否按列表顺序切换账号 |

`apiKeyEnv` 与每个账号的 `apiKeyEnv` 都必须是合法的环境变量名（`^[A-Za-z_][A-Za-z0-9_]*$`）。它们只是**引用名**，密钥值存放在 DSH 凭据服务里。

账号项的结构（`src/config-contract.ts` 的 `OpenDesignAccount`）：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 本地稳定 ID，不会发给上游，最长 128 字符 |
| `name` | 是 | 显示名，最长 80 字符；非 legacy 条目不能为空 |
| `apiKeyEnv` | 是 | 该账号的凭据引用名，列表内不可重复 |
| `workspaceId` | 否 | 控制台通道读额度用；省略表示「推理可用，额度显示不可用」，不会猜测 |

账号规则（`src/accounts.ts`）：

- 最多 20 个账号。
- **列表第一项就是当前账号**。选择账号不是写另一个字段，而是把该项移到首位，因此选中状态不可能与列表顺序不一致。
- 每个账号是一份**独立的 OpenDesign 订阅**。同一工作空间内的多把 Key 共享同一份额度，所以多账号的意义是「多买几份 Go」，而不是把一份订阅拆成多把钥匙。
- 至少保留一个账号：移除最后一个会被拒绝，因为没有账号就无从解析密钥。
- 旧配置若只写了 `apiKeyEnv` 而没有 `accounts`，会被当作一个合成的 legacy 账号继续工作，不会让所有请求失败。

### 额度读取

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `useVelaCredential` | boolean | `false` | 用本机 OpenDesign 桌面端的登录态读额度 |
| `sessionRef` | string | `''` | 控制台会话通道的凭据引用名，默认常量是 `OPENDESIGN_SESSION` |
| `workspaceId` | string | `''` | 控制台通道的工作空间 ID，作为账号未声明时的回退 |

`useVelaCredential` 与 `sessionRef` 是两条互斥的额度来源：前者优先。两条都关着时，插件不读额度，只显示本地用量。详见 [quota.md](quota.md)。

### 模型

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `modelParamsJson` | string（JSON） | `''` | 每模型参数覆盖 |
| `enabledModelsJson` | string（JSON 数组） | `''` | 启用的模型 ID |

用 JSON 字符串而不是嵌套对象，是宿主的表单投影限制：设置页只能遍历经过 `volatile()` 后仍然存活的 `object` / `dict` 节点，嵌套的对象字典会被静默丢掉，等于整个页面不显示。所以这类数据一律走序列化字符串。

`modelParamsJson` 的格式：

```json
{
  "kimi-k2.7-code": { "contextWindow": 262144, "maxTokens": 131072 },
  "gpt-6-luna": { "maxTokens": 64000 }
}
```

- 字段都可选，省略即用默认值。
- 校验范围：`contextWindow` 1,000–10,000,000；`maxTokens` 1–1,000,000。越界或非数字的覆盖会被忽略，回退到默认值（不会变成 0）。
- 单个模型两项都留空 = 恢复官方默认值。
- 整段 JSON 解析失败时按「无覆盖」处理，不会让模型列表不可用。

`enabledModelsJson` 的格式：

```json
["deepseek-v4.1-flash", "claude-haiku-5.5"]
```

- **空字符串表示全部启用**。这个默认值是有意的：全新安装时字段为空，若解释成「一个都不启用」，选择器会空白且没有解释。
- 过滤在适配器的 `listModels` 里做，所以被停用的模型对所有消费方都不存在，不只是从某个列表里隐藏。
- 在设置页取消勾选时，若原本是「全部启用」，插件会把其余 ID 显式写出来——否则空值仍表示全部，这次修改就是空操作。

### 套餐与对账

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `planOverrides` | string | `''` | 按档位覆盖月额度上限 |
| `alignBaselineJson` | string（JSON） | `''` | 对账基准点 |
| `recoveredEnabled` | boolean | `false` | 是否从会话日志补算历史用量 |
| `recoveredProviders` | string | `''` | 补算计入的 provider 名，逗号分隔 |

`planOverrides` 格式 `go:150,plus:200`：

- 解析永不抛错。格式错误的项、未知档位、非正数会被静默丢弃——用户手输的字段，一个笔误不该让整张额度卡片挂掉。
- 重复档位后者生效，所以往字符串末尾追加就是修改一个值的方式。
- **只覆盖 `monthlyCapUsd`，不覆盖 `monthlyUsd`**。月费是购买事实，设置项无权改写，否则档位表会声称一个用户从未支付的价格。

`alignBaselineJson` 由设置页的「对齐当前周期」按钮写入，结构 `{"at":<epochms>,"credits":<number>,"measuredUsd":<number>}`。套餐 credits 是窗口内累计值，只增不减；插件只看到自己服务的流量。两者只有从同一时刻起的增量才可比，基准点就是那个「同一时刻」。

`recoveredEnabled` 默认关闭，原因是这个补算读本机所有会话日志：同一把 Key 被别的 agent 用过时结果偏低，多个工作空间共用时结果偏高，误差方向不确定。方向不确定的默认真值就是「不开启」。

`recoveredProviders` 空值回退到默认名单 `['opendesign', 'dsh-opendesign-go']`——前者是手工配置的自定义模型路由，后者是本插件，两者计费到同一份订阅。

## 插件写入的字段

以下三个字段由宿主侧写入，设置页只读。它们借配置文档这条已被两端共享的通道传数据，不是用户该手改的配置。

| 字段 | 内容 |
| --- | --- |
| `usageJson` | 最近一次额度读取的序列化快照，`UsageSnapshot` |
| `reportJson` | 最近 30 天的本地用量报告，`UsageReport` |
| `diagnosticsJson` | 路由诊断，包含是否注册、是否启用、凭据是否解析、声明模型数 |

三者都会在读取时逐字段校验：格式不对就当作「没有数据」，绝不编造数字。

## 首次配置的最小步骤

1. 在设置页「账号」卡片点「添加账号」，填名称和 API Key，确认。
2. 想读额度的话，勾选「使用本机 OpenDesign 的登录凭证读取额度」（前提是本机装了 OpenDesign 桌面端并已登录）。
3. 按需在「可用模型」里取消勾选不用的模型，或调整某个模型的参数。

不需要填 `baseURL`、`apiKeyEnv`、`workspaceId`。前两项有默认值，工作空间 ID 由 `vela` 自动探测。
