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
export { barColor, resetCountdown } from './usage-format.ts';
/**
 * Render the quota block.
 *
 * Three states are distinguishable on purpose: not configured (the user has to
 * store a session), failed (the console refused this read), and a real reading.
 * Collapsing them would make "no data" look like "no usage".
 * @param props - the host reading, or undefined while it is being fetched.
 * @returns the quota card.
 */
export declare function QuotaCard({ snapshot, loading, ledgerCostUsd, onRefresh, refreshing }: {
    readonly snapshot: UsageSnapshot | undefined;
    readonly loading: boolean;
    /** What this plugin measured for the same traffic, priced at vendor rates. */
    readonly ledgerCostUsd?: number | undefined;
    /** Request a reading now; omitted when the page cannot write configuration. */
    readonly onRefresh?: (() => void) | undefined;
    /** True while a requested reading has not landed yet. */
    readonly refreshing?: boolean | undefined;
}): ReactElement;
