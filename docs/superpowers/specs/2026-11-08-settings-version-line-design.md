# 设置页版本行设计

2026-11-08。目标版本 0.1.16。

## 问题

设置页只在「有新版本」时显示更新卡片（`Section.tsx:384`），没有更新时整张卡片不渲染，页面上一片空白。用户看到的结果是：既不知道当前装的是哪一版，也不知道远端到哪一版，更无从判断「更新按钮不见了」是功能失效还是本来就该没有。

2026-11-08 的实际例子：本机 0.1.15，npm registry 最新 0.1.14，GitHub 最新 tag v0.1.15。两个来源都不比本机新，于是 `src/index.ts:315` 直接 `return`，`updateJson` 保持空字符串，页面什么都不显示。用户报告「要求的更新按钮没看到」。

根因不是渲染条件写错，是**用「字段写不写」编码「要不要更新」**。这样「没有更新」和「没查到」在页面上不可区分，而且两者都表现为空白。

## 目标

1. 设置页顶部常驻一行，显示本机版本、GitHub 最新版本、npm 最新版本。
2. 无更新时明确写「已是最新」，让空白消失。
3. 查不到时写「未知」，**不能**把网络失败显示成「已是最新」。
4. 有更新时按钮就在这一行里，删除页面底部的独立更新卡片。

## 非目标

- 不加手动「重新检查」按钮。检查只在插件启动时跑一次。
- 不改更新按钮的行为与结果文案。`update-controller.ts` 不动。
- 不等于把版本号写进 README 或 changelog 之外的其他地方。

## 决策

扩展 `updateJson` 的语义，从「更新通知」变成「版本快照」，不新增配置字段。

理由：0.1.15 刚给 `updateJson` 接上 `cache-retry.ts` 的写回重试（宿主抢 profile 写锁会失败，2 秒超时）。新增字段就要把同一套写回与重试复制一遍，为一个只有四行的显示多一套并发写入路径，不划算。

## 数据契约

`updateJson` 由宿主在启动检查完成后写入：

```json
{
  "current": "0.1.15",
  "npm": "0.1.14",
  "github": "0.1.15",
  "checkedAt": "2026-11-08T09:01:12.345Z"
}
```

| 字段 | 必有 | 含义 |
| --- | --- | --- |
| `current` | 是 | 写入时本插件的 `PLUGIN_VERSION` |
| `npm` | 否 | npm registry 的 `latest`。缺失 = 这次没查到 |
| `github` | 否 | 仓库最新 tag（去掉 `v` 前缀）。缺失 = 这次没查到 |
| `checkedAt` | 是 | 本次检查完成的时刻，ISO 8601 UTC |

**`npm` / `github` 缺失代表「这个源这次没查成功」，不代表「没有更新」。** 这是本设计的核心约束。`fetchLatestTag()` 在网络失败、GitHub 返回非 2xx、超时（5 秒）时都返回 `undefined`，当前语义无法与「查到了、且不比本机新」区分；写进快照后可以区分。

### 写入规则

`src/index.ts` 的启动检查：

- 去掉 `if (newer === undefined && tagNewer === undefined) return`。任何一次成功的检查都要写。
- 两个源都查不到（`npm` 与 `github` 都为 `undefined`）时**也要写**，内容是 `{ current, checkedAt }`。页面据此显示「无法检查更新」，而不是空白。
- 写回失败仍走 `updateRetry.publish`（0.1.15 已有的 3s / 12s / 30s 退避），不改。

## 判定规则

解析在客户端完成，`src/update-check.ts` 的 `parseUpdate` 改写为返回版本快照视图：

```ts
export interface VersionLine {
  /** 本机版本，来自 PLUGIN_VERSION，不取缓存值。 */
  readonly current: string
  /** npm 最新版本，缺失表示这次没查到。 */
  readonly npm: string | undefined
  /** GitHub 最新 tag，缺失表示这次没查到。 */
  readonly github: string | undefined
  /** 检查时刻，缺失表示缓存里没有这一项。 */
  readonly checkedAt: string | undefined
  /** 本机更新的来源列表，空数组表示已是最新。 */
  readonly aheadOf: readonly ('npm' | 'github')[]
}
```

`aheadOf` 用现有的 `compareVersions(remote, current) > 0` 计算，只收版本存在且严格更新的源。

