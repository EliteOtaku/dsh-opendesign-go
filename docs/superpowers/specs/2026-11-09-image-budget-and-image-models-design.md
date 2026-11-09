# 大图请求 413 与生图模型不可用 设计

2026-11-09。目标版本 0.1.19。

## 问题

两个独立故障，同一个根因层：**网关返回的目录里混着两类模型，而插件只认一类；同时请求体里的图片字节没有任何预算。**

### 问题 A：会话越用越久，请求必定 413

现象：

```
OpenDesign request failed (413): <html><head><title>413 Request Entity Too Large</title></head>
<body><center><h1>413 Request Entity Too Large</h1></center><hr><center>nginx</center></body></html>
```

伴随 `Compaction could not produce a useful summary` —— 压缩要发同一份历史，于是同样 413。

实测确认（session `session-2efb77b8-4b43-4ea0-8ea6-e2ab060ee62b`，「制作素材发布到小红书」，seq 3849 与 3859）：两次失败都紧跟在 `gpt-image-2` 生成的一批 2048px PNG 之后。该会话累计 20 张图，附件库原始 16.68 MB，base64 后 **22.24 MB**，平均每张 0.83 MB。

根因：`src/image-bytes.ts` 的 `imageResolverOf()` 把每张历史图片原样 `readFileSync(...).toString('base64')` 塞进 `data:` URL，且**没有任何预算**。Chat Completions 没有 Files 上传，所以每一轮的每一张图都按 base64 长度重发一次 —— 请求体随会话单调增长，直到网关前面的 nginx 直接拒收。nginx 的 413 页面不写阈值，也不返回 JSON，所以从客户端看不出这是字节数问题。

已排除的猜测：

- **不是上下文窗口问题。** `deepseek-v4.1-flash` 是 1,000,000 窗口 / 384,000 输出，报给宿主 750,000 输入预算；`/models` 也确认了。全表只有 `kimi-k2.7-code` 是 262,144。
- **不是本插件独有的疏忽。** 同类插件都实现了预算：`dsh-llm-deepseek`（`assertImagesFit`、`maxInlineRequestImageBytes 20 MiB`、`maxImagesPerRequest 600`）、`dsh-llm-pi-ai`（`maxRequestImageBytes`）、`@mars-sea/dsh-commandcode-provider`（`requiredImageOffload` 四处调用，CHANGELOG 记录了 issue #37，实测 body 上限约 50.17 MB，预算 32 MiB / 60 张）。而 `dsh-opendesign-go` 里 `readImageRequest`、`requiredImageOffload`、`IMAGE_OFFLOAD_REQUIRED`、`offloadImages` 出现 **0 次**。

### 问题 B：生图模型在列表里，选中就报错

现象：`gpt-image-2`、`seedream-5.0`、`nano-banana-2` 等 id 出现在会话的模型选择器里，选中后每个请求都失败。

根因：`GET {baseURL}/models` 把对话模型和生图模型混在同一个列表里，只给 id，不给输出模态。插件把每个 id 都当成对话模型，用 `GENERIC_DEFAULTS` 补上门数与参数，于是生图模型被包装成「1M 上下文、128K 输出」的对话模型，选中就 `POST /chat/completions` —— 网关必然拒绝。

issue #3 里作者本人报过这一条，回复是「应该用 `v1/images/generations`」，但随后这个 issue 被报告者自己在 14 秒后关闭，问题就此埋掉，上游从未处理。

## 目标

1. 图片很多的会话不会再把请求撑到 413，且失败是可恢复的（宿主能自己修好并重试）。
2. 生图模型可以被选中并真的产出图片，而不是报错。
3. 生图模型和对话模型的区别在设置页上看得见。
4. 其余行为不变：文本请求路径、额度、价格、目录兜底逻辑都不动。

## 非目标

- 不自己做图片压缩或缩放。压缩会改变模型看到的东西，而且当时问题不是「图太大」而是「图太多」。
- 不把生图模型从目录里删掉。它们是账号买到的、可调用的，删掉等于把「不支持」伪装成「没有」。
- 不改宿主的 offload 机制，也不自己丢图。
- 不做视频/音频输出。

## 决策

### A. 走宿主已有的 `IMAGE_OFFLOAD_REQUIRED` 契约

宿主早就定义了这条通路：适配器发现请求超预算时不自己丢图，而是抛

```ts
new LlmError(msg, IMAGE_OFFLOAD_REQUIRED_CODE, { offloadImages: count })
```

`dsh-compaction-image-offload`（在 `dsh-base` 里，0.2.1-rc.5）收到后写一条 `image/offload` 事件，记录被选中的 occurrence 序号，然后用重新派生的输入重试；派生器把打了 `offloaded: true` 的图片投影成占位文本。

之所以必须走这条，而不是在 `imageResolverOf` 里「太大就跳过」：**没记录的投影会让会话日志与实际发送的内容不一致**。日志里那轮是带图的，模型实际上没看到图，之后回放、计费、复制会话全都对不上，而且用户拿不到任何解释。

