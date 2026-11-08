import type { ThrottleClock } from './throttle.ts';
/** One value ready to publish, plus the identity that decides whether it changed. */
export interface CacheSnapshot {
    /**
     * What the value says, excluding any timestamp.
     *
     * The timestamp moves on every poll while the facts rarely do, so deduplication
     * keys on the facts alone: a field is republished when it has something new to
     * say, not because time passed.
     */
    readonly fingerprint: string;
    /** The exact text to store, timestamp included. */
    readonly json: string;
}
/** Retry control for one cached field. */
export interface CacheRetry {
    /**
     * Publish the current value, retrying while the host refuses it.
     *
     * A newer call supersedes the running chain: it recomputes the value anyway,
     * and two chains would race for the same lock.
     * @param snapshot - builds the value to publish; called once per attempt.
     * @param store - writes it; resolves true once the document carries it.
     * @returns whether the value reached the document within the retry budget.
     */
    publish(snapshot: () => CacheSnapshot, store: (json: string) => Promise<boolean>): Promise<boolean>;
    /** Drop any pending retry, for example when the plugin is disposed. */
    dispose(): void;
    /** Whether a retry is currently waiting. */
    readonly pending: boolean;
}
/**
 * Build a retry controller.
 * @param options - the delays before each retry, an optional clock for tests, and
 * observers for the retry and for giving up.
 * @returns the controller.
 */
export declare function createCacheRetry(options: {
    delays: readonly number[];
    clock?: ThrottleClock;
    /** Called before each wait, so a retry is visible in the log. */
    onRetry?: (delayMs: number, attempt: number) => void;
    /** Called after the last attempt was refused; the caller reports it. */
    onGiveUp?: (attempts: number) => void;
}): CacheRetry;
