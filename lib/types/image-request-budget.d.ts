import type { ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm';
/**
 * Inline image bytes one request may carry, measured after projection.
 *
 * The same 20 MiB bound the bundled `dsh-llm-pi-ai` adapter enforces for its
 * base64 representation, chosen rather than measured for two reasons: it is the
 * value the rest of the harness already expects of a base64 route, and the nginx
 * in front of this gateway answers 413 with an HTML body that names no threshold
 * at all, so there is nothing to measure against. Text, tool declarations and
 * JSON framing sit outside this bound, which is why the image share must stay
 * comfortably below any gateway body limit of the same order.
 */
export declare const MAX_REQUEST_IMAGE_BYTES: number;
/**
 * Bytes one offload decision frees before the prefix stops growing.
 *
 * Removing only the minimum that clears the budget would make every new image
 * offload one more occurrence — one history rewrite per turn, and each rewrite
 * ends prompt-cache reuse from the first changed image. Advancing in whole quanta
 * means the removed prefix stays stable across several requests.
 */
export declare const IMAGE_OFFLOAD_BYTE_QUANTUM: number;
/** Image occurrences one request may carry, as a second, independent bound. */
export declare const MAX_REQUEST_IMAGES = 60;
/** Occurrences one offload decision removes before the prefix stops growing. */
export declare const IMAGE_OFFLOAD_COUNT_QUANTUM = 20;
/** How many oldest occurrences a route must still offload before this fits. */
export interface ImageRequestBudget {
    /** Inline bytes one request may carry, after base64 expansion. */
    readonly maxBytes?: number;
    /** Image occurrences one request may carry. */
    readonly maxImages?: number;
    /** Bytes one decision frees before the prefix stops growing. */
    readonly byteQuantum?: number;
    /** Occurrences one decision removes before the prefix stops growing. */
    readonly countQuantum?: number;
}
/** The budget this route enforces when nothing overrides it. */
export declare const DEFAULT_IMAGE_REQUEST_BUDGET: ImageRequestBudget;
/**
 * Base64-expanded length of one encoded image.
 * @param encodedBytes - encoded length of the bytes actually sent.
 * @returns the length its `data:` URL adds to the body.
 */
export declare function inlineBytesOf(encodedBytes: number): number;
/**
 * Inline length of one occurrence, before any request version was derived.
 *
 * Only a fallback now that projection exists: it answers with the stored object's
 * encoded length, which is what the body carries when the store could not derive
 * a smaller version.
 * @param block - one retained image occurrence.
 * @returns its base64 length, from the recorded encoded byte count.
 */
export declare function base64BytesOf(block: ImageBlock): number;
/**
 * Whether one occurrence is both sent and selectable for offload.
 *
 * The host reactor walks `user/message` and `tool/result` events only, and
 * assistant images are not replayed by the projection either, so this predicate
 * is what keeps the demand describing exactly the set that costs body bytes.
 * @param message - request message carrying the occurrence.
 * @returns true when the occurrence costs body bytes this route can reclaim.
 */
export declare function isBudgeted(message: RequestMessage): boolean;
/**
 * How many oldest occurrences must be offloaded before this request fits.
 *
 * Zero means the request is within budget and nothing may be dropped. The answer
 * is always satisfiable: the count is computed over the messages the host reactor
 * can select from, so offloading exactly this many always clears the excess.
 *
 * The counting itself is the harness's, not a second implementation of it: the
 * difference between the reference adapters and this route is only which
 * occurrences are eligible, never how the excess is rounded into a prefix.
 * @param messages - request history already carrying the surface's offload marks.
 * @param bytesOf - inline length one occurrence will actually send.
 * @param budget - limits and removal quanta for this route.
 * @returns the count to name in an `IMAGE_OFFLOAD_REQUIRED` failure.
 */
export declare function planImageOffload(messages: readonly RequestMessage[], bytesOf?: (block: ImageBlock) => number, budget?: ImageRequestBudget): number;
