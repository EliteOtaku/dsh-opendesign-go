/**
 * Quota channel: reads the OpenDesign console on behalf of the page.
 *
 * The inference gateway has no quota endpoint, so this service is the only way
 * to show real numbers. It is deliberately narrow and safe by construction:
 *
 * - it is **off** unless the user stored a console session reference;
 * - it issues **two GETs** (`coding-plan-usage`, `billing/summary`) and never
 *   writes anything upstream;
 * - it never blocks inference: every failure becomes a snapshot with `error`
 *   set, and the page renders a degraded state instead of failing;
 * - it reports credits exactly as received and derives percentages from them,
 *   so the bars cannot drift from the console the user trusts.
 *
 * The console identifies the tenant by workspace id, which is per account, so a
 * read is keyed by the account it was requested for.
 *
 * @module dsh-opendesign-go/usage
 */
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import {
  percentUsedOf,
  windowLabel,
} from './usage-contract.ts'
import type { QuotaWindow, UsageSnapshot, WalletSnapshot } from './usage-contract.ts'

/** Console host; the page and the inference gateway are different origins. */
export const CONSOLE_BASE_URL = 'https://amr-api.open-design.ai/api/v1'

/** Failure envelope the console uses for an expired or absent session. */
interface ConsoleUsageWindow {
  policyId?: unknown
  durationSeconds?: unknown
  resetMode?: unknown
  usedCredits?: unknown
  limitCredits?: unknown
  remainingCredits?: unknown
  windowStart?: unknown
  resetsAt?: unknown
}

/** Credential reference holding the console session token, when configured. */
export const DEFAULT_SESSION_REF = 'OPENDESIGN_SESSION'

/**
 * Read one field that must be a non-empty string.
 * @param value - raw field from the console payload.
 * @returns the string, or undefined when absent or the wrong type.
 */
function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Normalize one console window. Unusable rows are dropped rather than zeroed:
 * reporting 0 % for a window the console did not describe would read as "plenty
 * of quota left".
 * @param raw - one entry of `windows`.
 * @param asOf - reading timestamp used when the payload omits a reset time.
 * @returns the normalized window, or undefined when the row is unusable.
 */
function windowOf(raw: ConsoleUsageWindow, asOf: string): QuotaWindow | undefined {
  const duration = typeof raw.durationSeconds === 'number' && Number.isFinite(raw.durationSeconds)
    ? raw.durationSeconds
    : undefined
  const used = stringOf(raw.usedCredits)
  const limit = stringOf(raw.limitCredits)
  const remaining = stringOf(raw.remainingCredits)
  if (duration === undefined || used === undefined || limit === undefined || remaining === undefined) return undefined
  return {
    status: 'ok',
    durationSeconds: duration,
    usedCredits: used,
    limitCredits: limit,
    remainingCredits: remaining,
    percentUsed: percentUsedOf(used, limit),
    resetsAt: stringOf(raw.resetsAt) ?? asOf,
  }
}

/**
 * Read the console base URL for one account override.
 * @returns the console base without a trailing slash.
 */
function consoleBase(): string {
  return CONSOLE_BASE_URL.replace(/\/+$/u, '')
}

/** Options the host passes to the usage service. */
export interface OpenDesignUsageServiceOptions {
  /** Resolve the stored console session token, if the user configured one. */
  readonly resolveSession: () => Promise<string | undefined>
  /** Workspace id for the account being read, when known. */
  readonly workspaceOf: (accountRef: string) => string | undefined
  /** Inference API-key reference the read is for. */
  readonly activeRef: () => string
}

/**
 * Read the console on demand. One instance per plugin mount.
 */
export class OpenDesignUsageService {
  private readonly options: OpenDesignUsageServiceOptions

  /**
   * @param options - resolution hooks supplied by the plugin entry.
   */
  constructor(options: OpenDesignUsageServiceOptions) {
    this.options = options
  }

