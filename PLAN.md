# dsh-opendesign-go 开发计划 v2（定稿候选）

> 状态：待「计划通过」。通过前不产出业务代码。
> 日期：2026-10-19　｜　目标：为 OpenDesign **Go 套餐** 提供 DSH 插件

## 0. 前提与定位

参考仓库 `Duskriver/dsh-opencode-go` 是 **TypeScript 的 DSH 插件**（v0.1.25-pre），仓库名中的 "go" 指 **OpenCode Go 订阅套餐**，不是 Go 语言。本项目同理：`dsh-opendesign-go` 的 "go" 指 **OpenDesign Go 套餐**。

**定位**：DSH 已能通过「自定义 OpenAI 兼容端点」直连 OpenDesign，官方接入列表也已含 DSH。因此本插件不是唯一通路，价值必须落在四件事上：

1. 会话内**额度可视化**（5 小时 + 7 天双窗口）
2. **多账号**管理与自动切换（跨 OpenDesign 账号）
3. **模型目录**与设置页（按套餐过滤、容量覆盖、思考预算）
4. **用量看板**（本地 token 统计 + 官方价格估算）

## 1. 对参考仓库的模仿关系

| 参考仓库模块 | 本项目 | 关系 |
| --- | --- | --- |
| `src/index.ts`（`apply(ctx)` 注册路由/发现/设置） | `src/index.ts` | 照搬结构 |
| `config.ts` / `config-contract.ts`（schemastery + 浏览器安全契约） | 同名 | 照搬结构 |
| `adapter.ts`（推理适配器、流式、重放） | 同名 | 照搬结构 |
| `conversion/`（流式、重放、图片池） | 同名 | **删除 Google 分支** |
| `catalog.ts` / `catalog-manager.ts`（在线目录+缓存+降级+诊断） | 同名 | 照搬结构 |
| `usage.ts` / `usage-contract.ts` | 同名 | **窗口口径重写**（5h+7d） |
| `account-*.ts`（多账号、自动切换、恢复日志） | 同名 | 照搬结构，**切换语义重写** |
| `analytics*.ts`（会话扫描 + 计价） | 同名 | 照搬结构，**价格源换官方接口** |
| `gateway-error.ts` / `account-policy.ts` | 同名 | 照搬结构 |
| `proxy.ts` | 同名 | 照搬 |
| `host-settings.ts` / `settings-bridge.ts` / `client/host-compat.ts` | 同名 | 照搬（宿主版本兼容） |
| `client/`（React + CSS Modules 设置页/胶囊/看板） | 同名 | 照搬结构 |
| `scripts/build.mjs`（esbuild + rollup-plugin-dts） | 同名 | 照搬 |
| `tests/hosts/*`（宿主兼容矩阵） | 同名 | 照搬 |
| `go-plan.ts` | `plan-policy.ts` | **改造**为版本化套餐策略快照 |

## 2. 已实测确认的 API 契约（一手，非文档推测）

### 2.1 推理网关（API Key 鉴权）

| 协议 | 基址 | 路径 |
| --- | --- | --- |
| OpenAI Chat Completions | `https://amr-link.open-design.ai/v1` | `/chat/completions` |
| OpenAI Responses | `https://amr-link.open-design.ai/v1` | `/responses` |
| Anthropic Messages | `https://amr-link.open-design.ai` | `/v1/messages` |
| 模型列表 | `https://amr-link.open-design.ai/v1` | `/models` |

- 未鉴权错误体：`{"error":{"code":"missing_api_key","message":"...","type":"missing_api_key"}}`
- **网关不提供任何额度端点**：`/v1/usage`、`/v1/quota`、`/v1/me`、`/v1/account`、`/v1/limits`、`/v1/billing`、`/v1/credits`、`/v1/subscription` 实测全部 404。
- (待补充：`/v1/models` 在 Go 套餐下的实际返回集合；需真实 Key 验证)

### 2.2 控制台后端（会话鉴权，`https://amr-api.open-design.ai/api/v1`）

| 用途 | 接口 | 鉴权 |
| --- | --- | --- |
| 额度窗口 | `GET /workspaces/{workspaceId}/billing/coding-plan-usage` | 会话 |
| 钱包/订阅 | `GET /billing/summary?timeZone=Asia/Shanghai` | 会话 |
| API Key 管理 | `GET /runtime-api-keys` | 会话 |
| 价格目录 | `GET /public/model-prices` | **公开无鉴权** |
| 实时额度事件 | `GET /collab/events?codingPlanUsageEvents=1` | 会话（SSE） |

