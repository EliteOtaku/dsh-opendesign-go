# 设置页版本行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 设置页顶部常驻一行，显示本机版本、GitHub 最新版本、npm 最新版本，并区分「已是最新 / 有新版本 / 无法检查更新」三态；有更新时按钮就在这一行里。

**Architecture:** 把 `updateJson` 从「只在有更新时写的通知」改成「每次启动都写的版本快照」，是否落后由客户端用 `compareVersions` 现算。解析与序列化都放在 `src/update-check.ts`，纯函数、无 IO，便于单测。客户端只多一个展示行，按钮逻辑沿用现有 `update-controller.ts`。

**Tech Stack:** TypeScript（严格模式，`exactOptionalPropertyTypes`）、React 18、vitest、esbuild 构建到 `lib/`。

**设计文档:** `docs/superpowers/specs/2026-11-08-settings-version-line-design.md`

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/update-check.ts` | 已有：版本比较、两个远端抓取。新增：`VersionLine`、`parseVersionLine`、`versionStateOf`、`snapshotOf` |
| `src/client/usage-format.ts` | 已有：额度文案格式化。新增：`relativeTime` |
| `src/index.ts` | 启动检查改为无条件写快照 |
| `src/client/Section.tsx` | 顶部版本行；删除页面底部的更新卡片 |
| `src/client/Section.module.css` | 版本行样式（三态） |
| `tests/update-check.spec.ts` | 扩展现有文件 |
| `tests/usage-format.spec.ts` | 新建 |
| `tests/section-render.spec.ts` | 扩展现有文件 |

所有命令都在 `D:\AI\dsh-opendesign-go` 下执行。

---

### Task 1: 版本快照解析器

**Files:**
- Modify: `src/update-check.ts`（在文件末尾追加，不动已有导出）
- Test: `tests/update-check.spec.ts`（追加两个 describe）

- [ ] **Step 1: 写失败的测试**

在 `tests/update-check.spec.ts` 顶部的 import 里加上 `parseVersionLine` 与 `versionStateOf`：

```ts
import {
  compareVersions,
  fetchLatestRelease,
  fetchLatestTag,
  parseLatestRelease,
  parseLatestTag,
  parseUpdate,
  parseVersionLine,
  pendingUpdate,
  versionStateOf,
} from '../src/update-check.ts'
```

在文件末尾追加：

```ts
describe('parseVersionLine', () => {
  const CURRENT = '0.1.16'
  /** Read one raw snapshot at a fixed local version. */
  const line = (raw: unknown, current = CURRENT) =>
    parseVersionLine(typeof raw === 'string' ? raw : JSON.stringify(raw), current)

  it('reads both sources and reports nothing to do when neither is ahead', () => {
    expect(line({ current: CURRENT, npm: '0.1.14', github: '0.1.16', checkedAt: '2026-11-08T09:00:00.000Z' }))
      .toEqual({
        current: CURRENT,
        npm: '0.1.14',
        github: '0.1.16',
        checkedAt: '2026-11-08T09:00:00.000Z',
        aheadOf: [],
        stale: false,
        writtenBy: undefined,
      })
  })

  it('names only the sources that are strictly newer', () => {
    expect(line({ current: CURRENT, npm: '0.1.16', github: '0.1.17' }).aheadOf).toEqual(['github'])
    expect(line({ current: CURRENT, npm: '0.1.17', github: '0.1.15' }).aheadOf).toEqual(['npm'])
    expect(line({ current: CURRENT, npm: '0.1.17', github: '0.1.17' }).aheadOf).toEqual(['npm', 'github'])
    // Equal is not ahead: an installed copy must never be told to update to itself.
    expect(line({ current: CURRENT, npm: CURRENT, github: CURRENT }).aheadOf).toEqual([])
  })

  it('keeps a source that did not answer as unknown instead of "no update"', () => {
    const onlyTag = line({ current: CURRENT, github: '0.1.16' })
    expect(onlyTag.npm).toBeUndefined()
    expect(onlyTag.github).toBe('0.1.16')

    const nothing = line({ current: CURRENT })
    expect(nothing.npm).toBeUndefined()
    expect(nothing.github).toBeUndefined()
  })

  it('reads the 0.1.15 shape once, so an upgrade does not lose the card', () => {
    expect(line({ current: CURRENT, latest: '0.1.17', githubLatest: '0.1.18' }))
      .toEqual({
        current: CURRENT,
        npm: '0.1.17',
        github: '0.1.18',
        checkedAt: undefined,
        aheadOf: ['npm', 'github'],
        stale: false,
        writtenBy: undefined,
      })
  })

  it('refuses remote numbers written by another build', () => {
    // The field persists across upgrades; last build's remote versions answer
    // last build's question, so showing them would state a fact about the wrong
    // question.
    expect(line({ current: '0.1.15', npm: '0.1.17', github: '0.1.18' }))
      .toEqual({
        current: CURRENT,
        npm: undefined,
        github: undefined,
        checkedAt: undefined,
        aheadOf: [],
        stale: true,
        writtenBy: '0.1.15',
      })
  })

  it('treats unreadable input as "nothing known" rather than throwing', () => {
    const empty = {
      current: CURRENT,
      npm: undefined,
      github: undefined,
      checkedAt: undefined,
      aheadOf: [],
      stale: false,
      writtenBy: undefined,
    }
    for (const raw of [undefined, '', '{', 'null', '[]', '42', '"x"']) {
      expect(() => parseVersionLine(raw, CURRENT)).not.toThrow()
    }
    expect(parseVersionLine(undefined, CURRENT)).toEqual(empty)
    expect(parseVersionLine('', CURRENT)).toEqual(empty)
    expect(parseVersionLine('{', CURRENT)).toEqual(empty)
    expect(parseVersionLine(JSON.stringify({ npm: '0.1.17' }), CURRENT)).toEqual(empty)
  })
})

