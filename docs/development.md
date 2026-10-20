# 开发与排障

## 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| DSH | `>=0.2.0-rc.1` |
| TypeScript | 6.0.3（devDependency） |

## 常用命令

```bash
npm run compile        # 构建 lib/（esbuild + d.ts）
npm run check:dist     # 重新构建到 .tmp/ 并与 lib/ 比对，产物是否最新
npm run typecheck      # 宿主侧类型检查（tsconfig.host.json）
npx tsc -p tsconfig.client.json --noEmit   # 客户端侧类型检查
npm test               # compile + vitest run
npm run verify:load    # 用真实 Cordis 运行时加载 lib/ 产物
npm run test:ci        # check:dist + vitest + verify:load
```

`lib/` 是**提交进仓库**的：Git 安装、npm 包、tarball 都必须免构建即可加载，所以 `compile` 是显式命令，不是生命周期钩子。

## 目录结构

```
src/
  index.ts              入口：apply(ctx)，注册路由、额度、账本、设置页
  adapter.ts            LlmAdapter 实现：listModels / resolveModel / stream
  conversion.ts         Chat Completions 的请求投影（含图片）
  catalog.ts            12 个模型的静态目录
  model-params.ts       每模型默认参数、覆盖解析、思考等级
  config.ts             schemastery schema（volatile 热更新）
  config-contract.ts    两端共用的配置类型与常量
  accounts.ts           账号规则（顺序即选中、上限、凭据引用）
  account-command.ts    页面 → 宿主的账号命令契约
  usage-ledger.ts       本地账本：计价与汇总
  ledger-store.ts       账本的 JSONL 持久化
  session-usage.ts      会话日志扫描（历史补算）
  usage.ts              控制台会话通道
  usage-contract.ts     额度契约（两端共用）
  vela-billing.ts       vela 命令行通道
  vela-locate.ts        vela 可执行文件发现
  plans.ts              套餐档位与额度覆盖
  pricing.ts            官方价目表快照
  diagnostics.ts        路由诊断
  host-settings.ts      宿主配置挂载（版本兼容）
  gateway-error.ts      网关错误分类
  client/               React 设置页：Section + 各卡片
scripts/                构建、同步 profile、冒烟测试
tests/                  vitest 单元测试
```

## 本地挂到桌面端调试

桌面端 profile 由 Electron 应用管理，手工编辑容易半装。仓库提供了三个脚本：

```bash
# 校验 profile 是否具备加载本插件的四个必要条件
node scripts/verify-profile.mjs --profile desktop

# 把构建产物拷贝进已安装的 profile，并按摘要校验拷贝确实落地
node scripts/sync-profile.mjs --profile desktop

# 用目录 junction 让 profile 里的包就是本 checkout（推荐，之后只需 npm run compile）
node scripts/link-profile.mjs --profile desktop
```

这三个脚本都会拒绝在桌面端运行时执行：运行中替换目录会让宿主指向一个不存在的路径。

`sync-profile.mjs` 按 SHA-256 校验拷贝结果，不是「cp 返回 0 就算成功」——profile 可以从它自己的依赖声明被重建，一次看似成功的拷贝随后被覆盖，与插件 bug 无法区分。这个坑在开发期重复出现过好几轮。

## 排障

### 模型选择器里没有 OpenDesign Go 的模型

设置页的「路由状态」一行会说明原因：

```
已注册/未注册 · 启用=true/false · 凭据=已解析/未解析（引用名）· 声明模型 12 个
```

三种情况都能看到：

- **未注册 + 启用=false**：`enabled` 被关掉了。
- **未注册 + 凭据=未解析**：引用的凭据名在凭据服务和启动环境里都取不到值。检查 `apiKeyEnv` 与账号列表。
- **未注册 + 有失败信息**：宿主拒绝了路由注册，错误文本就在同一行。

诊断写在配置字段 `diagnosticsJson` 里，由宿主侧上报；页面刷新后仍然可见。

路由的存在条件是「已启用 **且** 凭据可解析」。凭据缺失时路由会被撤销，而不是留着假装可用。

### 额度是空的或显示读取失败

依次检查：

