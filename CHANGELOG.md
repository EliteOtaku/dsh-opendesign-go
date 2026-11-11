# 更新记录

版本号与 GitHub 的 `vX.Y.Z` 标签一一对应。安装方式见 [README](README.md)。

## 0.1.22

修设置页「一键更新」必定失败：点下去报 `client api: pluginManager/listVersions expected 2 business argument(s) plus an optional AbortSignal, got 1`。

### 原因

宿主网关按**参数个数**校验每一次 Remote 调用，判据是端点声明了几个参数：

```js
const expected = descriptor.parameters.length - (projection?.parameterIndex === void 0 ? 0 : 1)
if (values.length !== expected && !hasCallerSignal) throw new Error(...)
```

关键在于 `parameters.length` **包含 TypeScript 标成可选的那些**。`listVersions` 声明两个参数（`name`、`options`），`options` 标了可选、也标了 `acceptsUndefined: true`，但那个标记只放宽**值**的检查，不放宽**个数**。插件只传了 `name`，于是 1 ≠ 2，在值被解码之前就抛错。

这个错误在编译期看不见：TypeScript 的 `options?:` 语法让 `listVersions(name)` 完全合法。所以它一路通过 typecheck 和全部单测，只在用户点按钮时暴露。

### 改法

1. 调用点显式补占位实参：`listVersions(PACKAGE_NAME, undefined)`。`undefined` 能通过 strict codec（该端点声明的是 `z.union([z.undefined(), …])`），语义正好是「不指定 registry」。
2. 接口签名把可选槽位写成**必填但可为 undefined**（`options: {...} | undefined`），让编译器以后能拦住同样的疏漏，而不是继续放行。
3. 审计同类调用：`updateBundle`（3 个参数）、`removeBundle`（1 个）、`installBundle`（2 个）、`settings.describe`（0 个）、`settings.update`（3 个）、`credentials.set`（2 个）、`credentials.unset`（1 个）——均与宿主声明一致，只有 `listVersions` 少一个。

### 验证

- 新增 5 例接口约定测试：用一个按宿主同款规则（参数个数必须严格相等）校验的假网关，直接复现原报错。断言 `listVersions` 收到 `(name, undefined)`、`updateBundle` 收到 3 个实参、`removeBundle`/`installBundle` 各 1/2 个。
- 全量 `504` 例通过（原 499 + 新增 5），`typecheck` / `compile` / `check:dist` / `verify:load` 全绿。

## 0.1.21

新增第三种接口协议 Anthropic Messages，设置页「接口协议」里排在 Responses 右边。

### 起因

宿主 0.2.2 起对工具调用参数改成严格校验：模型偶尔在一次调用里连出两段 `{…}{…}`，旧版只执行第一段照常往下跑，新版直接判格式错误、整轮失败且不自动重试。这是模型吐出的文本问题，插件改不了；但飞书群里反馈切到 Anthropic 协议可以避开，于是做成可选协议。

### 新增

`src/anthropic.ts` 承载这一面的请求投影与事件翻译，与 `responses.ts` 同构：`stream-state.ts` 仍是唯一的累加器，协议层只翻译自己的事件形状。

端点 `POST {baseURL}/messages`。四处必须与 OpenAI 两个面区别对待，全部实测确认：

| 项 | 事实 |
| --- | --- |
| 鉴权 | `x-api-key`，不是 `Authorization: Bearer`；缺 `anthropic-version` 头返回 400 |
| 思考控制 | `thinking: {type:'disabled'}` 才真关；`reasoning_effort` 六档实测 thinking 长度都在 1000–1700 字符同一区间，完全无效 |
| 输出上限 | `max_tokens` 必填，不能像另两面那样省略 |
| usage | `input_tokens` **不含**缓存读，缓存另给 `cache_read_input_tokens` |

### 思考等级怎么映射

思考等级选「关闭」→ 发 `thinking: {type:'disabled'}`；其余档位 → `{type:'enabled', budget_tokens}`。不做逐档预算映射，因为该网关不认 `budget_tokens`（给 512 仍产出 1117 字符思考），按档位编一个假映射只会误导。

### usage 的坑

OpenAI 两个面的 `prompt_tokens`/`input_tokens` 是**含**缓存的总和，所以共用换算要减掉缓存。Anthropic 是分开报的，直接套用会减掉一个从未加进去的数，把输入 token 算少。实测重复长 prompt：冷启动 2677，第二次 245 输入 + 2432 缓存读，两者相加正好 2677 —— 这是分开计数的直接证据。因此单独实现 `anthropicUsage`。

图片识别也做了对应处理：`{type:'image', source:{data}}` 的成本按每图上限计，`output-budget.ts` 补了这一支，否则一张截图会按 base64 字符长度计价，把请求预算吃光。

### 关于「能否避开双段参数」

不能承诺。双段 `{…}{…}` 是模型侧输出，判定发生在宿主解析工具参数时，与请求走哪条路径无关，插件这一层修不了。Anthropic 面只是社区反馈的规避路径，同时也是唯一能拿到原始思维链的备选（Responses 只给改写摘要）。

### 验证

- 门禁五连全绿：`typecheck` → `test`（46 文件 **499** 例，新增 21 例）→ `compile` → `check:dist` → `verify:load`。
- 实机三协议同题对比（真实网关、同一条工具调用 prompt）：chat 1945ms / responses 1368ms / anthropic 2357ms，三者都正确产出 `get_weather{"city": "北京"}`。Anthropic 面额外拿到 54 字符思考，且 usage 报出 128 token 缓存读。
- 多轮工具往返（assistant tool_use → tool_result → 最终答复）在 chat 与 anthropic 两面均跑通，Anthropic 面正常读到 `晴，28℃` 并作答。

## 0.1.20

