# 对账功能实现契约

本文件是给执行子智能体的**唯一规格来源**。实现时只看本文件与列出的既有代码，不要自行扩大范围。

## 全局约束

- 语言：TypeScript，`exactOptionalPropertyTypes` 已开启，可选属性必须写 `?: T | undefined`。
- 注释：英文，写**为什么**不写是什么。每条导出函数要有 `@param` / `@returns`。
- 测试：vitest，放在 `tests/`，命名 `<模块>.spec.ts`。
- 不得修改契约定好的导出名与签名；如需扩展，只在末尾追加可选字段。
- 不得引入新依赖。
- 文件路径必须落在任务指定的范围内，越界视为失败。

## 阶段 1：`src/plans.ts`（新建，独占）

套餐档位常量与解析。

```ts
export type PlanTier = 'go' | 'plus' | 'pro' | 'max'

export interface PlanSpec {
  /** 月费，美元 */
  readonly monthlyUsd: number
  /** 官方宣传的每月最高额度，美元 */
  readonly monthlyCapUsd: number
}

export const PLAN_SPECS: Readonly<Record<PlanTier, PlanSpec>>

/** 读取用户覆盖值，格式 `go:120` 或 `plus:200`，逗号分隔；非法项忽略。
 *  覆盖只改 monthlyCapUsd，不改 monthlyUsd。 */
export function parsePlanOverrides(raw: string | undefined): Partial<Record<PlanTier, number>>

/** 合并内置与覆盖，返回生效档位表。tier 未知时返回 undefined。 */
export function planOf(tier: string, overrides: Partial<Record<PlanTier, number>>): PlanSpec | undefined
```

内置值（来自官方定价页截图，2026-10-20）：

| tier | monthlyUsd | monthlyCapUsd |
|---|---|---|
| go | 10 | 120 |
| plus | 20 | 180 |
| pro | 100 | 480 |
| max | 200 | 900 |

测试要求：覆盖生效、非法输入忽略、未知 tier 返回 undefined、`monthlyUsd` 不被覆盖改写。

## 阶段 2：`src/session-usage.ts`（修改，独占）

已有 `RecoveredCall` 缺时间戳与 provider 可配置性。要求：

1. 给 `RecoveredCall` **追加** `readonly at: number`（epoch ms，取自事件顶层 `time`）。
2. 新增可配置 provider 名单：

```ts
export const DEFAULT_RECOVERED_PROVIDERS: readonly string[]  // ['opendesign', 'dsh-opendesign-go']

/** 解析用户配置的名单，逗号分隔；空值返回默认名单。 */
export function parseRecoveredProviders(raw: string | undefined): readonly string[]

export interface ScanOptions {
  /** 只统计该时间点之后的调用；省略表示不限。 */
  readonly since?: number | undefined
  /** provider 名单；省略用默认。 */
  readonly providers?: readonly string[] | undefined
}

export function scanSessions(root: string, options?: ScanOptions): RecoveredCall[]
```

3. `callsFromSessionText` 同样接受 `providers` 参数（第 2 个可选参数）。

测试要求：时间过滤生效、自定义名单生效、缺失 `time` 的事件被跳过（`at` 不能是 NaN）、原有测试不回归。

## 阶段 3：`src/client/BillingCard.tsx`（新建，独占）

新建一个组件承载对账 UI。**不要修改** `QuotaCard.tsx`（阶段 4 才改它）。

```ts
export interface BillingCardProps {
  readonly snapshot: UsageSnapshot | undefined
  /** 套餐档位，来自 snapshot.tier */
  readonly plan: PlanSpec | undefined
  /** 插件实测累计成本，美元；undefined 表示尚无数据 */
  readonly measuredUsd: number | undefined
  /** 对齐基准，undefined 表示未对齐 */
  readonly baseline: { at: number, credits: number, measuredUsd: number } | undefined
  /** 点击「对齐当前周期」 */
  readonly onAlign: (() => void) | undefined
  /** 是否可操作 */
  readonly editable: boolean
}
export function BillingCard(props: BillingCardProps): ReactElement
```

渲染要求（顺序固定）：

