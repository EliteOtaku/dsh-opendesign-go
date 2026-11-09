import type { ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm';
/**
 * Inline base64 image bytes one request may carry.
 *
 * The gateway documents no limit, and the nginx in front of it answers 413 with
 * an HTML body that names no threshold, so this is a safety margin rather than a
 * measured ceiling: the Command Code adapter measured its own gateway at about
 * 50.17 MB, and this sits well under that so a single request cannot approach a
 * limit of the same order. Requests also carry text, tool declarations and
 * framing, which is why the image share is not allowed to fill the whole body.
 */
export declare const MAX_REQUEST_IMAGE_BYTES: number;
/**
 * Bytes removed per offload decision.
 *
 * Removing the minimum that clears the budget would make every new image offload
 * one more occurrence — one history rewrite per turn, and each rewrite ends
 * prompt-cache reuse from the first changed image. Advancing in whole quanta
 * means the removed prefix stays stable across several requests.
 */
export declare const IMAGE_OFFLOAD_BYTE_QUANTUM: number;
/** Image occurrences one request may carry, as a second, independent bound. */
export declare const MAX_REQUEST_IMAGES = 60;
/** Occurrences removed per offload decision, mirroring the byte quantum. */
export declare const IMAGE_OFFLOAD_COUNT_QUANTUM = 20;
/** How many oldest occurrences a route must still offload before this fits. */
export interface ImageRequestBudget {
    /** Inline base64 bytes one request may carry. */
    readonly maxBytes?: number;
    /** Image occurrences one request may carry. */
    readonly maxImages?: number;
    /** Bytes removed per decision. */
    readonly byteQuantum?: number;
    /** Occurrences removed per decision. */
    readonly countQuantum?: number;
}
/** The budget this route enforces when nothing overrides it. */
export declare const DEFAULT_IMAGE_REQUEST_BUDGET: ImageRequestBudget;
/**
 * Inline data URL length of one normalized attachment.
 * @param block - one retained image occurrence.
 * @returns its base64 length, from the recorded encoded byte count.
 */
export declare function base64BytesOf(block: ImageBlock): number;
/**
 * How many oldest occurrences must be offloaded before this request fits.
 *
 * Zero means the request is within budget and nothing may be dropped.
 * @param messages - request history already carrying the surface's offload marks.
 * @param budget - limits and removal quanta for this route.
 * @returns the count to name in an `IMAGE_OFFLOAD_REQUIRED` failure.
 */
export declare function overBudgetOffloadCount(messages: readonly RequestMessage[], budget?: ImageRequestBudget): number;
