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
import { DISPLAY_NAME, PROVIDER_ID, SETTINGS_NAMESPACE } from './config-contract.ts'
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
import { homedir } from 'node:os'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { UsageSnapshot } from './usage-contract.ts'

/** How often a failed quota read is retried before giving up for the session. */
const MAX_USAGE_RETRIES = 6

/** Local usage report window: the trailing 30 days. */
const REPORT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
import { fieldWriterOf, installHostSettings } from './host-settings.ts'
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
   * Read the quota channel and publish the result into the config document,
   * which is the channel the page already receives.
   *
   * Two sources, chosen by configuration. The `vela` path reuses the OpenDesign
   * app's own login and needs nothing from the user; the console-session path is
   * the older one and stays available for anyone who prefers it.
   *
   * A failure is published too: the page can then say why it has no numbers
   * instead of showing a stale reading with no explanation.
   */
  const refreshUsage = async (): Promise<UsageSnapshot | undefined> => {
    const write = fieldWriterOf(ctx)
    if (write === undefined) return undefined
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
    await write('usageJson', JSON.stringify(snapshot))
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
   */
  const refreshIfConfigured = async (): Promise<UsageSnapshot | undefined> => {
    if (!wantsUsage()) return undefined
    try {
      return await refreshUsage()
    } catch (error) {
      ctx.logger.warn(`llm-opendesign-go: quota refresh failed (${String(error)})`)
      return undefined
    }
  }

  /** A reading that answered with numbers is final; anything else may recover. */
  const usable = (snapshot: UsageSnapshot | undefined): boolean =>
    snapshot !== undefined && snapshot.error === undefined && snapshot.windows.length > 0

  void refreshIfConfigured()
  let lastUsageKey = `${current().useVelaCredential}|${current().sessionRef}|${current().workspaceId}`
  let retries = 0
  ctx.effect(() => {
    // The config document has no change event on this host, so the same values
    // are compared on a short timer. The interval is deliberately coarse: each
    // read costs a subprocess (or a network call) and a quota bar does not need
    // seconds.
    const timer = setInterval(() => {
      const config = current()
      const key = `${config.useVelaCredential}|${config.sessionRef}|${config.workspaceId}`
      const changed = key !== lastUsageKey
      if (changed) {
        lastUsageKey = key
        retries = 0
      }
      // `changed` forces a read; otherwise retry only while the last attempt
      // produced nothing usable, and only a few times.
      if (!changed && (retries >= MAX_USAGE_RETRIES || !wantsUsage())) return
      if (!changed) retries += 1
      void refreshIfConfigured().then((snapshot) => {
        if (usable(snapshot)) retries = MAX_USAGE_RETRIES
      })
    }, 5_000)
    return () => { clearInterval(timer) }
  })

  // Local usage ledger: every request this plugin serves, priced with the public
  // list. It needs no credential and covers the question a user can act on —
  // which model on which key is spending what.
  const ledger = new LedgerStore(LedgerStore.pathIn(resolveDshHome()))
  /** Recompute the report and publish it, debounced to one write per burst. */
  let pendingReport: ReturnType<typeof setTimeout> | undefined
  const publishReport = (): void => {
    if (pendingReport !== undefined) return
    pendingReport = setTimeout(() => {
      pendingReport = undefined
      const write = fieldWriterOf(ctx)
      if (write === undefined) return
      const now = Date.now()
      const report = summarize(ledger.all(), now - REPORT_WINDOW_MS, now)
      void write('reportJson', JSON.stringify(report)).catch(() => undefined)
    }, 1_000)
  }
  ctx.effect(() => () => {
    if (pendingReport !== undefined) clearTimeout(pendingReport)
  })
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

  const adapter = new OpenDesignAdapter({
    config: current,
    resolveApiKey,
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
  /**
   * Publish what the routing layer currently believes.
   *
   * The model picker shows nothing when the route is absent, and the reason can
   * be any of "disabled", "no credential", or "registration refused" — all of
   * which look identical in the UI. This makes the state visible instead.
   * @param configured - whether the selected account's credential resolved.
   * @param triedRef - the reference that was resolved.
   * @param lastError - registration failure, when one occurred.
   */
  const publishDiagnostics = (configured: boolean, triedRef: string, lastError?: string): void => {
    const write = fieldWriterOf(ctx)
    if (write === undefined) return
    const payload: RouteDiagnostics = {
      registered: registration !== undefined,
      enabled: current().enabled,
      credentialResolved: configured,
      triedRef,
      ...(lastError === undefined ? {} : { lastError }),
      modelCount: listSeedModels(PROVIDER_ID).length,
      asOf: new Date().toISOString(),
    }
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

  const syncRoute = (): void => {
    const check = ++routeCheck
    // The route's presence follows the selected account: with auto-switch on,
    // any configured account could serve a request, so any of them counts.
    const config = current()
    const refs = config.autoSwitch
      ? accountsOf(config).map((account) => account.apiKeyEnv)
      : [config.apiKeyEnv]
    const anyRef = refs[0] ?? config.apiKeyEnv
    void resolveApiKey(anyRef)
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
    credentialsCtx.on('credentials/reference-updated', (ref) => {
      if (ref === current().apiKeyEnv) syncRoute()
    })
    syncRoute()
  })

  // The seam may already be active when this plugin applies, in which case the
  // inject above runs synchronously; a key stored later flips the route through
  // the reference-updated listener.
  syncRoute()
}

/** Re-exported so composition patches can list the seed without importing internals. */
export { listSeedModels as seedCatalog }
