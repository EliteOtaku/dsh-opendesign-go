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
 * Abbreviate a window length for a place with no room for words.
 *
 * The composer pill sits in the tool row beside the submit action, where
 * `5 小时` and `7 天` would push the composer out of shape; `5h` and `7d` read
 * the same and take a third of the width. Derived from the same
 * `durationSeconds`, so a new plan window needs no change here.
 * @param durationSeconds - window length from the console.
 * @returns an abbreviated label such as `5h` or `7d`.
 */
export declare function compactWindowLabel(durationSeconds: number): string;
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
export declare function daysToExhaust(window: {
    readonly usedCredits: string;
    readonly limitCredits: string;
    readonly resetsAt: string;
    readonly durationSeconds: number;
}, now?: number): number | undefined;
