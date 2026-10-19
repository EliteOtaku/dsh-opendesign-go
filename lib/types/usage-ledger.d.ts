/**
 * Local usage ledger: what this plugin's own requests cost, per model.
 *
 * Scope is deliberately narrow — **only requests routed through this plugin**
 * are counted. The question it answers is "which of my keys/models is spending
 * what", which is what a user can act on; the console's own quota bars answer a
 * different question and need credentials this plugin will not ask for.
 *
 * Two facts shape the design:
 *
 * - Only the **base price tier** is available. The public price list has no
 *   tiered rows, so a request above a model's tier threshold is priced low.
 *   Every report therefore carries `pricedAs: 'base-tier'` rather than
 *   pretending to be a bill.
 * - Requests are recorded **from the adapter**, where the exact token usage is
 *   already in hand. Nothing scans session history, so the numbers exist for
 *   every call regardless of whether the session was ever persisted.
 *
 * @module dsh-opendesign-go/usage-ledger
 */
/** One model's price, per million tokens, in USD. */
export interface ModelPrice {
    readonly model: string;
    readonly input: number;
    readonly output: number;
    readonly cacheRead?: number;
    readonly cacheWrite?: number;
}
/** Token usage of one finished call, in the harness's disjoint accounting. */
export interface CallUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
}
/** One recorded call. */
export interface LedgerEntry {
    /** Epoch milliseconds when the call finished. */
    readonly at: number;
    /** Exact model id the call used. */
    readonly model: string;
    /** Credential reference of the account that served it. */
    readonly accountRef: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheWriteTokens: number;
    /** Cost in USD, or null when this model has no known price. */
    readonly costUsd: number | null;
}
/** One model's rollup. */
export interface ModelTotals {
    readonly model: string;
    readonly calls: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheWriteTokens: number;
    /** Sum of known costs; calls without a price are excluded from the sum. */
    readonly costUsd: number;
    /** Calls whose model had no price, so the cost total is partial. */
    readonly unpricedCalls: number;
}
/** A rolled-up report over a time window. */
export interface UsageReport {
    /** Window start, epoch milliseconds. */
    readonly since: number;
    /** Window end, epoch milliseconds. */
    readonly until: number;
    readonly calls: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheWriteTokens: number;
    readonly costUsd: number;
    readonly unpricedCalls: number;
    /** Per-model rows, highest cost first so the expensive model is on top. */
    readonly models: readonly ModelTotals[];
    /**
     * How costs were derived. `base-tier` means only the first price tier was
     * applied: a request past a model's tier threshold is undercounted, and the
     * page must say so instead of presenting the number as a bill.
     */
    readonly pricedAs: 'base-tier';
}
/**
 * Cost of one call under a model's base price tier.
 * @param price - the model's price, when known.
 * @param usage - token usage of the call.
 * @returns the cost in USD, or null when the model has no price.
 */
export declare function costOf(price: ModelPrice | undefined, usage: CallUsage): number | null;
/**
 * Roll entries up per model and in total.
 *
 * Entries without a known price are still counted in the token totals — their
 * tokens were really spent — but are reported separately so the dollar figure
 * is never mistaken for complete.
 * @param entries - recorded calls inside the window.
 * @param since - window start.
 * @param until - window end.
 * @returns the report.
 */
export declare function summarize(entries: readonly LedgerEntry[], since: number, until: number): UsageReport;
