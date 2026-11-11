/**
 * Page → host channel for updating this plugin.
 *
 * DSH exposes no plugin-wide "update" action to a third-party page, but the
 * Host already publishes `remote.pluginManager`, the same namespace the desktop
 * plugin manager itself calls. This module wraps the two routes that namespace
 * supports and turns every answer into one sentence the page can show:
 *
 * - **npm** (`listVersions` + `updateBundle`): the normal path. The Host only
 *   accepts it for a bundle installed from a registry under its own name, which
 *   is how this plugin is installed, and it restores the previous version
 *   itself when the install fails.
 * - **GitHub** (`removeBundle` + `installBundle('github:…#vX')`): the fallback
 *   for a release published before it reached the registry, or for a version
 *   the registry cannot serve. The Host refuses to install a package name the
 *   profile already holds, so this route has to remove first — and therefore has
 *   to put the old version back if the install does not land. That restore is
 *   attempted here, and its outcome is reported rather than hidden.
 *
 * A failure is always returned as a message, never thrown: every one of these
 * calls can refuse for reasons the user needs to read (a release still inside
 * pnpm's minimum-release-age window, an incompatible DSH version, a network
 * fault), and a thrown error would surface as a broken settings page instead of
 * a sentence.
 *
 * @module dsh-opendesign-go/client/update-controller
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the client Remote Context merge (ctx.remote).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { PACKAGE_NAME } from '../update-check.ts'

/** One sentence describing what happened, plus whether it succeeded. */
export type UpdateOutcome =
  | { readonly ok: true, readonly message: string }
  | { readonly ok: false, readonly message: string }

/** Executes one update route. */
export type RunUpdate = (version: string) => Promise<UpdateOutcome>

/** Which step the channel reached, for diagnostics. */
export type UpdateChannelState = () => string

/** Every Remote call resolves to this envelope, never to a bare value. */
type RemoteResult<T> = { readonly ok: true, readonly value: T } | { readonly ok: false, readonly error: unknown }

/** One version row as `listVersions` reports it. */
interface VersionRow {
  readonly version: string
  readonly prerelease?: boolean
  readonly deprecated?: unknown
  readonly incompatible?: readonly unknown[]
}

/** The `listVersions` answer, in both of its shapes. */
type VersionList =
  | {
    readonly status: 'listed'
    readonly installed: string
    readonly registry: string
    readonly versions: readonly VersionRow[]
  }
  | {
    readonly status: 'refused'
    readonly problem: 'network' | 'unknown' | 'not-found' | 'not-updatable'
    readonly reason: string
  }

/** How the Host applied one change. */
type Application = 'cancelled' | 'failed' | 'applied' | 'restart-required' | 'overridden'

/** The `updateBundle` answer. */
interface UpdateResult {
  readonly from: string
  readonly to: string
  readonly step: 'check' | 'remove' | 'install' | 'enable' | 'restore'
  readonly result: ChangeResult
}

/** The fields of `PluginChangeResult` this page reads. */
interface ChangeResult {
  readonly application?: Application
  readonly error?: { readonly code?: string, readonly diagnostic?: string }
  readonly version?: string
  readonly packageResult?: { readonly kind?: string, readonly output?: string }
  readonly restartReason?: string
}

/**
 * The subset of `remote.pluginManager` this page calls.
 *
 * Every optional parameter is declared **required but nullable** on purpose.
 * The Host gateway counts the parameters a method declares and rejects a call
 * whose argument count differs:
 *
 * ```
 * const expected = descriptor.parameters.length - (projection ? 1 : 0)
 * if (values.length !== expected && !hasCallerSignal) throw new Error(
 *   `client api: ${endpoint} expected ${expected} business argument(s) …, got ${values.length}`,
 * )
 * ```
 *
 * `parameters` includes the ones the Host's TypeScript signature marks
 * optional — `acceptsUndefined` relaxes the *value* check, not the count — so
 * `listVersions(name)` fails with "expected 2 business argument(s) …, got 1".
 * Passing `undefined` explicitly satisfies the count and the codec accepts it.
 * TypeScript's `options?:` syntax is what made this invisible at compile time,
 * which is why the signatures below spell the slots out.
 */