1. 是否勾选了「使用本机 OpenDesign 的登录凭证读取额度」？未勾选时不读额度，这是预期行为。
2. 本机是否装了 OpenDesign 桌面端并已登录？
3. `vela` 是否在预期位置？插件找不到时会报错并带上 `home=` 与 `LOCALAPPDATA=` 的实际值，便于判断路径问题。
4. 如果显示的是 `vela` 命令本身的错误，说明格式变了或登录过期。这是官方私有接口，升级后格式变化属正常风险。

失败会显示原因，**不会显示 0%**——空额度和 0 使用量在界面上是两种不同状态。

### 金额和 OpenDesign 控制台对不上

预期内。本地金额按官方公开价目表的**基础档**估算：

- 超出阶梯阈值的长上下文请求被低估；
- 无价格的模型只计 token，不计金额；
- 只统计经本插件的调用，官方客户端和其他工具不计入。

控制台数字是权威的。页面上的「已扣 / 实测」两行只陈述各自来源的独立事实，不给比值——两者覆盖的流量范围不同，相除没有意义。

### 桌面端启动报 `cannot resolve profile bundle`

profile 处于半安装状态：依赖和 `dsh.profile.bundles` 条目只落地了一个。跑 `node scripts/verify-profile.mjs --profile desktop` 定位，然后在应用内重新安装该插件，不要用 `dsh plugin add` 手工补。

### 页面停在「正在读取配置…」

宿主尚未下发该条目的配置镜像。页面提供了「重新加载」按钮。若重启后仍为空，说明插件未完成激活——看桌面端日志里 `llm-opendesign-go:` 开头的行。

### 桌面端日志

插件用 `ctx.logger` 输出，前缀统一是 `llm-opendesign-go:`。关键节点：

| 日志 | 含义 |
| --- | --- |
| `mounted` | `apply` 已执行 |
| `route "dsh-opendesign-go" registered as OpenDesign Go` | 路由注册成功 |
| `disabled by configuration; the route is withdrawn` | 被配置关闭 |
| `reading quota via vela (<via>) <path>` | 额度读取启动，含发现方式与路径 |
| `quota <摘要>` | 额度读取结果，只含窗口标签与百分比，不含金额 |
| `account settled on <ref>` | 故障切换后由某个账号真实产出 |

崩溃日志在 `%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-*.log`，`crash-host` 记插件激活失败详情，是定位启动问题最快的入口。

### 环境变量

| 变量 | 用途 |
| --- | --- |
| `OPENDESIGN_API_KEY` | 默认的 API Key 引用名 |
| `OPENDESIGN_SESSION` | 默认的控制台会话引用名 |
| `OPENDESIGN_VELA_PATH` | 覆盖 `vela` 可执行文件路径 |

凭据解析优先走 DSH 凭据服务，取不到时回退到启动环境变量。

## 测试

vitest，测试文件在 `tests/`，按模块命名。覆盖的关键面：

| 文件 | 覆盖内容 |
| --- | --- |
| `adapter.spec.ts` / `account-fallback.spec.ts` | 请求投影、流式、故障切换的触发条件 |
| `config.spec.ts` | 默认值、校验、baseURL 与凭据引用名的合法性 |
| `accounts.spec.ts` / `account-command.spec.ts` | 账号规则、命令解析 |
| `model-params.spec.ts` / `plans.spec.ts` | 覆盖解析与范围校验 |
| `usage*.spec.ts` | 账本计价、额度缓存、控制台读取 |
| `vela-*.spec.ts` | `vela` 发现与输出解析 |
| `session-usage.spec.ts` | 会话日志扫描与时间过滤 |
| `quota-card.spec.ts` / `billing-card.spec.ts` | 界面渲染与降级状态 |
| `activation.spec.ts` / `index.spec.ts` / `client-bundle.spec.ts` | 插件挂载与客户端产物 |
| `remote-envelope.spec.ts` | Remote 调用的信封解包 |

`verify:load` 用真实 Cordis 运行时加载 `lib/index.js`（不是 `src/`）。它证明的是**发布的产物**能被加载且没有宿主内部依赖，源码通过类型检查并不覆盖这一点。