修长会话图片撑爆请求体，以及生图模型选中就报错（[PR #4](https://github.com/EliteOtaku/dsh-opendesign-go/pull/4)，作者 BaxterL）。

两个症状看着无关，根因是同一层：图片字节在这个适配器里从来没有被「投影」过 —— 发出去的、算进预算的、能回收的，三者不是同一个集合。

### 症状

会话用久了必定失败，而且换任何模型都一样：

```
OpenDesign request failed (413): <html>...<center>nginx</center>...</html>
```

紧接着压缩也失败（`Compaction could not produce a useful summary`），会话就此卡死。

另一个：`gpt-image-2`、`seedream-5.0`、`nano-banana-2` 出现在模型选择器里，选中后每个请求都报 `404 [code=model_not_found]`。

### 原因

**413 是字节数问题，只是从客户端看不出。** 每张历史图片都被 `readFileSync(...).toString('base64')` 原样塞进 `data:` URL。Chat Completions 没有 Files 上传，所以每张图每一轮都按**原图**长度重发一次，请求体单调增长，直到网关前面的 nginx 拒收。nginx 的 413 页面既不带阈值也不是 JSON。

实测一个会话：28 张历史图，附件库 41.30 MB，base64 后**55.06 MB**（平均 1.47 MB/张，最大 3.76 MB）。

**404 是分类问题。** `GET {baseURL}/models` 把对话模型和生图模型混在一个列表里，只给 id 不给输出模态。插件把每个 id 都当对话模型补成「1M 上下文」，然后 `POST /chat/completions` —— 而这些模型只吃 `POST /images/generations`。

### 改法一：先按路由声明的尺寸缩放

这是修字节数本身。适配器实现 `imageRequestTarget()`，声明 2048² / 1 MiB，宿主据此调 `attachments.readImageRequest(ref, target)` 拿到缩放后的字节。同一个会话：请求体图片部分从 55.06 MB 降到 **30.48 MB**（28 张里 11 张变小，其余不动）。

缩放严格优于丢图：降了清晰度的截图模型还能读，被 offload 的图只剩一行占位文本。**永不放大** —— 小图保持原样。

缩放解决不了的部分走宿主的 `IMAGE_OFFLOAD_REQUIRED` 契约：超预算时抛带 `offloadImages: N` 的 `LlmError`，由 `dsh-compaction-image-offload` 记一条 `image/offload` 事件再重试。

不自己丢图是因为**没有记录的投影会让会话日志与实际发送的内容不一致** —— 日志说那轮带了图，模型其实没看到，之后的回放、计费和复制会话全都对不上。

预算（`src/image-request-budget.ts`）：

| 常量 | 值 | 理由 |
| --- | --- | --- |
| 单请求内联图片字节 | 20 MiB | 与 `dsh-llm-pi-ai` 的 base64 上限同值；网关不公布阈值，nginx 的 413 也不带数字 |
| 每次 offload 移除的字节 | 8 MiB | 按最小需要量丢会每轮多丢一张，每次重写历史都打断 prompt 缓存 |
| 单请求图片张数 | 60 | 独立于字节的第二道闸，很多小图靠字节闸拦不住 |
| 每次 offload 移除的张数 | 20 | 同上 |

超额算式直接复用宿主的 `requiredImageOffload`，不写第二份实现。

**一个死锁必须避开。** `requiredImageOffload` 只按 `role` 过滤，但三条事实互相对抗：`conversion.ts` 不重放 assistant 图片、宿主的 offload 插件明确排除 assistant 节点、而 `requiredImageOffload` 不看 role。三者相乘的结果是：一个只有 5 张自生成图的会话，旧逻辑要求 `offloadImages = 3`，宿主能选中的是 0 张，**每次请求都失败且永远出不来**。现在只统计真正会发出去的那些：已 offload 的不计、assistant 侧的不计、纯文本模型下也不计（图片本来就投影成占位文本，对它计费会要求一次释放不了任何字节的 offload）。

### 改法二：生图做成工具，结果作为 tool result 回到会话

**不能做成 assistant 图片块。** 三条独立证据：官方适配器在两条转换路径上都把 assistant 图片判 `UNSUPPORTED_CONTENT`；宿主的 image offload 只扫 `user/message` 与 `tool/result`，assistant 的图永远选不中；被计入预算却无法 offload 的图会让会话卡在修不好的状态里（就是上面那个死锁）。

tool result 三条都满足，这也正是 `dsh-image-gen` 的形状。流程：`POST {baseURL}/images/generations` → 逐张 `attachments.saveImage` → 渲染成 `text + image` 块。模型真的收到图，画廊照样渲染，会话重了也能被 offload。

工具名取 `opendesign_generate_image` 而不是 `generate_image`：`dsh-image-gen` 可能同时挂载，两个同名全局工具会让注册直接失败。

刻意保留的取舍：

- **不重试。** 重试归宿主管；这里重试会为一份没人留下的产物付两次钱。
- **点名要一个账号没有的模型就报错**，错误里列出能用的 id。静默换模型会为一张没被要求的图计费。
- **prompt 为空就拒绝**：`/images/generations` 没有会话概念，空 prompt 会让网关生成一张随机图并计费。
- **不报 usage。** Images 端点不报 token，编一个数字会让账本记录无法核对。

### 模型目录区分生图模型

目录快照新增 `imageIds`（`ids` 的子集）。`ids` 仍包含生图模型 —— 它们是账号买到的、可调用的，删掉等于把「不支持」伪装成「没有」。

分类规则：目录声明了 `output_modalities` 就以声明为准，**双向**有效 —— 声明 `["text"]` 的即使叫 `gpt-image-2` 也算对话模型。只有目录什么都没说时，才查已知生图 id 表。沉默不能当成「生图」，那会误伤能用的对话模型。网关的 `output_modalities` 有两种形状（顶层、`architecture.output_modalities` 下），都读。

`listModels()` 过滤掉生图模型：生图没有文本可流式返回，选中它根本没有可发的一轮。设置页读的是目录而不是这个列表，所以照样列出并标注「生图模型」，订阅里这部分额度仍然看得见。

### 验证

全量 478 个测试通过（45 个文件），比上一版多 54 例：4 个新测试文件共 45 例，另在 `adapter.spec.ts`、`catalog.spec.ts`、`catalog-fetch.spec.ts` 补 9 例。四条新测试专门钉住关键判断：`defineTool` 真的接受生图工具的 schema、在**真实的** `ToolRuntime` 上注册成功并可释放（含重名拒绝）、生图模型作为对话路由被拒且**一个请求都没发**、assistant-only 历史要求 0 次 offload（死锁回归）。

门禁：typecheck 通过、`check:dist` 一致、`verify:load` 通过、`test:hosts` 在 0.2.0-rc.1 / 0.2.0-rc.2 / 0.2.1-rc.2 / 0.2.2-alpha.2 四个宿主版本全 PASS。

### 已知限制

- 20 MiB 是取官方同值，不是测出来的：网关不公布上限，nginx 的 413 也不带数字。取小了会提前丢图（丢的是最旧的，可接受），取大了会继续 413。
- 缩放后仍超预算的长会话还是会被 offload 掉最旧的图。这是宿主契约的设计意图，但一个会话累计了几十张大图时，最早期那批最终会变成占位文本。
- `readImageRequest` 派生失败（比如解码器不认某种格式）时回退到原对象字节 —— 请求仍然合法，只是大一点。
- 只做文生图，不做图生图：`/images/generations` 不吃图片输入，所以「把刚才那张图改成蓝色」无法工作，要做得换成 `/images/edits`。
- `output_modalities` 是网关的字段，不是标准。缺失时退回已知 id 表；表里没有的新生图模型会被当成对话模型，症状与本次修的 404 相同。

## 0.1.19

修并行工具调用偶发失败（[issue #5](https://github.com/EliteOtaku/dsh-opendesign-go/issues/5)）。

### 症状

工具调用偶发失败，DSH 侧报：

```
Error: invalid arguments: "arguments" must be an object
```

失败调用的参数是**两段 JSON 首尾相接** —— 例如 `{"url":"..."}{"command":"ls"}`，对哪一次调用都不是合法 JSON。

### 原因

网关在负载下偶发把两个并行调用**都编号成 `index: 0`**，而两个调用的 id 其实是不同的。适配器只按 `index` 归档调用，于是第二次调用命中了第一次的记录：

- `name` 被覆盖（`read` 变成 `bash`）；
- `arguments` 被追加到第一次的参数后面。

DSH 的 `parseArguments` 解析失败后保留原文，schema 校验对根节点报 `"arguments" must be an object`。报告者统计 17 个会话 5114 次调用里踩中 124 次（`flash-eco` 111、`flash` 13），同期另一条路由 3777 次 0 次。

### 修复

同一个 `index` 上出现**新 id** 时另起一个调用块。如果只改这一处还不够：收块逻辑原本遍历按 index 索引的表，而该表每个键只保留最新一个调用，被顶掉的旧调用会直接丢失。所以同时引入一张按出现顺序排列的调用表，收块时读它。

开块逻辑收敛成 `stream-state.ts` 里的单一入口，Chat Completions 与 Responses 两个协议共用 —— 两边各写一份正是这个 bug 能藏这么久的原因。

### 验证

新增 4 条回归测试，覆盖四种形态：同 index 换新 id（本 bug）、正常并行 `0/1`、同一调用重复发送 id、Responses 面同 `output_index` 双调用。全量 424 个测试通过。

## 0.1.18

支持 Plus / Pro / Max 套餐的模型（[issue #3](https://github.com/EliteOtaku/dsh-opendesign-go/issues/3)）。

### 模型目录改为向网关查询

此前模型列表写死在 `src/catalog.ts`，固定 14 条 —— 那是 **Go** 套餐的 Design Plan 模型。Plus、Pro、Max 各自还有一批额外模型，插件完全不知道，所以更高档位的用户看不到自己买到的模型，例如 Claude Sonnet 5.5。

现在启动时用当前账号的 API key 请求 `GET {baseURL}/models`。这个端点**按账号额度等级返回**：Go 拿到 14 个，Plus 及更高档位拿到各自的名额。插件不需要判断用户是什么套餐 —— 权限由网关给，插件照单展示。这样官方新增模型时也不需要插件发版。

拉取失败（离线、网关故障、key 无效）时回退到内置的 14 条并写明原因，页面不会突然空掉。

### 未收录参数的新模型

网关先于本文档收录新模型是常态。以前 `MODEL_DEFAULTS` 查不到的 id 拿不到任何参数，表现为「列表里没有它」或「选了之后没有思考档位」。

现在改用一套通用默认值（上下文 1M、输出 128K、文本 + 图像、全部思考档位），并在该行标注「参数未收录」加一行说明。理由是这些数字是估的：上下文影响截断判定，输出上限直接变成请求的 `max_tokens`，用户有权知道哪些核对过、哪些没有。改过参数后标注消失。

设置页显示的上下文与输出数字也同步改用这套默认值，与请求路径保持一致 —— 否则页面说「未知」而实际按 1M/128K 在跑。

## 0.1.17

修 0.1.16 版本行在启动瞬间拿不到远端数字的问题。

### 检查失败会再试一次

0.1.16 把「没查到」如实显示成「未知」，但实测第一次启动就是两个来源全未知。宿主日志给出的是 `10:17:04.4` 插件激活、`10:17:09.97` 写回，正好卡在 5 秒超时之后；同一台机器一分钟后再查，npm 0.4 秒、GitHub 2.1 秒就返回了。

原因是启动那一刻宿主还在开自己的 profile、抢写锁、把网络栈拉起来，5 秒预算被吃掉。现在首次检查未全部成功会在 60 秒后补一次，两次都失败才认；请求超时也从 5 秒放宽到 15 秒。

### 检查结果会记日志

每次检查写一行 `version check npm=… github=… (Nms)`。两个抓取函数此前刻意保持安静，失败完全不留痕，于是「页面显示未知」到底卡在超时、HTTP 状态还是 DNS，日志里看不出来。

## 0.1.16

设置页顶部常驻一行版本信息。

### 版本行

此前只在发现新版本时才渲染一张卡片。没有更新时页面上一片空白：用户既不知道装的是哪一版，也不知道远端到哪一版，更无法分辨「更新按钮不见了」是功能失效，还是本来就该没有。

现在页面顶部固定显示本机版本、GitHub 最新标签与 npm 最新发布，并给出三态之一：「已是最新」「有新版本」「无法检查更新」。两个更新按钮也移入这一行，不再单独占一张卡片。

判定按来源分别计算：比的是「这个来源有没有比本机更新的版本」，不是「两个来源是否都比本机旧」。因此 npm 落后、GitHub 领先时只给「从 GitHub 装」，反之只给「一键更新」。

### 查不到不再等于最新

`updateJson` 的语义从「只在有更新时写的通知」改成「每次启动都写的快照」。两个来源各自记录查到的最新版本，没查到的那个留空，页面显示「未知」而不是「已是最新」。此前字段不写就等于「没有更新」，于是网络失败与真的没有更新在页面上无法区分。

快照若由别的版本写入（升级后首次打开），远端数字一律显示「未知」并注明写入者版本，不拿上一版的数字当现状。

### 检查时间

显示「上次检查：N 分钟前」，超过 24 小时转为警示色。缓存写回被拒时页面沿用上一次启动的数字，时间戳让这件事可见。

## 0.1.15

修一个会让设置页长期显示错数的问题，以及两处随之而来的口径问题。

### 缓存写回失败会重试

设置页的「路由状态」一直写着「声明模型 12 个」，实际是 14 个。缓存字段 `diagnosticsJson` 停在 `2026-10-20` 那份快照，之后再没动过。

根因是去重的水位记早了：`publishDiagnostics` 在**调用写入之前**就把指纹记成「已发布」，写入又用 `.catch(() => undefined)` 吞掉失败。启动时宿主正占着 profile 的写锁（`atomic-write: timed out waiting for the writer lock`，宿主抢锁只等 2 秒），这一次失败之后，后续每次调用都发现指纹没变、直接返回——没有任何事件能再触发一次写入，只能重启进程。

现在写入改成走 `src/cache-retry.ts`：水位**只在写入真的落地之后**才推进，失败按 3 秒 / 12 秒 / 30 秒退避重试三次（跨过宿主的 2 秒抢锁窗口），每次重试都重算当前值而不是重放旧快照。插件销毁时取消等待中的重试。

同样的处理也给了 `updateJson`——它每个进程只写一次（启动时的版本检查），被拒就等于这一版永远不提示更新。`usageJson` 与 `reportJson` 不加重试：它们由定时器反复重发，丢一次下轮就补上了，加退避只会和写锁打架。

`fieldWriterOf` 的返回值从 `void` 改成 `boolean`（文档现在是否带这个值），调用方据此决定要不要重试。

### 「声明模型」以本版本为准

页面上的模型数原本直读缓存字段，缓存停在哪天就显示哪天的数。现在页面把自己的模型目录（`GO_DESIGN_PLAN_MODELS.length`）当作准数，缓存对不上时在下面补一行说明「宿主缓存的是 N 个，与本版本的 M 个不一致」，并解释缓存只在写回成功时刷新、而写回要抢 profile 的写锁。

理由是这一版正在发出的请求才是事实：缓存是宿主写的镜像，写到一半被拒，不能拿旧数当现状。

### 文档

`README.md` 与 `docs/configuration.md` 补上一直被漏掉的 `updateJson`（四个缓存字段此前只写了三个），并说明写回失败会重试。

## 0.1.14

两个新能力：设置页可以选请求走哪条接口，以及两个能从设置页直接点的更新按钮。

### 两条接口协议

同一个网关提供 `chat/completions` 与 `responses` 两条 OpenAI 风格接口，现在可以切换，默认仍是 `chat`。

选它当默认不是习惯，是实测结论：`/responses` 的思考增量是对思维过程的**改写摘要**（`response.reasoning_summary_text.delta`），而 `/chat/completions` 的 `reasoning_content` 是模型自己的完整思维链。插件把思考块渲染给用户，换过去等于把这个能力降级。计费与额度消耗两边相同，思考 token 吃光预算导致的空回答也一样（同组 prompt 预算 24 时 chat 7/12 空、responses 9/12 空）。

实现上请求侧换了投影：工具声明扁平化、图片 part 用 `input_image`、首个 system 消息提升为 `instructions`、输出上限字段改名 `max_output_tokens`、思考强度改走 `reasoning: { effort }`。响应侧没有 `choices[0].finish_reason`，正常结束是 `response.completed`、截断是 `response.incomplete` 加 `incomplete_details.reason`，两者都映射到宿主的停止原因。

流式累加器抽成了 `src/stream-state.ts`，两条协议共用块与 usage 的记账。这里有个容易漏的地方：`input_image` 的 base64 必须按图计费而不是按字符计，否则 `estimatePromptTokens` 会把一张图估成几十万 token，把 `max_tokens` 钳到 1。

### 从设置页更新

发现新版本时那张卡片现在有两个按钮：

- **一键更新**走 npm registry，与桌面端插件管理界面同一条 Host 通道（`remote.pluginManager.updateBundle`）。
- **从 GitHub 装**是兜底，从仓库标签安装。因为 Host 不允许安装 profile 里已有的包名，这条路必须先卸载再安装，所以安装失败时插件会把原版本装回去，并在卡片上如实写「已恢复 X」或「恢复也失败」。

两个按钮各自只在对应来源有更新时出现：npm 的发布与仓库标签经常不同步，没有可装的版本就不给按钮。

已把两种最常见的失败翻译成人话：pnpm 的最短发布时长门禁（`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`，发布当天点大概率撞上，等几小时）与 DSH 版本要求过高。`restart-required` 明确写成「已装好 X，重启 DSH 后生效」——文件落地和运行中的宿主换掉模块是两件事。

版本检查现在同时读 npm 的 `latest` 与 GitHub 的 `/tags`（仓库没有建 Release，`/releases/latest` 是 404）。

## 0.1.13

按 DeepSeek 官方的[思考模式文档](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)复核了思考等级。**运行时行为没有任何改变**——这一版改的是依据、注释、测试和文档；模型的参数表、请求体、默认档全部原样。

### 思考等级的八个值只有三档强度

官方文档给了映射表：`minimal`/`low` → low、`medium`/`high`/`xhigh` → high、`max`/`ultra` → max。照这张表，插件展示的八个档位其实只落在三档强度上。这是不是「插件谎报 8 档」？在网关上量 `reasoning_tokens` 把这件事定下来了：

| 模型 | n | 可区分的配对（z>2.5） |
| --- | --- | --- |
| `deepseek-v4.1-flash`（`/chat/completions`） | 10 | `max−high` z=7.95、`medium−minimal` z=3.63 |
| `deepseek-v4.1-flash-eco`（`/chat/completions`） | 8 | `max−high` z=9.45、`medium−minimal` z=2.36 |
| `deepseek-v4.1-flash`（`/responses`） | 6 | `max−high` z=3.86 |

三组内部（`minimal↔low`、`medium↔high↔xhigh`、`ultra↔max`）每次都不可区分，组与组之间才分得开——**与厂商映射表逐组吻合**。所以网关没有发明自己的分档，八个值确实是三档强度加上五个别名，官方文档与网关行为在这个问题上**一致**，不存在「router 错了」。

**列表保持八个不变**，理由是缩表会改语义：默认档是 `medium`（映射到 high），若只剩 `low`/`high`/`max`，`medium` 不在列表里，适配器会把默认值钳到 `low`，所有用户默认的思考强度静默下降一档。八个值全部合法，写全不会让任何请求失败；`ultra` 的例外只有 eco，而 eco 那一行早就没有它。文档现在把「接受哪些值」和「有几种强度」分开写清楚。

### `none` 关不关思考，跟厂商文档相反

厂商文档说 OpenAI 协议下 `reasoning_effort: "none"` 不关思考、要关得用 `thinking: {type: "disabled"}`。**这个网关正好相反**，两个 DeepSeek ID 各四轮、稳定复现：

| 发送的字段 | `deepseek-v4.1-flash` | `-eco` |
| --- | --- | --- |
| `reasoning_effort: "none"` | `reasoning_tokens` 0/0/0/0 | 0/0/0/0 |
| `thinking: {type: "disabled"}` | 仍思考（18/18/18/19） | 仍思考（18/20/17/18） |
| 两者同时发 | 0/0/0/0 | 0/0/0/0 |

`thinking` 被静默忽略：不报错，也不生效。所以适配器只发 `reasoning_effort`、不发 `thinking` 是这个网关上的正确实现，不是漏做。这次补了两条测试把结论钉住——带档位时 `reasoning_effort` 必须出现、`thinking`/`reasoning` 必须不出现；不带档位时三个字段都不出现，让厂商自己的默认值生效。日后有人「照官方文档」把 `thinking` 加进去，测试会拦下来。

代价写进了文档：这套语义**绑定当前网关**。若 OpenDesign 哪天把 `thinking` 接通、或让 `none` 不再关思考，「关闭」这一档就得重新探针。

### 顺带修正文档里一处不实说法

`docs/models.md` 原来写「列表来自网关自己的拒绝信息：发送一个非法值，返回的错误里会写明该模型的合法取值集合」。**这是错的**：非法值的回包只有 `[code=invalid_request_error] The request is invalid. Please check the request parameters.`（部分上游包成 `[code=upstream_error]`），一个字都不列举合法值。那张表是**逐个值发出去看 200 还是 400** 探出来的。代码注释与测试注释里的同款说法一并改掉。

### 两处数字对上了

厂商 `/models` 给 `deepseek-flash` 报 `context_window: 1048576`、`max_output_tokens: 393216`，与插件记的 1,000,000 / 384,000 看着不像。查清了：输出上限**是同一个数**（`393216 = 384 × 1024`，价格页写「384K」），上下文**真的不一样**（`1048576` 比 1,000,000 大 4.86%），这里仍取小的那个，因为插件报给宿主的是「窗口 − 输出预留」，用保守值不会让宿主晚一步压缩。eco 的输出上限另外被探到了硬边：`393216` 返 200、`393217` 返 400，而同一个 `max_tokens` 给 base 一路到 `1048576` 都不拒。

### 没有换成 Responses 协议

有反馈建议改用 `/responses`。实测这条链路在本网关可用——function calling、`data:` 流式事件、`input_image` 带图全部正常——但**换过去会亏**，所以没换：

- **思维链会变成摘要**。`/responses` 的 `reasoning` 项给的是 `summary[].text`，实测拿到的文本是被截断改写的（`We need answer. Need think through maybe simple. 17*23 = 391. Need maybe show method. final concise. …`），而 `/chat/completions` 给的 `reasoning`/`reasoning_content` 是原始思维链。插件现在把思考块渲染给用户看，换协议等于把这个能力降级。
- **省额度的老问题两边一样**。同一组英文 prompt、小预算测试里，`/chat/completions` 与 `/responses` 在预算 24 时都大面积返回空内容（7/12 与 9/12），预算 64 时都基本正常（2/12 与 1/12）。这不是协议的问题，是**思考 token 会吃光输出预算**，与厂商文档说的「思考模式独占 completion 预算」一致。
- **八档折叠一模一样**。`/responses` 的 `reasoning_tokens` 也是三组（上表第三行），没有更细的分档。

`/responses` 唯一比 `/chat/completions` 强的地方是截断信号更明确：它返回 `status: "incomplete"` + `incomplete_details.reason: "length"`，而不是只靠 `finish_reason`。插件已经把 `finish_reason: length` 映射成 `max-tokens`，所以这一点不构成迁移理由。

## 0.1.12

新增 `deepseek-v4.1-flash-eco` 与 `minimax-m3.1-flash` 两个模型；把套餐宣传额度换成官方现版；把价目表补齐到线上的 41 条。

### 一个慢速档

OpenDesign 把 DeepSeek V4.1 Flash 的低速线路单独挂了一个 ID。厂商侧没有这个 ID——[定价页](https://open-design.ai/pricing/)列它为「DeepSeek V4.1 Flash Eco」，[额度页](https://open-design.ai/model-credits/)写明「may respond more slowly at times」，建议批处理。所以这一行的参数不是抄来的官方数，而是「参数同 V4.1-Flash」加实测确认：`max_tokens: 384000` 返 200，窗口与输出上限沿用同一个模型。

### 它少一档思考等级

`ultra` 对它返回 400。这不是偶发：五轮 base/eco 交替实测里，eco 每次都在一秒内返回 `[code=upstream_error]`，同一时刻 `deepseek-v4.1-flash` 五轮全部 200。它是 **DeepSeek 系列里唯一没有 `ultra` 的一档**，其余四个 DeepSeek ID 都有。同一个模型的快慢两档在思考等级上出现差异，正好说明这张表必须按模型存、不能按系列推断；如果不按模型过滤，选 `ultra` 的请求会稳定失败。

顺带修正文档里一处旧错：`none` 到 `xhigh` 那一组（Claude Haiku 5.5、Kimi K2.7 Code、MiMo 两个型号、Hy4 Preview）在代码里一直带 `max`，文档却写成止于 `xhigh`。现在按代码写明。

### 便宜在额度倍率上，不在单价上

公开价目表给 eco 的价格与 V4.1-Flash 逐项相同（输入 0.3 / 输出 1.2 / 缓存读 0.006 USD per 1M token），线上 `model-prices` 端点也确实发布同一组数。差别在订阅额度：额度页的 credit 倍率是 0.27× 对 0.5×。本地账本按公开单价估算、不乘倍率，所以两个模型的金额估算相同——这是账本口径的边界，不是漏算。

### 网关的模态元数据是错的

`/v1/models` 给 eco 的 `architecture.input_modalities` 是 `["text"]`，但它实际能读图：红/蓝/绿三张纯色图全部答对，左紫右黄的双色图答「purple 和 yellow」，左侧黑竖条答「A black vertical stripe on the left and a large white area」。这与它把 `metadata.output_budget` 报成 128000 是同一类问题——广播元数据不等于真实能力，因此没有采用，模态依据改为实测记录。

### 补上 MiniMax M3.1 Flash

网关早就在服务 `minimax-m3.1-flash`，插件的静态目录里却没有它，选择器里因此看不到。现在补进三个地方：`MODEL_DEFAULTS`（1M 上下文、524,288 输出、`text` + `image`）、`GO_DESIGN_PLAN_MODELS`（显示名取自定价页的「MiniMax M3.1 Flash」）、`BASE_PRICES`（0.15 / 0.6 / 0.015）。

它的两处参数都不是抄来的：

- **思考等级是新形状**。`none` 三发三中 400，与厂商文档说它「requires adaptive thinking」一致，所以列表从 `minimal` 起步；`ultra` 同样被拒，止于 `max`。这是三组之外的第一种「两端都缺」的集合，说明按系列套模板会错。
- **524,288 是实测定界**，不是文档值：524,288 返 200，524,289 被拒。

网关还声明 `video` 输入，但宿主的 `ModelModality` 只有 `text | image`，这一项在插件里没有可表达的位置，已在文档里写明而不是悄悄丢掉。

### 套餐额度改用官方现版数字

[额度页](https://open-design.ai/model-credits/)改版后，Go 的宣传口径从 `$120` 变成 `$220`（7 天窗口标价 `$55`），且 `$220 = 4 × $55` 首次自洽。原来的 Plus/Pro/Max 三档（180/480/900）与新表任何一列都对不上，现在统一取 **Design Plan 列**：go 220、plus 290、pro 360、max 600。取这一列而不是「monthly maximum」列的理由是 Go 根本没有套餐模型额度，能花的只有 Design Plan 那一份；两列只在 Go 上重合。

同时查清了一件事：**`vela` 报的 credit 与页面标的美元不是同一套单位**。`vela` 两个窗口仍是 50,000 / 150,000 credits，页面标 `$18` / `$55`，相除得 2,727–2,778 credits/美元；而用 DeepSeek 调用的 credit 增量除以公开价成本，五次采样落在 10,067–11,880。两套数字的**比例**一致（1:3 对 18:55），**绝对值**差约 3.7 倍。汇率常量保持 10,000 不动，注释与 `docs/quota.md` 改成记录这处分歧，而不是假装它不存在。原先「四周只有 $65、用不满 $120」的叙事随之作废——在 $220/$55 下四周恰好等于月额度。

### 价目表补到 41 条

线上 `model-prices` 有 41 条，本地快照只有 35 条时缺了 6 条。逐字段比对后补齐 5 条：`gemini-4-argon`、`gpt-6.1-terra`、`hy4`、`kimi-k3.1-pro`、`minimax-m3.1-flash`；35 条既有价格**零处不符**，所以这不是重抄一遍。`PRICES_AS_OF` 更新为 2026-11-07。

`gpt-6.1-terra` 有 `longContext` 阶梯（272,000 输入 token 之上翻倍），但 `ModelPrice` 没有第二个档位的字段，只能记基础档——这一点现在写进了 `src/pricing.ts` 的模块注释，与 `pricedAs: 'base-tier'` 的既有标注对应上。顺带删掉一句不实的注释：`PRICES_URL` 从来没有被运行时抓取过。

### 构建产物不再携带构建机的路径

CI 从 0.1.10 起每一轮都失败，报的都是一句 `check:dist: lib/ is out of date` + `differs from source: client.js`。根因不是构建脚本没有跑，而是**产物本身取决于检出目录**：CSS Modules 插件把样式表的绝对路径交给 lightningcss 当文件名，而它的 `[hash]` 是从文件名派生的，于是 `D:\AI\…` 与 `/home/runner/work/…` 生成出两套类名；esbuild 还会给插件命名空间里的每个模块打一行 `// <路径>` 注释，那条注释也把本地目录写进了 `lib/client.js`。

改法是让模块身份与机器无关：解析阶段就把路径折成仓库内的相对 POSIX 路径，哈希改用 `[content-hash]`（由规则内容派生，而不是路径），真实路径只留给读取和 `watchFiles`。这样两份内容相同的样式表仍会各自注入、类名仍不冲突，但产物在任何机器上逐字节一致。

回归测试 `tests/client-bundle.spec.ts` 增加一条断言：`lib/client.js` 里不得出现盘符路径或 `/home/`、`/Users/`、`/root/`、`/builds/`、`/runner/` 这类前缀。这条断言只认这些前缀，`https://` 之类正常文本不会误报。

## 0.1.11

两处正确性修正。

### 胶囊只在花这份额度时出现

输入框旁边那枚胶囊原来只要插件启用就出现，不看当前选中的是哪个模型。这会和同样用 `conversation.input.right` 的其他插件抢位置，也会在别的 provider 的请求旁边显示一份不属于它的余额。

现在它读会话的模型目录，只有当前选择是本插件的模型时才渲染。选择别的模型即消失，切回来即恢复；`composerUsage` 仍是独立开关，两者都要满足。

### 推理内容不再丢失（issue #2）

网关把增量写在 `reasoning`（以及结构化的 `reasoning_details`）里，而适配器只认 `reasoning_content`。其后果不是「少了点思考文本」：思考块从未打开，推理模型的输出被整段丢弃，turn 可能直接以空响应结束，报的还是一句难以归因的空响应错误。

现在三种拼写都读，且只取第一个有内容的——它们是同一个增量的不同写法，`reasoning` 与 `reasoning_details` 常常同时出现，叠加会把每个词报两遍。

## 0.1.10

这一版没有单独发布到 npm：它的内容随 0.1.11 一起上线，所以版本序列是 `0.1.9 → 0.1.11`。

额度现在就在输入框旁边，设置页也换了版式。

### 为什么加这枚胶囊

5 小时窗口是**滚动**的，重置点不像 7 天窗口那样落在整点，所以「现在还能不能跑一次长任务」这件事，只有在设置页 → 插件 → 额度卡片里才能看到。而真正要判断的时刻，是正在输入框里准备发请求的那一秒。

胶囊因此常驻在会话输入框右侧：`5h 62% · 7d 88%`。点开是明细——每窗口的进度条、剩余金额、重置倒计时、钱包余额和「读取于」时间。

### 它不产生额外开销

宿主本来就把每轮额度读数写进配置的 `usageJson`，胶囊只解析这份已经存在的文档：不轮询、不开第二条传输、不额外调 `vela`。刷新按钮写的是 `refreshNonce`，与会话外那条既有链路完全相同，没有第二套机制。

口径与设置页一致：显示**剩余**（越大越健康，条越长），按两个窗口里最差的那个着色（≤ 25% 黄，≤ 5% 红）。没有读数时整枚胶囊不渲染，不留空壳。开关是 `composerUsage`，默认开；关掉只是不渲染，宿主照常读取，重新打开立刻有数据。

### 界面的做法变了

原来的客户端是纯内联样式，靠一堆 `rgba(128,128,128,…)` 手工凑出层次，既没有 hover 态也不跟随主题。现在：

- 引入 CSS Modules 构建管线（esbuild 插件 + `lightningcss` 编译，class 名按文件哈希隔离），客户端仍是单个 CJS 文件，CSS 在模块加载时注入一次。
- 颜色全部映射到宿主的 `--dsw-alias-*` 变量，跟随用户选定的亮/暗与主题色，插件页面不再有自己的一套皮肤。
- 抽出 `Card` / `Row` / `Switch` / `Button` / `Badge` / `Bar` / `Field` / `Input` 这些基元，五张卡片与设置页共用同一套间距、圆角、分割线与字号层级。

设置页的信息顺序也重排了：启用 → 账号 → 模型 → 额度 → 对账 → 本地用量 → 额度来源 → 路由状态。先给「能不能用」，再给「用了多少」。

### 顺手修掉一个会在 CI 假红的坑

`lightningcss` 返回的 class 名映射是哈希表顺序，两次构建的**字节内容相同、键顺序不同**。这会让 `npm run check:dist`（以及 `test:ci`）在什么都没改的情况下报「lib/ 与源码不一致」。已在 `scripts/css-modules.mjs` 里按键排序输出，并把「两次编译必须字节相同」当作验证标准。

## 0.1.9

长对话不再在「只用了三成上下文」时被拒。

### 为什么会被拒

网关的判据是 `输入 + max_tokens ≤ 窗口`。窗口实测就是 1,048,576（喂到 1,036,038 token 仍然 200，1,053,038 才 400），OpenDesign 没有偷偷缩容。问题出在 `max_tokens`：插件每次把模型公布的最大输出（DeepSeek 系 384,000）原样发上去，于是输入到 ~660K、约六成窗口时就必然超出。

而界面上显示的是三成。因为宿主只用 `contextWindow` 衡量对话有多满，从不扣掉为输出预留的部分，所以它的百分比与网关的判据差着这个预留量。两边都没错，只是量的不是同一个东西。

### 现在怎么算

- 报给宿主的窗口改成**输入预算**：`窗口 − max(输出上限, 窗口/4)`。1M 窗口 + 384K 输出的模型报 750,000，于是宿主在七成半就开始压缩，留出的余量正好够一次长回答。
- `defaultMaxTokens` 同步报预留量（250,000）。
- 真正发出的 `max_tokens` 按本次请求的实际输入钳制：输入占满时省略该字段（那时任何预留都会被拒），留有余量时取剩余量。估算走字符数与图片数，图片按每张 1,024 token 计——按 base64 长度算会高估三个数量级。
- 工具声明也计入输入预算：本机真实工具集是 326 个声明、约 163K token，占窗口 15.6%，忽略它会让每次估算小三分之一。
- 设置页的模型行同时显示「可用输入」，例如 `上下文 1.00M（可用输入 750k）· 输出 384k`，改参数时能立刻看到自己填的数会换来多少可用输入。

实测对照：`输入 980,038` 时，`max_tokens` 给 68,500 通过，69,000 被拒；`输入 1,043,038` 时，4,096 通过，8,192 被拒。

## 0.1.8

工具读到的图片，现在能真正到达模型。0.1.7 只修好了一半。

### 图片为什么还是看不见

0.1.7 把图片按 `image_url` 放在 **tool** 消息里发出。直连网关时这条路径成立，但请求链路上多一层中间件时就不成立：那类中间件按 OpenAI 的常见形状重建 tool 消息，把 content 拍平成字符串再转发，`image_url` 部件被静默丢弃。现象是字节账上「客户端发了 12.8 MiB，转发出去只有 1.0 MiB」，而模型那边只收到一条 `<path>…</path>` 文本，于是回答「我看不到图片」。

这不是某个特定中间件的 bug，而是 tool 角色承载非文本部件本身缺乏共识：Chat Completions 规范没有约定它，各家重建实现各行其是。把它当成可靠通道，就是把可视化能力押在链路每一跳的行为上。

### 现在怎么发

- 工具消息只发文本。它读到的图片被提取出来，放入紧随其后的一条 **user** 消息，带一句说明 `(Image content from the preceding tool result.)` 让模型知道这些图来自工具而不是用户新贴的。
- `user` 消息携带 `image_url` 是各家都实现得最完整的形状，实测在中间件前后都能到达模型。
- 一个 assistant 轮次可以发多个工具调用，它们的结果是连续多条 tool 消息。提取出的图片统一攒到这段连续区之后才发——插在中间会打断 tool_call 与结果配对的相邻性，严格校验的网关会直接拒绝。这条也补了测试。
- 逐模型实测（直连 / 经中间件，全部一致）：`deepseek-v4.1-flash`、`deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`、`claude-haiku-5.5`、`glm-5.3-flash`、`glm-5.3-flashx`、`gpt-6-luna`、`kimi-k2.7-code`、`mimo-v2.6-flash`、`mimo-v2.6-pro` 都能正确说出图片颜色。并行两条工具调用的形状也实测通过（先蓝后红，两张都被正确识别）。
- 本机按真实宿主链路验证：`read_image` 读取一张写着四个字母的图，模型复述出这四个字母。修复前同样的调用只能得到尺寸文本。

### 其它

- 路由诊断新增 `attachmentsMounted`：附件服务没挂上时，图片变不成字节，而后果是模型说「我看不到图」——这与健康的请求从外部无法区分。现在这个事实会出现在设置页。

## 0.1.7

三处修复：工具读到的图片现在真的会发给模型；配置写入不再每轮都抢 profile 的锁。

### 工具读到的图片发不出去

- `read_image` 的回答是一条 **tool** 消息，而 `toChatMessage` 处理 tool 角色时把图片解析器传成了 `undefined`，于是每张工具侧图片都被换成占位文本 `[image omitted because this model accepts text only]`。模型于是回答"我看不到图片"，看起来像模型不支持视觉，实际是我们自己没发。
- 现在 tool 消息也走同一个解析器，图片按 `image_url` 发出。网关实测：`tool` 角色带图返回 200 并正确识别颜色，**前提是请求同时声明了 `tools`**——宿主的真实请求总是带着工具表，所以这条路径可用；我最初用不声明 `tools` 的裸请求探测，撞到的是另一条规则（`reasoning_content must be passed back`），与图片无关。
- 新增测试固定住这条路径，并做过反向验证：把解析器改回 `undefined`，新测试立刻失败。

### 配置写入不再无条件抢锁

- 宿主的 `settings.update` 会锁住 profile 根目录的 `package.json` 并重写整份 composition 文档（本机 55KB，1–2 秒），随后重算插件树。此前每次调用都无条件写入：`reportJson` 每次模型调用写一次（实测约 1814 次/天），`usageJson` 每 60 秒写一次（1440 次/天），一天数千次 profile 级加锁，插件市场安装要同一把锁就会长时间等待甚至超时。
- `fieldWriterOf` 现在先读该 entry 当前的 `value`，与待写入的 JSON 相等就直接返回；短路放在重试循环内部，每次重写前重新读，保持 revision 围栏语义——值变了仍带 `row.revision` 写入，不会覆盖页面上的并发编辑。
- 写入失败不再死重试 12 次：等服务与 entry 出现是免费的（纯定时器，`WAIT_ATTEMPTS = 12`），真正写入最多两次（`WRITE_ATTEMPTS = 2`）；只有 `SETTINGS_CONFLICT` 值得重试一次，其他错误记一条 warn 就放弃。每次重试都可能触发一次插件树重建，代价远高于"这次没写进去"。
- `usageJson` 与 `reportJson` 加 5 分钟节流（`PUBLISH_MIN_INTERVAL_MS`）：实测写入上限从约 1814 + 1440 次/天降到各 288 次/天。配置变化（含手动刷新）仍然立即发布，不等节流。
- `diagnosticsJson` 增加指纹比较，`asOf` 之外的内容没变就不写。
- 配置变化监听间隔 `FAST_WATCH_MS` 从 300ms 改为 1000ms。桌面端常开数天，高频率定时器是长期成本；1 秒对手动刷新仍然是即时响应。

## 0.1.6

修好「模型不能识图」：模态字段读错了表，以及一处自相矛盾的声明。

- 宿主的图片工具会调用 `llm.resolveModelInfo`，只有解析出的路由显式声明了 `image` 才允许读图。`resolveModel` 此前从 `catalog.ts` 的静态目录取模态，而那张表只有 id 和 name，于是**每个**模型解析出的模态都是空，连视觉模型也被判成不能识图。现在改读 `MODEL_DEFAULTS`，与选择器和请求门控同源。
- `CatalogModel` 不再携带 `inputModalities` 字段，从类型上排除了两处再次分叉。
- `deepseek-v4-flash` 的模态改为 `text, image`。官方价格页脚注说它与 `deepseek-v4-flash-vision-exp` 都由 DeepSeek-V4.1-Flash-1017 承接，此前把同一个后端写成了两种能力。
- 每个模型的模态现在都对应一条厂商文档里的明确表述（DeepSeek 价格页的「图像理解」行、智谱的介绍页、Kimi 的模型页、MiMo 的模型列表、腾讯把视觉放在独立的 vision 系列），出处列在 `docs/models.md`。测试会把 12 个模型强制分进「支持图片」和「仅文本」两组并要求并集等于全集，漏写会失败。
- README 补三张设置页截图。

## 0.1.5

修复历史回放在部分 Node 24 上重复计数。

- 会话日志每个事件一帧。此前的读法是「整块尾部解码一次，再跳到下一个帧头」，依赖「一次解码只返回第一帧」这个前提。部分 Node 24.x 构建一次解码会连带后面的帧，于是每一轮都重复解出剩余全部内容，三个事件被算成五个（CI 实测 `[2,3,2,3,3]` vs `[2,3]`）。
- 现在按帧边界切片，一片一帧，与运行时是否连帧无关。切片会自动加宽直到解码成功，所以压缩后恰好含帧头字节的那一帧也不会被切断。
- 本机的 zstd 不连帧，无法复现该 bug，因此把解码器做成可注入参数：测试用一个「会连帧」的模拟解码器验证，再与真实解码器交叉核对。把算法换回旧版，这两个测试立刻失败。
- 顺带修正：非 zstd 的日志（纯文本 fixture 或未来格式）此前会被当成空会话，现在按原样读出。

宿主兼容矩阵进入 CI。

- `engines.dsh` 写着 `>=0.2.0-rc.1`，但此前只在本机当前版本上验证过。版本范围是承诺，不是证据。
- 新增 `npm run test:hosts`：对每个受支持的宿主版本，在临时目录里装齐该版本的 12 个 peer，然后依次检查三层
  - **符号**：产物导入的每个 `@deepseek-ai` 符号是否仍存在。导出被改名或删除时导入本身不报错，要到首次调用才炸，所以挂载通过不能替代这一层；
  - **类型**：源码能否用该版本的声明文件型检通过，抓符号还在但签名漂移的情况；
  - **挂载**：真实 Cordis 运行时是否接受产物入口。
- 覆盖 `0.2.0-rc.1`（范围下界）、`0.2.0-rc.2`、`0.2.1-rc.2`（当前最新）。三版全绿。
- 两条反向验证已做：向产物注入不存在的导出，`symbols` 报 `thisExportDoesNotExist`；向源码写类型错误，`types` 报 `TS2322`。不会永远通过。
- CI 新增 `hosts` 作业独立运行，避免拖慢主矩阵的四条组合。

## 0.1.4

模型没注册时，页面顶部直接说明原因。

- 此前插件未注册时，设置页照常显示，只有页面中部一行「未注册」，而会话的模型选择器是空的。用户无法判断是没装好、没启用，还是凭据没解析——这三种情况的处理方式完全不同。
- 现在顶部会列出具体原因：开关是关的、凭据没解析到、或 profile 条目缺失（后者通常是安装被中断留下的半装状态），并给出各自的处理办法。
- 路由正常时不显示任何提示，避免用户习惯性忽略告警。

## 0.1.3

启动时检查有没有新版本。

- DSH 没有插件级的「更新」入口，已安装的副本无法得知作者发了新版本，用户唯一的途径是人来通知。
- 现在每次启动读一次 npm registry，设置页显示「有新版本 X（当前 Y）」并附两条安装命令。
- 版本号按段做数字比较。若按字符串比较，`0.10.0` 会排在 `0.9.0` 下面，恰好藏掉它本该报告的那个更新。
- 构建时会校验 `PLUGIN_VERSION` 与 `package.json` 一致，不一致直接失败，避免比较到错的构建产物。

## 0.1.2

修复推理等级。

- **每个模型只显示它真正支持的推理等级。** 此前所有模型共用四个等级，方向错了两头：
  - DeepSeek 系列的 `ultra` 和 `max` 从未出现过，可选上限比实际能力低两级。
  - GLM-5.3 只接受 `low`、`high`、`max`，选到别的值网关直接返回 400。
- 现在会按模型过滤，并且把默认等级钳制到该模型支持的范围内（GLM 的默认原本是 `medium`，提交即报错）。
- 等级列表补全为 `none / minimal / low / medium / high / xhigh / ultra / max`，由弱到强排列。

## 0.1.1

配额刷新的可用性与开销。

- **勾选「使用本机 OpenDesign 的登录凭证读取额度」后立即刷新。** 此前要等下一次轮询，并且往往要先发生一次对话才看到数字，开关看起来像没生效。
- **稳态轮询从 5 秒改为 60 秒。** 实测一次读取要跑两次 OpenDesign 命令行、耗时约 2.1 秒；5 秒间隔等于每天约 10 小时的进程时间，只为显示一个不常看的数字。
- **新增手动刷新按钮**，位于额度卡片右上角。
- 文档补充 GitHub 安装方式，并说明 `lib/` 构建产物入库的原因。

## 0.1.0

首个发布版本。

- 把 OpenDesign Go 套餐的 12 个 Design Plan 模型接入 DSH。
- 通过本机 OpenDesign 桌面端的登录凭证读取真实的 5 小时 / 7 天额度。
- 按模型统计 token 与成本（厂商公开价目表的基础档）。
- 多账号：每个账号是一份独立订阅，可自动故障切换。
- 每模型可调上下文窗口与输出上限；不需要的模型可隐藏。
- 声明支持图片的模型可接收图片输入。
