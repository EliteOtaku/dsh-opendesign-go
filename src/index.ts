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
import { installHostSettings } from './host-settings.ts'
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
  ctx.set('openDesignGoUsage', usage)

  /**
   * Resolve the selected account's key through the credentials seam, falling
   * back to the launch environment when the seam is not mounted yet.
   * @returns the usable key, or undefined when nothing is configured.
   */
  const resolveApiKey = async (): Promise<string | undefined> => {
    const ref = current().apiKeyEnv
    const credentials = ctx.get('credentials')
    const hit = credentials !== undefined
      ? (await credentials.resolve(credentialRef(ref)))?.value
      : launchEnvironmentOf(ctx).get(ref)?.value
    if (hit === undefined || hit.length === 0) return undefined
    return assertUsableApiKey(hit, name, ref)
  }

  let registration: AdapterRegistrationHandle | undefined
  let routeCheck = 0

  const adapter = new OpenDesignAdapter({ config: current, resolveApiKey })

  /**
   * Add or withdraw the route so its presence always matches "enabled and
   * credential available". Nothing else is torn down with it: discovery and
   * (from M4) the settings section stay mounted so the page that owns the
   * switch remains reachable.
   * @param configured - whether the credential resolved.
   */
  const applyRoute = (configured: boolean): void => {
    const enabled = current().enabled
    if (configured && enabled && registration === undefined) {
      try {
        registration = ctx.llm.registerAdapter([PROVIDER_ID], adapter)
        ctx.logger.info(`llm-opendesign-go: route "${PROVIDER_ID}" registered as ${DISPLAY_NAME}`)
      } catch (error: unknown) {
        ctx.logger.error(`llm-opendesign-go: not registering "${PROVIDER_ID}" (${String(error)})`)
      }
      return
    }
    if ((!configured || !enabled) && registration !== undefined) {
      registration()
      registration = undefined
      if (!enabled) ctx.logger.info('llm-opendesign-go: disabled by configuration; the route is withdrawn')
    }
  }

  const syncRoute = (): void => {
    const check = ++routeCheck
    void resolveApiKey()
      .then((key) => {
        if (check !== routeCheck) return
        applyRoute(key !== undefined)
      })
      .catch((error: unknown) => {
        if (check !== routeCheck) return
        if (error instanceof LlmError && error.code === 'INVALID_CREDENTIAL') {
          ctx.logger.error(`llm-opendesign-go: ${error.message}`)
          applyRoute(false)
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