额度响应结构（实测）：

```jsonc
{
  "workspaceId": "string",
  "generatedAt": "string",
  "eligible": true,
  "tier": "go",
  "windows": [{
    "policyId": "model_limit_policy_…",
    "durationSeconds": 18000,        // 5 小时
    "resetMode": "anchored_recurring",
    "usedCredits": "string",         // 十进制字符串
    "limitCredits": "string",
    "remainingCredits": "string",
    "windowStart": "string",
    "resetsAt": "string"
  }]
}
```

实测 Go 套餐恰好两个窗口：`durationSeconds` = **18000（5 小时）** 与 **604800（7 天）**。

### 2.3 价格目录（公开）

`GET /api/v1/public/model-prices` → `{data:[{model, pricing:{unit:"1m_tokens", currency:"USD", input, output, cacheRead, cacheWrite}}]}`，35 个模型。

- (待补充：分层计价，如 `gpt-6-astra` 输入 ≤/>272,000 tokens 两档；该接口只给基础档，首版接受低估并在看板标注)

## 3. 技术选型

- **形态**：方案 A —— 纯 TypeScript DSH 插件（Cordis 插件树），与参考仓库同构
- Node `^22.19.0 || >=24`；TypeScript 6；`@deepseek-ai/cordis` peer
- 构建：esbuild + `rollup-plugin-dts`，**提交 `lib/`**（Git 安装免构建）
- 测试：vitest + `tests/hosts/*` 宿主兼容矩阵
- 配置：`@deepseek-ai/schemastery`（`volatile()` 热更新）
- HTTP：`undici`；SDK：`openai`、`@anthropic-ai/sdk`（**不使用** `@google/genai`）
- 客户端：React 18 + CSS Modules + zustand
- 发布：npm 公开包 + Git 安装 + **DSH 插件市场**三通道

## 4. 目录结构

```
src/
  index.ts                 # 入口：apply(ctx) 注册路由/发现/设置分区
  config.ts                # schemastery schema（volatile 热更新）
  config-contract.ts       # 浏览器安全配置词汇（两端共用）
  adapter.ts               # 推理适配器
  conversion/              # 流式、重放、图片池（无 Google）
  catalog.ts               # 模型目录：/v1/models + 价格 + 缓存 + 降级
  catalog-manager.ts       # 按配置分键的目录实例
  plan-policy.ts           # 【新】版本化套餐策略快照
  usage.ts                 # 【改】额度服务：5h + 7d 双窗口 + 钱包
  usage-contract.ts        # 额度契约（两端共用）
  accounts.ts              # 账号集合与引用
  account-manager.ts       # 账号元数据持久化
  account-selection.ts     # 当前账号与切换
  account-policy.ts        # 换号策略（含钱包判定）
  gateway-error.ts         # 错误分类
  analytics.ts             # 用量看板：会话扫描 + 计价
  analytics-pricing.ts     # 官方价格换算
  proxy.ts                 # HTTP/SOCKS5 代理
  host-settings.ts         # 宿主版本兼容（配置挂载）
  settings-bridge.ts       # 设置写入裁决
  client/                  # React：设置页、用量胶囊、账号卡片、看板
tests/
  *.spec.ts                # 单元 + 契约
  hosts/<id>/              # 宿主兼容矩阵
scripts/build.mjs          # 构建与产物校验
cordis.patch.yml           # 插件清单
```

## 5. 双通道对接方案

### 5.1 通道 A：推理（API Key）

API Key 经 DSH 凭据服务**只写存储**，按请求解析，永不回显。三协议按模型元数据选择，**不做协议间自动重试**。

```ts
interface OpenDesignConfig {
  enabled: boolean
  baseURL: string                     // 默认 https://amr-link.open-design.ai/v1
  apiKeyEnv: string                   // 凭据引用名
  accounts: Account[]                 // ≤ 20，每项一个 OpenDesign 账号
  autoSwitch: boolean
  protocolOverrides: Record<string, 'openai-responses' | null>
  usageDisplay: 'auto' | 'always' | 'off'
  sessionRef?: string                 // 通道 B 凭据引用（可选，默认未设置）
}

interface Account {
  id: string
  name: string
  apiKeyEnv: string
  workspaceId?: string                // 通道 B 查额度需要
}
```

### 5.2 通道 B：额度（控制台会话，默认关闭）

