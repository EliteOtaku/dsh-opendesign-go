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
}
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
 * @returns the recovered calls, in log order.
 */
export declare function callsFromSessionText(text: string): RecoveredCall[];
/**
 * Walk every session log under a root and collect OpenDesign calls.
 *
 * Sessions are stored under `<root>/<workspace-slug>/<session-id>/`, so the walk
 * is two levels deep by design rather than recursive: a deeper search would
 * touch unrelated trees.
 * @param root - absolute `~/.dsh/sessions` directory.
 * @returns every recovered call.
 */
export declare function scanSessions(root: string): RecoveredCall[];