interface PluginManagerRemote {
  listVersions(
    name: string,
    options: { registry?: string | null } | undefined,
  ): Promise<RemoteResult<VersionList>>
  updateBundle(
    name: string,
    version: string,
    options: { registry?: string | null, requestId?: string } | undefined,
  ): Promise<RemoteResult<UpdateResult>>
  removeBundle(name: string): Promise<RemoteResult<ChangeResult>>
  installBundle(
    spec: string,
    options: { enabled?: boolean, requestId?: string } | undefined,
  ): Promise<RemoteResult<ChangeResult>>
}

/**
 * Unwrap one Remote result.
 * @param result - the envelope the Host answered with.
 * @returns the value.
 * @throws {Error} when the Host reported a failure.
 */
function unwrap<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(result.error instanceof Error ? result.error.message : String(result.error))
}

/** Read one refused change into the most specific sentence available. */
function refusalText(change: ChangeResult): string {
  const detail = change.error?.diagnostic
  if (detail !== undefined && detail.length > 0) return detail
  const code = change.error?.code
  if (code === 'incompatible-version') return '该版本要求的 DSH 版本高于当前运行版本'
  if (code === 'management-required') return '宿主不允许本页面管理这个包'
  if (code === 'not-removable') return '宿主认为这个包不能移除'
  // pnpm's own refusal lands here: the supply-chain gate rejects a release
  // published inside the minimum-release-age window, and its message is the only
  // place that says so.
  const output = change.packageResult?.output
  const gate = output?.includes('ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION') === true
  if (gate) return '这个版本刚发布，尚未通过 pnpm 的最短发布时长检查；等几小时后再试'
  if (code !== undefined) return `宿主拒绝：${code}`
  return '宿主未说明原因'
}

/** Describe one applied change. */
function appliedText(change: ChangeResult, version: string | undefined): UpdateOutcome {
  const landed = version ?? change.version
  if (change.application === 'restart-required') {
    return { ok: true, message: `已装好 ${landed ?? ''}，重启 DSH 后生效`.replace('  ', ' ') }
  }
  return { ok: true, message: `已更新到 ${landed ?? ''}`.replace('  ', ' ') }
}

/**
 * Turn one `PluginChangeResult` into an outcome.
 * @param change - the result the Host answered with.
 * @param version - the version the change was for, when known.
 * @returns the outcome.
 */
export function changeOutcome(change: ChangeResult, version?: string): UpdateOutcome {
  if (change.application === 'failed' || change.application === 'cancelled') {
    return { ok: false, message: refusalText(change) }
  }
  return appliedText(change, version)
}

/**
 * Turn one `updateBundle` answer into an outcome.
 *
 * The step matters: a refusal during `check` means the version was never
 * touched, while one during `restore` means the new version landed and the old
 * one could not be put back — a state the user must not read as success.
 * @param update - the answer.
 * @returns the outcome.
 */
export function updateBundleOutcome(update: UpdateResult): UpdateOutcome {
  const change = update.result
  if (change.application !== 'failed' && change.application !== 'cancelled') {
    return appliedText(change, update.to)
  }
  const reason = refusalText(change)
  if (update.step === 'check') return { ok: false, message: `装不上 ${update.to}：${reason}` }
  if (update.step === 'remove') return { ok: false, message: `卸载 ${update.from} 失败，未做改动：${reason}` }
  return { ok: false, message: `更新到 ${update.to} 失败，已恢复 ${update.from}：${reason}` }
}

/**
 * Build the two executors over the Host's plugin manager.
 *
 * The namespace is injected after mounting rather than required at activation:
 * declaring it in `inject` would park the whole settings page on a service the
 * shell may not have published yet, and the page is the only way to fix a
 * broken configuration.
 * @param ctx - client root context that has already been granted `remote`.
 * @returns the executors, a stage reader, and a promise settling when injected.
 */
