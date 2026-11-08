# 按账号套餐提供模型目录 设计

2026-11-09。回应 issue #3，目标版本 0.1.18。

## 问题

Issue #3（作者 BaxterL）：用户购买了 OpenDesign **Plus** 套餐，想在 DSH 里用 `claude-sonnet-5.5`，但模型选择器里没有这个模型。

根因：`src/catalog.ts` 的 `GO_DESIGN_PLAN_MODELS` 是写死的 14 条 —— 那是 **Go** 套餐的 Design Plan 模型。Plus / Pro / Max 各自还有一批额外模型，插件完全不知道，所以「看不到更高档位的模型」不是渲染问题，是目录根本没有那些 id。

实测确认（2026-11-09，使用本机 Go 套餐的 key）：`GET https://amr-link.open-design.ai/v1/models` 返回 **恰好 14 个**，与本机写死名单完全一致。也就是说这个端点是**按账号额度等级返回的**，不是全量目录。

## 目标

1. Plus / Pro / Max 用户能在 DSH 里看到并使用自己套餐包含的模型。
2. Go 用户看到的东西与现在完全一致（14 个，顺序不变）。
3. 新模型即使没有手工配置参数也能立刻选、立刻用。
4. 用户能看出哪些模型参数是插件没有权威依据的，需要自己核对。

## 非目标

- 不做套餐识别。插件不需要知道用户是 Go 还是 Plus —— 网关已经按账号权限返回了，插件再判断一次就是第二套真相。
- 不把定价页的套餐矩阵写进代码参与运行时判定。
- 不在运行时拉取模型价格。目录与价格是两件事，`pricing.ts` 已有独立的价格通道。

## 决策

### 目录来源：`/v1/models`

启动时（以及每次适配器注册前）带当前账号的 API key 请求 `GET {baseURL}/models`，把返回的 id 列表作为可用模型。

理由：这是唯一与账号权限自动一致的做法。硬编码套餐矩阵有两个致命问题 —— 官方新增模型时需要发版才生效；以及分不清账号实际有没有权限，会向 Go 用户展示他根本没有的模型，点下去就是 403。

### 未收录模型：保守默认值 + 界面显式声明

`MODEL_DEFAULTS`（`src/model-params.ts`）里没有的 id，使用一套通用默认值：

| 字段 | 值 | 理由 |
| --- | --- | --- |
| `contextWindow` | 1,000,000 | 当前在售模型的常见量级 |
| `maxTokens` | 128,000 | 同上，且是多个厂商的公布值 |
| `inputModalities` | `['text', 'image']` | 多数新模型支持图像；不声明的话宿主会拒绝读图 |
| `reasoningEfforts` | 全部 8 档 | 与现有「未知 id 保留全档」的既有行为一致 |

但这套值是**猜的**，必须让用户知道。因此：

- `ModelsCard` 里该行显示「**参数未收录**」徽标，并附一句「下面是通用默认值，请按厂商文档核对后修改」。
- 用户在设置页改过参数后，徽标消失（因为此时数值有了明确来源）。

这与 `catalog.ts` 顶部注释「M3 用 `/v1/models` 替换种子」的方向一致，属于补上那条计划路径。

### Go 行为不变

Go 账号的 `/v1/models` 返回的 14 个 id 与写死名单一致，所以展示内容不变。写死的 `GO_DESIGN_PLAN_MODELS` 保留，降级用途：

- `/v1/models` 请求失败（离线、网关故障、key 无效）时用它，页面不会突然空掉。
- 它是新模型 `name` 的显示名回退来源。

## 数据流

```
启动 / 注册适配器
   ↓
resolveApiKey(当前账号) → key
   ↓
GET {baseURL}/models   （带 Bearer key）
   ↓ 成功                    ↓ 失败
得到 id 列表                用 GO_DESIGN_PLAN_MODELS 兜底
   ↓                          ↓
   └──────→ 合并为模型行 ←──────┘
              ↓
        写入 catalogJson（配置缓存字段）
              ↓
   listModels() 读它 / ModelsCard 渲染它
```

`catalogJson` 沿用 `updateJson` / `diagnosticsJson` 的写回模式：`createCacheRetry` + `fieldWriterOf`，写入失败会退避重试。

