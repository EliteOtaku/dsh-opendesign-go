# 模型与参数

模型目录是代码内的静态表（`src/catalog.ts` 的 `GO_DESIGN_PLAN_MODELS`），共 12 个，对应 Go 套餐授予的 Design Plan 模型。参数默认值在 `src/model-params.ts` 的 `MODEL_DEFAULTS`。

目录不来自线上接口：Go 套餐不包含套餐模型额度，可授予的集合是固定的，静态表省掉一次启动期网络依赖。

## 模型表

| 显示名 | ID | 上下文 | 输出上限 | 输入模态 |
| --- | --- | --- | --- | --- |
| DeepSeek V4.1 Flash | `deepseek-v4.1-flash` | 1,000,000 | 384,000 | text, image |
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
| Hunyuan H4 Preview | `hy4-preview` | 1,000,000 | 64,000 | text |

参数的取值依据（代码注释里保留了出处）：

- **DeepSeek 系**：1M 上下文、384K 输出。`deepseek-v4-flash` 与 `deepseek-v4-flash-vision-exp` 是已退役 ID，官方文档的脚注明确两者都由 DeepSeek-V4.1-Flash-1017 承接，因此这两个 ID 的参数**与图片能力**都同 V4.1-Flash。`deepseek-v4-pro` 是另一个模型，官方价格表的「图像理解」一行对它标的是**不支持**。实测 `max_tokens: 384000` 会被接受，网关 `metadata.output_budget` 里的 128000 只是广播元数据，不是硬限制。
- **Claude Haiku 5.5**：1M 上下文（比早期的 200K 放宽）、128K 输出。超限时端点会报 `maximum context length is 1000000 tokens`，这条独立印证了上下文数字。
- **GLM-5.3 两个型号**：1M 上下文、128K 输出。
- **GPT-6 Luna**：1,050,000 总上下文、128K 输出（922,000 输入 + 128,000 输出 = 1,050,000，三个数字自洽）。实测 1.5M token 的 prompt 未被端点拒绝，说明端点不自校验，这里采用文档值。
- **Kimi K2.7 Code**：256K 上下文，端点报 `Range of max_tokens should be [1, 262144]`，故输出上限同为 262,144。
- **MiMo 两个型号**：1M 上下文、128K 输出。
- **Hunyuan H4 Preview**：1M 上下文、64K 输出。

模态全部取自厂商文档，逐条注明出处：

| 厂商 | 依据 |
| --- | --- |
| DeepSeek | [价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) 的「图像理解」行：`deepseek-flash` 支持、`deepseek-v4-pro` 不支持；脚注(1) 说明两个退役 ID 由 V4.1-Flash 承接。格式见[图像理解](https://api-docs.deepseek.com/zh-cn/guides/vision)页（JPEG/PNG/GIF/WebP） |
| Anthropic | Haiku 5.5 标准支持图像输入 |
| OpenAI | GPT-6 Luna 标准支持图像输入 |
| 智谱 | [GLM-5.3-Flash/FlashX 页](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash)：原生多模态，输入模态为「视频、图像、文本、文件」 |
| 月之暗面 | [Kimi K2.7 Code 页](https://platform.kimi.com/docs/guide/kimi-k2-7-code-quickstart)：支持「文本、图片与视频输入」 |
| 小米 | [MiMo 模型列表](https://mimo.mi.com/docs/zh-CN/quick-start/summary/model)：两个 V2.6 型号均标注「全模态理解」 |
| 腾讯 | 混元把视觉能力放在独立的 `hunyuan-vision` 系列，H4 不在其中；网关对 H4 也返回 404 `No endpoints found that support image input` |

「图片输入」一列取自 `src/model-params.ts` 的 `MODEL_DEFAULTS`。

这张表是模态的**唯一来源**：会话选择器的模态提示（`catalog.ts` 的 `listSeedModels`）、请求参数解析（`adapter.ts` 的 `resolveModel`）和请求门控（`adapter.ts` 的 `#imageResolverFor`）都读它。`resolveModel` 曾经改从 `catalog.ts` 的静态目录读模态，而那张表只有 id 和 name，于是每个模型解析出的模态都是空 —— 宿主的图片工具据此拒绝读图，表现为「这个模型不能识图」。现在 `CatalogModel` 已不再携带模态字段，从类型上排除了再次分叉。

文本模型收到图片时会替换为占位文本，不会把图片字节发到网关。

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

## 思考等级

等级由弱到强共八个，每个模型只展示它接受的那部分：

| ID | 显示名 | 说明 |
| --- | --- | --- |
| `none` | 关闭 | 不思考，响应最快 |
| `minimal` | 最低 | |
| `low` | 低 | |
| `medium` | 中 | 多数模型的默认值 |
| `high` | 高 | |
| `xhigh` | 较高 | |
| `ultra` | 极高 | 仅 DeepSeek 系列与 GPT-6 Luna |
| `max` | 最高 | |

每个模型只显示它真正支持的推理等级，列表来自网关自己的拒绝信息：发送一个非法值，返回的错误里会写明该模型的合法取值集合。网关没有公开文档说明这个字段，实测是唯一可靠来源。

| 模型 | 支持的推理等级 |
| --- | --- |
| deepseek-v4.1-flash、deepseek-v4-flash、deepseek-v4-flash-vision-exp、deepseek-v4-pro、gpt-6-luna | `none`、`minimal`、`low`、`medium`、`high`、`xhigh`、`ultra`、`max` |
| claude-haiku-5.5、kimi-k2.7-code、mimo-v2.6-flash、mimo-v2.6-pro、hy4-preview | `none` 到 `xhigh`（无 `ultra`） |
| glm-5.3-flash、glm-5.3-flashx | 仅 `low`、`high`、`max` |

选到该模型不支持的值，网关会返回 400。因此插件按模型过滤列表，并把默认等级钳制在合法范围内。

未知模型 ID（不在静态表里的）同样会拿到思考等级列表，因为网关对它服务的每个模型都接受这个参数；隐藏选择器反而会让比本版本更新的 ID 少一个能力。

## 图片输入

声明了 `image` 模态的模型可以接收图片：

- 适配器把图片附件解析成内联 `data:` URL，作为 `image_url` 内容块发给网关（`src/conversion.ts`）。
- **按声明的模态做门控**：文本模型不会收到图片字节。会话里已有的图片会被替换成 harness 的占位文本（含图片名与路径），对话继续可用而不是整轮报错。
- 只有图片、没有文字的轮次是合法的。

图片字节由宿主附件服务提供（`attachments.imageHostPath`）。宿主没有该服务时，图片内容不会被投影成图像块。

## 停用模型

取消勾选某个模型后：

- 它不再出现在会话的模型选择器里，也不出现在任何其他消费方；
- 模型仍可用 API 直接调用——停用只是目录过滤，不是禁止路由；
- 未知模型 ID 的路由仍然被接受，静态目录是建议性的，不是准入名单。