```ts
interface QuotaWindow {
  policyId: string
  durationSeconds: number             // 18000 | 604800 | 其他
  resetMode: string
  usedCredits: string
  limitCredits: string
  remainingCredits: string
  windowStart: string
  resetsAt: string
}

interface UsageSnapshot {
  asOf: string
  tier: 'go' | string
  eligible: boolean
  windows: QuotaWindow[]
  wallet: { balanceUsd: string; subscriptionPeriodEnd?: string }
}
```

**安全约束（按确认执行）**：

- 默认关闭，用户显式开启后才要求提供会话凭据
- 只读：仅调用 `coding-plan-usage` 与 `billing/summary` 两个 GET，不写任何账号数据
- 加密存入 DSH 凭据服务，UI 不回显，可一键清除
- 设置页显式风险提示：会话凭据等同账号访问权，且会过期
- 失败即降级：不显示真实额度，退回本地 token 估算，绝不阻塞推理

(待补充：better-auth 会话凭据的字段名与最小可用范围；倾向只取 session token 而非全部 cookie)

### 5.3 价格与目录

- 目录：`/v1/models`（按套餐权益过滤）+ `public/model-prices`（价格）合并
- 价格接口无鉴权，可独立刷新与缓存
- 分层计价缺失 → 首版按基础档估算，看板标注「长上下文成本可能低估」

## 6. 额度、账号与 UI

### 6.1 双血条（已确认形态）

```
[ 5 小时额度 ]  ▓▓▓▓▓▓░░░░  62%   4 小时 49 分后重置
[ 7 天额度  ]  ▓▓▓▓▓▓▓▓░░  80%   6 天 23 小时后重置
钱包余额 $1.50 · 周期至 2026-11-19 · 并发 10（按 2026-10-19 官方口径）
```

- 窗口标签由 `durationSeconds` **反推**，不硬编码「5 小时 / 7 天」
- 百分比 = `usedCredits / limitCredits`，credits 为字符串，用十进制安全解析
- 接近上限变黄、耗尽变红（沿用参考仓库配色逻辑）

### 6.2 套餐策略快照

```ts
// src/plan-policy.ts
export const PLAN_POLICY_AS_OF = '2026-10-19'
export const PLAN_POLICY_SOURCE = 'https://open-design.ai/zh/pricing/'
export const GO_POLICY = {
  tier: 'go',
  monthlyCapUsd: 120,
  concurrency: 10,                    // 官方口径，UI 显式标注日期
  designPlanModels: [ /* 12 个 */ ],
  excludesPackageModels: true,        // Go 不含套餐模型额度
}
```

### 6.3 多账号（已确认：跨 OpenDesign 账号）

- 每个账号 = 一个 OpenDesign 账号的 API Key（+ 可选 workspaceId）
- 同工作区多 Key **共享同一份额度**，不产生额外额度 —— 因此「多账号」的价值是**多买几份 Go**
- 自动切换触发条件（必须同时判断）：
  1. 错误为 `INVALID_CREDENTIAL`，或
  2. 额度耗尽 **且** 钱包余额为 0
- **已产出 token / 已开始输出 / 已取消**的请求不换号重发（沿用参考仓库策略）
- 额度耗尽但钱包有余额时**不换号**，按量付费继续

## 7. 里程碑

| 阶段 | 产出物 | 验收标准 |
| --- | --- | --- |
| **M0 契约勘察** ✅已完成 | 本文档 §2 | 已拿到推理三协议地址、额度结构、价格目录 |
| **M1 骨架** | package.json、cordis.patch.yml、tsconfig、build.mjs、空 CI | `npm run compile` 通过；DSH 能加载空插件不报错 |
| **M2 推理适配器** | Chat Completions 单模型 + 流式 + 用量上报 | 真实 Key 单轮对话成功，token 用量正确 |
| **M2b 额度通道** | 会话凭据接入 + 降级 | 双窗口百分比与官方一致；无凭据时优雅降级不阻塞 |
| **M3 目录与模型** | 在线目录 + 缓存 + 降级 + 套餐过滤 | 断网/401 不崩；选择器只出现 Go 可用模型 |
| **M4 设置页** | 设置分区 + 凭据写入 + 热更新 | 改配置无需重启生效；会话凭据默认关闭 |
| **M5 用量与账号** | 双血条胶囊、多账号、自动切换 | 双血条与钱包一致；切换不重发已产出请求 |
| **M6 协议扩展** | Responses + Anthropic + 图片 | 三协议各一轮回归通过 |
| **M7 看板与打磨** | 用量看板、代理、错误分类、i18n | 计价标注分层缺失；错误码映射全覆盖 |
| **M8 兼容与发布** | 宿主矩阵、npm 发布、插件市场登记、README + 截图 | `npm run verify` 全绿；`validate-names` 退出码 0；市场可按 `dsh-opendesign-go` 搜到并安装 |

