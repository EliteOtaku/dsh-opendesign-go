# 大图请求 413 与生图模型不可用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图片很多的会话在撞到网关 413 之前就以宿主能修复的方式失败并重试；让网关目录里的生图模型真的能产出图片，而不是选中就报错。

**Architecture:** 两个改动共用一条事实：`/models` 把对话模型和生图模型混在一个列表里，而插件此前既不分端点，也不计量请求体里的图片字节。预算部分遵循宿主已有的 `IMAGE_OFFLOAD_REQUIRED` 契约（适配器只报数，不丢图），生图部分新增 `/images/generations` 通道并把结果经 `attachments.saveImage` 落成持久 image block。目录快照新增 `imageIds` 标记哪些 id 是生图模型。

**Tech Stack:** TypeScript（`exactOptionalPropertyTypes`、`noUncheckedIndexedAccess`）、React 18、vitest、esbuild。

**设计文档:** `docs/superpowers/specs/2026-11-09-image-budget-and-image-models-design.md`

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/image-request-budget.ts` | 新建。预算常量与「还差多少张要 offload」的计算 |
| `src/image-generation.ts` | 新建。`/images/generations` 的请求、解码、嗅探、失败分类 |
| `src/image-bytes.ts` | 存储 seam 增加 `saveImage?`；`SavedImage` 复用 `ImageBlock['attachment']` |
| `src/catalog.ts` | `imageGeneration` 标记、`imageIds`、`isImageModel` 分类规则 |
| `src/catalog-fetch.ts` | 返回 id + 可选 `outputModalities`，不再只返 id |
| `src/adapter.ts` | 预算检查、生图分支、`#isImageModel`、`#generateImage` |
| `src/index.ts` | 写 `imageIds`；把附件存储读取器交给适配器 |
| `src/client/ModelsCard.tsx` | 生图行标注与说明 |
| `tests/*` | 两个新 spec，两个扩展 spec，两个跟随契约调整 |

所有命令在 `D:\deepseek_workspace\dsh-opendesign-go` 下执行。

---

### Task 1: 请求图片预算

**Files:**
- Create: `src/image-request-budget.ts`
- Test: `tests/image-request-budget.spec.ts`

- [ ] **Step 1: 写测试**

新建 `tests/image-request-budget.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import type { ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm'
import {
  MAX_REQUEST_IMAGE_BYTES,
  MAX_REQUEST_IMAGES,
  base64BytesOf,
  overBudgetOffloadCount,
} from '../src/image-request-budget.ts'

/** One image occurrence of a known encoded size. */
function imageOf(bytes: number, offloaded = false): ImageBlock {
  return {
    type: 'image',
    attachment: { attachmentId: `sha256:${bytes}`, mediaType: 'image/png', bytes, width: 1, height: 1 } as ImageBlock['attachment'],
    ...(offloaded ? { offloaded: true as const } : {}),
  }
}

/** One user message carrying the given images. */
function turnOf(images: readonly ImageBlock[]): RequestMessage {
  return { role: 'user', content: [...images] }
}

describe('image request budget', () => {
  it('charges the exact base64 length of the recorded bytes', () => {
    expect(base64BytesOf(imageOf(3))).toBe(4)
    expect(base64BytesOf(imageOf(1))).toBe(4)
    expect(base64BytesOf(imageOf(1000))).toBe(1336)
  })

  it('counts a reference with no usable byte count as free instead of infinite', () => {
    for (const bytes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(base64BytesOf(imageOf(bytes))).toBe(0)
    }
  })

  it('asks for nothing when the request is within budget', () => {
    const small = Array.from({ length: 10 }, () => imageOf(200_000))
    expect(overBudgetOffloadCount([turnOf(small)])).toBe(0)
  })

  it('asks for an offload once the byte budget is exceeded', () => {
    const heavy = Array.from({ length: 5 }, () => imageOf(8 * 1024 * 1024))
    const count = overBudgetOffloadCount([turnOf(heavy)])
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(heavy.length)
  })

  it('asks for an offload once the occurrence budget is exceeded', () => {
    const many = Array.from({ length: MAX_REQUEST_IMAGES + 5 }, () => imageOf(1000))
    expect(overBudgetOffloadCount([turnOf(many)])).toBeGreaterThan(0)
  })

  it('ignores occurrences the surface already offloaded', () => {
    const kept = [imageOf(200_000)]
    const dropped = Array.from({ length: 30 }, () => imageOf(8 * 1024 * 1024, true))
    expect(overBudgetOffloadCount([turnOf([...kept, ...dropped])])).toBe(0)
  })

  it('advances in whole quanta, so a slightly larger history asks for the same prefix', () => {
    const base = Array.from({ length: 12 }, () => imageOf(8 * 1024 * 1024))
    const grown = [...base, imageOf(1024)]
    expect(overBudgetOffloadCount([turnOf(grown)]))
      .toBe(overBudgetOffloadCount([turnOf(base)]))
  })

  it('names a count that actually clears the budget when offloaded', () => {
    const heavy = Array.from({ length: 12 }, () => imageOf(8 * 1024 * 1024))
    const messages = [turnOf(heavy)]
    const count = overBudgetOffloadCount(messages)
    expect(count).toBeGreaterThan(0)
    const offloaded = messages.map((message) => ({
      ...message,
      content: message.content.map((block, index) => (
        block.type === 'image' && index < count ? { ...block, offloaded: true as const } : block
      )),
    }))
    expect(overBudgetOffloadCount(offloaded as RequestMessage[])).toBe(0)
  })

  it('keeps the ceiling under the smallest measured gateway body limit', () => {
    expect(MAX_REQUEST_IMAGE_BYTES).toBeLessThan(30 * 1024 * 1024)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/image-request-budget.spec.ts`
