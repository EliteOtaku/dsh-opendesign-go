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