## 数据契约

新增配置字段 `catalogJson`（字符串，默认 `''`）：

```json
{
  "asOf": "2026-11-09T06:50:00.000Z",
  "source": "gateway",
  "ids": ["claude-sonnet-5.5", "deepseek-v4.1-flash", "..."],
  "error": "仅当 source 为 fallback 时出现"
}
```

| 字段 | 含义 |
| --- | --- |
| `source` | `gateway` = 从 `/v1/models` 拉到；`fallback` = 用写死名单 |
| `ids` | 该账号可用的模型 id，顺序即展示顺序 |
| `error` | 兜底时的原因，页面显示 |

`ids` 为空数组表示「确实一个也没有」，与字段缺失（未拉取过）区分。

## 显示名

网关只返回 id，没有显示名。命名规则：

1. `GO_DESIGN_PLAN_MODELS` 里有的 id，用表中的 `name`（保持现有显示不变）。
2. 没有的，由 id 推导：`claude-sonnet-5.5` → `Claude Sonnet 5.5`，`kimi-k3.1-pro` → `Kimi K3.1 Pro`。规则是把 `-` 分段，已知厂商名首字母大写，数字段保持原样。

推导出的名字不完美但可读，且不需要为每个新模型维护一张表。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/catalog.ts` | 新增 `parseCatalog`、`catalogRowsOf`、`displayNameOf`；保留 `GO_DESIGN_PLAN_MODELS` 作为兜底与显示名来源 |
| `src/catalog-fetch.ts` | **新建**。`fetchGatewayModels(baseURL, apiKey)` → id 列表或 undefined |
| `src/config.ts` / `src/config-contract.ts` | 新增 `catalogJson` 字段（两处 schema + `LiveConfig` + `readConfig`） |
| `src/index.ts` | 启动与注册前拉目录并写回；失败走兜底 |
| `src/adapter.ts` | `listModels` 与 `resolveModel` 改读 `catalogJson` |
| `src/model-params.ts` | 新增 `GENERIC_DEFAULTS` 与 `paramsOf` 的兜底分支 |
| `src/client/ModelsCard.tsx` | 读 `catalogJson` 渲染；未收录行加徽标与提示 |
| `tests/catalog.spec.ts` | 新增解析与命名用例 |
| `tests/catalog-fetch.spec.ts` | 新建，覆盖成功 / 非 2xx / 超时 / 畸形 body |
| `tests/models-card.spec.ts` | 新增（若不存在）徽标渲染用例 |

## 测试

`tests/catalog-fetch.spec.ts`：

- 正常返回 → id 列表
- 非 2xx → undefined
- 请求抛错 → undefined（不抛给调用方）
- body 不是 `{data: [...]}` 形状 → undefined
- 超时 → undefined

`tests/catalog.spec.ts`：

- `parseCatalog` 读新格式；缺失 / 畸形 / 空串 → undefined
- `source` 为 `fallback` 时携带 error
- `displayNameOf('claude-sonnet-5.5')` → `Claude Sonnet 5.5`
- 表中已有的 id 用表中的 name（不被推导规则覆盖）
- `catalogRowsOf` 合并后顺序稳定

`tests/model-params.spec.ts`（扩展现有）：

- 未收录 id 返回 `GENERIC_DEFAULTS`
- 已收录 id 不受影响

## 验收

1. `npm run typecheck`、`npx vitest run`、`npm run check:dist` 全绿。
2. 同步并重启后，Go 账号的设置页仍显示 14 个模型，顺序不变。
3. 手工把 `catalogJson` 改成含 `claude-sonnet-5.5` 的列表，重启，该模型出现在列表里并带「参数未收录」徽标。
4. 断开网络重启，页面回退到 14 个并显示兜底原因。

## 风险

- `/v1/models` 的具体返回形状依赖网关实现。解析器必须容忍多种形状（`{data: [...]}`、裸数组、`{models: [...]}`），任一种都不认识时返回 undefined 走兜底，不能崩。
- 拉目录需要 API key。key 未配置时跳过拉取，直接用兜底，不报错 —— 这与「路由未注册」是同一状态，不该额外红一片。
- 拉目录在启动路径上，必须设超时（15 秒，与版本检查一致），且失败不阻塞插件激活。