Expected: FAIL，无法解析 `../src/image-request-budget.ts`。

- [ ] **Step 3: 实现**

新建 `src/image-request-budget.ts`（完整文件，见设计文档「数据契约」；常量 24 MiB / 8 MiB / 60 / 20，`base64BytesOf` 对非正数返回 0，`overBudgetOffloadCount` 转发给 `requiredImageOffload` 且 `representation: 'base64'`）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/image-request-budget.spec.ts`
Expected: PASS，9 个用例。

- [ ] **Step 5: 提交**

```bash
git add src/image-request-budget.ts tests/image-request-budget.spec.ts
git commit -m "feat: budget the inline image bytes one request may carry"
```

---

### Task 2: 生图端点通道

**Files:**
- Create: `src/image-generation.ts`
- Modify: `src/gateway-error.ts`（无需改动，仅确认 `classifyGatewayFailure` 已导出）
- Test: `tests/image-generation.spec.ts`

- [ ] **Step 1: 写测试**

新建 `tests/image-generation.spec.ts`，覆盖：四种魔数嗅探、默认 PNG、OpenAI/`images`/裸数组三种信封、坏成员跳过、无法识别返回空数组、请求形状与鉴权头、`size` 透传与省略、错误信封走共享分类器（`invalid_api_key` → `INVALID_CREDENTIAL`）、非 JSON body 保留状态码、无字节时 `INVALID_REQUEST`、传输失败 `SERVER`。`ImageGenerationRequest` 带可选 `fetchImpl`，测试用它注入。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/image-generation.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

新建 `src/image-generation.ts`。要点：

- `sniffMediaType` 按魔数判 PNG/JPEG/WebP/GIF，兜底 PNG。
- `imagesOf` 接受 `{data}` / `{images}` / 裸数组，只收 base64 成员，`url` 成员跳过（没有第二次请求就没法变成持久字节）。
- `failureOf` 保留状态码；body 不是 JSON 时用原文前 500 字，交给 `classifyGatewayFailure`。
- `generateImages` 发 `{model, prompt, n: 1, size?}`，`authorization: Bearer <key>`；`!ok` 走 `failureOf`；解析失败抛 `INVALID_REQUEST`；解码为空抛 `INVALID_REQUEST`（带 "no image bytes"）；传输失败抛 `SERVER`。**不重试。**

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/image-generation.spec.ts`
Expected: PASS，12 个用例。

- [ ] **Step 5: 提交**

```bash
git add src/image-generation.ts tests/image-generation.spec.ts
git commit -m "feat: speak the images endpoint so generation models return pictures"
```

---

### Task 3: 目录区分对话模型与生图模型

**Files:**
- Modify: `src/catalog.ts`
- Modify: `src/catalog-fetch.ts`
- Test: `tests/catalog.spec.ts`、`tests/catalog-fetch.spec.ts`

- [ ] **Step 1: 改 `catalog-fetch.ts`**

`fetchGatewayModels` 返回 `GatewayModelEntry[]` 而不是 `string[]`：

```ts
export interface GatewayModelEntry {
  readonly id: string
  /** 目录声明的输出模态，未声明时为 undefined。解释权归 catalog.ts。 */
  readonly outputModalities?: readonly string[]
}
```

`outputModalitiesOf(row)` 读顶层 `output_modalities`，再读 `architecture.output_modalities`，都是字符串数组才收。

- [ ] **Step 2: 改 `catalog.ts`**