1. 若 `plan !== undefined` 且 `snapshot` 有 7 天窗口：**月总额度行**
   - 文本：`月总额度 $X / $Y（Z%）`，`X` = 7 天窗口 `usedCredits` 按 `creditsPerUsd` 折算
   - `Z` 为百分比，取整
   - 说明小字：`月总额度是官方宣传值，实际约束是下方窗口`
2. **窗口行**：每个窗口一行，显示 `剩余 N%` + `剩余 $A / $B`
   - 复用 `QuotaCard` 里已有的 `windowLabel` 与 `resetCountdown`（从 `../usage-format.ts` 导入，见下）
3. **对齐区块**
   - 未对齐：按钮 `对齐当前周期`（`onAlign` 为 undefined 或 `!editable` 时禁用）
   - 已对齐：显示
     - `自 M月D日 HH:mm 起的增量`
     - `套餐 $A · 实测 $B`
     - 若 `A` 与 `B` 都 > 0，附 `比值 X.X`
4. **等价 API 成本**（折叠）
   - 默认收起，一行可点：`等价 API 成本（仅供参考）`
   - 展开后显示 `measuredUsd` 与一行说明：
     `按各厂商公开单价估算；套餐按 credits 计费且缓存输入占比不同，此值仅供参考，不代表账单。`

`spentFromCredits(credits: string, creditsPerUsd: number | undefined): number | undefined`
放在本文件并导出，供测试直接调用。

测试要求：百分比取整正确、`creditsPerUsd` 缺失时返回 undefined、`plan` 缺失时不崩、对齐前按钮禁用。

## 阶段 4：`src/client/usage-format.ts`（新建，独占）

把 `QuotaCard.tsx` 里已有的 `windowLabel` / `resetCountdown` / `barColor` 迁出为共享模块，**保留原导出名与行为**。

```ts
export function windowLabel(durationSeconds: number): string
export function resetCountdown(resetsAt: string, now?: number): string
export function barColor(remaining: number): string
export const WARN_AT: number   // 25
export const STOP_AT: number   // 5
```

`QuotaCard.tsx` 改为从这里导入并 re-export（保持 `tests/quota-card.spec.ts` 现有导入路径可用）。
`src/usage-contract.ts` 里的 `windowLabel` 若存在，改为从本文件 re-export。

测试要求：现有 `tests/quota-card.spec.ts` 必须继续通过，不得改其导入路径。

## 阶段 5（我本人执行，不派发）

- `src/config.ts` / `src/config-contract.ts` 加字段：`planOverrides: string`、`alignBaselineJson: string`、`recoveredEnabled: boolean`、`recoveredProvidersJson: string`
- `src/index.ts` 接线
- `QuotaCard.tsx` 接入 `BillingCard`
- 最终集成、门禁、提交

## 验收门禁（每个阶段都要过）

```bash
npm run typecheck
npx vitest run <本阶段测试文件>
```

阶段 3、4 额外要求：

```bash
npx tsc -p tsconfig.client.json --noEmit
```

完成后报告：改了哪些文件、测试数量、任何偏离本契约之处及原因。

---

## 阶段 5 追加规格（Lead 执行，供审查参考）

新增配置字段（全部为字符串或布尔，避免 `z.dict` / `transform` 破坏表单投影）：

| 字段 | 类型 | 默认 | 用途 |
|---|---|---|---|
| `planOverrides` | string | `''` | 套餐额度覆盖，格式 `go:150,plus:200` |
| `alignBaselineJson` | string | `''` | 对齐基准，JSON：`{"at":<epochms>,"credits":<number>,"measuredUsd":<number>}` |
| `recoveredEnabled` | boolean | `false` | 是否补算会话日志历史 |
| `recoveredProvidersJson` | string | `''` | 补算的 provider 名单，JSON 字符串数组 |

所有字段必须：
1. 在 `src/config-contract.ts` 的 `OpenDesignConfig` 声明
2. 在 `src/config.ts` 的 `PlainConfig` 与 `Config` 各加一次（后者加 `.volatile()`）
3. 在 `readConfig` 返回值中出现
4. 在 `cordis.patch.yml` 与 `~/.dsh/profiles/desktop/cordis.patch.yml` 的 config 块中出现

`recoveredEnabled` 默认 `false`，因为补算依赖「本机所有会话」这一不精确前提：同一把 key 在别的 agent 用过时数字会偏低，而多 workspace 共用时又会偏高，方向不确定。