## 8. 测试与 CI/CD

- **单元**：配置校验、错误分类、credits 字符串解析、窗口边界（5h/7d 交叉）
- **契约回放**：mock 网关与 mock 控制台，覆盖额度/价格/401/429 响应
- **降级**：无会话凭据、会话过期、价格接口 5xx
- **宿主兼容矩阵**：`tests/hosts/*` 多 DSH 版本各跑一次（**必须项**）
- **安装回归**：npm / pnpm 从 tarball 与 Git 安装，验证入口与类型解析
- **E2E**：真实 Key 手工触发，受额度限制，不进 CI 默认链路
- **CI**：三 job —— `core`（check:dist + vitest）、`install`（npm/pnpm 矩阵）、`compatibility`（宿主矩阵），矩阵 ubuntu + windows × Node 22.19 / 24

## 9. 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 额度依赖会话凭据 | 过期、安全敏感 | 默认关闭、只读、加密存、可清除、失败降级 |
| 分层计价缺失 | 长上下文成本低估 | 看板显式标注 |
| 额度按 workspace 而非 Key | 多 Key 不扩容 | 定位为多账号（多买 Go） |
| 官方口径变动 | UI 误导 | `plan-policy.ts` 版本化 + 日期标注 |
| 上游目录轮换 | 模型失配 | 在线目录 + 缓存 + 降级 + 告警 |
| 参考仓库体量大（约 1.2 MB / 70 文件） | 照搬成本高 | 先裁剪：去 Google、看板后置到 M7 |
| ToS 风险 | 第三方封装 API Key | 只做只读额度查询，不做自动化下单/续费 |

## 10. 已决事项

1. 形态：方案 A，TypeScript DSH 插件，必须做宿主兼容性测试
2. 协议：Chat Completions / Responses / Anthropic Messages，**放弃 Google**
3. 额度通道：控制台会话，默认关闭、只读、加密存、可清除、失败降级
4. 账号定义：**不同 OpenDesign 账号**的 Key，支持多买几份 Go
5. 分层计价：接受首版低估，看板标注
6. 用量看板：首版实现
7. 并发数：UI 显式标注「10（按 2026-10-19 官方口径）」并链接价格页
8. 仓库：本地已 clone，`.gitignore` 已替换为 Node/TS 版（保留提交 `lib/`）
9. 会话凭据范围：只取 better-auth 的 **session token**，不取整包 cookie
10. 发布渠道：npm 公开包 + Git 安装 + **DSH 插件市场**（要可被市场检索与安装）

## 11. 发布与命名（DSH 插件规范）

外部插件须在仓库根放 `dsh-plugin.naming.json`，并用官方只读校验器验证。计划值：

```jsonc
{
  "schemaVersion": 1,
  "policy": "dsh-plugin-naming/v1",
  "plugin": {
    "namespace": "eliteotaku",
    "name": "opendesign-go",
    "coordinate": "eliteotaku/opendesign-go",
    "packageName": "dsh-opendesign-go"
  },
  "names": {
    "pluginNames": ["llm-opendesign-go"],
    "loaderIds": ["llm-opendesign-go"],
    "services": ["openDesignGoUsage", "openDesignGoModels"],
    "tools": [],
    "commands": [],
    "skills": [],
    "skillProviders": [],
    "events": [],
    "settingsNamespaces": ["llm-opendesign-go"],
    "routes": []
  }
}
```

M8 步骤：

1. `node <plugin-write>/scripts/validate-names.mjs --manifest ./dsh-plugin.naming.json` → 退出码 0
2. `node <plugin-write>/scripts/query-registry.mjs --manifest ./dsh-plugin.naming.json --harness-version <目标版本>` → 记录「无匹配 / 查询不可用 / 发现候选 / 已评审登记」四种状态之一，不得把无匹配说成可用
3. `npm publish`（`publishConfig.access: public`），包内 `files` 含 `lib`、`cordis.patch.yml`、`docs`、`examples`
4. 市场可检索性验证：在干净 Profile 中用包名安装并启用，完成一轮对话
5. 命名冲突处理：校验器报的是**兼容错误**则必须改；仅报**社区建议警告**时，保留已发布名（改名属兼容性破坏），除非用户明确授权

(待补充：目标 DSH 版本号；中央登记若走正式条目需另备 v2 entry 并跑 `check` / `verify-source`)