describe('versionStateOf', () => {
  const BASE = {
    current: '0.1.16',
    npm: undefined,
    github: undefined,
    checkedAt: undefined,
    aheadOf: [],
    stale: false,
    writtenBy: undefined,
  } as const

  it('reports outdated as soon as any source is ahead', () => {
    expect(versionStateOf({ ...BASE, aheadOf: ['npm'] })).toBe('outdated')
    expect(versionStateOf({ ...BASE, aheadOf: ['github'] })).toBe('outdated')
    expect(versionStateOf({ ...BASE, aheadOf: ['npm', 'github'] })).toBe('outdated')
  })

  it('reports current only when both sources answered and neither is ahead', () => {
    expect(versionStateOf({ ...BASE, npm: '0.1.16', github: '0.1.16' })).toBe('current')
    expect(versionStateOf({ ...BASE, npm: '0.1.14', github: '0.1.15' })).toBe('current')
  })

  it('reports unknown when a source did not answer', () => {
    expect(versionStateOf({ ...BASE, npm: '0.1.16' })).toBe('unknown')
    expect(versionStateOf({ ...BASE, github: '0.1.16' })).toBe('unknown')
    expect(versionStateOf(BASE)).toBe('unknown')
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run tests/update-check.spec.ts`
Expected: FAIL，报 `parseVersionLine is not a function`（或 import 解析失败）。

- [ ] **Step 3: 实现**

在 `src/update-check.ts` 顶部加 import（放在 `@module` 注释之后）：

```ts
import { PLUGIN_VERSION } from './config-contract.ts'
```

在文件末尾追加：

```ts
/** A source a newer release can come from. */
export type UpdateSource = 'npm' | 'github'

/**
 * Everything the settings page knows about versions.
 *
 * A source that did not answer is `undefined`, which is deliberately different
 * from "answered and is not newer": the page must be able to say "could not
 * check" instead of claiming the copy is current.
 */
export interface VersionLine {
  /** Version this build reports. */
  readonly current: string
  /** Newest version on the registry, when this start reached it. */
  readonly npm: string | undefined
  /** Newest repository tag, when this start reached it. */
  readonly github: string | undefined
  /** When the check that produced these numbers finished. */
  readonly checkedAt: string | undefined
  /** Sources carrying a strictly newer version than this build. */
  readonly aheadOf: readonly UpdateSource[]
  /** Whether the cache was written by a different build. */
  readonly stale: boolean
  /** Version that wrote the cache, when it was a different build. */
  readonly writtenBy: string | undefined
}

/** How the version line should read. */
export type VersionState = 'current' | 'outdated' | 'unknown'

/** One non-empty string out of an unknown value, or undefined. */
function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Read the version snapshot out of its serialized settings field.
 *
 * Returns a value even when the field is missing or malformed: the page shows
 * this build's own version regardless, and the remote halves degrade to
 * "unknown". Never throws — one bad character must not take the settings page
 * down.
 * @param raw - serialized snapshot, or undefined/empty when unset.
 * @param current - this build's version; a snapshot written by another version
 * is reported as `stale` instead of being read as facts.
 * @returns the snapshot view.
 */
export function parseVersionLine(raw: string | undefined, current: string = PLUGIN_VERSION): VersionLine {
  const empty: VersionLine = {
    current,
    npm: undefined,
    github: undefined,
    checkedAt: undefined,
    aheadOf: [],
    stale: false,
    writtenBy: undefined,
  }
  if (raw === undefined || raw.length === 0) return empty

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return empty
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return empty

  const row = parsed as Record<string, unknown>
  const written = textOf(row.current)
  if (written === undefined) return empty

  // 0.1.15 wrote `latest` / `githubLatest`, and only for a source that was
  // ahead. Reading those names once means an upgrade shows the old card instead
  // of going blank until the next start check lands.
  const npm = textOf(row.npm) ?? textOf(row.latest)
  const github = textOf(row.github) ?? textOf(row.githubLatest)
  const checkedAt = textOf(row.checkedAt)

  if (written !== current) {
    // A snapshot without a writer version is old enough to predate this field;
    // treat it the same way rather than trusting numbers authored elsewhere.
    return { ...empty, stale: true, writtenBy: written }
  }

  const aheadOf: UpdateSource[] = []
  if (npm !== undefined && compareVersions(npm, current) > 0) aheadOf.push('npm')
  if (github !== undefined && compareVersions(github, current) > 0) aheadOf.push('github')

  return { current, npm, github, checkedAt, aheadOf, stale: false, writtenBy: undefined }
}

/**
 * Reduce a snapshot to the one state the page paints.
 * @param line - parsed snapshot.
 * @returns outdated when a source is ahead, current only when both answered,
 * unknown otherwise.
 */
export function versionStateOf(line: VersionLine): VersionState {
  if (line.aheadOf.length > 0) return 'outdated'
  if (line.npm !== undefined && line.github !== undefined) return 'current'
  return 'unknown'
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run tests/update-check.spec.ts`
Expected: PASS，全部用例通过（含原有的 `parseUpdate` 用例——本任务不删旧函数）。

- [ ] **Step 5: 提交**

```bash
git add src/update-check.ts tests/update-check.spec.ts
git commit -m "feat: read a version snapshot instead of an update notice"
```

---

### Task 2: 快照序列化

**Files:**
- Modify: `src/update-check.ts`（追加 `snapshotOf`）
- Test: `tests/update-check.spec.ts`（追加一个 describe）

- [ ] **Step 1: 写失败的测试**

把 `snapshotOf` 加进 `tests/update-check.spec.ts` 的 import 列表，并在文件末尾追加：

```ts
describe('snapshotOf', () => {
  const AT = new Date('2026-11-08T09:00:00.000Z')
  /** Parse the JSON back so the assertion reads as a shape, not a string. */
  const shape = (json: string): unknown => JSON.parse(json)

  it('records both sources when both answered', () => {
    expect(shape(snapshotOf({ version: '0.1.17', homepage: undefined }, '0.1.18', AT, '0.1.16')))
      .toEqual({ current: '0.1.16', npm: '0.1.17', github: '0.1.18', checkedAt: '2026-11-08T09:00:00.000Z' })
  })

  it('omits a source that did not answer instead of writing null', () => {
    // Absent and null would both serialize, but only absent means "not checked".
    expect(shape(snapshotOf(undefined, undefined, AT, '0.1.16')))
      .toEqual({ current: '0.1.16', checkedAt: '2026-11-08T09:00:00.000Z' })
    expect(shape(snapshotOf(undefined, '0.1.18', AT, '0.1.16')))
      .toEqual({ current: '0.1.16', github: '0.1.18', checkedAt: '2026-11-08T09:00:00.000Z' })
  })

  it('keeps a source that answered with a version behind this build', () => {
    // The registry can trail the repository; the number is still worth showing
    // so a missing button has a visible explanation.
    expect(shape(snapshotOf({ version: '0.1.14', homepage: undefined }, undefined, AT, '0.1.16')))
      .toEqual({ current: '0.1.16', npm: '0.1.14', checkedAt: '2026-11-08T09:00:00.000Z' })
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run tests/update-check.spec.ts`
Expected: FAIL，报 `snapshotOf is not a function`。

- [ ] **Step 3: 实现**

在 `src/update-check.ts` 末尾追加：

```ts
/**
 * Serialize one startup check into the settings field.
 *
 * Written even when neither source answered: "checked, nothing newer" and
 * "could not check" have to stay distinguishable on the page, and an absent
 * field cannot express the difference.
 * @param release - registry answer, or undefined when it was not read.
 * @param tag - newest repository tag, or undefined when it was not read.
 * @param now - check completion time, injectable for tests.
 * @param current - this build's version.
 * @returns the JSON payload for the cache field.
 */
export function snapshotOf(
  release: LatestRelease | undefined,
  tag: string | undefined,
  now: Date = new Date(),
  current: string = PLUGIN_VERSION,
): string {
  return JSON.stringify({
    current,
    ...(release === undefined ? {} : { npm: release.version }),
    ...(tag === undefined ? {} : { github: tag }),
    checkedAt: now.toISOString(),
  })
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run tests/update-check.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/update-check.ts tests/update-check.spec.ts
git commit -m "feat: serialize the version snapshot on every start"
```

---

### Task 3: 相对时间文案

**Files:**
- Modify: `src/client/usage-format.ts`（追加 `relativeTime`）
- Test: `tests/usage-format.spec.ts`（新建）

- [ ] **Step 1: 写失败的测试**

新建 `tests/usage-format.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { relativeTime } from '../src/client/usage-format.ts'

const NOW = Date.parse('2026-11-08T12:00:00.000Z')
/** An ISO timestamp `minutes` before NOW. */
const ago = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString()

describe('relativeTime', () => {
  it('names a fresh check as just now', () => {
    expect(relativeTime(ago(0), NOW)).toBe('刚刚')
    expect(relativeTime(ago(0.5), NOW)).toBe('刚刚')
  })

  it('counts minutes, then hours, then days', () => {
    expect(relativeTime(ago(3), NOW)).toBe('3 分钟前')
    expect(relativeTime(ago(59), NOW)).toBe('59 分钟前')
    expect(relativeTime(ago(60), NOW)).toBe('1 小时前')
    expect(relativeTime(ago(60 * 23), NOW)).toBe('23 小时前')
    expect(relativeTime(ago(60 * 26), NOW)).toBe('1 天前')
  })

  it('returns undefined for a value that is not a timestamp', () => {
    expect(relativeTime(undefined, NOW)).toBeUndefined()
    expect(relativeTime('', NOW)).toBeUndefined()
    expect(relativeTime('not-a-date', NOW)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run tests/usage-format.spec.ts`
Expected: FAIL，报 `relativeTime is not a function`。

- [ ] **Step 3: 实现**

在 `src/client/usage-format.ts` 末尾追加：

```ts
/**
 * Describe how long ago a timestamp was.
 *
 * The version line is always on screen, so it has to say when its remote
 * numbers were read: a refused cache write leaves the previous start's numbers
 * in place, and without a time they read as current.
 * @param iso - timestamp, or undefined when the snapshot carried none.
 * @param now - current time in epoch milliseconds, injectable for tests.
 * @returns a short phrase such as `3 分钟前`, or undefined for unreadable input.
 */
export function relativeTime(iso: string | undefined, now: number = Date.now()): string | undefined {
  if (iso === undefined || iso.length === 0) return undefined
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return undefined
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run tests/usage-format.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/client/usage-format.ts tests/usage-format.spec.ts
git commit -m "feat: format how long ago the version check ran"
```

---

### Task 4: 启动检查改为总是写快照

**Files:**
- Modify: `src/index.ts:38`（import）
- Modify: `src/index.ts:301-332`（启动检查块）

- [ ] **Step 1: 换 import**

第 38 行：

```ts
import { compareVersions, fetchLatestRelease, fetchLatestTag, pendingUpdate } from './update-check.ts'
```

改成：

```ts
import { fetchLatestRelease, fetchLatestTag, snapshotOf } from './update-check.ts'
```

- [ ] **Step 2: 替换启动检查块**

把 301-332 行整块（从 `// One registry read per start,` 注释开始，到 `})()` 结束）替换为：

```ts
  // One registry read per start. Both sources are written whenever they answer,
  // even when neither is newer: the settings page shows what each source last
  // reported, and "did not answer" has to stay distinguishable from "no update".
  void (async () => {
    const [release, tag] = await Promise.all([fetchLatestRelease(), fetchLatestTag()])
    const write = fieldWriterOf(ctx)
    if (write === undefined) return
    const json = snapshotOf(release, tag)
    // This runs once per start, so a refused write would leave the page with no
    // snapshot at all until the next restart — the one case where a retry is
    // worth more than the lock it costs.
    void updateRetry.publish(
      () => ({ fingerprint: json, json }),
      (value) => write('updateJson', value),
    )
  })()
```

- [ ] **Step 3: 类型检查**

Run: `npm run typecheck`
Expected: 无输出（退出码 0）。若报 `pendingUpdate` / `compareVersions` 未使用，删掉它们即可——本步骤已把它们从 import 里去掉，不应出现。

- [ ] **Step 4: 跑全量测试**

Run: `npx vitest run`
Expected: PASS。`parseUpdate` 与 `pendingUpdate` 的旧测试仍通过（这两个函数保留到 Task 5 才删）。

- [ ] **Step 5: 提交**

```bash
git add src/index.ts
git commit -m "feat: record every version check instead of only an available update"
```

---

### Task 5: 顶部版本行，删除旧更新卡片

**Files:**
- Modify: `src/client/Section.tsx:28`（import）
- Modify: `src/client/Section.tsx:98`（解析）
- Modify: `src/client/Section.tsx:229-232`（插入版本行）
- Modify: `src/client/Section.tsx:384-429`（删除卡片）
- Modify: `src/client/Section.module.css`（追加样式）

- [ ] **Step 1: 换 import**

第 28 行：

```ts
import { parseUpdate } from '../update-check.ts'
```

改成：

```ts
import { parseVersionLine, versionStateOf } from '../update-check.ts'
import { relativeTime } from './usage-format.ts'
```

- [ ] **Step 2: 换解析**

第 95-98 行：

```tsx
  // Published release newer than this build, filled by the startup check. Absent
  // means either up to date or the registry was unreachable; both read the same
  // way to a user, so no banner appears.
  const update = useMemo(() => parseUpdate(value?.updateJson), [value?.updateJson])
```

改成：

```tsx
  // Version snapshot written by the startup check. An empty field means the
  // check has not run or its write was refused, and that reads as "unknown" —
  // never as "up to date". Telling those apart is the point of this line.
  const versionLine = useMemo(() => parseVersionLine(value?.updateJson), [value?.updateJson])
  const versionState = versionStateOf(versionLine)
  const checkedAgo = relativeTime(versionLine.checkedAt)
```

- [ ] **Step 3: 插入版本行**

在 `</header>`（第 232 行）之后插入：

```tsx
      <div className={cx(
        styles.versionBar,
        versionState === 'outdated' && styles.versionBarAlert,
        versionState === 'unknown' && styles.versionBarQuiet,
      )}>
        <span className={styles.versionNumber}>本机 {versionLine.current}</span>
        <span className={styles.footerSep}>·</span>
        <span>GitHub {versionLine.github === undefined ? '未知' : `v${versionLine.github}`}</span>
        <span className={styles.footerSep}>·</span>
        <span>npm {versionLine.npm ?? '未知'}</span>
        <span className={styles.footerSep}>·</span>
        <span className={styles.versionState}>
          {versionState === 'outdated'
            ? '有新版本'
            : versionState === 'current' ? '已是最新' : '无法检查更新'}
        </span>
        {versionState === 'outdated' && (
          <span className={styles.versionActions}>
            {versionLine.aheadOf.includes('npm') && (
              <Button
                variant="primary"
                disabled={updating !== undefined}
                onClick={() => { runUpdate('npm', updateFromNpm, versionLine.npm ?? versionLine.current) }}
              >
                {updating === 'npm' ? '更新中…' : '一键更新'}
              </Button>
            )}
            {versionLine.aheadOf.includes('github') && (
              <Button
                variant={versionLine.aheadOf.includes('npm') ? 'ghost' : 'primary'}
                disabled={updating !== undefined}
                onClick={() => { runUpdate('github', installFromGithub, versionLine.github ?? versionLine.current) }}
              >
                {updating === 'github' ? '安装中…' : '从 GitHub 装'}
              </Button>
            )}
          </span>
        )}
        {outcome !== undefined && <span className={styles.versionFoot}>{outcome.message}</span>}
        {versionLine.stale && versionLine.writtenBy !== undefined && (
          <span className={styles.versionFoot}>
            快照由 {versionLine.writtenBy} 写入，远端数字暂不可用
          </span>
        )}
        {checkedAgo !== undefined && <span className={styles.versionFoot}>上次检查：{checkedAgo}</span>}
        <span className={styles.versionFoot}>更新通道：{updateState()}</span>
      </div>
```

- [ ] **Step 4: 删除旧更新卡片**

删除从 `{update !== undefined && (` 到与之匹配的 `)}`（原 384-429 行，即 `title={\`有新版本（当前 ${update.current}）\`}` 那张 `Card` 的整个区块）。删除后该位置直接接 `<div className={styles.footer}>`。

同时确认删除后这些名字不再有引用：`update`、`update.latest`、`update.githubLatest`。三者只在这张卡片里用过。

- [ ] **Step 5: 加样式**

在 `src/client/Section.module.css` 的 `.routeLine` 规则之后追加：

```css
/* Always-on version line. Three states share one layout so the page does not
   jump when a check turns up an update. */
.versionBar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--ods-radius-sm);
  border: 1px solid var(--ods-border);
  font-size: 12px;
  line-height: 1.6;
  color: var(--ods-text-2);
}

.versionBarAlert {
  border-color: color-mix(in srgb, var(--ods-warn) 45%, transparent);
  background: color-mix(in srgb, var(--ods-warn) 9%, transparent);
}

.versionBarQuiet {
  opacity: 0.8;
}

.versionNumber {
  font-variant-numeric: tabular-nums;
  color: var(--ods-text);
}

.versionState {
  font-weight: 600;
  color: var(--ods-text);
}

.versionActions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 4px;
}

.versionFoot {
  width: 100%;
  font-size: 11px;
  color: var(--ods-text-3);
}
```

- [ ] **Step 6: 构建并确认没有残留引用**

Run: `npm run compile`
Expected: 构建成功，输出 `lib/index.js` 与 `lib/client.js`（构建脚本自身会打印文件清单，无报错即通过）。

Run: `Select-String -Path src\client\Section.tsx -Pattern "parseUpdate|update\.latest|update\.githubLatest"`
Expected: 无输出。

- [ ] **Step 7: 提交**

```bash
git add src/client/Section.tsx src/client/Section.module.css
git commit -m "feat: show the version line above the settings page"
```

---

### Task 6: 更新渲染测试并整体验收

**Files:**
- Modify: `tests/section-render.spec.ts:144-159`（替换更新卡片用例）
- Delete: `src/update-check.ts` 的 `parseUpdate` 与 `pendingUpdate`，以及 `tests/update-check.spec.ts` 中对应用例

- [ ] **Step 1: 换渲染测试**

把 `tests/section-render.spec.ts` 里的 `withNotice` 辅助函数与 `draws the update card...` 用例替换为：

```ts
/** A configuration carrying a version snapshot. */
function withSnapshot(snapshot: Record<string, unknown>): OpenDesignConfig {
  return {
    ...BASE,
    updateJson: JSON.stringify({ current: '0.1.16', ...snapshot }),
  } as unknown as OpenDesignConfig
}
```

```ts
  it('shows the version line even when there is nothing to install', () => {
    const html = render(withSnapshot({ npm: '0.1.14', github: '0.1.16', checkedAt: new Date().toISOString() }))
    expect(html).toContain('本机 0.1.16')
    expect(html).toContain('GitHub v0.1.16')
    expect(html).toContain('npm 0.1.14')
    expect(html).toContain('已是最新')
    expect(html).not.toContain('一键更新')
    expect(html).not.toContain('从 GitHub 装')
  })

  it('offers only the route that actually has a newer version', () => {
    // The registry answered without an update, the tag did: a GitHub button and
    // no npm button, because there is nothing for npm to install.
    const githubOnly = render(withSnapshot({ npm: '0.1.16', github: '0.1.17' }))
    expect(githubOnly).toContain('有新版本')
    expect(githubOnly).toContain('从 GitHub 装')
    expect(githubOnly).not.toContain('一键更新')

    const npmOnly = render(withSnapshot({ npm: '0.1.17', github: '0.1.16' }))
    expect(npmOnly).toContain('一键更新')
    expect(npmOnly).not.toContain('从 GitHub 装')
  })

  it('says it could not check rather than claiming to be current', () => {
    // Both sources absent is the "did not answer" state; calling that "已是最新"
    // would be a silent lie, and the user would stop looking for updates.
    const html = render(withSnapshot({}))
    expect(html).toContain('无法检查更新')
    expect(html).toContain('npm 未知')
    expect(html).toContain('GitHub 未知')
  })
```

- [ ] **Step 2: 跑渲染测试，确认通过**

Run: `npx vitest run tests/section-render.spec.ts`
Expected: PASS。

- [ ] **Step 3: 删除旧解析函数**

从 `src/update-check.ts` 删除 `parseUpdate` 函数与 `UpdateNotice` 接口，以及只被它使用的 `pendingUpdate` 函数。保留 `compareVersions`、`parseLatestRelease`、`parseLatestTag`、两个 fetch、`VersionLine` 相关。

从 `tests/update-check.spec.ts` 删除 `describe('parseUpdate', ...)` 与 `describe('pendingUpdate', ...)` 两个整块，并从 import 中去掉 `parseUpdate` 与 `pendingUpdate`。

- [ ] **Step 4: 全量测试 + 构建一致性**

Run: `npm run typecheck`
Expected: 退出码 0。

Run: `npx vitest run`
Expected: PASS，全部用例通过。

Run: `npm run check:dist`
Expected: `check:dist: lib/ matches source`。

- [ ] **Step 5: 提交**

```bash
git add src/update-check.ts tests/update-check.spec.ts tests/section-render.spec.ts
git commit -m "test: cover the version line and drop the notice parser"
```

- [ ] **Step 6: 同步到 desktop profile（重启后才能看到）**

Run: `node scripts/sync-profile.mjs --profile desktop`
Expected: `sync-profile: lib/ mirrored (36 files) into desktop`（文件数按实际打印）。

**这一步之后必须重启桌面端才会显示新版本行。** 重启会结束当前会话。

- [ ] **Step 7: 手工验收**

重启后在设置页顶部确认：

1. 出现一行：`本机 0.1.16 · GitHub v0.1.16 · npm 0.1.14 · 已是最新`
2. 没有更新按钮
3. 有「上次检查：刚刚」与「更新通道：…」

再验证「按源分别判定」（设计文档验收第 4 条）：临时把 `src/config-contract.ts` 的 `PLUGIN_VERSION` 改成 `0.1.14`，重跑 `npm run compile` 与同步、重启，应看到 `本机 0.1.14`、`有新版本`，且只有「从 GitHub 装」按钮。验完改回 `0.1.16` 并重新编译同步。

---

## 自审记录

- **规格覆盖**：设计文档的数据契约 → Task 1/2；检查时间 → Task 3/5；判定三态 → Task 1/5；本机版本不读缓存 → Task 1 默认参数取 `PLUGIN_VERSION`、Task 5 显示 `versionLine.current`；旧格式兼容 → Task 1 用例；删旧卡片 → Task 5 Step 4；单测与渲染测试 → Task 1/2/3/6。无遗漏。
- **占位符**：所有代码步骤都给了完整实现，无 TBD。
- **类型一致性**：`VersionLine` 字段在 Task 1 定义（含 `writtenBy`），Task 2 的 `snapshotOf` 只写 JSON 与它对应；Task 5 使用 `versionLine.aheadOf` / `npm` / `github` / `stale` / `writtenBy` / `checkedAt`，与定义一致；`versionStateOf` 只读 `aheadOf` / `npm` / `github`。
