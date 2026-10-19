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
import type { UsageReport } from './usage-ledger.ts';
/** How one quota window stands right now. */
export interface QuotaWindow {
    /** `ok` when the console answered; `unknown` when it could not be read. */
    readonly status: 'ok' | 'unknown';
    /** Window length in seconds, exactly as the policy declares it. */
    readonly durationSeconds: number;
    /** Used credits as a decimal string. */
    readonly usedCredits: string;
    /** Window limit as a decimal string; `"0"` when the plan declares none. */
    readonly limitCredits: string;
    /** Remaining credits as a decimal string. */
    readonly remainingCredits: string;
    /** Percentage already consumed, 0–100, or null when the limit is unusable. */
    readonly percentUsed: number | null;
    /** ISO timestamp the window resets. */
    readonly resetsAt: string;
}
/** Wallet balance alongside the plan, which pays overage after quota runs out. */
export interface WalletSnapshot {
    /** Available balance in USD, as the console reports it. */
    readonly balanceUsd: string;
    /** End of the current billing period, when the console reports one. */
    readonly subscriptionPeriodEnd?: string;
}
/** One read of the console's quota channel. */
export interface UsageSnapshot {
    /** When this reading was taken, ISO timestamp. */
    readonly asOf: string;
    /** Plan tier the console reports; `go` for this plugin's target. */
    readonly tier: string;
    /** Whether the plan grants quota at all. */
    readonly eligible: boolean;
    /** Windows in console order, longest last. */
    readonly windows: readonly QuotaWindow[];
    /** Wallet, when the summary endpoint answered. */
    readonly wallet?: WalletSnapshot;
    /**
     * Credits per US dollar, as the service reports it (10000 today).
     *
     * Windows are denominated in credits, which mean nothing to a user; the
     * dollar figure is what makes a quota bar legible. The rate comes from the
     * service rather than being hardcoded, so a change in scale shows up instead
     * of silently misreporting every number.
     */
    readonly creditsPerUsd?: number;
    /** Set when the quota channel is configured but the last read failed. */
    readonly error?: string;
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
export declare function windowLabel(durationSeconds: number): string;
/**
 * Parse a decimal credits string without losing precision or inventing a value.
 * @param value - decimal string from the console.
 * @returns the number, or null when it is not a finite numeric string.
 */
export declare function creditsToNumber(value: string): number | null;
/**
 * Percentage consumed, from the two exact strings.
 * @param usedCredits - used credits as reported.
 * @param limitCredits - limit credits as reported.
 * @returns 0–100, or null when the limit is zero or unparseable.
 */
export declare function percentUsedOf(usedCredits: string, limitCredits: string): number | null;
/**
 * Read the cached local usage report.
 *
 * The report is produced by this plugin, but it crosses an editable document,
 * so it is validated the same way a quota reading is: a malformed value means
 * "no report", never a fabricated one.
 * @param raw - serialized report, or empty string.
 * @returns the report, or undefined when absent or unusable.
 */
export declare function parseReport(raw: string | undefined): UsageReport | undefined;
/**
 * Read a cached reading back from the config document.
 *
 * The value crosses a document the user can edit, so every field is validated
 * and a malformed cache degrades to "no reading" rather than rendering
 * nonsense. An absent or empty string is the normal "never read" state.
 * @param raw - serialized snapshot, or empty string.
 * @returns the snapshot, or undefined when absent or unusable.
 */
export declare function parseUsage(raw: string | undefined): UsageSnapshot | undefined;
