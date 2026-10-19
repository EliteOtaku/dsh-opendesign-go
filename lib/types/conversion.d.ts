import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
/**
 * Convert a harness request into Chat Completions `messages`.
 *
 * A one-shot `options.system` becomes the leading system message; when the
 * history already starts with one, the two texts merge instead of competing.
 * @param options - fully assembled request.
 * @returns OpenAI Chat Completions messages, in conversation order.
 */
export declare function toChatMessages(options: GenerateOptions): unknown[];
/**
 * Convert harness tool schemas into Chat Completions `tools`.
 *
 * `deferLoading` is not projected: this adapter always declares the complete
 * active tool list, which is the non-deferred behaviour the flag opts out of.
 * @param options - fully assembled request.
 * @returns the tools array, or undefined when the request declares none.
 */
export declare function toChatTools(options: GenerateOptions): unknown[] | undefined;
