import type { ImageBlock } from '@deepseek-ai/dsh-llm';
/**
 * One image committed to the store, as the store answers.
 *
 * Named from the block's own attachment field rather than declared again: the
 * store returns exactly what an {@link ImageBlock} carries, and a second
 * declaration would drift from that contract the first time either side gained a
 * field.
 */
export type SavedImage = ImageBlock['attachment'];
/** The methods this plugin uses from the host's attachment store. */
export interface AttachmentsSeam {
    /**
     * Resolve one durable image reference to its normalized bytes on disk.
     * @param ref - durable attachment reference.
     * @returns an absolute path, or undefined when the store keeps no local file.
     */
    readonly imageHostPath?: (ref: unknown) => string | undefined;
    /**
     * Validate and durably commit one generated image.
     *
     * Absent on a host whose store has no write path, which is why the image route
     * refuses to generate rather than returning bytes the session cannot keep.
     * @param input - encoded bytes and declared media type.
     * @returns the durable reference.
     */
    readonly saveImage?: (input: {
        readonly data: Uint8Array;
        readonly mediaType: string;
        readonly name?: string;
    }) => Promise<SavedImage>;
}
/**
 * Guess a media type from a normalized attachment's extension.
 *
 * The store normalizes to a small set of formats, so an extension map is
 * enough; an unknown extension falls back to PNG because the store re-encodes
 * to it when the input format is not one it preserves.
 * @param path - absolute path to normalized bytes.
 * @returns the media type to declare.
 */
export declare function mediaTypeOf(path: string): string;
/**
 * Build a resolver from a store and a warning sink.
 *
 * Bytes are read synchronously because request projection is synchronous; these
 * are small normalized rasters and this runs once per image per request.
 * @param storeOf - current attachment store, or undefined when none is mounted.
 * @param warn - sink for read failures; never throws into the request path.
 * @returns a resolver that answers `undefined` instead of failing a request.
 */
export declare function imageResolverOf(storeOf: () => AttachmentsSeam | undefined, warn: (message: string) => void): (attachment: unknown) => string | undefined;
