# 按账号套餐提供模型目录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Plus / Pro / Max 用户看到并使用自己套餐包含的模型，Go 用户体验不变；未收录参数的新模型可立即使用并在页面上明确标注。

**Architecture:** 启动时用当前账号的 key 请求网关 `GET {baseURL}/models`（该端点按账号额度等级返回），把 id 列表写进配置缓存字段 `catalogJson`；`listModels` / `resolveModel` / `ModelsCard` 都从它读。拉取失败时回退到写死的 14 条 Go 名单，页面不空。`MODEL_DEFAULTS` 未收录的 id 用一套通用默认值，并在模型行标注「参数未收录」。

**Tech Stack:** TypeScript（`exactOptionalPropertyTypes`、`noUncheckedIndexedAccess`）、React 18、vitest、esbuild。

**设计文档:** `docs/superpowers/specs/2026-11-09-plan-tier-models-design.md`

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/catalog-fetch.ts` | 新建。一次 HTTP 调用，把多种响应形状归一成 id 数组；失败一律 undefined |
| `src/catalog.ts` | 目录的解析、合并、显示名推导；保留写死名单作兜底 |
| `src/model-params.ts` | 新增 `GENERIC_DEFAULTS`，`paramsOf` 对未收录 id 返回它 |
| `src/config.ts` / `src/config-contract.ts` | 新增 `catalogJson` 字段 |
| `src/index.ts` | 启动拉目录、写回、失败兜底 |
| `src/adapter.ts` | 改读快照而非写死名单 |
| `src/client/ModelsCard.tsx` | 渲染快照；未收录行加徽标 |
| `tests/*` | 新增与扩展 |

所有命令在 `D:\AI\dsh-opendesign-go` 下执行。

---

### Task 1: 网关模型列表请求

**Files:**
- Create: `src/catalog-fetch.ts`
- Test: `tests/catalog-fetch.spec.ts`

- [ ] **Step 1: 写失败的测试**

新建 `tests/catalog-fetch.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { fetchGatewayModels } from '../src/catalog-fetch.ts'

/** A fetch double returning one canned JSON body. */
function respondWith(body: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, json: async () => body })) as unknown as typeof fetch
}

const BASE = 'https://amr-link.open-design.ai/v1'

