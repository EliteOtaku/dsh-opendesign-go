/**
 * Formatting shared by every quota surface.
 *
 * These helpers live apart from `QuotaCard` because more than one panel renders
 * the same windows: the quota card and the billed-versus-measured view read one
 * snapshot, so two copies of the thresholds or the labels could disagree on
 * screen while rendering the same numbers.
 *
 * @module dsh-opendesign-go/client/usage-format
 */

/**
 * Remaining percentage at which a window starts to deserve the user's attention.
 *
 * Expressed as remaining, not consumed, to match the bar it paints.
 */
export const WARN_AT: number = 25

/**
 * Remaining percentage at which a window will run out mid-task.
 *
 * Kept beside `WARN_AT` so the ordering of the two states cannot drift.
 */
export const STOP_AT: number = 5

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
 * Format a reset time as a coarse countdown, which is what a quota bar needs.
 * @param resetsAt - ISO timestamp from the console.
 * @param now - reference instant.
 * @returns text such as `4 小时 49 分后重置`.
 */
export function resetCountdown(resetsAt: string, now: number = Date.now()): string {
  const target = Date.parse(resetsAt)
  if (!Number.isFinite(target)) return '重置时间未知'
  const delta = target - now
  if (delta <= 0) return '即将重置'
  const minutes = Math.floor(delta / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (days > 0) return `${days}天 ${hours}小时后重置`
  if (hours > 0) return `${hours}小时 ${rest}分后重置`
  return `${rest}分钟后重置`
}

/**
 * Colour for one remaining percentage.
 *
 * Expressed in remaining terms so it matches the bar it paints: a bar that is
 * nearly empty is the alarming state, and colouring by consumed share would
 * turn a 95%-used window into full-length red — visually loud while the number
 * beside it said 5%.
 * @param remaining - 0–100.
 * @returns the fill colour.
 */
export function barColor(remaining: number): string {
  if (remaining <= STOP_AT) return '#e5484d'
  if (remaining <= WARN_AT) return '#e5a00d'
  return '#3b82f6'
}

/**
 * Estimate how long the current burn rate takes to exhaust one window.
 *
 * Answers the question a user actually acts on — "will I hit the wall before it
 * resets?" — rather than "what would a month cost". A monthly projection from
 * weekly windows is not just imprecise, it is misleading: Go grants $15 per week
 * and advertises $120 per month, but 4.3 weeks of $15 is $65, so a linear
 * projection reports roughly half the advertised cap and reads as unused
 * headroom that the weekly window will never allow.
 *
 * Returns undefined while nothing has been consumed: no rate exists yet, and
 * reporting "0 days" would look like immediate exhaustion.
 * @param window - the quota window with its used credits and reset instant.
 * @param now - reference instant, epoch milliseconds.
 * @returns days-to-exhaustion, or undefined when it cannot be estimated.
 */
export function daysToExhaust(window: {
  readonly usedCredits: string
  readonly limitCredits: string
  readonly resetsAt: string
  readonly durationSeconds: number
}, now: number = Date.now()): number | undefined {
  const used = Number(window.usedCredits)
  const limit = Number(window.limitCredits)
  const reset = Date.parse(window.resetsAt)
  if (!Number.isFinite(used) || !Number.isFinite(limit) || !Number.isFinite(reset)) return undefined
  if (used <= 0 || limit <= 0) return undefined

  // Elapsed time is derived from the reset instant rather than tracked
  // separately: the window is anchored, so `resetsAt - duration` is its start and
  // needs no extra state to survive a page reload.
  const start = reset - window.durationSeconds * 1000
  const elapsed = now - start
  if (elapsed <= 0) return undefined

  const perMs = used / elapsed
  if (perMs <= 0) return undefined
  return (limit - used) / perMs / 86_400_000
}
