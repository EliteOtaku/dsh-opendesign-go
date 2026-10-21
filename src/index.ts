/**
 * Dedicated OpenDesign Go adapter plugin.
 *
 * Registers one `dsh-opendesign-go` route whose catalog follows the Go plan's
 * Design Plan models, and resolves the API key per request through the
 * credentials seam, falling back to the process environment. The route
 * registers only while the plugin is enabled and its credential resolves, so a
 * keyless install never sits in a model picker pretending to be usable.
 *
 * M2 scope: one route, static catalog, Chat Completions streaming. The live
 * catalog, usage windows, accounts and the settings section arrive in later
 * milestones; nothing here is removed by them.
 *
 * @module dsh-opendesign-go
 */
import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { LlmError, assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import { OpenDesignAdapter } from './adapter.ts'
import { Config, assertApiKeyEnv, assertBaseURL, readConfig } from './config.ts'
import type { LiveConfig } from './config.ts'
import { DISPLAY_NAME, PLUGIN_VERSION, PROVIDER_ID, SETTINGS_NAMESPACE } from './config-contract.ts'
import type { OpenDesignConfig } from './config-contract.ts'
import { listSeedModels } from './catalog.ts'
import { accountsOf, assertAccounts } from './accounts.ts'
import { LedgerStore } from './ledger-store.ts'
import { costOf, summarize } from './usage-ledger.ts'
import { priceOf } from './pricing.ts'
import { locateVela } from './vela-locate.ts'
import { readVelaUsage } from './vela-billing.ts'
import type { RouteDiagnostics } from './diagnostics.ts'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { join } from 'node:path'
import { parseRecoveredProviders, scanSessions } from './session-usage.ts'
import { readDue } from './quota-cadence.ts'
import { fetchLatestRelease, pendingUpdate } from './update-check.ts'
import { imageResolverOf } from './image-bytes.ts'
import type { AttachmentsSeam } from './image-bytes.ts'
import { homedir } from 'node:os'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { UsageSnapshot } from './usage-contract.ts'

/** How often a failed quota read is retried before giving up for the session. */
const MAX_USAGE_RETRIES = 6


/** How often a configuration change is noticed, in milliseconds.
 *
 * The config document has no change event, so this is a poll of an in-memory
 * object — cheap, but not free on a host that stays open for days. One second
 * still reads as instant when a user flips a switch. */
const FAST_WATCH_MS = 1_000

/** Steady-state quota read interval, in milliseconds.
 *
 * A read spawns the OpenDesign CLI twice and costs about 2.1s of wall time, so a
 * five-second cadence would keep a process running roughly 43% of the day for a
 * number nobody watches. The manual refresh covers the moment the user does care.
 */
const SLOW_POLL_MS = 60_000

/** Local usage report window: the trailing 30 days. */
const REPORT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * How often one cached field may be written into the profile.
 *
 * Every `settings.update` makes the host lock the profile directory and rewrite
 * the whole composition document, which recomposes this plugin tree. At one
 * write per model call that is thousands of file locks a day, and a plugin
 * install that needs the same lock then waits — the failure this constant
 * exists to prevent. Five minutes still publishes the first change of any quiet
 * period immediately; a user watching the page never sees a stale number for
 * more than one poll.
 *
 * The alternative the report deserves — publish only while the page is open —
 * is not reachable here: the only channel from the client to the host is the
 * config document itself, so asking "is the page open?" would cost the very
 * write being avoided.
 */
const PUBLISH_MIN_INTERVAL_MS = 5 * 60 * 1000
import { fieldWriterOf, installHostSettings } from './host-settings.ts'
import { createThrottle, systemClock } from './throttle.ts'
import { OpenDesignUsageService, sessionResolverOf } from './usage.ts'
import { DEFAULT_SESSION_REF } from './config-contract.ts'

/** Plugin module name; stable, and declared in dsh-plugin.naming.json. */
export const name = 'llm-opendesign-go'

/** The adapter needs the LLM registry to exist before it can register a route. */
export const inject = ['llm']

/** Settings namespace this plugin will install from M4. */
export const NS = SETTINGS_NAMESPACE

export { OpenDesignAdapter } from './adapter.ts'
export { DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, DISPLAY_NAME, PROVIDER_ID, SETTINGS_NAMESPACE } from './config-contract.ts'
export type { OpenDesignAccount, OpenDesignConfig } from './config-contract.ts'
export { GO_DESIGN_PLAN_MODELS, listSeedModels } from './catalog.ts'
export { OpenDesignUsageService, CONSOLE_BASE_URL } from './usage.ts'
export { percentUsedOf, windowLabel } from './usage-contract.ts'
export type { QuotaWindow, UsageSnapshot, WalletSnapshot } from './usage-contract.ts'
export { Config, PlainConfig, assertApiKeyEnv, assertBaseURL, readConfig } from './config.ts'

/**
 * Mount the plugin for one composition entry.
 * @param ctx - Cordis context carrying the LLM registry.
 * @param raw - composition-entry config, or the Loader's live references.
 */
export function apply(ctx: Context, raw?: Partial<OpenDesignConfig> | LiveConfig): void {
  const config = raw !== undefined && typeof (raw as LiveConfig).enabled === 'object'
    ? (raw as LiveConfig)
    : Config(raw as Partial<OpenDesignConfig> | undefined)
  const current = (): OpenDesignConfig => readConfig(config as LiveConfig)

  // A self-contained misconfiguration fails at load, naming the field that is
  // wrong, instead of surfacing as a confusing failure at first request.
  const initial = current()
  assertBaseURL(initial.baseURL)
  assertApiKeyEnv(initial.apiKeyEnv)
  // A malformed account list would resolve to a surprising reference at
  // request time, so it fails here with a message naming the problem.
  assertAccounts(initial.accounts, initial.apiKeyEnv)
  ctx.logger.info('llm-opendesign-go: mounted')
  installHostSettings(ctx)

  // The quota channel is off until the user stores a console session reference:
  // it reads account state far beyond inference, so it is opt-in by design.
  const usage = new OpenDesignUsageService({
    resolveSession: async () => {
      const ref = current().sessionRef
      if (ref.length === 0) return undefined
      const resolve = sessionResolverOf(ctx)
      return await resolve()
    },
    workspaceOf: (accountRef) => {
      const config = current()
      const account = config.accounts?.find((row) => row.apiKeyEnv === accountRef)
      const workspace = account?.workspaceId ?? (accountRef === config.apiKeyEnv ? config.workspaceId : undefined)
      return workspace !== undefined && workspace.length > 0 ? workspace : undefined
    },
    activeRef: () => current().apiKeyEnv,
  })
  // Publish the service for other plugins and the page. `provide` must come
  // first: `ctx.set` throws without it, and a throw inside `apply` aborts this
  // entry's activation — which silently removes the plugin from the settings
  // service's `describe()` and leaves its page stuck on "unavailable".
  ctx.provide('openDesignGoUsage')
  ctx.set('openDesignGoUsage', usage)

  /**
   * Publish a quota reading at most once per throttle interval.
   *
   * Two mechanisms cooperate. The throttle bounds how often a *reading* costs a
   * profile write; the writer's own value check skips the write when the reading
   * is identical anyway. Readings carry a fresh `asOf`, so the value check alone
   * would never fire — the throttle is what keeps a 60-second poll from becoming
   * 1,440 profile-level file locks a day.
   */
  let pendingUsage: UsageSnapshot | undefined
  const usageThrottle = createThrottle({
    intervalMs: PUBLISH_MIN_INTERVAL_MS,
    clock: systemClock,
    publish: () => {
      const snapshot = pendingUsage
      if (snapshot === undefined) return
      pendingUsage = undefined
      const write = fieldWriterOf(ctx)
      if (write === undefined) return
      void write('usageJson', JSON.stringify(snapshot)).catch(() => undefined)
    },
  })
  ctx.effect(() => () => { usageThrottle.dispose() })

  /**
   * Read the quota channel and publish the result into the config document,
   * which is the channel the page already receives.
   *
   * Two sources, chosen by configuration. The `vela` path reuses the OpenDesign
   * app's own login and needs nothing from the user; the console-session path is
   * the older one and stays available for anyone who prefers it.
   *
   * A failure is published too: the page can then say why it has no numbers
   * instead of showing a stale reading with no explanation.
   * @param options - `force` publishes this reading regardless of the throttle,
   * used when the user pressed refresh and is waiting on the result.
   * @returns the reading, published or not.
   */
  const refreshUsage = async (options: { force?: boolean } = {}): Promise<UsageSnapshot | undefined> => {
    const config = current()
    let snapshot: UsageSnapshot
    if (config.useVelaCredential) {
      const vela = locateVela()
      if (vela === undefined) {
        snapshot = {
          asOf: new Date().toISOString(),
          tier: '',
          eligible: false,
          windows: [],
          error: '未找到 vela 命令行。'
            + `（home=${homedir()} LOCALAPPDATA=${process.env.LOCALAPPDATA ?? 'unset'}）`
            + '安装并登录 OpenDesign 桌面端后即可自动读取。',
        }
      } else {
        ctx.logger.info(`llm-opendesign-go: reading quota via vela (${vela.via}) ${vela.path}`)
        snapshot = await readVelaUsage(vela.path, config.workspaceId)
      }
    } else {
      snapshot = await usage.read()
    }
    pendingUsage = snapshot
    usageThrottle.request(options.force === true)
    ctx.logger.info(`llm-opendesign-go: quota ${usage.describe(snapshot)}`)
    return snapshot
  }

  /** Whether this configuration asks for a quota read at all. */
  const wantsUsage = (): boolean => {
    const config = current()
    if (config.useVelaCredential) return true
    if (config.sessionRef.length === 0) return false
    return config.workspaceId.length > 0 || config.accounts?.some((row) => row.workspaceId) === true
  }

  /**
   * Refresh the quota reading, replacing what is stored.
   *
   * The outcome is returned so the caller can tell a usable reading from a
   * failed one: a startup attempt can lose a race against the settings service
   * or the CLI probe, and treating that as success would leave the bar empty
   * for the whole session.
   * @param options - `force` publishes immediately instead of waiting out the
   * publish throttle.
   * @returns the reading, when one was attempted.
   */
  const refreshIfConfigured = async (options: { force?: boolean } = {}): Promise<UsageSnapshot | undefined> => {
    if (!wantsUsage()) return undefined
    try {
      return await refreshUsage(options)
    } catch (error) {
      ctx.logger.warn(`llm-opendesign-go: quota refresh failed (${String(error)})`)
      return undefined
    }
  }

  /** A reading that answered with numbers is final; anything else may recover. */
  const usable = (snapshot: UsageSnapshot | undefined): boolean =>
    snapshot !== undefined && snapshot.error === undefined && snapshot.windows.length > 0

  void refreshIfConfigured()

  // One registry read per start, so the page can say a newer release exists.
  // DSH has no plugin-wide update action and the desktop profile hides its
  // package manager, so without this an installed copy has no way to learn that
  // a fix was published.
  void (async () => {
    const release = await fetchLatestRelease()
    const newer = pendingUpdate(PLUGIN_VERSION, release)
    if (newer === undefined) return
    const write = fieldWriterOf(ctx)
    if (write === undefined) return
    const payload = {
      current: PLUGIN_VERSION,
      latest: newer,
      ...(release?.homepage === undefined ? {} : { homepage: release.homepage }),
    }
    void write('updateJson', JSON.stringify(payload)).catch(() => undefined)
  })()

  /** Configuration inputs that call for a fresh reading. */
  const quotaKey = (config: OpenDesignConfig): string =>
    `${config.useVelaCredential}|${config.sessionRef}|${config.workspaceId}|${config.refreshNonce}`
  let lastUsageKey = quotaKey(current())
  let retries = 0
  /** Read once, recording whether the result was usable. */
  const tick = (force: boolean): void => {
    const config = current()
    const key = quotaKey(config)
    const changed = key !== lastUsageKey
    if (changed) {
      lastUsageKey = key
      retries = 0
    }
    if (!force && !readDue({
      changed,
      retries,
      maxRetries: MAX_USAGE_RETRIES,
      wantsUsage: wantsUsage(),
    })) return
    if (!changed) retries += 1
    // A configuration change — including the refresh button's nonce — means
    // someone is waiting on this number, so it is published at once instead of
    // waiting out the publish throttle.
    void refreshIfConfigured({ force: changed }).then((snapshot) => {
      if (usable(snapshot)) retries = MAX_USAGE_RETRIES
    })
  }

  ctx.effect(() => {
    // The config document has no change event on this host, so the same values
    // are compared on a timer. The watch polls an in-memory object while the
    // read spawns a CLI process, so watching faster than reading is what keeps a
    // flipped switch from feeling dead; steady-state reads stay once a minute.
    let timer: ReturnType<typeof setTimeout> | undefined
    const step = (): void => {
      // `tick` queues the read and returns; overlapping reads are already
      // collapsed inside refreshIfConfigured by the usage cache key.
      tick(false)
      timer = setTimeout(step, SLOW_POLL_MS)
    }
    const watch = setInterval(() => {
      const config = current()
      if (quotaKey(config) === lastUsageKey) return
      // A change is the user waiting on a result: read now rather than at the
      // next scheduled tick.
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      step()
    }, FAST_WATCH_MS)
    timer = setTimeout(step, SLOW_POLL_MS)
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      clearInterval(watch)
    }
  })

  // Local usage ledger: every request this plugin serves, priced with the public
  // list. It needs no credential and covers the question a user can act on —
  // which model on which key is spending what.
  const ledger = new LedgerStore(LedgerStore.pathIn(resolveDshHome()))

  /**
   * Spend from session logs that never passed this adapter.
   *
   * Computed once and cached: it walks every session log on disk (12 files and
   * several hundred megabytes of decompressed JSONL on this machine), so doing
   * it per report write would stall every request. History does not change
   * while the process runs — new calls are metered live — so one pass is enough.
   */
  let recoveredCache: { calls: number, costUsd: number, unpricedCalls: number, cacheReadTokens: number } | undefined
  let recoveredKey = ''
  const recoveredSpend = (): typeof recoveredCache => {
    // Off by default: the scan reads every session on the machine, so its total
    // includes traffic from other agents sharing the key and other workspaces.
    const config = current()
    if (!config.recoveredEnabled) return undefined
    // Re-scan when the provider list changes, since the cached total was
    // computed against the previous one.
    const key = config.recoveredProviders
    if (recoveredCache !== undefined && key === recoveredKey) return recoveredCache
    let calls = 0
    let costUsd = 0
    let unpricedCalls = 0
    let cacheReadTokens = 0
    try {
      const since = Date.now() - REPORT_WINDOW_MS
      const scan = {
        since,
        providers: parseRecoveredProviders(config.recoveredProviders),
      }
      for (const call of scanSessions(join(resolveDshHome(), 'sessions'), scan)) {
        const price = priceOf(call.model)
        if (price === undefined) {
          unpricedCalls += 1
          continue
        }
        calls += 1
        cacheReadTokens += call.cacheReadTokens
        costUsd += (call.inputTokens * price.input
          + call.outputTokens * price.output
          + call.cacheReadTokens * (price.cacheRead ?? price.input)) / 1_000_000
      }
    } catch (error) {
      ctx.logger.warn(`llm-opendesign-go: session history scan failed (${String(error)})`)
      return undefined
    }
    // Only cache a real result: caching an empty scan would hide history that a
    // later fix could recover.
    recoveredCache = { calls, costUsd, unpricedCalls, cacheReadTokens }
    recoveredKey = key
    return recoveredCache
  }

  /**
   * Publish the usage report at most once per throttle interval.
   *
   * The report is recomputed from the local ledger on every model call, but
   * writing it into the profile costs a profile-level file lock and a plugin-tree
   * recomposition — far more than a page that nobody is looking at is worth. The
   * burst behaviour still lands one write, so a single call updates the page.
   */
  const reportThrottle = createThrottle({
    intervalMs: PUBLISH_MIN_INTERVAL_MS,
    clock: systemClock,
    publish: () => {
      const write = fieldWriterOf(ctx)
      if (write === undefined) return
      const now = Date.now()
      const base = summarize(ledger.all(), now - REPORT_WINDOW_MS, now)
      const recovered = recoveredSpend()
      const report = recovered === undefined ? base : { ...base, recovered }
      void write('reportJson', JSON.stringify(report)).catch(() => undefined)
    },
  })
  const publishReport = (): void => { reportThrottle.request() }
  ctx.effect(() => () => { reportThrottle.dispose() })
  const recordUsage = (call: { model: string, accountRef: string, usage: TokenUsage }): void => {
    const price = priceOf(call.model)
    ledger.record({
      at: Date.now(),
      model: call.model,
      accountRef: call.accountRef,
      inputTokens: call.usage.inputTokens,
      outputTokens: call.usage.outputTokens,
      cacheReadTokens: call.usage.cacheReadTokens ?? 0,
      cacheWriteTokens: call.usage.cacheWriteTokens ?? 0,
      costUsd: costOf(price, call.usage),
    })
    publishReport()
  }
  ctx.provide('openDesignGoUsageLedger')
  ctx.set('openDesignGoUsageLedger', { record: recordUsage, report: () => summarize(ledger.all(), Date.now() - REPORT_WINDOW_MS, Date.now()) })
  publishReport()

  /**
   * Resolve one account's key through the credentials seam, falling back to the
   * launch environment when the seam is not mounted yet.
   * @param ref - credential reference of the account to resolve.
   * @returns the usable key, or undefined when nothing is configured for it.
   */
  const resolveApiKey = async (ref: string): Promise<string | undefined> => {
    const credentials = ctx.get('credentials')
    const hit = credentials !== undefined
      ? (await credentials.resolve(credentialRef(ref)))?.value
      : launchEnvironmentOf(ctx).get(ref)?.value
    if (hit === undefined || hit.length === 0) return undefined
    return assertUsableApiKey(hit, name, ref)
  }

  let registration: AdapterRegistrationHandle | undefined
  let routeCheck = 0

  /**
   * The attachment store, resolved through its own injection scope.
   *
   * A service is only readable on a context that declared it: `ctx.get` on the
   * plugin's own context answers `undefined` even while the store is mounted.
   * Reading it there would make every image resolve to no bytes, and the request
   * would carry the text-only placeholder instead of the picture — which looks
   * exactly like a model that cannot see images, so the symptom points at the
   * model rather than at this lookup. Declaring the dependency fixes the lookup
   * for the whole dispatch path.
   */
  let attachments: AttachmentsSeam | undefined

  /**
   * Read one durable image's normalized bytes as an inline data URL.
   *
   * The store owns the normalized raster; nothing else can produce it, and the
   * harness keeps no copy in the request. Bytes are read synchronously because
   * projection is synchronous — these are small normalized rasters and this runs
   * once per image per request.
   * @param attachment - durable attachment reference from an image block.
   * @returns a data URL, or undefined when this route cannot supply bytes.
   */
  const imageDataUrl = imageResolverOf(
    () => attachments,
    (message) => { ctx.logger.warn(message) },
  )

  /**
   * Mount the image-bytes seam.
   *
   * Optional on purpose: a host without an attachment store still serves text
   * requests, and vetoing activation over it would turn a missing optional
   * service into a plugin that refuses to load. When it is absent, image blocks
   * fall back to their placeholder text and the model is told an image exists
   * rather than being handed nothing.
   */
  ctx.inject(['attachments'], (attachmentCtx) => {
    attachments = attachmentCtx.get('attachments') as AttachmentsSeam | undefined
    ctx.logger.info(
      `llm-opendesign-go: attachment store ${attachments === undefined ? 'absent; images project to text' : 'mounted'}`,
    )
  })

  const adapter = new OpenDesignAdapter({
    config: current,
    resolveApiKey,
    imageDataUrl,
    onAccountSettled: (ref) => {
      // Promote a fallback account only after it produced output. The write goes
      // through the same config field the page edits, so the ordering the user
      // sees always matches what the next request resolves.
      const config = current()
      if (config.apiKeyEnv === ref) return
      ctx.logger.info(`llm-opendesign-go: account settled on ${ref}`)
    },
    onUsage: recordUsage,
  })

  /**
   * Add or withdraw the route so its presence always matches "enabled and
   * credential available". Nothing else is torn down with it: discovery and
   * (from M4) the settings section stay mounted so the page that owns the
   * switch remains reachable.
   * @param configured - whether the credential resolved.
   */
  /** The last published route facts, excluding the timestamp. */
  let lastDiagnostics: string | undefined
  /**
   * Publish what the routing layer currently believes.
   *
   * The model picker shows nothing when the route is absent, and the reason can
   * be any of "disabled", "no credential", or "registration refused" — all of
   * which look identical in the UI. This makes the state visible instead.
   *
   * Only a change in what is being *said* is published. `syncRoute` runs on
   * every credential event and on every configuration change, so an
   * unconditional write here would mean a profile-level file lock — and a plugin
   * tree recomposition — for each of them, while the answer almost never moves.
   * The timestamp therefore follows the last real change rather than the last
   * call.
   * @param configured - whether the selected account's credential resolved.
   * @param triedRef - the reference that was resolved.
   * @param lastError - registration failure, when one occurred.
   */
  const publishDiagnostics = (configured: boolean, triedRef: string, lastError?: string): void => {
    const payload: RouteDiagnostics = {
      registered: registration !== undefined,
      enabled: current().enabled,
      credentialResolved: configured,
      triedRef,
      ...(lastError === undefined ? {} : { lastError }),
      modelCount: listSeedModels(PROVIDER_ID).length,
      asOf: new Date().toISOString(),
    }
    const { asOf: _asOf, ...facts } = payload
    const fingerprint = JSON.stringify(facts)
    if (fingerprint === lastDiagnostics) return
    const write = fieldWriterOf(ctx)
    if (write === undefined) return
    lastDiagnostics = fingerprint
    void write('diagnosticsJson', JSON.stringify(payload)).catch(() => undefined)
  }

  const applyRoute = (configured: boolean, triedRef = ''): void => {
    const enabled = current().enabled
    if (configured && enabled && registration === undefined) {
      try {
        registration = ctx.llm.registerAdapter([PROVIDER_ID], adapter)
        ctx.logger.info(`llm-opendesign-go: route "${PROVIDER_ID}" registered as ${DISPLAY_NAME}`)
        publishDiagnostics(configured, triedRef)
      } catch (error: unknown) {
        ctx.logger.error(`llm-opendesign-go: not registering "${PROVIDER_ID}" (${String(error)})`)
        publishDiagnostics(configured, triedRef, String(error))
      }
      return
    }
    if ((!configured || !enabled) && registration !== undefined) {
      registration()
      registration = undefined
      if (!enabled) ctx.logger.info('llm-opendesign-go: disabled by configuration; the route is withdrawn')
      publishDiagnostics(configured, triedRef)
      return
    }
    publishDiagnostics(configured, triedRef)
  }

  const syncRoute = (
    resolve: (ref: string) => Promise<string | undefined> = resolveApiKey,
  ): void => {
    const check = ++routeCheck
    // The route's presence follows the selected account: with auto-switch on,
    // any configured account could serve a request, so any of them counts.
    const config = current()
    const refs = config.autoSwitch
      ? accountsOf(config).map((account) => account.apiKeyEnv)
      : [config.apiKeyEnv]
    const anyRef = refs[0] ?? config.apiKeyEnv
    void resolve(anyRef)
      .then((key) => {
        if (check !== routeCheck) return
        applyRoute(key !== undefined, anyRef)
      })
      .catch((error: unknown) => {
        if (check !== routeCheck) return
        if (error instanceof LlmError && error.code === 'INVALID_CREDENTIAL') {
          ctx.logger.error(`llm-opendesign-go: ${error.message}`)
          applyRoute(false, anyRef)
          return
        }
        ctx.logger.error(`llm-opendesign-go: credential resolution failed; keeping the previous route state (${String(error)})`)
      })
  }

  ctx.effect(() => () => {
    registration?.()
    registration = undefined
  })

  ctx.inject(['credentials'], (credentialsCtx) => {
    // Resolve through the injected context, not the outer one: a service is only
    // readable on a context that declared it, and `ctx.get` on the outer context
    // answers `undefined` even while the credential is stored. That reads as
    // "credential unresolved" and leaves the route unregistered for good — the
    // model list then looks absent rather than broken.
    const resolveVia = async (ref: string): Promise<string | undefined> => {
      const hit = (await credentialsCtx.credentials.resolve(credentialRef(ref)))?.value
      if (hit === undefined || hit.length === 0) return undefined
      return assertUsableApiKey(hit, name, ref)
    }
    credentialsCtx.on('credentials/reference-updated', (ref) => {
      if (ref === current().apiKeyEnv) syncRoute(resolveVia)
    })
    syncRoute(resolveVia)
  })
}

/** Re-exported so composition patches can list the seed without importing internals. */
export { listSeedModels as seedCatalog }