预算值（`src/image-request-budget.ts`）：

| 常量 | 值 | 理由 |
| --- | --- | --- |
| `MAX_REQUEST_IMAGE_BYTES` | 24 MiB | 网关没公布上限，nginx 413 也不说阈值；Command Code 实测同类网关约 50.17 MB，取一半留足余量给文本、工具声明和 JSON 框架 |
| `IMAGE_OFFLOAD_BYTE_QUANTUM` | 8 MiB | 按最小需要量丢，会每轮多丢一张、每次重写历史都打断 prompt 缓存；按整块前进，被丢的前缀能跨多轮稳定 |
| `MAX_REQUEST_IMAGES` | 60 | 与 Command Code 同量级；张数是独立于字节的第二道闸，很多小图靠字节闸拦不住 |
| `IMAGE_OFFLOAD_COUNT_QUANTUM` | 20 | 同上 |

计量用 `base64BytesOf`：`Math.ceil(bytes / 3) * 4`，是精确值不是估计 —— 读的是整份对象，不是流式切片。

只在**这条路由真的会发字节**时才计量（`#imageResolverFor(...) !== undefined`）。纯文本模型下图片本来就投影成占位文本，对它计费会要求一次释放不了任何字节的 offload。

### B. 生图模型走 `/images/generations`，并把结果落成 image block

三条事实决定了实现形状：

1. `LlmAdapter` 只有 `stream()`，没有生图通道；`LlmModelInfo` 没有 `outputModalities`；`ModelModalityMap` 只有 `text | image`。所以「这是一个输出图片的模型」无法通过模型元数据表达 —— 只能在目录行上带一个 `imageGeneration: true` 标记，由适配器据此切换端点。
2. `ImageBlock` 是 **role-neutral** 的（`dsh-llm` 的原文：*"A durable raster image reference, valid in user or assistant content"*），`conversation.chat.message.images` 插槽会用同一个画廊渲染 assistant 侧图片，ACP 桥也会 `readImage` 后回传。所以生图结果可以是一个正常的 assistant image block。
3. `attachments.saveImage()` 是唯一能把字节变成持久引用的入口。

流程：取本轮最后一条 user 消息的可见文本作为 prompt → `POST {baseURL}/images/generations`（`{model, prompt, n: 1, size?}`）→ 逐张 `saveImage` → 依次 yield 文本块、每张图的 `block-start`/`block-end`、`finish`。

几个刻意的选择：

- **不重试。** 重试归宿主管；这里重试会为一份没人留下的产物付两次钱。
- **没有附件存储就拒绝生成**，抛 `UNSUPPORTED_OPTION`。发出去的字节没有归属，用户会看到一条指向不存在附件的坏图。
- **prompt 为空就拒绝**，抛 `INVALID_REQUEST`。`/images/generations` 没有会话概念，空 prompt 会让网关生成一张随机图并计费。
- **不发 usage。** Images 端点不报 token，编一个数字会让账本记录无法核对的支出。但 `onAccountSettled` 仍然调用 —— 确实产出了内容。
- **媒体类型从字节嗅探**，不信模型名。PNG/JPEG/WebP/GIF 的魔数都在固定位置。

### C. 目录快照记录 `imageIds`

`catalogJson` 增加 `imageIds`：

```json
{ "asOf": "...", "source": "gateway", "ids": ["..."], "imageIds": ["seedream-5.0"] }
```

- `ids` 里仍然包含生图模型（它们确实是账号可用的），`imageIds` 是子集标记。这样设置页能显示全部并区分，会话选择器也能显示全部并选对端点。
- 分类规则（`isImageModel`）：目录声明了 `output_modalities` 就以声明为准，**双向**有效 —— 声明 `["text"]` 的即使是 `gpt-image-2` 也算对话模型，没声明 `text` 的即使名字像对话模型也算生图。只有目录什么都没说时，才查已知生图 id 表。理由是沉默不能当成「生图」，那会误伤能用的对话模型。
- 网关的 `output_modalities` 有两种形状（顶层、`architecture.output_modalities` 下），都读。

## 数据契约

`src/image-request-budget.ts`：

```ts
export interface ImageRequestBudget {
  readonly maxBytes?: number
  readonly maxImages?: number
  readonly byteQuantum?: number
  readonly countQuantum?: number
}
export function base64BytesOf(block: ImageBlock): number
export function overBudgetOffloadCount(
  messages: readonly RequestMessage[],
  budget?: ImageRequestBudget,
): number
```

`overBudgetOffloadCount` 返回 0 表示不超预算；大于 0 就是 `offloadImages` 要填的值。

`src/image-generation.ts`：

```ts
export interface GeneratedImage { readonly data: Uint8Array; readonly mediaType: GeneratedMediaType }
export function sniffMediaType(bytes: Uint8Array): GeneratedMediaType
export function imagesOf(body: unknown): GeneratedImage[]
export async function generateImages(request: ImageGenerationRequest): Promise<GeneratedImage[]>
```

