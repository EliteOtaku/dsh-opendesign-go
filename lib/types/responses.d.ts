/**
 * Project the harness request vocabulary onto the Responses wire shape, and
 * translate its event stream back into {@link StreamChunk}s.
 *
 * The two surfaces describe the same conversation in different shapes, so this
 * module is the whole of the difference on the request side: tools lose their
 * `function` wrapper and grow a flat `name`, a tool result becomes a
 * `function_call_output` item keyed by `call_id`, and the system prompt is sent
 * as `instructions` instead. On the response side the events are named rather
 * than indexed — `response.output_text.delta`,
 * `response.reasoning_summary_text.delta`,
 * `response.function_call_arguments.delta` — and there is no
 * `choices`, no `finish_reason` and no per-event usage: the terminal
 * `response.completed` (or `response.incomplete`) carries the counts.
 *
 * The functions here are pure, so both mappings are testable without a gateway.
 *
 * @module dsh-opendesign-go/responses
 */
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { ImageDataUrlResolver } from './conversion.ts';
import type { StreamState } from './stream-state.ts';
import type { FinishReason, StreamChunk } from '@deepseek-ai/dsh-llm';
/** One `input_text` content part. */
interface ResponsesTextPart {
    readonly type: 'input_text';
    readonly text: string;
}
/** One `input_image` content part. */
interface ResponsesImagePart {
    readonly type: 'input_image';
    readonly image_url: string;
}
/** Content is a bare string unless the message carries images. */
type ResponsesContent = string | readonly (ResponsesTextPart | ResponsesImagePart)[];
/** One conversation item: a message, or one half of a tool exchange. */
type ResponsesItem = {
    readonly role: string;
    readonly content: ResponsesContent;
} | {
    readonly type: 'function_call';
    readonly call_id: string;
    readonly name: string;
    readonly arguments: string;
} | {
    readonly type: 'function_call_output';
    readonly call_id: string;
    readonly output: string;
};
/** One flat `tools[]` declaration; Responses has no `function` wrapper. */
interface ResponsesTool {
    readonly type: 'function';
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
}
/** The request body this adapter sends to `/responses`. */
export interface ResponsesRequest {
    /** System prompt, hoisted out of the message list. */
    readonly instructions?: string;
    /** Conversation items, in order. */
    readonly input: readonly ResponsesItem[];
    /** Tool declarations, absent when the request declares none. */
    readonly tools?: readonly ResponsesTool[];
}
/**
 * Convert a harness request into a Responses request body.
 *
 * The system prompt becomes `instructions`, which the gateway honours in place
 * of a system message; when the history also opens with one, the two texts
 * merge instead of competing, exactly as the Chat Completions projection does.
 * @param options - fully assembled request.
 * @param resolveImage - route image resolver, absent for text-only routes.
 * @returns the request members this adapter sets.
 */
export declare function toResponsesRequest(options: GenerateOptions, resolveImage?: ImageDataUrlResolver): ResponsesRequest;
/**
 * Convert harness tool schemas into Responses `tools`.
 *
 * `deferLoading` is not projected: this adapter always declares the complete
 * active tool list, which is the non-deferred behaviour the flag opts out of.
 * @param options - fully assembled request.
 * @returns the tools array, or undefined when the request declares none.
 */
export declare function toResponsesTools(options: GenerateOptions): ResponsesTool[] | undefined;
/**
 * Map a terminal status onto the harness vocabulary.
 *
 * Responses never sends `finish_reason`; the two facts that matter are whether
 * the response completed and whether it stopped short of its output budget.
 * @param status - `response.status` of the terminal event.
 * @param incompleteReason - `response.incomplete_details.reason`, when present.
 * @param sawToolCall - whether this response emitted a tool call.
 * @returns the harness finish reason.
 */
export declare function mapResponsesStop(status: string | undefined, incompleteReason: string | undefined, sawToolCall: boolean): FinishReason;
/**
 * Translate one Responses SSE payload into chunks.
 * @param state - per-response streaming state.
 * @param payload - decoded SSE data payload.
 * @returns chunks to emit, in order.
 */
export declare function translateResponsesEvent(state: StreamState, payload: string): StreamChunk[];
export {};
