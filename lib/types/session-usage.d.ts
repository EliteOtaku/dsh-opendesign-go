/** One recovered call. */
export interface RecoveredCall {
    /** Provider id recorded by the harness, e.g. `opendesign`. */
    readonly provider: string;
    /** Exact model id. */
    readonly model: string;
    /** Prompt tokens excluding cache reads, as the log records them. */
    readonly inputTokens: number;
    /** Completion tokens. */
    readonly outputTokens: number;
    /** Prompt tokens served from cache. */
    readonly cacheReadTokens: number;
    /** Cache-write tokens, when recorded. */
    readonly cacheWriteTokens: number;
    /**
     * Event time in epoch milliseconds, from the event's top-level `time`.
     *
     * Carried so recovered spend can be placed in the same time windows as the
     * live ledger; without it the two sources could only be compared as totals.
     */
    readonly at: number;
}
/**
 * Provider ids treated as this subscription by default.
 *
 * `opendesign` is the hand-configured custom-model route; `dsh-opendesign-go` is
 * this plugin. Both bill the same subscription, so both are counted. A user who
 * renamed or duplicated the route can extend this through configuration, which
 * is why it is a list rather than a hard-coded set.
 */
export declare const DEFAULT_RECOVERED_PROVIDERS: readonly string[];
/** Options for {@link scanSessions}. */
export interface ScanOptions {
    /** Only count calls at or after this epoch-ms instant; omitted means no bound. */
    readonly since?: number | undefined;
    /** Provider ids to count; omitted means {@link DEFAULT_RECOVERED_PROVIDERS}. */
    readonly providers?: readonly string[] | undefined;
}
/**
 * Parse a configured provider list.
 *
 * Configuration reaches this as one string, so the separator is fixed here.
 * Blank items are dropped because a trailing comma in a settings field is an
 * ordinary typo, and an empty result falls back to the defaults so that clearing
 * the field restores the standard routes instead of silently counting nothing.
 * @param raw - comma-separated provider ids, as stored in settings.
 * @returns the configured ids, or the default list when nothing usable was given.
 */
export declare function parseRecoveredProviders(raw: string | undefined): readonly string[];
/**
 * Decompress every frame of one session log.
 *
 * The harness appends each event as its own frame, so a single
 * `zstdDecompressSync` call stops after the first one and silently reports a
 * nearly empty session. Walking the magic bytes is what makes the rest readable.
 * @param path - absolute path to a `session.v4.jsonl.zstd` file.
 * @returns the concatenated plaintext, or undefined when it cannot be read.
 */
export declare function readSessionLog(path: string): string | undefined;
/**
 * Extract OpenDesign calls from one decoded session log.
 *
 * Only `assistant/message` events carry usage. A line that parses but is another
 * event type is skipped; a line that does not parse at all is skipped too,
 * because a partially written tail must not discard the whole log.
 * @param text - decoded session JSONL.
 * @param providers - provider ids to count; omitted means the default list.
 * @returns the recovered calls, in log order.
 */
export declare function callsFromSessionText(text: string, providers?: readonly string[]): RecoveredCall[];
/**
 * Walk every session log under a root and collect OpenDesign calls.
 *
 * Sessions are stored under `<root>/<workspace-slug>/<session-id>/`, so the walk
 * is two levels deep by design rather than recursive: a deeper search would
 * touch unrelated trees.
 * @param root - absolute `~/.dsh/sessions` directory.
 * @param options - time bound and provider list; omitted means no bound and the
 *   default providers.
 * @returns every matching recovered call.
 */
export declare function scanSessions(root: string, options?: ScanOptions): RecoveredCall[];
