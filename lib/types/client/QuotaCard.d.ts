/**
 * Quota surfaces: the two dual bars, the wallet line, and their degraded states.
 *
 * The bars render the host's reading verbatim. Nothing here recomputes a
 * percentage: the host derives it from the console's exact credit strings, so a
 * bar can never disagree with the console the user checks. A window the host
 * could not read is labelled, never drawn as 0 %.
 *
 * @module dsh-opendesign-go/client/QuotaCard
 */
import type { ReactElement } from 'react';
import type { UsageSnapshot } from '../usage-contract.ts';
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
 * Format a reset time as a coarse countdown, which is what a quota bar needs.
 * @param resetsAt - ISO timestamp from the console.
 * @param now - reference instant.
 * @returns text such as `4 小时 49 分后重置`.
 */
export declare function resetCountdown(resetsAt: string, now?: number): string;
/**
 * Render the quota block.
 *
 * Three states are distinguishable on purpose: not configured (the user has to
 * store a session), failed (the console refused this read), and a real reading.
 * Collapsing them would make "no data" look like "no usage".
 * @param props - the host reading, or undefined while it is being fetched.
 * @returns the quota card.
 */
export declare function QuotaCard({ snapshot, loading }: {
    readonly snapshot: UsageSnapshot | undefined;
    readonly loading: boolean;
}): ReactElement;
