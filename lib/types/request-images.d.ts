import type { ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm';
import type { AttachmentsSeam } from './image-bytes.ts';
/** Dimensions and byte ceiling one request image is derived at. */
export interface RequestImagePolicy {
    /** Pixels the derived image may cover; the store keeps the source below it. */
    readonly maxPixels: number;
    /** Encoded bytes the derived image should aim for. */
    readonly maxBytes: number;
}
/**
 * The policy this route asks for.
 *
 * Deliberately the same numbers the bundled adapters use rather than a figure
 * measured against this gateway: the gateway documents no limit, so matching the
 * reference behaviour keeps one request's images identical in cost to a DeepSeek
 * or pi-ai one, and leaves the measured 413 margin to the byte budget.
 */
export declare const DEFAULT_REQUEST_IMAGE_POLICY: RequestImagePolicy;
/** One projected image, ready to inline. */
export interface PreparedImage {
    /** `data:` URL carrying the projected bytes. */
    readonly dataUrl: string;
    /** Encoded byte length of the projected image, which is what the body carries. */
    readonly bytes: number;
}
/** Projected images of one request, keyed by durable attachment id. */
export type PreparedImageIndex = ReadonlyMap<string, PreparedImage>;
/**
 * Width and height to derive one image at.
 *
 * Kept identical to the harness's own helper — scale by area, never upscale, then
 * walk the longer edge down until the pixel ceiling actually holds. The second
 * loop is not redundant: rounding to whole pixels after scaling can still leave
 * the product a few pixels above the ceiling.
 * @param width - source width in pixels.
 * @param height - source height in pixels.
 * @param maxPixels - pixel ceiling for the result.
 * @returns the derived dimensions, or the source ones when it already fits.
 */
export declare function requestImageDimensions(width: number, height: number, maxPixels: number): {
    width: number;
    height: number;
};
/**
 * The target one attachment is projected to under a policy.
 * @param attachment - durable reference carrying the source dimensions.
 * @param policy - pixel and byte ceiling.
 * @returns the target to hand the store.
 */
export declare function requestImageTarget(attachment: ImageBlock['attachment'], policy?: RequestImagePolicy): {
    width: number;
    height: number;
    maxBytes: number;
};
/**
 * Every distinct non-offloaded image occurrence in one request, in order.
 *
 * Deduplicated by attachment id because the store caches one derived version per
 * (attachment, policy) pair: the same screenshot pasted twice is one decode, and
 * asking twice would be wasted work rather than a different answer.
 * @param messages - request history already carrying the surface's offload marks.
 * @returns durable references in first-appearance order.
 */
export declare function imageRefsOf(messages: readonly RequestMessage[]): ImageBlock['attachment'][];
/**
 * Derive every request image this route will send.
 *
 * A reference that cannot be projected falls back to its stored bytes, and one
 * that cannot be read at all is left out of the index — the projection layer then
 * substitutes the harness placeholder text, so the model is told an image exists
 * instead of being handed a request that quietly lost it.
 *
 * Failures are collected rather than raised: an image that cannot be decoded
 * must not take down a request whose text is perfectly sendable, and the
 * placeholder is the harness's own way of reporting that.
 * @param messages - request history already carrying the surface's offload marks.
 * @param store - mounted attachment store.
 * @param warn - sink for projection and read failures.
 * @param signal - cancellation for the whole preparation.
 * @param policy - pixel and byte ceiling to derive at.
 * @returns the projected images, keyed by attachment id.
 */
export declare function prepareRequestImages(messages: readonly RequestMessage[], store: AttachmentsSeam, warn: (message: string) => void, signal?: AbortSignal, policy?: RequestImagePolicy): Promise<PreparedImageIndex>;
