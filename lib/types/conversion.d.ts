import type { ContentBlock, GenerateOptions } from '@deepseek-ai/dsh-llm';
/**
 * Resolve one durable image reference to an inline data URL.
 *
 * The harness stores normalized bytes on disk, so the adapter reads them and
 * base64-encodes them: Chat Completions accepts `data:` URLs for `image_url`
 * and this avoids depending on a host-visible upload endpoint.
 */
export type ImageDataUrlResolver = (attachment: unknown) => string | undefined;
/**
 * Split one block list into visible text and inline images.
 *
 * Reasoning is deliberately not echoed back: the provider derives it per
 * request and rejects a client-supplied copy. Tool blocks are projected by the
 * caller, so they contribute nothing here.
 *
 * An image the route cannot carry is replaced by its harness placeholder text
 * rather than throwing: a conversation that already contains an image must stay
 * usable on a text-only model, and the placeholder names the image and its path
 * so the model is not silently lied to.
 * @param blocks - model-facing blocks of one message.
 * @param resolveImage - turns one durable reference into a data URL, or
 * undefined when this route cannot carry images.
 * @returns text and image parts.
 */
export declare function partsOf(blocks: readonly ContentBlock[], resolveImage: ImageDataUrlResolver | undefined): {
    text: string;
    images: string[];
};
/**
 * Join the one-shot system prompt with the leading system-role message.
 * @param system - system prompt supplied through {@link GenerateOptions.system}.
 * @param existing - text of the leading system-role message.
 * @returns the merged prompt, request prompt first.
 */
export declare function mergeSystem(system: string, existing: string): string;
/**
 * Convert a harness request into Chat Completions `messages`.
 *
 * A one-shot `options.system` becomes the leading system message; when the
 * history already starts with one, the two texts merge instead of competing.
 * @param options - fully assembled request.
 * @returns OpenAI Chat Completions messages, in conversation order.
 */
export declare function toChatMessages(options: GenerateOptions, resolveImage?: ImageDataUrlResolver): unknown[];
/**
 * Convert harness tool schemas into Chat Completions `tools`.
 *
 * `deferLoading` is not projected: this adapter always declares the complete
 * active tool list, which is the non-deferred behaviour the flag opts out of.
 * @param options - fully assembled request.
 * @returns the tools array, or undefined when the request declares none.
 */
export declare function toChatTools(options: GenerateOptions): unknown[] | undefined;
