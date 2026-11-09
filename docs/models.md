# 模型与参数

模型目录来自网关：启动时用当前账号的 API key 请求 `GET {baseURL}/models`，该端点**按账号额度等级返回**，插件照单展示。Go 拿到 14 个 Design Plan 模型，Plus / Pro / Max 拿到各自档位的额外模型。参数默认值在 `src/model-params.ts` 的 `MODEL_DEFAULTS`；未收录的 id 用 `GENERIC_DEFAULTS`，并在设置页标注「参数未收录」。

`src/catalog.ts` 的 `GO_DESIGN_PLAN_MODELS` 保留为兜底：拉取失败时（离线、网关故障、key 无效）用它顶上，页面不会空掉。它也是显示名的权威来源 —— 网关只返回 id，没有显示名。

## 模型表

| 显示名 | ID | 上下文 | 输出上限 | 输入模态 |
| --- | --- | --- | --- | --- |
| DeepSeek V4.1 Flash | `deepseek-v4.1-flash` | 1,000,000 | 384,000 | text, image |
| DeepSeek V4.1 Flash Eco | `deepseek-v4.1-flash-eco` | 1,000,000 | 384,000 | text, image |
| DeepSeek V4 Flash | `deepseek-v4-flash` | 1,000,000 | 384,000 | text, image |
| DeepSeek V4 Flash Vision Exp | `deepseek-v4-flash-vision-exp` | 1,000,000 | 384,000 | text, image |
| DeepSeek V4 Pro | `deepseek-v4-pro` | 1,000,000 | 384,000 | text |
| Claude Haiku 5.5 | `claude-haiku-5.5` | 1,000,000 | 128,000 | text, image |
| GPT-6 Luna | `gpt-6-luna` | 1,050,000 | 128,000 | text, image |
| GLM-5.3 Flash | `glm-5.3-flash` | 1,000,000 | 128,000 | text, image |
| GLM-5.3 Flash-X | `glm-5.3-flashx` | 1,000,000 | 128,000 | text, image |
| Kimi K2.7 Code | `kimi-k2.7-code` | 262,144 | 262,144 | text, image |
| MiMo V2.6 Flash | `mimo-v2.6-flash` | 1,000,000 | 128,000 | text, image |
| MiMo V2.6 Pro | `mimo-v2.6-pro` | 1,000,000 | 128,000 | text, image |
| MiniMax M3.1 Flash | `minimax-m3.1-flash` | 1,000,000 | 524,288 | text, image |
| Hunyuan H4 Preview | `hy4-preview` | 1,000,000 | 64,000 | text |

参数的取值依据（代码注释里保留了出处）：

- **DeepSeek 系**：1M 上下文、384K 输出。`deepseek-v4-flash` 与 `deepseek-v4-flash-vision-exp` 是已退役 ID，官方文档的脚注明确两者都由 DeepSeek-V4.1-Flash-1017 承接，因此这两个 ID 的参数**与图片能力**都同 V4.1-Flash。`deepseek-v4-pro` 是另一个模型，官方价格表的「图像理解」一行对它标的是**不支持**。实测 `max_tokens: 384000` 会被接受，网关 `metadata.output_budget` 里的 128000 只是广播元数据，不是硬限制。

  厂商 `/models` 端点给 `deepseek-flash` 报的是 `context_window: 1048576`、`max_output_tokens: 393216`，与这里记的 1,000,000 / 384,000 差在两个不同的地方。输出上限**是同一个数**：`393216 = 384 × 1024`，价格页写「384K」，端点写 KiB 精确值。eco 正好卡在这个点上被验证——`393216` 返 200、`393217` 返 400，而 base 一直放到 `1048576` 都不拒，说明这个界不是网关自己加的。上下文窗口则**真的不一样**：`1048576 = 1 Mi` 比 `1,000,000` 大约 4.86%，这里仍取价格页的十进制 1M，因为插件报给宿主的是「窗口 − 输出预留」，用小的那个更保守，不会让宿主晚一步压缩。
