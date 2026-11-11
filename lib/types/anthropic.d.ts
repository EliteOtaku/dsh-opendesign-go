/**
 * Project the harness request vocabulary onto the Anthropic Messages wire
 * shape, and translate its event stream back into {@link StreamChunk}s.
 *
 * Three surfaces now describe the same conversation, so the differences are
 * kept to this module the way `responses.ts` keeps the Responses ones: the
 * system prompt is a top-level `system` string, content is always an array of
 * typed parts (a bare string is legal but never echoed), tools carry their
 * schema under `input_schema`, and a tool result is a `tool_result` part inside
 * a **user** turn rather than a message of its own. On the response side every
 * event is a named SSE event whose payload repeats the name in `type`, blocks
 * are addressed by `index`, and usage arrives twice: zeros on `message_start`,
 * then real counts on `message_delta`.
 *
 * The functions here are pure, so both mappings are testable without a gateway.
 * The wire facts were measured against the gateway rather than copied from the
 * documentation, because several differ: `anthropic-version` is mandatory, and
 * the thinking switches below are the two forms that actually change behaviour.
 *
 * @module dsh-opendesign-go/anthropic
 */
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { ImageDataUrlResolver } from './conversion.ts';
import type { StreamState } from './stream-state.ts';
import type { FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
/** One `text` content part. */
interface AnthropicTextPart {
    readonly type: 'text';
    readonly text: string;
}
/** One `image` content part; the bytes ride inline as base64. */
interface AnthropicImagePart {
    readonly type: 'image';
    readonly source: {
        readonly type: 'base64';
        readonly media_type: string;
        readonly data: string;
    };
}
/** One `tool_use` part an assistant turn issued. */
interface AnthropicToolUsePart {
    readonly type: 'tool_use';
    readonly id: string;
    readonly name: string;
    readonly input: unknown;
}
/** One `tool_result` part answering a call by id. */
interface AnthropicToolResultPart {
    readonly type: 'tool_result';
    readonly tool_use_id: string;
    readonly content: string;
}
/** Every content part this projection emits. */
type AnthropicPart = AnthropicTextPart | AnthropicImagePart | AnthropicToolUsePart | AnthropicToolResultPart;
/** One conversation turn; content is always a part array. */
interface AnthropicMessage {
    readonly role: 'user' | 'assistant';
    readonly content: readonly AnthropicPart[];
}
/** One tool declaration; the schema is `input_schema`, not `parameters`. */
interface AnthropicTool {
    readonly name: string;
    readonly description: string;
    readonly input_schema: Record<string, unknown>;
}
/** The request body this adapter sends to `/messages`. */
export interface AnthropicRequest {
    /** System prompt, hoisted out of the message list. */
    readonly system?: string;
    /** Conversation turns, in order. */
    readonly messages: readonly AnthropicMessage[];
    /** Tool declarations, absent when the request declares none. */
    readonly tools?: readonly AnthropicTool[];
}
/**
 * Convert a harness request into an Anthropic Messages request body.
 *
 * The system prompt becomes the top-level `system` field, and so does any
 * system-level message in the history — this surface has one such field and no
 * system role, so they are joined in order rather than one winning. Consecutive
 * `tool` messages are folded into one user turn because a single assistant turn
 * may issue several calls whose results arrive as a run of messages, and this
 * surface expects them together.
 * @param options - fully assembled request.
 * @param resolveImage - route image resolver, absent for text-only routes.
 * @returns the request members this adapter sets.
 */
export declare function toAnthropicRequest(options: GenerateOptions, resolveImage?: ImageDataUrlResolver): AnthropicRequest;
/**
 * Convert harness tool schemas into Anthropic `tools`.
 *
 * `deferLoading` is not projected: this adapter always declares the complete
 * active tool list, which is the non-deferred behaviour the flag opts out of.
 * @param options - fully assembled request.
 * @returns the tools array, or undefined when the request declares none.
 */
export declare function toAnthropicTools(options: GenerateOptions): AnthropicTool[] | undefined;
/**
 * Map a terminal `stop_reason` onto the harness vocabulary.
 * @param stopReason - `delta.stop_reason` of the `message_delta` event.
 * @param sawToolCall - whether this response emitted a tool call.
 * @returns the harness finish reason.
 */
export declare function mapAnthropicStop(stopReason: string | undefined, sawToolCall: boolean): FinishReason;
/**
 * Translate one Anthropic SSE payload into chunks.
 *
 * The `type` member repeats the event name, so one switch covers both the
 * `event:` line and the payload. Three deltas carry content — `text_delta`,
 * `thinking_delta`, `input_json_delta` — and the last one is keyed by block
 * `index` rather than by a provider call id.
 * @param state - per-response streaming state.
 * @param payload - decoded SSE data payload.
 * @returns chunks to emit, in order.
 */
export declare function translateAnthropicEvent(state: StreamState, payload: string): StreamChunk[];
/**
 * Map this surface's usage object onto disjoint harness token counts.
 *
 * Anthropic states the two counts differently from OpenAI, and the difference is
 * not cosmetic: `input_tokens` here is **uncached input only**, while
 * `cache_read_input_tokens` is reported beside it. {@link toTokenUsage} subtracts
 * the cache share because the OpenAI shape folds it into the prompt total, so
 * feeding these fields to it would subtract a number that was never included.
 * Measured on a repeated long prompt: 2677 tokens cold, then 245 input with 2432
 * cache-read — the two add up to the cold figure, which is what proves they are
 * disjoint.
 * @param usage - the `usage` object from `message_delta`.
 * @returns disjoint token accounting, or undefined when the counts are absent.
 */
export declare function anthropicUsage(usage: Record<string, unknown>): TokenUsage | undefined;
export {};