- `CatalogModel` 加 `readonly imageGeneration?: true`。
- `CatalogSnapshot` 加 `readonly imageIds: readonly string[]`，`parseCatalog` 读它并**只保留同时出现在 `ids` 里的项**（陈旧条目不能复活一个账号已失去的模型）。
- `KNOWN_IMAGE_MODEL_IDS`（`gpt-image-2`、`gpt-image-2.6-flare`、`nano-banana-2`、`nano-banana-2-lite`、`seedream-5.0`、`seedream-5.0-pro`）。
- `isImageModel(id, outputModalities?)`：有声明就 `!outputModalities.includes('text')`；没声明才查表。
- `catalogRowsOf` 给命中 `imageIds` 的行加 `imageGeneration: true`。

- [ ] **Step 3: 改测试**

`tests/catalog-fetch.spec.ts`：

- 加 `idsOf` 辅助函数把条目映射成 id，原有断言改为 `idsOf(...)`。
- 新增一条：顶层与 `architecture` 两种形状都能读到，未描述的条目不带字段。

`tests/catalog.spec.ts`：

- `reads a gateway snapshot` 的期望加 `imageIds: []`。
- 新增 `keeps the image models apart from the chat models`：`ids` 含两个、`imageIds` 只含生图那个，`catalogRowsOf` 出来的生图行带 `imageGeneration: true`。
- 新增 `drops an image id the snapshot no longer carries`。

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/catalog.spec.ts tests/catalog-fetch.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/catalog.ts src/catalog-fetch.ts tests/catalog.spec.ts tests/catalog-fetch.spec.ts
git commit -m "feat: tell image-generation models apart in the catalog snapshot"
```

---

### Task 4: 适配器接入预算与生图通道

**Files:**
- Modify: `src/adapter.ts`
- Modify: `src/image-bytes.ts`
- Modify: `src/index.ts`
- Test: `tests/adapter.spec.ts`

- [ ] **Step 1: 存储 seam**

`src/image-bytes.ts`：

```ts
export type SavedImage = ImageBlock['attachment']
```

`AttachmentsSeam` 加可选的 `saveImage?`（`{ data, mediaType, name? } → Promise<SavedImage>`）。

- [ ] **Step 2: 适配器选项**

`OpenDesignAdapterOptions` 加：

```ts
attachments?: () => AttachmentsSeam | undefined
```

必须是函数而不是值：适配器在 `ctx.inject(['attachments'])` 落地之前就构造好了，捕获值会把「没有存储」永久钉住。

- [ ] **Step 3: 预算检查**

在 `stream()` 里、账户循环之前：

```ts
const resolver = this.#imageResolverFor(options.model)
if (resolver !== undefined) {
  const overBudget = overBudgetOffloadCount(options.messages)
  if (overBudget > 0) {
    throw new LlmError(
      `OpenDesign: this request carries more inline image bytes than the route allows; `
      + `${overBudget} of the oldest images must be offloaded before it can be sent`,
      IMAGE_OFFLOAD_REQUIRED_CODE,
      { offloadImages: overBudget },
    )
  }
}
```

然后 `dispatch(...)` 复用同一个 `resolver`。只在有 resolver 时计量：纯文本模型下图片本来就投影成占位文本，对它计费会要求一次释放不了任何字节的 offload。

- [ ] **Step 4: 生图分支**

`stream()` 最前面：

```ts
if (this.#isImageModel(options.model)) {
  yield* this.#generateImage(options, config, candidates)
  return
}
```

`#isImageModel(model)`：先查 `catalogRowsOf(parseCatalog(config.catalogJson))` 里有没有这个 id（有就用 `row.imageGeneration === true`），没有才退回 `isImageModel(model)`。

`#generateImage`：

1. `this.#options.attachments?.()` 没有 `saveImage` → `UNSUPPORTED_OPTION`。
2. `promptOf(options)` 为空 → `INVALID_REQUEST`。
3. `baseURL` 为空 → `INVALID_REQUEST`。
4. 循环候选账号，`generateImages({ model, prompt, url: `${base}/images/generations`, apiKey, signal: deadlineSignal(...) })`。
5. 成功：先 yield 一个文本块说明张数，再逐张 `saveImage` 并 yield `block-start`/`block-end`，最后 `onAccountSettled(ref)` 与 `finish`。
6. 失败：`isRetryableAccountFailure` 且还有下一个账号则继续，否则抛。

`promptOf(options)`：从后往前找最后一条 `user` 消息，把其中 `text` 块（`trim()` 非空）用换行拼起来。`extensionOf(mediaType)` 给存储起名用。

- [ ] **Step 5: 接线**

