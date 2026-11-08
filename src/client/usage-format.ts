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
 * Abbreviate a window length for a place with no room for words.
 *
 * The composer pill sits in the tool row beside the submit action, where
 * `5 小时` and `7 天` would push the composer out of shape; `5h` and `7d` read
 * the same and take a third of the width. Derived from the same
 * `durationSeconds`, so a new plan window needs no change here.
 * @param durationSeconds - window length from the console.
 * @returns an abbreviated label such as `5h` or `7d`.
 */
export function compactWindowLabel(durationSeconds: number): string {
  const days = durationSeconds / 86400
  if (Number.isInteger(days) && days >= 1) return `${days}d`
  const hours = durationSeconds / 3600
  if (Number.isInteger(hours) && hours >= 1) return `${hours}h`
  return `${Math.round(durationSeconds / 60)}m`
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
 * the recurrent windows is not just imprecise, it is misleading: the windows are
 * hard caps, so the sum of them over a month is what a subscription can ever
 * spend, and a projection that exceeds it reads as spendable headroom that does
 * not exist. Go now publishes $220 a month and $55 a week, which agree exactly
 * at four weeks; the same four-to-one relation held under the earlier $120/$15
 * pair, so the shape of the warning survives any repricing.
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