export function updateCommands(ctx: ClientContext): {
  updateFromNpm: RunUpdate
  installFromGithub: RunUpdate
  state: UpdateChannelState
  ready: PromiseLike<unknown>
} {
  let stage = 'mounting'
  let manager: PluginManagerRemote | undefined

  const ready = ctx.inject(['remote.pluginManager'], (remoteCtx) => {
    const remote = remoteCtx.remote as unknown as { pluginManager?: PluginManagerRemote }
    manager = remote.pluginManager
    stage = manager === undefined ? 'namespace present but methods missing' : 'ready'
  })

  /** The manager, or the reason there is none. */
  const require = (): PluginManagerRemote => {
    if (manager === undefined) throw new Error('宿主未提供插件管理器（remote.pluginManager）')
    return manager
  }

  /**
   * Update through the registry, the route the desktop plugin manager uses.
   * @param version - the version to install.
   * @returns the outcome.
   */
  const updateFromNpm: RunUpdate = async (version) => {
    try {
      const pluginManager = require()
      // Asking first turns "install failed" into a specific reason: the Host
      // checks DSH compatibility per version and reports which requirement the
      // running build misses.
      // The second argument is required by the call convention even though the
      // Host treats it as optional: the gateway compares the argument count with
      // the declared parameter list, so omitting it fails before the value is
      // ever validated. `undefined` means "no registry preference".
      const listing = unwrap(await pluginManager.listVersions(PACKAGE_NAME, undefined))
      if (listing.status === 'refused') {
        return { ok: false, message: `读不到可用版本（${listing.problem}）：${listing.reason}` }
      }
      const row = listing.versions.find((item) => item.version === version)
      if (row === undefined) {
        return { ok: false, message: `registry 上没有比 ${listing.installed} 更新的 ${version}` }
      }
      if (row.incompatible !== undefined) {
        return { ok: false, message: `${version} 要求的 DSH 版本高于当前运行版本` }
      }
      const answer = unwrap(await pluginManager.updateBundle(PACKAGE_NAME, version, {
        registry: listing.registry,
        requestId: crypto.randomUUID(),
      }))
      return updateBundleOutcome(answer)
    } catch (error: unknown) {
      return { ok: false, message: `更新失败：${error instanceof Error ? error.message : String(error)}` }
    }
  }

  /**
   * Install the repository tag, removing the registry copy first.
   *
   * The Host refuses `installBundle` for a name the profile already holds, so
   * the old version has to go first. That makes the restore below load-bearing:
   * without it a failed install leaves the user with no plugin at all.
   * @param version - the tag's version, without the leading `v`.
   * @returns the outcome.
   */
  const installFromGithub: RunUpdate = async (version) => {
    let removed: string | undefined
    try {
      const pluginManager = require()
      const removal = unwrap(await pluginManager.removeBundle(PACKAGE_NAME))
      if (removal.application === 'failed' || removal.application === 'cancelled') {
        return { ok: false, message: `卸载当前版本失败，未做改动：${refusalText(removal)}` }
      }
      removed = removal.version
      const spec = `github:EliteOtaku/${PACKAGE_NAME}#v${version}`
      const install = unwrap(await pluginManager.installBundle(spec, {
        enabled: true,
        requestId: crypto.randomUUID(),
      }))
      if (install.application === 'failed' || install.application === 'cancelled') {
        throw new Error(refusalText(install))
      }
      return appliedText(install, version)
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error)
      if (removed === undefined) return { ok: false, message: `从 GitHub 安装失败：${reason}` }
      // The old version is already gone; saying so without trying to put it back
      // would leave the user with a missing plugin and no way to know why.
      try {
        const restore = unwrap(await require().installBundle(`${PACKAGE_NAME}@${removed}`, {
          enabled: true,
          requestId: crypto.randomUUID(),
        }))
        const restored = restore.application !== 'failed' && restore.application !== 'cancelled'
        return {
          ok: false,
          message: restored
            ? `从 GitHub 安装失败，已恢复 ${removed}：${reason}`
            : `从 GitHub 安装失败，且恢复 ${removed} 也失败（${refusalText(restore)}）——请在插件管理里重装`,
        }
      } catch (restoreError: unknown) {
        const detail = restoreError instanceof Error ? restoreError.message : String(restoreError)
        return {
          ok: false,
          message: `从 GitHub 安装失败（${reason}），且无法恢复 ${removed}（${detail}）——请在插件管理里重装`,
        }
      }
    }
  }

  return {
    updateFromNpm,
    installFromGithub,
    state: () => stage,
    ready,
  }
}
