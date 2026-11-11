/**
 * Decide whether a quota reading is due on this tick.
 *
 * Extracted because the rule is the one users feel: a configuration change must
 * read immediately, while steady state must not spawn a subprocess every second.
 * Keeping it here makes that trade explicit and testable instead of embedding it
 * in a timer callback.
 *
 * @module dsh-opendesign-go/quota-cadence
 */
/** Inputs that decide whether a read is due. */
export interface CadenceInput {
    /** Whether the configuration key changed since the previous tick. */
    readonly changed: boolean;
    /** Consecutive attempts that produced no usable reading. */
    readonly retries: number;
    /** Cap on those attempts, so a broken source is not retried forever. */
    readonly maxRetries: number;
    /** Whether the current configuration expects quota at all. */
    readonly wantsUsage: boolean;
}
/**
 * Decide whether this tick should read quota.
 *
 * A change always reads: the user just flipped a switch and is watching the
 * result, so the reading is the point of the interaction. Otherwise the read
 * repeats only while the last attempt produced nothing usable, and stops after
 * `maxRetries` so an unreachable source costs a bounded number of subprocesses
 * rather than one every interval forever.
 * @param input - the current tick's state.
 * @returns true when a read should be queued.
 */
export declare function readDue(input: CadenceInput): boolean;
/**
 * Retry budget to carry into the next tick.
 *
 * The cap in `readDue` exists for a source that will not answer: it bounds how
 * many subprocesses one outage may cost. A readable answer therefore has to
 * clear the streak. Leaving the counter at the cap after a success — which this
 * module used to do — keeps `readDue` false for the rest of the session, so the
 * card freezes on that one reading instead of refreshing once an interval.
 * @param previous - the budget after the previous attempt.
 * @param usable - whether that attempt produced a reading worth keeping.
 * @returns the budget the next tick decides with.
 */
export declare function nextRetries(previous: number, usable: boolean): number;