显示分四种情况：

| 条件 | 文案 |
| --- | --- |
| `aheadOf` 非空 | 「有新版本」，对该源渲染按钮 |
| 两源都有值且都不新 | 「已是最新」 |
| 两源都缺失 | 「无法检查更新」 |
| 只有一个源缺失 | 缺失侧显示「未知」，另一侧照常判定 |

`current` 取 `PLUGIN_VERSION` 常量（`config-contract.ts` 已导出，客户端已 import 同一文件），**不读缓存里的 `current`**。与 0.1.15 修「声明模型」同一理由：缓存可能写不进去，本机版本不能跟着错。缓存里的 `current` 只用来判断「这份快照是不是本版本写的」。两者不一致时，版本行照常显示本机版本与「上次检查」时间，但两个远端版本一律显示「未知」，并附一句「快照由 0.1.15 写入，本版本 0.1.16」。宁可说不知道，也不拿上一版的远端数字当现状。

### 旧格式兼容

升级瞬间页面可能读到 0.1.15 写下的旧值 `{ current, latest?, githubLatest? }`。解析器按旧字段名读一次（`latest` → `npm`，`githubLatest` → `github`），`checkedAt` 缺失时显示「未知」。这份缓存会在下一次启动检查时被覆盖，兼容只需保证不显示错数。

## 检查时间

显示「上次检查：N 分钟前」。这一行常驻，不写时间的话，缓存写回被拒留下的旧数字与刚查的数字看起来一样。

时间取自 `checkedAt`。超过 24 小时显示「上次检查：X 天前」并改用警示色，因为启动检查每次启动都跑，正常情况不会隔天。

## 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/index.ts` | 启动检查去掉「都不新就 return」，改为总是写快照；`payload` 增加 `npm` / `github` / `checkedAt` |
| `src/update-check.ts` | 新增 `VersionLine` 与 `parseVersionLine`，**删除** `parseUpdate`（只有 `Section.tsx` 一个调用方，直接替换；旧字段 `latest` / `githubLatest` 的读法并入新解析器）；保留 `compareVersions` |
| `src/client/Section.tsx` | 页面根 div 内新增版本行（`<div className={styles.page}>` 的第一个子元素）；删除 384-429 行的更新卡片；按钮与 `outcome` 消息移入版本行 |
| `src/client/Section.module.css` | 版本行样式：正常 / 有更新（警示）/ 未知（灰）三态，按钮行内排列 |
| `tests/update-check.spec.ts` | 新增快照解析用例 |
| `tests/section-render.spec.ts` | 新增三态渲染用例 |

`src/client/update-controller.ts`、`src/config.ts`、`src/cache-retry.ts` 不改。

## 测试

`tests/update-check.spec.ts`：

- 新格式：`{current, npm, github, checkedAt}` → 正确算出 `aheadOf`
- 只有 `npm` 更新 / 只有 `github` 更新 / 两个都更新
- 两源都不新 → `aheadOf` 为空
- `npm` 缺失但 `github` 存在 → `npm` 为 `undefined`，`github` 照常判定
- 两源都缺失 → 两者 `undefined`，不误判为最新
- 旧格式 `{current, latest, githubLatest}` → 正确映射
- 非 JSON、空字符串、`null`、缺 `current` → 返回 `undefined`（页面不渲染版本行，不崩）
- `current` 与 `PLUGIN_VERSION` 不一致 → 视为旧快照

`tests/section-render.spec.ts`：

- 已是最新：出现「已是最新」，无按钮
- 有更新：出现「有新版本」与对应按钮
- 未知：出现「无法检查更新」

## 验收

1. `npm run check:dist` 通过（`lib/` 与源码一致）
2. `npm test` 通过
3. 同步到 desktop profile 并重启，设置页顶部出现版本行，显示「已是最新」，无更新按钮
4. 验证「按源分别判定」：临时把 `src/config-contract.ts` 的 `PLUGIN_VERSION` 改成 `0.1.14`，`npm run compile`、同步、重启，版本行应显示「本机 0.1.14 · GitHub v0.1.15 · npm 0.1.14 · 有新版本」，且**只出现「从 GitHub 装」按钮**（npm 的 0.1.14 不比本机新）。验完改回 `0.1.15` 并重新编译同步。