- **DeepSeek V4.1 Flash Eco**：**DeepSeek 官方文档里没有这个 ID**。它是 OpenDesign 侧的慢速档，定价页把它列进 Design Plan 模型并注明「速度较慢」，[额度页](https://open-design.ai/model-credits/)的说法是「may respond more slowly at times」，建议用于批处理。所以上下文与输出上限没有厂商出处，只有实测依据：`max_tokens: 384000` 返 200，与 V4.1-Flash 相同；网关给它的 `metadata` 也与 V4.1-Flash 逐字段相同（`context_limit 1048000`、`context_budget 328000`）。表格里的 1,000,000 / 384,000 是这两条加上「参数同 V4.1-Flash」的合并结论，不是独立公布值。
  - 它的输出上限**能被探到硬边**：`393216` 返 200、`393217` 返 400，正是 384 Ki。同一个 `max_tokens` 丢给 base 一路到 `1048576` 都不拒，所以这个界是 eco 自己带的，不是网关统一加的。表里记的 384,000 落在这条线下方，两边都安全。
  - 价格与 V4.1-Flash 逐项相同：输入 0.3 / 输出 1.2 / 缓存读 0.006 USD per 1M token。
  - 但**订阅额度的扣减倍率不同**：额度页给 eco 的 Design Plan credit 倍率是 0.27×，V4.1-Flash 是 0.5×。同样的工作量消耗更少的订阅额度，「慢速档更便宜」指的是这件事。本地账本按公开价目表估算、不乘倍率，所以两个模型的金额估算相同。
- **Claude Haiku 5.5**：1M 上下文（比早期的 200K 放宽）、128K 输出。超限时端点会报 `maximum context length is 1000000 tokens`，这条独立印证了上下文数字。
- **GLM-5.3 两个型号**：1M 上下文、128K 输出。
- **GPT-6 Luna**：1,050,000 总上下文、128K 输出（922,000 输入 + 128,000 输出 = 1,050,000，三个数字自洽）。实测 1.5M token 的 prompt 未被端点拒绝，说明端点不自校验，这里采用文档值。
- **Kimi K2.7 Code**：256K 上下文，端点报 `Range of max_tokens should be [1, 262144]`，故输出上限同为 262,144。
- **MiMo 两个型号**：1M 上下文、128K 输出。
- **MiniMax M3.1 Flash**：上下文取自厂商文档（[文本生成](https://platform.minimax.io/docs/guides/text-generation)的 Supported Models 表写 1,000,000，网关 `context_limit` 也是 1000000）。**输出上限没有厂商数字**，由实测二分：524,288 返 200，524,289 被拒，故记 524,288。这个 ID 总是思考，`none` 每次都被 400 拒绝，与文档「requires adaptive thinking」一致。
- **Hunyuan H4 Preview**：1M 上下文、64K 输出。

模态取自厂商文档，逐条注明出处；例外是 `deepseek-v4.1-flash-eco` 与 `minimax-m3.1-flash` 的输出上限，以及前者的模态——厂商没有 eco 这个 ID，该行依据实测：

| 厂商 | 依据 |
| --- | --- |
| DeepSeek | [价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) 的「图像理解」行：`deepseek-flash` 支持、`deepseek-v4-pro` 不支持；脚注(1) 说明两个退役 ID 由 V4.1-Flash 承接。格式见[图像理解](https://api-docs.deepseek.com/zh-cn/guides/vision)页（JPEG/PNG/GIF/WebP） |
| DeepSeek V4.1 Flash Eco | 厂商文档没有这个 ID，因此**没有厂商依据、只有实测**：96×96 的纯色图（红/蓝/绿）全部答对，左紫右黄的双色图答「purple 和 yellow」，左侧黑竖条答「A black vertical stripe on the left and a large white area」。网关 `architecture.input_modalities` 给它写的是 `["text"]`，与真实行为不符，未采用 |
| Anthropic | Haiku 5.5 标准支持图像输入 |
| OpenAI | GPT-6 Luna 标准支持图像输入 |
| 智谱 | [GLM-5.3-Flash/FlashX 页](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash)：原生多模态，输入模态为「视频、图像、文本、文件」 |
| 月之暗面 | [Kimi K2.7 Code 页](https://platform.kimi.com/docs/guide/kimi-k2-7-code-quickstart)：支持「文本、图片与视频输入」 |
| 小米 | [MiMo 模型列表](https://mimo.mi.com/docs/zh-CN/quick-start/summary/model)：两个 V2.6 型号均标注「全模态理解」 |
| MiniMax | [文本生成](https://platform.minimax.io/docs/guides/text-generation)页把 M3.1-Flash 列为多模态模型；实测左紫右黄的 96×96 双色图答「Purple and yellow-green.」。网关另声明 `video` 输入，但宿主的模态类型只有 `text` 与 `image`，这一项无法表达 |
| 腾讯 | 混元把视觉能力放在独立的 `hunyuan-vision` 系列，H4 不在其中；网关对 H4 也返回 404 `No endpoints found that support image input` |

「图片输入」一列取自 `src/model-params.ts` 的 `MODEL_DEFAULTS`。

这张表是模态的**唯一来源**：会话选择器的模态提示（`catalog.ts` 的 `listSeedModels`）、请求参数解析（`adapter.ts` 的 `resolveModel`）和请求门控（`adapter.ts` 的 `#imageResolverFor`）都读它。`resolveModel` 曾经改从 `catalog.ts` 的静态目录读模态，而那张表只有 id 和 name，于是每个模型解析出的模态都是空 —— 宿主的图片工具据此拒绝读图，表现为「这个模型不能识图」。现在 `CatalogModel` 已不再携带模态字段，从类型上排除了再次分叉。

文本模型收到图片时会替换为占位文本，不会把图片字节发到网关。

上表的「上下文」是厂商公布的窗口。**报给宿主的窗口是它的输入预算**，即 `窗口 − max(输出上限, 窗口/4)`：1M + 384K 的模型报 750,000，1M + 64K 的报 936,000，256K + 256K 的报 196,608。原因见下一节。

## 参数覆盖

在设置页「可用模型」每行点「改参数」可以覆盖两项：

| 参数 | 范围 | 作用 |
| --- | --- | --- |
| 上下文窗口 | 1,000–10,000,000 | 驱动选择器里的上下文显示和截断提示 |
| 输出上限（`max_tokens`） | 1–1,000,000 | 调用方没有显式给 `maxTokens` 时作为请求的 `max_tokens` |

行为约定：

- 越界的编辑会被**拒绝并提示**，不会静默截断或夹到边界——错一个数量级会直接改变行为，假装成功比报错更糟。
- 两项都留空 = 恢复官方默认值，覆盖项从配置里删除。
- 默认值以 placeholder 显示，不强行写进配置：没动过的模型继续跟随代码里的默认值。

请求构建时（`src/adapter.ts` 的 `dispatch`）：调用方给的 `maxTokens` 优先；没给就用该模型的默认 `maxTokens`。不显式发送会让部分模型的上限远低于它公布的能力。

发出的值再按本次请求的实际输入钳制。网关的判据是 `输入 + max_tokens ≤ 窗口`，输入与输出共用同一份预算，原样发 384,000 会让输入刚到六成窗口就被拒。实测：固定输入 980,038 时，`max_tokens` 给 68,500 通过、69,000 被拒；输入 1,043,038 时，4,096 通过、8,192 被拒。

配套地，报给宿主的 `contextWindow` 是**输入预算** `窗口 − max(输出上限, 窗口/4)`，而不是公布的窗口。宿主只量输入、从不扣输出预留量，报公布窗口会让每次压缩决策都晚一个预留量。1M 窗口 + 384K 输出的模型报 750,000。设置页的模型行把这两个数都显示出来：`上下文 1.00M（可用输入 750k）· 输出 384k`。

输入估算按字符数走：ASCII 约 3.5 字符/token（实测 4.4，刻意取低），中文约 2 字符/token。图片按每张 1,024 token 计——实测那张 391KB 的 JPEG 上游只计约 974 token，而它的 data URL 有 242 万字符，按长度算会高估三个数量级。工具声明也计入：本机真实工具集 326 个声明、约 163K token，占 1M 窗口的 15.6%，忽略它每次估算会小三分之一。

## 思考等级

等级由弱到强共八个，每个模型只展示它接受的那部分。**八个值不等于八种强度**：其中七个别名折叠到三档真实强度上，详见本节末尾。

| ID | 显示名 | 说明 |
| --- | --- | --- |
| `none` | 关闭 | 不思考，响应最快 |
| `minimal` | 最低 | |
| `low` | 低 | |
| `medium` | 中 | 多数模型的默认值 |
| `high` | 高 | |
| `xhigh` | 较高 | |
| `ultra` | 极高 | 仅 DeepSeek 系列与 GPT-6 Luna（不含 Flash Eco） |
| `max` | 最高 | |

每个模型只显示它真正支持的推理等级。网关没有公开文档说明这个字段，取值是**逐个值探出来的**：发一次看 200 还是 400，没有捷径——网关对非法值的回包不列举合法集合，只是 `[code=invalid_request_error] The request is invalid. Please check the request parameters.`（部分上游模型包成 `[code=upstream_error]`）。所以表里每一行的边界都是探针结果，不是从错误信息里读出来的。

| 模型 | 支持的推理等级 |
| --- | --- |
| deepseek-v4.1-flash、deepseek-v4-flash、deepseek-v4-flash-vision-exp、deepseek-v4-pro、gpt-6-luna | `none`、`minimal`、`low`、`medium`、`high`、`xhigh`、`ultra`、`max` |
| claude-haiku-5.5、kimi-k2.7-code、mimo-v2.6-flash、mimo-v2.6-pro、hy4-preview、deepseek-v4.1-flash-eco | `none`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`（跳过 `ultra`） |
| minimax-m3.1-flash | `minimal`、`low`、`medium`、`high`、`xhigh`、`max`（**没有 `none`**，也没有 `ultra`） |
| glm-5.3-flash、glm-5.3-flashx | 仅 `low`、`high`、`max` |

选到该模型不支持的值，网关会返回 400。因此插件按模型过滤列表，并把默认等级钳制在合法范围内。

两行值得单独说明，因为它们各自否证了一种「按系列推」的省事做法：

- `deepseek-v4.1-flash-eco` 的集合与中间那行五个模型**完全相同**，但它是 **DeepSeek 系列里唯一没有 `ultra` 的一档**：五轮交替实测它对 `ultra` 每次都在一秒内返回 400（`[code=upstream_error]`），同一时刻 `deepseek-v4.1-flash` 五轮全部 200。同一个模型的快慢两档在思考等级上出现差异，这件事本身就是参数表必须按模型存、不能按系列推断的理由。
- `minimax-m3.1-flash` 是唯一**两端都被削掉**的：`none` 三次全部 400，与厂商文档说它「requires adaptive thinking」吻合，所以它的列表从 `minimal` 起步；`ultra` 同样被拒，于是止于 `max`。它是三组之外的新形状，不能并入任何一行。

### 八档里只有三档是真的强

「接受」不等于「有区别」。DeepSeek 的[思考模式文档](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)自己给了映射表：`minimal`/`low` → low、`medium`/`high`/`xhigh` → high、`max`/`ultra` → max。也就是说七个中间值只落在三档强度上。

在这个网关上量 `reasoning_tokens`（同一 prompt 交错采样、temperature 0）确实复现了这三组：

| 模型 | n | 实测均值（`reasoning_tokens`） | 统计上可区分的配对（z>2.5） |
| --- | --- | --- | --- |
| `deepseek-v4.1-flash` | 10 | low 756 < minimal 881 < high 1158 < xhigh 1277 < medium 1280 ≪ max 4402 < ultra 5020 | `max−high` z=7.95、`medium−minimal` z=3.63 |
| `deepseek-v4.1-flash-eco` | 8 | low 1316 < minimal 1140 < xhigh 1496 < medium 1510 < high 1701 ≪ max 5286 | `max−high` z=9.45、`medium−minimal` z=2.36 |
| `deepseek-v4.1-flash`（`/responses`） | 6 | low 955 < minimal 1048 < high 1150 < xhigh 1247 < medium 1453 < ultra 2325 < max 3081 | 仅 `max−high` z=3.86 |

三组内部（`minimal↔low`、`medium↔high↔xhigh`、`ultra↔max`）在各次采样里都不可区分，组与组之间才分得开。**结论：8 个合法值折叠成 3 档真实强度，与厂商映射表一致**，网关在这里没有发明自己的分档。

既然映射关系成立，为什么不把列表缩成 `low`/`high`/`max` 三个？三个理由：

- 缩表会**改掉默认档的语义**。插件默认 `medium`，它映射到 high；若只剩三档，`medium` 不在列表里，默认值会被钳到 `low`——所有用户的默认思考强度会静默下降一档。
- 八个值**都合法**，写全不会导致请求失败；`ultra` 的例外只有 eco，而 eco 已在它自己那一行减去。
- 别名有实际用途：`medium`/`xhigh` 都落在 high，但换别名不等价于白换——`xhigh` 的实测均值始终略高于 `high`（三组数据里都是），只是这个差在单次采样噪声里分不出来。

所以这张表描述的是**该模型接受哪些值**，不是「有几种强度」。这两件事必须分开看，否则会得出「插件谎报 8 档」的错误结论。

### `none` 关不关思考：看协议

厂商文档说 OpenAI 协议下 `reasoning_effort: "none"` 不关思考、要关得用 `thinking: {type: "disabled"}`。**这个网关的行为正好相反**，两边都是 4/4 稳定：

| 发送的字段 | `deepseek-v4.1-flash` | `deepseek-v4.1-flash-eco` |
| --- | --- | --- |
| `reasoning_effort: "none"` | `reasoning_tokens` 全为 0 | 全为 0 |
| `thinking: {type: "disabled"}` | 仍思考（18/18/18/19） | 仍思考（18/20/17/18） |
| `thinking: {type: "disabled"}` + `effort: "none"` | 全为 0 | 全为 0 |

`thinking` 字段在这个网关上被**静默忽略**——发 `thinking: {type: "disabled"}` 不报错、也不生效；只有 `reasoning_effort` 真的能关掉思考。所以插件只发 `reasoning_effort`、不发 `thinking` 是**对的**，而且有额外理由：`minimax-m3.1-flash` 对这个 ID 本来就拒绝 `none`（三发三中 400），同时再带上 `thinking` 不会让它变好，只会让发出去的请求多一个没有作用的字段。

代价是这张表**绑定了当前网关**。如果哪天 OpenDesign 把 `thinking` 接通、或让 `none` 不再关思考，插件里「关闭」这一档的语义就会变，需要重新探针。

不在目录里的模型 ID 同样会拿到思考等级列表和通用参数（`GENERIC_DEFAULTS`），因为网关对它服务的每个模型都接受这个参数；隐藏选择器反而会让比本版本更新的 ID 少一个能力。设置页会把这些值标成「参数未收录」，提醒用户核对。

## 图片输入

声明了 `image` 模态的模型可以接收图片：

- 适配器把图片附件解析成内联 `data:` URL，作为 `image_url` 内容块发给网关（`src/conversion.ts`）。
- **按声明的模态做门控**：文本模型不会收到图片字节。会话里已有的图片会被替换成 harness 的占位文本（含图片名与路径），对话继续可用而不是整轮报错。
- 只有图片、没有文字的轮次是合法的。
- **工具读到的图片同样会发出**，但走的不是 `tool` 角色：`read_image` 的回答是 `tool` 消息，图片被提取出来放到紧随其后的 `user` 消息里，并附一句 `(Image content from the preceding tool result.)` 标明来源。

为什么不在 `tool` 消息里直接带图：直连网关时 `tool` 角色带 `image_url` 确实能通（实测 200 并正确识别颜色），但请求链路上多一层中间件就不成立——那类中间件按 OpenAI 的常见形状重建 `tool` 消息，把 content 拍平成字符串再转发，`image_url` 部件被静默丢弃。这不是某个中间件的 bug，而是 `tool` 角色承载非文本部件本身缺乏共识：Chat Completions 规范没有约定它，各家重建实现各行其是。`user` 消息带图是各家实现得最完整的形状。

多个工具调用时，结果可能是连续多条 `tool` 消息。提取出的图片统一攒到这段连续区之后才发——插在中间会打断 `tool_call` 与结果配对的相邻性，严格校验的网关会直接拒绝。

图片字节由宿主附件服务提供（`attachments.imageHostPath`）。宿主没有该服务时，图片内容不会被投影成图像块，路由诊断里的 `attachmentsMounted` 会显示这个事实。

`kimi-k2.7-code` 官方说明支持图片输入，但对**工具消息**里的图片会回答"无法读取此图"（直接贴图正常）。这是模型侧的差异，不是插件过滤。

## 图片请求预算

Chat Completions 没有 Files 上传，所以每一轮的每一张历史图片都要按 base64 长度重发一次。请求体因此随会话单调增长，直到网关前面的 nginx 直接拒收 —— 返回一个不含阈值、也不是 JSON 的 HTML 413 页面。压缩要发同一份历史，所以压缩也会同样失败，整个会话就此卡死。

预算在 `src/image-request-budget.ts`：

| 常量 | 值 |
| --- | --- |
| 单请求内联图片字节 | 24 MiB |
| 每次 offload 移除的字节 | 8 MiB |
| 单请求图片张数 | 60 |
| 每次 offload 移除的张数 | 20 |

超预算时不自己丢图，而是抛 `IMAGE_OFFLOAD_REQUIRED` 并带上 `offloadImages: N`，由 `dsh-compaction-image-offload` 记一条 `image/offload` 事件再重试，派生器把被选中的图片投影成占位文本。自己不丢是因为没记录的投影会让会话日志与实际发送的内容不一致：日志说那轮带了图，模型其实没看到，之后的回放和计费全都对不上。

按整块（8 MiB / 20 张）而不是最小需要量前进，是为了让被丢的前缀跨多轮保持稳定 —— 每轮多丢一张，每次重写历史都会从第一张被改的图开始打断 prompt 缓存。

只在真的会发图片字节的路由上计量。纯文本模型下图片本来就投影成占位文本，对它计费会要求一次释放不了任何字节的 offload。

24 MiB 是保守值，不是测出来的：网关不公布上限。同类的 Command Code 适配器实测其网关约 50.17 MB，这里取一半，留足余量给文本、工具声明和 JSON 框架。

## 生图模型

网关的 `GET /models` 把对话模型和生图模型混在一个列表里，只给 id 不给输出模态。`gpt-image-2`、`seedream-5.0`、`nano-banana-2` 这类 id 无法用 `POST /chat/completions` 服务，它们只吃 `POST /images/generations`。

目录快照因此多记一个 `imageIds` 字段（是 `ids` 的子集）。选中这些模型时的行为：

1. 取本轮最后一条 user 消息的可见文本作为 prompt；
2. `POST {baseURL}/images/generations`，body 是 `{model, prompt, n: 1}`，请求 `size` 时可带上 `size`；
3. 返回的 base64 逐张经 `attachments.saveImage` 落成持久引用；
4. 作为正常的 assistant image block 贴进回复 —— `ImageBlock` 是 role-neutral 的，会话的图片画廊和 ACP 桥都会渲染它。

因此生成的图片能被后续对话继续读取，重启也还在。

几个明确的边界：

- **不重试。** 重试归宿主管；这里重试会为一份没人留下的产物付两次钱。
- **宿主没有附件存储就拒绝生成**（`UNSUPPORTED_OPTION`），而不是返回一条指向不存在附件的坏图。
- **prompt 为空就拒绝**（`INVALID_REQUEST`）：`/images/generations` 没有会话概念，空 prompt 会让网关生成一张随机图并计费。
- **不报 usage。** Images 端点不报 token，编一个数字会让账本记录无法核对的支出。
- **不支持图生图。** `/images/generations` 不吃图片输入，所以「把刚才那张图改成蓝色」这类要求无法工作；要做得换成 `/images/edits`，本期没做。

设置页给这些行加了「生图模型」标注，并隐藏上下文窗口、输出上限与「改参数」——它们没有这些参数。

分类规则（`src/catalog.ts` 的 `isImageModel`）：目录声明了 `output_modalities` 就以声明为准，**双向**有效 —— 声明 `["text"]` 的即使是 `gpt-image-2` 也算对话模型，没声明 `text` 的即使名字像对话模型也算生图模型。只有目录什么都没说时，才查已知生图 id 表。理由是沉默不能当成「生图」，那会误伤能用的对话模型。

## 停用模型

取消勾选某个模型后：

- 它不再出现在会话的模型选择器里，也不出现在任何其他消费方；
- 模型仍可用 API 直接调用——停用只是目录过滤，不是禁止路由；
- 未知模型 ID 的路由仍然被接受，静态目录是建议性的，不是准入名单。
