/**
 * Route the gateway's image-generation models to their own endpoint.
 *
 * The gateway lists image models in the same `/models` catalog as chat models,
 * but they are not chat models: `POST /chat/completions` answers them with an
 * error, and the only surface that serves them is `POST /images/generations`
 * (the OpenAI Images shape this gateway implements). Selecting one in the
 * session picker therefore failed every time, which is the reported bug.
 *
 * The fix is not to hide them. They are entitled, they are callable, and the
 * harness can carry an image back: `ImageBlock` is role-neutral and the
 * conversation renders a committed assistant image through the same attachment
 * gallery as a user upload. So this module does the two halves the chat path
 * cannot: build the Images request, and decode the reply into bytes the
 * attachment store can keep.
 *
 * @module dsh-opendesign-go/image-generation
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
/** Raster formats the attachment store accepts. */
export type GeneratedMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
/** One generated image, decoded and typed. */
export interface GeneratedImage {
    /** Encoded bytes, already decoded from base64. */
    readonly data: Uint8Array;
    /** Media type verified from the bytes themselves. */
    readonly mediaType: GeneratedMediaType;
}
/** What one image request needs. */
export interface ImageGenerationRequest {
    /** Model id exactly as the catalog lists it. */
    readonly model: string;
    /** The instruction, taken from the turn's visible text. */
    readonly prompt: string;
    /** Requested `size`, when the turn asked for one. */
    readonly size?: string;
    /** Absolute endpoint, e.g. `https://…/v1/images/generations`. */
    readonly url: string;
    /** Validated credential. */
    readonly apiKey: string;
    /** Cancellation and deadline for the whole exchange. */
    readonly signal: AbortSignal;
    /** Fetch implementation, injected so the request can be exercised without a gateway. */
    readonly fetchImpl?: typeof fetch;
}
/**
 * Media type for base64 bytes the endpoint did not label.
 *
 * The Images endpoint returns base64 without a media type in the common case,
 * and every format this store accepts has a fixed signature — cheaper and more
 * reliable than trusting a model id.
 * @param bytes - decoded image bytes.
 * @returns the media type to declare.
 */
export declare function sniffMediaType(bytes: Uint8Array): GeneratedMediaType;
/**
 * Pull the generated images out of whatever envelope the endpoint used.
 *
 * OpenAI's shape is `{ data: [{ b64_json }] }`. Relays serving the same models
 * sometimes answer `{ data: [{ url }] }` or a bare array; a `url` member cannot
 * be turned into durable bytes without a second fetch, so those members are
 * skipped rather than guessed at — the caller then reports a reply it could not
 * use instead of an empty success.
 * @param body - parsed JSON response.
 * @returns decoded images in reply order, possibly empty.
 */
export declare function imagesOf(body: unknown): GeneratedImage[];
/**
 * Read one failed Images response into the taxonomy the harness routes on.
 *
 * The body may be the gateway's `{ error: { code, message, type } }` envelope or
 * something with no JSON at all — the nginx 413 page is exactly that — so the
 * status is always kept and the raw text becomes the message when parsing fails.
 * @param response - non-ok response.
 * @returns a classified failure.
 */
export declare function failureOf(response: Response): Promise<LlmError>;
/**
 * Ask the gateway to generate images for one prompt.
 *
 * Never retries: the harness owns retry, and an image request retried here would
 * bill twice for output nobody kept.
 * @param request - model, prompt, endpoint, and credential.
 * @returns decoded images in reply order; never empty.
 * @throws LlmError - classified gateway failure, a transport failure, or a reply
 * that carried no image bytes this adapter can decode.
 */
export declare function generateImages(request: ImageGenerationRequest): Promise<GeneratedImage[]>;
