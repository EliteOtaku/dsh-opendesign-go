/**
 * Quota, wallet and account vocabulary shared by the host and the page.
 *
 * The console reports credits as decimal strings, not numbers: they are
 * authoritative upstream values and rounding them here would make the bars
 * disagree with the console the user checks. Percentages are derived once, on
 * the host, from those exact strings.
 *
 * @module dsh-opendesign-go/usage-contract
 */
import type { ModelTotals, UsageReport } from './usage-ledger.ts'

/** How one quota window stands right now. */
export interface QuotaWindow {
  /** `ok` when the console answered; `unknown` when it could not be read. */
  readonly status: 'ok' | 'unknown'
  /** Window length in seconds, exactly as the policy declares it. */
  readonly durationSeconds: number
  /** Used credits as a decimal string. */
  readonly usedCredits: string
  /** Window limit as a decimal string; `"0"` when the plan declares none. */
  readonly limitCredits: string
  /** Remaining credits as a decimal string. */
  readonly remainingCredits: string
  /** Percentage already consumed, 0–100, or null when the limit is unusable. */
  readonly percentUsed: number | null
  /** ISO timestamp the window resets. */
  readonly resetsAt: string
}

/** Wallet balance alongside the plan, which pays overage after quota runs out. */
export interface WalletSnapshot {
  /** Available balance in USD, as the console reports it. */
  readonly balanceUsd: string
  /** End of the current billing period, when the console reports one. */
  readonly subscriptionPeriodEnd?: string
}

/** One read of the console's quota channel. */
export interface UsageSnapshot {
  /** When this reading was taken, ISO timestamp. */
  readonly asOf: string
  /** Plan tier the console reports; `go` for this plugin's target. */
  readonly tier: string
  /** Whether the plan grants quota at all. */
  readonly eligible: boolean
  /** Windows in console order, longest last. */
  readonly windows: readonly QuotaWindow[]
  /** Wallet, when the summary endpoint answered. */
  readonly wallet?: WalletSnapshot
  /** Set when the quota channel is configured but the last read failed. */
  readonly error?: string
}

/**
 * Human label for a window length.
 *
 * Derived from `durationSeconds` rather than stored, so a plan that changes its
 * windows is described correctly without a code change. An unrecognised length
 * still renders something truthful.
 * @param durationSeconds - window length from the console.
 * @returns a short label such as `5 小时`.
 */
export function windowLabel(durationSeconds: number): string {
  // Largest whole unit first: 604800 s is "7 天", not "168 小时".
  const days = durationSeconds / 86400
  if (Number.isInteger(days) && days >= 1) return `${days} 天`
  const hours = durationSeconds / 3600
  if (Number.isInteger(hours) && hours >= 1) return `${hours} 小时`
  return `${Math.round(durationSeconds / 60)} 分钟`
}

/**
 * Parse a decimal credits string without losing precision or inventing a value.
 * @param value - decimal string from the console.
 * @returns the number, or null when it is not a finite numeric string.
 */
export function creditsToNumber(value: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Percentage consumed, from the two exact strings.
 * @param usedCredits - used credits as reported.
 * @param limitCredits - limit credits as reported.
 * @returns 0–100, or null when the limit is zero or unparseable.
 */
export function percentUsedOf(usedCredits: string, limitCredits: string): number | null {
  const used = creditsToNumber(usedCredits)
  const limit = creditsToNumber(limitCredits)
  if (used === null || limit === null || limit <= 0) return null
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)))
}

/**
 * Read the cached local usage report.
 *
 * The report is produced by this plugin, but it crosses an editable document,
 * so it is validated the same way a quota reading is: a malformed value means
 * "no report", never a fabricated one.
 * @param raw - serialized report, or empty string.
 * @returns the report, or undefined when absent or unusable.
 */
