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
export declare const WARN_AT: number;
/**
 * Remaining percentage at which a window will run out mid-task.
 *
 * Kept beside `WARN_AT` so the ordering of the two states cannot drift.
 */
export declare const STOP_AT: number;
/**
 * Human label for a window length.
 *
 * Derived from `durationSeconds` rather than stored, so a plan that changes its
 * windows is described correctly without a code change. An unrecognised length
 * still renders something truthful.
 * @param durationSeconds - window length from the console.
 * @returns a short label such as `5 小时`.
 */
export declare function windowLabel(durationSeconds: number): string;
/**
 * Format a reset time as a coarse countdown, which is what a quota bar needs.
 * @param resetsAt - ISO timestamp from the console.
 * @param now - reference instant.
 * @returns text such as `4 小时 49 分后重置`.
 */
export declare function resetCountdown(resetsAt: string, now?: number): string;
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
export declare function barColor(remaining: number): string;
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
export declare function daysToExhaust(window: {
    readonly usedCredits: string;
    readonly limitCredits: string;
    readonly resetsAt: string;
    readonly durationSeconds: number;
}, now?: number): number | undefined;