describe('fetchGatewayModels', () => {
  it('reads the OpenAI-shaped list the gateway returns', async () => {
    const body = { data: [{ id: 'deepseek-v4.1-flash' }, { id: 'claude-sonnet-5.5' }] }
    await expect(fetchGatewayModels(BASE, 'key', respondWith(body))).resolves.toEqual([
      'deepseek-v4.1-flash',
      'claude-sonnet-5.5',
    ])
  })

  it('tolerates a bare array and a models key', async () => {
    // The endpoint is the gateway's, not a standard anyone documented; accepting
    // the three shapes it could plausibly take is cheaper than a 403-shaped bug
    // report from a user whose account answers differently.
    await expect(fetchGatewayModels(BASE, 'key', respondWith([{ id: 'a' }, { id: 'b' }])))
      .resolves.toEqual(['a', 'b'])
    await expect(fetchGatewayModels(BASE, 'key', respondWith({ models: [{ id: 'c' }] })))
      .resolves.toEqual(['c'])
  })

  it('drops duplicates and entries without a usable id', async () => {
    const body = { data: [{ id: 'a' }, { id: 'a' }, { id: '' }, { id: 42 }, {}, null] }
    await expect(fetchGatewayModels(BASE, 'key', respondWith(body))).resolves.toEqual(['a'])
  })

  it('returns undefined for a body it does not recognise', async () => {
    await expect(fetchGatewayModels(BASE, 'key', respondWith({ nope: true }))).resolves.toBeUndefined()
    await expect(fetchGatewayModels(BASE, 'key', respondWith(null))).resolves.toBeUndefined()
  })

  it('returns undefined on a non-2xx response', async () => {
    // A rejected key and a broken gateway both mean "no catalog this start"; the
    // caller falls back rather than distinguishing them.
    await expect(fetchGatewayModels(BASE, 'key', respondWith({ data: [{ id: 'a' }] }, false)))
      .resolves.toBeUndefined()
  })

  it('returns undefined rather than throwing when the request fails', async () => {
    // This runs in the activation path: an offline start must not be an error.
    const failing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    await expect(fetchGatewayModels(BASE, 'key', failing)).resolves.toBeUndefined()
  })

  it('sends the key as a bearer token against the models path', async () => {
    const calls: { url: string, init?: RequestInit }[] = []
    const recording = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { ok: true, json: async () => ({ data: [{ id: 'a' }] }) }
    }) as unknown as typeof fetch

    await fetchGatewayModels(BASE, 'secret-key', recording)

    expect(calls[0]?.url).toBe('https://amr-link.open-design.ai/v1/models')
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret-key')
  })

  it('strips a trailing slash from the base URL', async () => {
    const calls: string[] = []
    const recording = (async (url: string) => {
      calls.push(url)
      return { ok: true, json: async () => ({ data: [] }) }
    }) as unknown as typeof fetch

    await fetchGatewayModels('https://amr-link.open-design.ai/v1/', 'k', recording)
    expect(calls[0]).toBe('https://amr-link.open-design.ai/v1/models')
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run tests/catalog-fetch.spec.ts`
Expected: FAIL，报无法解析 `../src/catalog-fetch.ts`。

- [ ] **Step 3: 实现**

新建 `src/catalog-fetch.ts`：

```ts
/**
 * Read the model catalog the gateway grants this account.
 *
 * `GET {baseURL}/models` answers per entitlement: a Go key returns the fourteen
 * Design Plan models, and a Plus or Pro key returns those plus the models that
 * tier pays for. That makes it the only source that cannot disagree with what
 * the account may actually call — a hard-coded table either omits a tier's
 * models or advertises models the account cannot use, and the second failure is
 * a 403 the user sees as "the plugin is broken".
 *
 * The shape is the gateway's own, so several plausible envelopes are accepted
 * and anything unrecognised reads as "no catalog this start" rather than an
 * error. The caller falls back to the bundled list.
 *
 * @module dsh-opendesign-go/catalog-fetch
 */

/** Deadline for the catalog request; the endpoint answers well under this. */
const MODELS_TIMEOUT_MS = 15_000

/**
 * Pull ids out of whichever envelope the gateway used.
 * @param body - parsed JSON.
 * @returns the ids in order, deduplicated, or undefined when unrecognised.
 */
function idsOf(body: unknown): string[] | undefined {
  const rows = Array.isArray(body)
    ? body
    : (body !== null && typeof body === 'object'
      ? ((body as Record<string, unknown>).data ?? (body as Record<string, unknown>).models)
      : undefined)
  if (!Array.isArray(rows)) return undefined

  const ids: string[] = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const id = (row as Record<string, unknown>).id
    if (typeof id !== 'string' || id.length === 0) continue
    if (!ids.includes(id)) ids.push(id)
  }
  // An empty list is a real answer — an account with no entitlement — and is
  // returned as such so the caller can tell it from a failed read.
  return ids
}

/**
 * Ask the gateway which models this account may use.
 *
 * Never throws: this runs while the plugin is activating, and an unreachable or
 * unhappy gateway must degrade to the bundled list rather than fail the start.
 * @param baseURL - inference base URL, with or without a trailing slash.
 * @param apiKey - the selected account's key.
 * @param fetchImpl - fetch implementation, injected for tests.
 * @param timeoutMs - request deadline.
 * @returns the model ids, or undefined when the catalog could not be read.
 */
export async function fetchGatewayModels(
  baseURL: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = MODELS_TIMEOUT_MS,
): Promise<string[] | undefined> {
  const base = baseURL.replace(/\/+$/u, '')
  try {
    const response = await fetchImpl(`${base}/models`, {
      headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return undefined
    return idsOf(await response.json())
  } catch {
    return undefined
  }
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run tests/catalog-fetch.spec.ts`
Expected: PASS，8 个用例。

- [ ] **Step 5: 提交**

```bash
git add src/catalog-fetch.ts tests/catalog-fetch.spec.ts
git commit -m "feat: read the model catalog the gateway grants this account"
```

---

### Task 2: 目录快照的解析与显示名

**Files:**
- Modify: `src/catalog.ts`
- Test: `tests/catalog.spec.ts`（新建，若已存在则扩展）

- [ ] **Step 1: 写失败的测试**

新建或追加到 `tests/catalog.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { GO_DESIGN_PLAN_MODELS, catalogRowsOf, displayNameOf, parseCatalog } from '../src/catalog.ts'

describe('parseCatalog', () => {
  const SNAPSHOT = {
    asOf: '2026-11-09T06:50:00.000Z',
    source: 'gateway',
    ids: ['deepseek-v4.1-flash', 'claude-sonnet-5.5'],
  }

  it('reads a gateway snapshot', () => {
    expect(parseCatalog(JSON.stringify(SNAPSHOT))).toEqual({
      asOf: '2026-11-09T06:50:00.000Z',
      source: 'gateway',
      ids: ['deepseek-v4.1-flash', 'claude-sonnet-5.5'],
      error: undefined,
    })
  })

  it('keeps the reason a fallback snapshot was written', () => {
    const raw = JSON.stringify({ ...SNAPSHOT, source: 'fallback', ids: ['a'], error: 'gateway said 403' })
    expect(parseCatalog(raw)?.error).toBe('gateway said 403')
    expect(parseCatalog(raw)?.source).toBe('fallback')
  })

  it('keeps an empty id list as a real answer', () => {
    // "This account grants nothing" is a different fact from "never asked", and
    // collapsing the two would make an entitlement problem look like a bug here.
    expect(parseCatalog(JSON.stringify({ source: 'gateway', ids: [] }))?.ids).toEqual([])
  })

  it('treats absent or malformed input as no snapshot', () => {
    for (const raw of [undefined, '', '{', 'null', '[]', '42']) {
      expect(() => parseCatalog(raw)).not.toThrow()
      expect(parseCatalog(raw)).toBeUndefined()
    }
    expect(parseCatalog(JSON.stringify({ source: 'gateway' }))).toBeUndefined()
  })
})

describe('displayNameOf', () => {
  it('uses the bundled name for a model it knows', () => {
    // The bundled table is the only source of officially spelled names; the
    // derivation below would turn this into "Deepseek V4.1 Flash".
    expect(displayNameOf('deepseek-v4.1-flash')).toBe('DeepSeek V4.1 Flash')
    expect(displayNameOf('gpt-6-luna')).toBe('GPT-6 Luna')
  })

  it('derives a readable name for a model it does not know', () => {
    expect(displayNameOf('claude-sonnet-5.5')).toBe('Claude Sonnet 5.5')
    expect(displayNameOf('kimi-k3.1-pro')).toBe('Kimi K3.1 Pro')
    expect(displayNameOf('gemini-3.8-flash')).toBe('Gemini 3.8 Flash')
  })

  it('leaves an id it cannot improve alone', () => {
    expect(displayNameOf('')).toBe('')
    expect(displayNameOf('weird')).toBe('Weird')
  })
})

describe('catalogRowsOf', () => {
  it('projects a snapshot into rows in the snapshot order', () => {
    const rows = catalogRowsOf({ asOf: undefined, source: 'gateway', ids: ['z-model', 'deepseek-v4-pro'], error: undefined })
    expect(rows.map((row) => row.id)).toEqual(['z-model', 'deepseek-v4-pro'])
    expect(rows[1]?.name).toBe('DeepSeek V4 Pro')
  })

  it('falls back to the bundled list when there is no snapshot', () => {
    const rows = catalogRowsOf(undefined)
    expect(rows.map((row) => row.id)).toEqual(GO_DESIGN_PLAN_MODELS.map((row) => row.id))
  })

  it('respects an empty snapshot instead of falling back', () => {
    expect(catalogRowsOf({ asOf: undefined, source: 'gateway', ids: [], error: undefined })).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run tests/catalog.spec.ts`
Expected: FAIL，`parseCatalog` / `displayNameOf` / `catalogRowsOf` 未导出。

- [ ] **Step 3: 实现**

在 `src/catalog.ts` 末尾追加（保留文件里已有的 `GO_DESIGN_PLAN_MODELS`、`seedModel`、`listSeedModels`）：

```ts
/** Where a catalog snapshot came from. */
export type CatalogSource = 'gateway' | 'fallback'

/** One reading of the models this account may use. */
export interface CatalogSnapshot {
  /** When the reading was taken, when the writer recorded it. */
  readonly asOf: string | undefined
  /** Whether the ids came from the gateway or from the bundled list. */
  readonly source: CatalogSource
  /** Model ids in display order. Empty is a real answer, not a missing one. */
  readonly ids: readonly string[]
  /** Why the bundled list was used, when it was. */
  readonly error: string | undefined
}

/** Capitalisation the derivation cannot guess from a hyphenated id. */
const NAME_FIXES: Readonly<Record<string, string>> = Object.freeze({
  deepseek: 'DeepSeek',
  gpt: 'GPT',
  glm: 'GLM',
  kimi: 'Kimi',
  mimo: 'MiMo',
  minimax: 'MiniMax',
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
  grok: 'Grok',
  qwen: 'Qwen',
  hy: 'Hunyuan',
  seed: 'Seedream',
})

/**
 * Human-readable name for a model id.
 *
 * The bundled table wins where it has an entry, because those names are spelled
 * the way the vendor spells them and no derivation reproduces that. Everything
 * else is derived, which is imprecise but legible and needs no maintenance when
 * the gateway adds a model.
 * @param id - model id from the catalog.
 * @returns a display name.
 */
export function displayNameOf(id: string): string {
  const known = GO_DESIGN_PLAN_MODELS.find((model) => model.id === id)
  if (known !== undefined) return known.name
  if (id.length === 0) return ''
  return id.split('-').map((part) => {
    const fix = NAME_FIXES[part.toLowerCase()]
    if (fix !== undefined) return fix
    // Version and size segments keep whatever casing the gateway used.
    if (/^\d/u.test(part)) return part
    return part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
  }).join(' ')
}

/**
 * Read the catalog snapshot from its serialized settings field.
 *
 * A malformed value reads as "no snapshot" rather than throwing: the field is
 * written by a background read, and one bad character must not take the whole
 * settings page down.
 * @param raw - serialized snapshot, or undefined/empty when unset.
 * @returns the snapshot, or undefined when absent or unusable.
 */
export function parseCatalog(raw: string | undefined): CatalogSnapshot | undefined {
  if (raw === undefined || raw.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const row = parsed as Record<string, unknown>
  const ids = row.ids
  if (!Array.isArray(ids)) return undefined
  const clean = ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
  const source: CatalogSource = row.source === 'fallback' ? 'fallback' : 'gateway'
  return {
    asOf: typeof row.asOf === 'string' && row.asOf.length > 0 ? row.asOf : undefined,
    source,
    ids: clean,
    error: typeof row.error === 'string' && row.error.length > 0 ? row.error : undefined,
  }
}

/**
 * Project a snapshot into the rows every consumer renders.
 *
 * A missing snapshot means the read has not landed, so the bundled list stands
 * in; an *empty* snapshot means the account grants nothing, and substituting the
 * bundled list there would advertise models the account cannot call.
 * @param snapshot - parsed snapshot, or undefined when none was ever written.
 * @returns rows in display order.
 */
export function catalogRowsOf(snapshot: CatalogSnapshot | undefined): readonly CatalogModel[] {
  if (snapshot === undefined) return GO_DESIGN_PLAN_MODELS
  return snapshot.ids.map((id) => ({ id, name: displayNameOf(id) }))
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run tests/catalog.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/catalog.ts tests/catalog.spec.ts
git commit -m "feat: parse a catalog snapshot and derive names for new models"
```

---

### Task 3: 未收录模型的通用参数

**Files:**
- Modify: `src/model-params.ts`
- Test: `tests/model-params.spec.ts`（扩展现有文件）

- [ ] **Step 1: 写失败的测试**

在 `tests/model-params.spec.ts` 的 import 里加上 `GENERIC_DEFAULTS`，并追加：

```ts
describe('paramsOf for a model the table does not carry', () => {
  it('returns the generic defaults instead of undefined', () => {
    // New ids arrive from the gateway before any vendor documentation reaches
    // this table. Returning undefined hid every parameter for them, so the
    // picker showed no context window and no reasoning selector at all.
    const params = paramsOf('claude-sonnet-5.5', undefined)
    expect(params).toEqual(GENERIC_DEFAULTS)
  })

  it('still applies overrides on top of the generic defaults', () => {
    const params = paramsOf('claude-sonnet-5.5', { 'claude-sonnet-5.5': { maxTokens: 64_000 } })
    expect(params?.maxTokens).toBe(64_000)
    expect(params?.contextWindow).toBe(GENERIC_DEFAULTS.contextWindow)
  })

  it('leaves a documented model on its own numbers', () => {
    expect(paramsOf('deepseek-v4.1-flash', undefined)).toBe(MODEL_DEFAULTS['deepseek-v4.1-flash'])
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run tests/model-params.spec.ts`
Expected: FAIL，`GENERIC_DEFAULTS` 未导出，或 `paramsOf` 返回 undefined。

- [ ] **Step 3: 实现**

在 `src/model-params.ts` 的 `MODEL_DEFAULTS` 定义之后追加：

```ts
/**
 * Parameters for a model this build has no documented numbers for.
 *
 * The gateway already grants the model, so it is callable; withholding the
 * metadata hid it from the picker and dropped the reasoning selector. These are
 * deliberately conservative and deliberately visible: the model row says the
 * numbers are generic, because a wrong context window changes truncation
 * behaviour and a wrong output cap changes `max_tokens`.
 *
 * The reasoning list is the full range for the same reason as an unknown id in
 * `resolveModel`: this build cannot know which values the model refuses, and
 * hiding levels is the worse error.
 */
export const GENERIC_DEFAULTS: ModelParams = Object.freeze({
  contextWindow: 1_000_000,
  maxTokens: 128_000,
  inputModalities: Object.freeze(['text', 'image'] as const) as readonly ModelModality[],
  reasoningEfforts: Object.freeze([
    'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'ultra', 'max',
  ] as const) as readonly ReasoningEffortName[],
})
```

然后把 `paramsOf` 的实现改成：

```ts
export function paramsOf(
  model: string,
  overrides: Readonly<Record<string, ModelParamOverride>> | undefined,
): ModelParams {
  // An id the table does not carry still gets numbers: the gateway granted it,
  // so it is callable, and returning undefined here hid every parameter from the
  // picker instead of flagging them as estimates.
  const base = MODEL_DEFAULTS[model] ?? GENERIC_DEFAULTS
  const override = overrides?.[model]
  if (override === undefined) return base
  return {
    contextWindow: clamp(override.contextWindow, base.contextWindow, MIN_CONTEXT_WINDOW, MAX_CONTEXT_WINDOW),
    maxTokens: clamp(override.maxTokens, base.maxTokens, MIN_MAX_TOKENS, MAX_MAX_TOKENS),
    inputModalities: base.inputModalities,
    reasoningEfforts: base.reasoningEfforts,
  }
}
```

同时把 `paramsOf` 的返回类型从 `ModelParams | undefined` 改成 `ModelParams`，并更新它的 JSDoc（原文说「undefined when the model is unknown」，现在不再如此）。

- [ ] **Step 4: 修掉因返回类型变宽而产生的调用点**

Run: `npm run typecheck`
逐个处理报错。`src/adapter.ts` 里 `params === undefined` 的分支会变成死代码，删除它并直接使用 `params`。其它位置若只做 `params?.x` 的空安全访问，可以保留（合法但冗余），不影响类型检查。

- [ ] **Step 5: 跑测试，确认通过**

Run: `npx vitest run tests/model-params.spec.ts tests/adapter.spec.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/model-params.ts src/adapter.ts tests/model-params.spec.ts
git commit -m "feat: give an undocumented model generic parameters instead of none"
```

---

### Task 4: catalogJson 配置字段

**Files:**
- Modify: `src/config-contract.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: 加字段**

`src/config-contract.ts`：在 `readonly updateJson: string` 之后加：

```ts
  /**
   * The models this account may use, as a serialized snapshot.
   *
   * Written by the startup read against `GET {baseURL}/models`, which answers
   * per entitlement. Empty means the read has not landed yet, and consumers fall
   * back to the bundled list; an empty `ids` *inside* a snapshot means the
   * account genuinely grants nothing.
   */
  readonly catalogJson: string
```

`src/config.ts` 的两处 schema（`OpenDesignConfig` 与 `Config`）各加一行，紧跟 `updateJson`：

```ts
  catalogJson: z.string().default(''),
```

`Config` 里那行要带 `.volatile()`：

```ts
  catalogJson: z.string().default('').volatile(),
```

`LiveConfig` 接口里加：

```ts
  /** Serialized catalog snapshot written by the startup read. */
  readonly catalogJson: { get(): string }
```

`readConfig` 的返回对象里加：

```ts
    catalogJson: config.catalogJson.get(),
```

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: 退出码 0，无报错。

- [ ] **Step 3: 跑配置测试**

Run: `npx vitest run tests/config.spec.ts`
Expected: PASS。若有断言固定了字段数量，按实际失败信息更新为包含新字段。

- [ ] **Step 4: 提交**

```bash
git add src/config.ts src/config-contract.ts
git commit -m "feat: carry the catalog snapshot in the configuration"
```

---

### Task 5: 启动时拉目录并写回

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 加 import**

在 `src/index.ts` 里加：

```ts
import { fetchGatewayModels } from './catalog-fetch.ts'
```

并把 `catalog.ts` 的 import 扩展为需要的内容（现有是 `import { listSeedModels } from './catalog.ts'`）：

```ts
import { GO_DESIGN_PLAN_MODELS, listSeedModels } from './catalog.ts'
```

- [ ] **Step 2: 加写回器**

在 `const updateRetry = createCacheRetry({...})` 之后加：

```ts
  const catalogRetry = createCacheRetry({
    delays: CACHE_RETRY_MS,
    onRetry: (delayMs, attempt) => {
      ctx.logger.info(`llm-opendesign-go: retrying catalogJson in ${delayMs}ms (attempt ${attempt})`)
    },
    onGiveUp: (attempts) => {
      ctx.logger.warn(`llm-opendesign-go: catalogJson is still not cached after ${attempts} attempts`)
    },
  })
```

并在 `ctx.effect(() => () => { diagnosticsRetry.dispose(); updateRetry.dispose() })` 里加一行 `catalogRetry.dispose()`。

- [ ] **Step 3: 加拉取函数**

在 `void refreshIfConfigured()` 之后、版本检查块之前加：

```ts
  /**
   * Read which models this account may use and publish the answer.
   *
   * `GET {baseURL}/models` answers per entitlement, which is the only way a Plus
   * or Pro subscriber sees the models their tier pays for without this plugin
   * shipping a table per tier. A failed read falls back to the bundled Go list
   * so the picker is never empty, and records why so the page can say it.
   * @param ref - credential reference of the account to ask as.
   */
  const publishCatalog = async (ref: string): Promise<void> => {
    const write = fieldWriterOf(ctx)
    if (write === undefined) return
    const baseURL = current().baseURL
    const key = await resolveApiKey(ref).catch(() => undefined)
    // No key means the route is not registered either; writing a fallback
    // snapshot here would claim a catalog for a route that cannot serve it.
    if (key === undefined) return
    const ids = await fetchGatewayModels(baseURL, key)
    const asOf = new Date().toISOString()
    const payload = ids === undefined
      ? {
        asOf,
        source: 'fallback',
        ids: GO_DESIGN_PLAN_MODELS.map((model) => model.id),
        error: '未能读取网关模型目录，正在显示内置的 Go 套餐列表',
      }
      : { asOf, source: 'gateway', ids }
    ctx.logger.info(
      `llm-opendesign-go: catalog ${payload.source} (${payload.ids.length} models)`,
    )
    const json = JSON.stringify(payload)
    void catalogRetry.publish(
      () => ({ fingerprint: json, json }),
      (value) => write('catalogJson', value),
    )
  }
```

- [ ] **Step 4: 在注册路径上调用它**

找到 `applyRoute` 里注册成功后打印日志的那一处（`route "..." registered as ...`），在它之前插入：

```ts
      void publishCatalog(triedRef)
```

若 `triedRef` 为空，用 `current().apiKeyEnv` 兜底：

```ts
      void publishCatalog(triedRef.length > 0 ? triedRef : current().apiKeyEnv)
```

- [ ] **Step 5: 类型检查与测试**

Run: `npm run typecheck`
Expected: 退出码 0。

Run: `npx vitest run`
Expected: PASS（393 + 新增用例）。

- [ ] **Step 6: 提交**

```bash
git add src/index.ts
git commit -m "feat: publish the entitlement-aware catalog on activation"
```

---

### Task 6: 适配器与设置页改读快照

**Files:**
- Modify: `src/adapter.ts`
- Modify: `src/client/ModelsCard.tsx`
- Modify: `src/client/ModelsCard.module.css`
- Test: `tests/models-card.spec.ts`（新建）

- [ ] **Step 1: 适配器**

`src/adapter.ts` 的 `listModels` 改为：

```ts
  async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const config = this.#options.config()
    const snapshot = parseCatalog(config.catalogJson)
    const rows = catalogRowsOf(snapshot)
    const enabled = config.enabledModels ?? []
    if (enabled.length === 0) return rows.map((row) => projectRow(provider, row))
    return rows.filter((row) => enabled.includes(row.id)).map((row) => projectRow(provider, row))
  }
```

其中 `projectRow` 是新增的模块级函数，把 `CatalogModel` 转成 `LlmModelInfo`（逻辑与现有 `listSeedModels` 的输出一致）：

```ts
/**
 * Project one catalog row into the harness vocabulary for a route.
 * @param provider - route that owns the model.
 * @param row - catalog row.
 * @returns discoverable model info.
 */
function projectRow(
  provider: string,
  row: { readonly id: string, readonly name: string },
): LlmModelInfo {
  const modalities = paramsOf(row.id, undefined).inputModalities
  return { provider, id: row.id, name: row.name, inputModalities: modalities }
}
```

`resolveModel` 里把 `const row = seedModel(model)` 改成：

```ts
    const row = catalogRowsOf(parseCatalog(this.#options.config().catalogJson))
      .find((entry) => entry.id === model)
```

其余分支逻辑保持不变（`row === undefined` 时仍返回自身 id 与全档思考等级）。

import 调整：加 `catalogRowsOf, parseCatalog`，`seedModel` 若不再使用则删掉。

- [ ] **Step 2: 设置页读快照**

`src/client/ModelsCard.tsx`：

把 `import { GO_DESIGN_PLAN_MODELS } from '../catalog.ts'` 改成：

```ts
import { GO_DESIGN_PLAN_MODELS, catalogRowsOf, parseCatalog } from '../catalog.ts'
```

在组件体内（`overrides` 之前）加：

```ts
  const catalog = useMemo(() => parseCatalog(config?.catalogJson), [config?.catalogJson])
  const rows = useMemo(() => catalogRowsOf(catalog), [catalog])
```

把三处 `GO_DESIGN_PLAN_MODELS` 换成 `rows`：

- `toggle` 里的 `GO_DESIGN_PLAN_MODELS.map((row) => row.id)` → `rows.map((row) => row.id)`
- `const allOn = next.length === GO_DESIGN_PLAN_MODELS.length` → `const allOn = next.length === rows.length`
- 渲染循环 `GO_DESIGN_PLAN_MODELS.map((model) => {` → `rows.map((model) => {`
- 卡片的 `actions` 里 `{GO_DESIGN_PLAN_MODELS.length} 个` → `{rows.length} 个`

- [ ] **Step 3: 未收录标注**

在渲染循环里，`const base = MODEL_DEFAULTS[model.id]` 之后加：

```ts
          const undocumented = base === undefined
```

在该行的 `modelMeta` span 之后（`</span>` 与 `<Button>` 之间）插入：

```tsx
                  {undocumented && (
                    <span className={styles.generic}>参数未收录</span>
                  )}
```

并在该行底部（`{isEditing && ...}` 之后、闭合 `</div>` 之前）插入：

```tsx
              {undocumented && (
                <p className={styles.hint}>
                  插件未收录该模型的官方规格，上面是通用默认值（上下文 1M、输出 128K、全部思考档位）。
                  请按厂商文档核对后点「改参数」修改；确认过的值不再显示此提示。
                </p>
              )}
```

- [ ] **Step 4: 加样式**

在 `src/client/ModelsCard.module.css` 末尾追加：

```css
/* Marks a row whose numbers this build guessed. Deliberately a filled badge
   rather than muted text: a wrong context window changes truncation, so the row
   has to look different from one backed by documentation. */
.generic {
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--ods-warn) 50%, transparent);
  background: color-mix(in srgb, var(--ods-warn) 12%, transparent);
  font-size: 11px;
  color: var(--ods-warn);
  white-space: nowrap;
}

.hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ods-text-3);
}
```

- [ ] **Step 5: 写渲染测试**

新建 `tests/models-card.spec.ts`：

```ts
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModelsCard } from '../src/client/ModelsCard.tsx'
import type { OpenDesignConfig } from '../src/config-contract.ts'
import type { ConfigForm } from '../src/client/form.ts'

/** A form stuck on one snapshot. */
function staticForm(value: OpenDesignConfig): ConfigForm<OpenDesignConfig> {
  return {
    subscribe: () => () => {},
    getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value }),
  } as unknown as ConfigForm<OpenDesignConfig>
}

/** Render the card with one configuration. */
function render(value: Partial<OpenDesignConfig>): string {
  return renderToStaticMarkup(createElement(ModelsCard, {
    form: staticForm(value as OpenDesignConfig),
    config: value as OpenDesignConfig,
    editable: true,
  }))
}

describe('ModelsCard', () => {
  it('renders the models the catalog snapshot names', () => {
    const html = render({
      catalogJson: JSON.stringify({ source: 'gateway', ids: ['claude-sonnet-5.5', 'deepseek-v4-pro'] }),
    })
    expect(html).toContain('Claude Sonnet 5.5')
    expect(html).toContain('DeepSeek V4 Pro')
    expect(html).toContain('2 个')
  })

  it('marks a model whose parameters this build does not carry', () => {
    // The user has to be able to tell a documented row from a guessed one: the
    // context window drives truncation and max_tokens becomes the request's cap.
    const html = render({
      catalogJson: JSON.stringify({ source: 'gateway', ids: ['claude-sonnet-5.5'] }),
    })
    expect(html).toContain('参数未收录')
    expect(html).toContain('通用默认值')
  })

  it('leaves a documented model unmarked', () => {
    const html = render({
      catalogJson: JSON.stringify({ source: 'gateway', ids: ['deepseek-v4.1-flash'] }),
    })
    expect(html).toContain('DeepSeek V4.1 Flash')
    expect(html).not.toContain('参数未收录')
  })

  it('falls back to the bundled list when no snapshot was ever written', () => {
    const html = render({})
    expect(html).toContain('DeepSeek V4.1 Flash')
    expect(html).toContain('14 个')
    expect(html).not.toContain('参数未收录')
  })
})
```

- [ ] **Step 6: 跑测试**

Run: `npx vitest run tests/models-card.spec.ts tests/adapter.spec.ts`
Expected: PASS。若 `ModelsCard` 的 props 形状与测试不符，按实际签名调整测试，不要改组件签名。

- [ ] **Step 7: 提交**

```bash
git add src/adapter.ts src/client/ModelsCard.tsx src/client/ModelsCard.module.css tests/models-card.spec.ts
git commit -m "feat: show the catalog the account is entitled to, marking guessed parameters"
```

---

### Task 7: 版本提升、文档与整体验收

**Files:**
- Modify: `package.json`
- Modify: `src/config-contract.ts`
- Modify: `CHANGELOG.md`
- Modify: `docs/models.md`（若存在且列出模型）
- Modify: `README.md`（若列出模型或套餐）

- [ ] **Step 1: 提升版本**

`package.json` 的 `"version"` 改成 `0.1.18`，`src/config-contract.ts` 的 `PLUGIN_VERSION` 也改成 `0.1.18`（build 会校验两者相等，不等直接抛错）。

- [ ] **Step 2: 写 CHANGELOG**

在 `CHANGELOG.md` 的 `## 0.1.17` 之前插入：

```markdown
## 0.1.18

支持 Plus / Pro / Max 套餐的模型（issue #3）。

### 模型目录改为向网关查询

此前模型列表是写死的 14 条 —— 那是 Go 套餐的 Design Plan 模型。Plus、Pro、Max 各自还有一批额外模型，插件完全不知道，所以更高档位的用户看不到自己买到的模型，例如 Claude Sonnet 5.5。

现在启动时用当前账号的 API key 请求 `GET {baseURL}/models`。这个端点是按账号额度等级返回的：Go 拿到 14 个，Plus 及更高档位拿到各自的名额。插件不需要判断用户是什么套餐，权限由网关给，插件照单展示。

拉取失败（离线、网关故障、key 无效）时回退到内置的 14 条并写明原因，页面不会突然空掉。

### 未收录参数的新模型

网关先于本文档收录新模型是常态。以前 `MODEL_DEFAULTS` 查不到的 id 拿不到任何参数，表现为「列表里没有它」或「选了之后没有思考档位」。

现在改用一套通用默认值（上下文 1M、输出 128K、文本 + 图像、全部思考档位），并在该行标注「参数未收录」加一行说明。理由是这些数字是估的：上下文影响截断判定，输出上限直接变成请求的 `max_tokens`，用户有权知道哪些是核对过的、哪些不是。改过参数后标注消失。
```

- [ ] **Step 3: 更新文档**

Run: `Select-String -Path docs\models.md,README.md -Pattern "14|GO_DESIGN_PLAN|套餐"`

按命中结果更新措辞：把「Go 套餐的 14 个模型」这类表述改成「按账号套餐从网关读取，Go 为 14 个」。不要改动与模型目录无关的段落。

- [ ] **Step 4: 全量门禁**

Run: `npm run typecheck`
Expected: 退出码 0。

Run: `npx vitest run`
Expected: 全部 PASS。

Run: `npm run compile`
Expected: `built dsh-opendesign-go@0.1.18 -> lib/`。

Run: `npm run check:dist`
Expected: `check:dist: lib/ matches source`。

Run: `npm run verify:load`
Expected: `plugin-smoke: built artifact loads and mounts on Cordis`。

- [ ] **Step 5: 提交**

```bash
git add package.json src/config-contract.ts CHANGELOG.md docs README.md lib
git commit -m "chore: release 0.1.18 with plan-tier model discovery"
```

- [ ] **Step 6: 同步到 desktop profile**

Run: `node scripts/sync-profile.mjs --profile desktop`
Expected: `sync-profile: lib/ mirrored (N files) into desktop`。

- [ ] **Step 7: 手工验收**

重启桌面端后：

1. Go 账号的设置页仍显示 14 个模型，顺序不变，没有「参数未收录」标注。
2. 日志出现 `catalog gateway (14 models)`。
3. 断开网络重启，日志出现 `catalog fallback`，页面仍显示 14 个。

---

## 自审记录

- **规格覆盖**：目录来源 → Task 1/5；未收录参数 → Task 3；界面显式声明 → Task 6 Step 3；Go 行为不变 → Task 2 `catalogRowsOf` 兜底 + Task 6 测试；显示名 → Task 2；配置字段 → Task 4；兜底与错误可见 → Task 5。无遗漏。
- **占位符**：所有代码步骤给出完整实现，命令与预期输出齐全。
- **类型一致性**：`CatalogSnapshot` 在 Task 2 定义（`asOf` / `source` / `ids` / `error`），Task 5 写出的 JSON 字段与之一一对应，Task 6 通过 `parseCatalog` 读取。`paramsOf` 在 Task 3 改为必然返回 `ModelParams`，Task 6 的 `projectRow` 直接取 `.inputModalities`，不再需要空值分支。
- **风险**：Task 3 Step 4 明确要求跑 `typecheck` 清理 `paramsOf` 返回类型变宽带来的死代码，避免把 `params === undefined` 的分支留在 `adapter.ts` 里。