`src/catalog.ts` 的 `CatalogModel` 增加 `readonly imageGeneration?: true`，`CatalogSnapshot` 增加 `readonly imageIds: readonly string[]`。

`src/image-bytes.ts` 的 `AttachmentsSeam` 增加可选的 `saveImage?`，`SavedImage` 直接取 `ImageBlock['attachment']`（不另写一份形状，否则存储契约一加字段就漂移）。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/image-request-budget.ts` | **新建**。预算常量、`base64BytesOf`、`overBudgetOffloadCount` |
| `src/image-generation.ts` | **新建**。`/images/generations` 请求、base64 解码、媒体类型嗅探、失败分类 |
| `src/adapter.ts` | `stream()` 先判生图模型；对话路径发送前计预算并抛 `IMAGE_OFFLOAD_REQUIRED`；新增 `#isImageModel`、`#generateImage`、`promptOf`、`extensionOf`；`OpenDesignAdapterOptions` 增加 `attachments` 读取器 |
| `src/catalog.ts` | `CatalogModel.imageGeneration`、`CatalogSnapshot.imageIds`、`isImageModel`、`KNOWN_IMAGE_MODEL_IDS`；`catalogRowsOf` 标记生图行 |
| `src/catalog-fetch.ts` | 返回 `GatewayModelEntry[]`（id + 可选 `outputModalities`），不再只返 id |
| `src/image-bytes.ts` | `AttachmentsSeam.saveImage?`、`SavedImage` |
| `src/index.ts` | `publishCatalog` 写 `imageIds`；构造适配器时传 `attachments` 读取器 |
| `src/client/ModelsCard.tsx` | 生图行标注「生图模型」，隐藏上下文/输出/改参数，加一段说明 |
| `tests/image-request-budget.spec.ts` | **新建** |
| `tests/image-generation.spec.ts` | **新建** |
| `tests/adapter.spec.ts` | 新增预算与生图两组用例 |
| `tests/catalog.spec.ts` / `tests/catalog-fetch.spec.ts` | 跟随契约变更调整，新增模态读取与分类用例 |

## 测试

`tests/image-request-budget.spec.ts`：精确 base64 长度、缺 `bytes` 时计 0、预算内返回 0、字节超限要求 offload、张数超限要求 offload、已 offload 的不再计、量子稳定性、**声明的 count 确实能让请求回到预算内**、上限低于实测网关阈值。

`tests/image-generation.spec.ts`：四种魔数嗅探、OpenAI/relay 三种信封、坏成员跳过、无法识别返回空、请求形状与鉴权头、`size` 透传与省略、错误信封走共享分类器、非 JSON body 保留状态码、无字节时命名失败、传输失败为 `SERVER`。

`tests/adapter.spec.ts`（新增两组）：

- 预算组：40 张 900 KB 的图片 → `IMAGE_OFFLOAD_REQUIRED` 且 `offloadImages > 0` 且**一个请求都没发**；2 张 → 正常发送；已 offload 的超大历史 → 不报错。
- 生图组：打到 `/images/generations` 而不是 `/chat/completions`；字节落进存储并产出 image block；chunk 流经 `BlockAssembler` 能装出 `['text', 'image']`；无附件存储 → `UNSUPPORTED_OPTION`；空 prompt → `INVALID_REQUEST`；对话模型仍走对话端点。

## 验收

1. `npm run typecheck`、`npx vitest run`、`npm run check:dist`、`npm run verify:load` 全绿。
2. 造一个 40 张大图的历史，请求不再打到网关就被拒，而是报 `IMAGE_OFFLOAD_REQUIRED`；宿主补一条 `image/offload` 后重试成功。
3. 选中 `seedream-5.0` 发一句提示词，回复里出现图片，且重启后图片仍在。
4. 设置页里生图模型带「生图模型」标注，没有上下文/输出参数和「改参数」按钮。
5. 普通对话模型的请求体与改动前逐字节一致（除图片预算检查外无新字段）。

## 风险

- **24 MiB 是保守值，不是测出来的。** 网关不公布上限。取小了会提前丢图（丢的是最旧的，可接受），取大了会继续 413。选 24 MiB 是因为它远低于已知的 50.17 MB 同类值，且真正需要保住的是「最旧的图」，不是全部。
- **`n: 1`。** 会话里一句提示词生成多张的需求存在，但一次多张会让 offload 预算和计费都变复杂，本期只做一张。多张回复也能正确解析（`imagesOf` 返回数组），只是不主动请求。
- **`output_modalities` 是网关的字段，不是标准。** 缺失时退回已知 id 表；表里没有的新生图模型会被当成对话模型，症状与本次修的 bug 相同。缓解办法是网关补齐该字段，或往表里加 id。
- **生图请求不带会话历史。** 这意味着「把刚才那张图改成蓝色」这类要求无法工作 —— `/images/generations` 不吃图片输入。要做图生图得换成 `/images/edits` 并把输入图传上去，本期不做。
- **`imageIds` 是新增字段。** 旧快照没有它，读出来是空数组，表现为所有模型都按对话模型处理 —— 与改动前一致，不会更坏。