export function parseReport(raw: string | undefined): UsageReport | undefined {
  if (raw === undefined || raw.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const row = parsed as Record<string, unknown>
  if (typeof row.since !== 'number' || typeof row.until !== 'number' || typeof row.calls !== 'number') return undefined
  if (!Array.isArray(row.models)) return undefined
  const models: ModelTotals[] = []
  for (const entry of row.models) {
    if (entry === null || typeof entry !== 'object') continue
    const model = entry as Record<string, unknown>
    if (typeof model.model !== 'string' || typeof model.calls !== 'number'
      || typeof model.inputTokens !== 'number' || typeof model.outputTokens !== 'number'
      || typeof model.costUsd !== 'number') continue
    models.push({
      model: model.model,
      calls: model.calls,
      inputTokens: model.inputTokens,
      outputTokens: model.outputTokens,
      cacheReadTokens: typeof model.cacheReadTokens === 'number' ? model.cacheReadTokens : 0,
      cacheWriteTokens: typeof model.cacheWriteTokens === 'number' ? model.cacheWriteTokens : 0,
      costUsd: model.costUsd,
      unpricedCalls: typeof model.unpricedCalls === 'number' ? model.unpricedCalls : 0,
    })
  }
  return {
    since: row.since,
    until: row.until,
    calls: row.calls,
    inputTokens: typeof row.inputTokens === 'number' ? row.inputTokens : 0,
    outputTokens: typeof row.outputTokens === 'number' ? row.outputTokens : 0,
    cacheReadTokens: typeof row.cacheReadTokens === 'number' ? row.cacheReadTokens : 0,
    cacheWriteTokens: typeof row.cacheWriteTokens === 'number' ? row.cacheWriteTokens : 0,
    costUsd: typeof row.costUsd === 'number' ? row.costUsd : 0,
    unpricedCalls: typeof row.unpricedCalls === 'number' ? row.unpricedCalls : 0,
    models,
    pricedAs: 'base-tier',
  }
}

/**
 * Read a cached reading back from the config document.
 *
 * The value crosses a document the user can edit, so every field is validated
 * and a malformed cache degrades to "no reading" rather than rendering
 * nonsense. An absent or empty string is the normal "never read" state.
 * @param raw - serialized snapshot, or empty string.
 * @returns the snapshot, or undefined when absent or unusable.
 */
export function parseUsage(raw: string | undefined): UsageSnapshot | undefined {
  if (raw === undefined || raw.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const row = parsed as Record<string, unknown>
  if (typeof row.asOf !== 'string' || typeof row.tier !== 'string' || typeof row.eligible !== 'boolean') return undefined
  if (!Array.isArray(row.windows)) return undefined
  const windows: QuotaWindow[] = []
  for (const entry of row.windows) {
    if (entry === null || typeof entry !== 'object') continue
    const window = entry as Record<string, unknown>
    if (typeof window.durationSeconds !== 'number' || typeof window.usedCredits !== 'string'
      || typeof window.limitCredits !== 'string' || typeof window.remainingCredits !== 'string'
      || typeof window.resetsAt !== 'string') continue
    windows.push({
      status: window.status === 'unknown' ? 'unknown' : 'ok',
      durationSeconds: window.durationSeconds,
      usedCredits: window.usedCredits,
      limitCredits: window.limitCredits,
      remainingCredits: window.remainingCredits,
      percentUsed: typeof window.percentUsed === 'number' ? window.percentUsed : null,
      resetsAt: window.resetsAt,
    })
  }
  const result: UsageSnapshot = {
    asOf: row.asOf,
    tier: row.tier,
    eligible: row.eligible,
    windows,
    ...(typeof row.error === 'string' ? { error: row.error } : {}),
  }
  const wallet = row.wallet
  if (wallet !== null && typeof wallet === 'object') {
    const walletRow = wallet as Record<string, unknown>
    if (typeof walletRow.balanceUsd === 'string') {
      return {
        ...result,
        wallet: typeof walletRow.subscriptionPeriodEnd === 'string'
          ? { balanceUsd: walletRow.balanceUsd, subscriptionPeriodEnd: walletRow.subscriptionPeriodEnd }
          : { balanceUsd: walletRow.balanceUsd },
      }
    }
  }
  return result
}