`src/index.ts` 构造适配器时加 `attachments: () => attachments`；`publishCatalog` 用 `entries.map(id)` 与 `entries.filter(isImageModel(...))` 产出 `ids` / `imageIds`，日志带两个计数。

- [ ] **Step 6: 加测试**

`tests/adapter.spec.ts` 追加两组 describe：

预算组——40 张 900 KB 图 → `IMAGE_OFFLOAD_REQUIRED` 且 `offloadImages > 0` 且 `fetch` **零调用**；2 张 → 正常发送；已 offload 的 40 张 → 正常发送。

生图组——`catalogJson` 标 `seedream-5.0`：打到 `/images/generations` 且 body 带 prompt；字节落进存储并产出 image block 且以 `finish` 结尾；堆到 `BlockAssembler` 得到 `['text', 'image']`；无存储 → `UNSUPPORTED_OPTION`；空 prompt → `INVALID_REQUEST`；`deepseek-v4.1-flash` 仍打 `/chat/completions`。

- [ ] **Step 7: 跑测试**

Run: `npm run typecheck && npx vitest run`
Expected: 全绿（444 + 新增）。

- [ ] **Step 8: 提交**

```bash
git add src/adapter.ts src/image-bytes.ts src/index.ts tests/adapter.spec.ts
git commit -m "fix: fail oversized image requests recoverably and route image models"
```

---

### Task 5: 设置页区分生图模型

**Files:**
- Modify: `src/client/ModelsCard.tsx`

- [ ] **Step 1: 标注**

模型 id 后面加「生图模型」徽标（复用 `styles.generic`）。

- [ ] **Step 2: 隐藏无意义的参数**

生图行右栏显示「走 /images/generations，无上下文参数」，「改参数」按钮不渲染；「参数未收录」提示与编辑区都跳过。新增一段说明：会话里选中它时把这一轮提示词发到 `/images/generations`，返回的图片进附件库并作为图片块贴进回复，所以能被其它模型继续读取。

- [ ] **Step 3: 跑测试与构建**

Run: `npx vitest run tests/models-card.spec.ts tests/section-render.spec.ts && npm run compile && npm run check:dist`
Expected: PASS + `lib/ matches source`。

- [ ] **Step 4: 提交**

```bash
git add src/client/ModelsCard.tsx lib
git commit -m "feat: mark image-generation models on the settings page"
```

---

### Task 6: 版本、文档与全量门禁

**Files:**
- Modify: `package.json`、`src/config-contract.ts`、`CHANGELOG.md`、`docs/models.md`、`README.md`
- Add: `docs/superpowers/specs/2026-11-09-image-budget-and-image-models-design.md`（本设计）、本计划

- [ ] **Step 1: 提版本**

`package.json` 与 `PLUGIN_VERSION` 同步改到 `0.1.19`（build 会校验两者相等）。

- [ ] **Step 2: CHANGELOG**

在 `## 0.1.18` 之前插入 0.1.19 段落，分「图片请求预算」与「生图模型」两节，写清 413 的现象、根因（22.24 MB base64）、为什么走宿主 offload 契约而自己不丢图，以及生图模型此前为何必然失败。

- [ ] **Step 3: 文档**

`docs/models.md` 增加「生图模型」一节（哪些 id、走哪个端点、为什么不显示上下文参数、图生图不支持）。`README.md` 的缺陷表加一行 0.1.19。

- [ ] **Step 4: 全量门禁**

Run: `npm run typecheck`
Run: `npx vitest run`
Run: `npm run compile`
Run: `npm run check:dist`
Run: `npm run verify:load`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "chore: release 0.1.19 with image budgets and image models"
```

---

## 自审记录

- **规格覆盖**：问题 A → Task 1 + Task 4 Step 3；问题 B → Task 2 + Task 3 + Task 4 Step 4；界面可见 → Task 5；文档与版本 → Task 6。无遗漏。
- **类型一致性**：`CatalogSnapshot.imageIds` 在 Task 3 定义，Task 4 的 `#isImageModel` 通过 `catalogRowsOf` 间接消费，Task 5 通过同一个函数渲染。`GatewayModelEntry` 在 Task 3 定义，`index.ts` 与 `adapter.ts` 都不直接依赖它的形状（`index.ts` 只取 `id` 与 `outputModalities`）。
- **风险**：Task 4 Step 3 强调只在 `resolver !== undefined` 时计量，这是本次最容易写错的一行 —— 无条件计量会让纯文本模型在长会话里被要求 offload 一批根本不占字节的图片。
- **不自己丢图**：Task 1 只算出「还差多少张」，Task 4 只抛错误。派生器与重试全部归宿主，这是设计文档里反复强调的约束。
