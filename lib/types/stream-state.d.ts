/**
 * Streaming state shared by every wire protocol this adapter speaks.
 *
 * Both Chat Completions and Responses describe the same output — some thinking,
 * some text, some tool calls, then a stop reason and a token count — so the
 * accumulator, the block indices and the token accounting live here once, and a
 * protocol module only translates its own events into that vocabulary. Keeping
 * one definition is what stops the two surfaces from disagreeing about, say,
 * whether cached input is counted inside the input total.
 *
 * @module dsh-opendesign-go/stream-state
 */
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
/** One text or reasoning block accumulated while streaming. */
export interface TextBlockState {
    /** Block index this accumulation owns. */
    readonly index: number;
    /** Assembled text so far. */
    text: string;
}
/** One tool call accumulated while streaming. */
export interface ToolCallState {
    /** Block index this call owns. */
    readonly index: number;
    /** Provider id correlating the call with its result. */
    readonly id: ToolCallId;
    /** Declared tool name; empty until the provider names it. */
    name: string;
    /** Raw JSON arguments, assembled incrementally. */
    arguments: string;
}
/** Per-response streaming state shared by the protocol translators. */
export interface StreamState {
    /** Next free block index. */
    nextIndex: number;
    /** Open text block, if the response produced one. */
    text: TextBlockState | undefined;
    /** Open reasoning block, if the response produced one. */
    reasoning: TextBlockState | undefined;
    /**
     * Routing table: the call that later id-less deltas on this provider key
     * append to. Only the newest call at a key lives here, so a gateway that
     * reuses an index for a second call cannot corrupt the first.
     */
    readonly toolCalls: Map<number | string, ToolCallState>;
    /**
     * Every tool call this response opened, in first-seen order.
     *
     * {@link closeOpenBlocks} reads this rather than {@link StreamState.toolCalls}
     * because a reused key leaves the earlier call reachable only from here.
     */
    readonly openToolCalls: ToolCallState[];
    /** Terminal stop reason once the provider names one. */
    finishReason: FinishReason | undefined;
    /** Token accounting once the provider reports it. */
    usage: TokenUsage | undefined;
    /** Blocks that carried content; zero means the response was degenerate. */
    contentBlocks: number;
}
/**
 * Create the empty state for one response.
 * @returns a fresh accumulator.
 */
export declare function createStreamState(): StreamState;
/**
 * Allocate the next block index.
 * @param state - per-response streaming state.
 * @returns the index this block owns for the whole response.
 */
export declare function takeIndex(state: StreamState): number;
/**
 * Append to the open text block, opening it on first use.
 * @param state - per-response streaming state.
 * @param text - increment to append.
 * @param chunks - accumulator for emitted chunks.
 */
export declare function appendText(state: StreamState, text: string, chunks: StreamChunk[]): void;
/**
 * Append to the open reasoning block, opening it on first use.
 * @param state - per-response streaming state.
 * @param text - increment to append.
 * @param chunks - accumulator for emitted chunks.
 */
export declare function appendReasoning(state: StreamState, text: string, chunks: StreamChunk[]): void;
/**
 * Open one tool call and publish its block start.
 *
 * Both protocols go through here rather than constructing a call at the call
 * site: the routing table and the ordered list have to agree, and a call built
 * elsewhere would be invisible to {@link closeOpenBlocks}.
 * @param state - per-response streaming state.
 * @param key - provider key that later id-less deltas will carry.
 * @param id - provider-issued call id, already branded.
 * @param name - declared tool name, or '' when the provider names it later.
 * @param chunks - accumulator for emitted chunks.
 * @returns the opened call.
 */
export declare function startToolCall(state: StreamState, key: number | string, id: ToolCallId, name: string, chunks: StreamChunk[]): ToolCallState;
/**
 * Close every block still open, in first-seen order.
 * @param state - per-response streaming state.
 * @returns the `block-end` chunks carrying each assembled block.
 */
export declare function closeOpenBlocks(state: StreamState): StreamChunk[];
/**
 * Map a usage object onto disjoint harness token counts.
 *
 * Both surfaces are accepted because both are in use: Chat Completions reports
 * `prompt_tokens`/`completion_tokens`, Responses reports
 * `input_tokens`/`output_tokens`, and either may carry the same facts in a
 * `*_details` child. `prompt_tokens`/`input_tokens` are aggregates that already
 * include cache hits, while {@link TokenUsage} counts uncached input separately,
 * so the cache share is subtracted out of `inputTokens`.
 * @param usage - provider usage object.
 * @returns disjoint token accounting, or undefined when the counts are absent.
 */
export declare function toTokenUsage(usage: Record<string, unknown>): TokenUsage | undefined;
/**
 * Read one finite number.
 * @param value - candidate value.
 * @returns the number, or undefined when absent or non-finite.
 */
export declare function numberValue(value: unknown): number | undefined;
/**
 * Return the first finite number among the candidates.
 * @param values - candidates in priority order.
 * @returns the first number, or undefined when none qualifies.
 */
export declare function firstNumber(...values: readonly unknown[]): number | undefined;
/**
 * Narrow an arbitrary value to a plain JSON object.
 * @param value - candidate value.
 * @returns whether the value is a non-null object.
 */
export declare function isRecord(value: unknown): value is Record<string, unknown>;
/**
 * Brand a provider-supplied call id for the harness block vocabulary.
 * @param id - provider id.
 * @returns the same string as a tool-call id.
 */
export declare function toolCallId(id: string): ToolCallId;