  /**
   * Read quota for one account.
   *
   * A missing session or workspace yields `error` with no windows rather than
   * throwing: the page shows "not configured" and the user can fix it in the
   * settings page.
   * @param accountRef - credential reference of the account to read.
   * @returns the snapshot, always populated.
   */
  async read(accountRef?: string): Promise<UsageSnapshot> {
    const asOf = new Date().toISOString()
    const ref = accountRef ?? this.options.activeRef()
    let session: string | undefined
    try {
      session = await this.options.resolveSession()
    } catch {
      session = undefined
    }
    if (session === undefined) {
      return { asOf, tier: '', eligible: false, windows: [], error: 'console session not configured' }
    }
    const workspace = this.options.workspaceOf(ref)
    if (workspace === undefined) {
      return { asOf, tier: '', eligible: false, windows: [], error: 'workspace id not configured for this account' }
    }

    const headers = { authorization: `Bearer ${session}`, accept: 'application/json' }
    const [usage, wallet] = await Promise.all([
      this.#getJson(`${consoleBase()}/workspaces/${encodeURIComponent(workspace)}/billing/coding-plan-usage`, headers),
      this.#getJson(`${consoleBase()}/billing/summary?timeZone=${encodeURIComponent('Asia/Shanghai')}`, headers)
        .catch(() => undefined),
    ])

    if (!usage.ok) {
      return { asOf, tier: '', eligible: false, windows: [], error: usage.error }
    }
    const payload = usage.value as { eligible?: unknown, tier?: unknown, windows?: unknown }
    const windows = Array.isArray(payload.windows)
      ? payload.windows.map((row) => windowOf(row as ConsoleUsageWindow, asOf)).filter((row): row is QuotaWindow => row !== undefined)
      : []
    if (windows.length === 0) {
      return { asOf, tier: stringOf(payload.tier) ?? '', eligible: payload.eligible === true, windows: [], error: 'console returned no usable quota window' }
    }
    windows.sort((a, b) => a.durationSeconds - b.durationSeconds)

    const result: UsageSnapshot = {
      asOf,
      tier: stringOf(payload.tier) ?? '',
      eligible: payload.eligible === true,
      windows,
    }
    const walletSnapshot = wallet === undefined || !wallet.ok ? undefined : walletOf(wallet.value)
    return walletSnapshot === undefined ? result : { ...result, wallet: walletSnapshot }
  }

  /**
   * Describe the windows for logging without leaking quota values.
   * @param snapshot - one reading.
   * @returns a one-line summary.
   */
  describe(snapshot: UsageSnapshot): string {
    if (snapshot.error !== undefined) return `usage unavailable: ${snapshot.error}`
    return snapshot.windows
      .map((window) => `${windowLabel(window.durationSeconds)}=${window.percentUsed ?? '?'}%`)
      .join(' ')
  }

  /**
   * Issue one GET and decode JSON without throwing.
   * @param url - absolute URL.
   * @param headers - request headers including the session.
   * @returns the decoded body, or an error string.
   */
  async #getJson(url: string, headers: Record<string, string>): Promise<ConsoleRead> {
    try {
      const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(15_000) })
      if (!response.ok) {
        const detail = response.status === 401 ? 'console session expired or invalid' : `console HTTP ${response.status}`
        return { ok: false, error: detail }
      }
      return { ok: true, value: await response.json() }
    } catch (error) {
      return { ok: false, error: `console request failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
}

/** Result of one console GET, discriminated so callers must handle both arms. */
type ConsoleRead = { readonly ok: true, readonly value: unknown } | { readonly ok: false, readonly error: string }

/**
 * Project the billing summary into the wallet shape.
 * @param raw - decoded summary body.
 * @returns the wallet, or undefined when the payload has no balance.
 */
function walletOf(raw: unknown): WalletSnapshot | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>
  const balance = stringOf(row.balanceUsd) ?? stringOf(row.totalAvailableCreditsUsd)
  if (balance === undefined) return undefined
  const periodEnd = stringOf(row.subscriptionCurrentPeriodEnd)
  return periodEnd === undefined ? { balanceUsd: balance } : { balanceUsd: balance, subscriptionPeriodEnd: periodEnd }
}

/**
 * Build the session resolver used by the plugin entry.
 *
 * Prefers the credentials seam and falls back to the launch environment, the
 * same reference semantics the API key uses.
 * @param ctx - host context.
 * @returns a resolver returning the session token, or undefined when unset.
 */
export function sessionResolverOf(ctx: Context): () => Promise<string | undefined> {
  return async () => {
    const credentials = ctx.get('credentials')
    const hit = credentials !== undefined
      ? (await credentials.resolve(credentialRef(DEFAULT_SESSION_REF)))?.value
      : launchEnvironmentOf(ctx).get(DEFAULT_SESSION_REF)?.value
    return hit === undefined || hit.length === 0 ? undefined : hit.trim()
  }
}
