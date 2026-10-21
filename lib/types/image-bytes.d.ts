/** The one method this plugin uses from the host's attachment store. */
export interface AttachmentsSeam {
    /**
     * Resolve one durable image reference to its normalized bytes on disk.
     * @param ref - durable attachment reference.
     * @returns an absolute path, or undefined when the store keeps no local file.
     */
    readonly imageHostPath?: (ref: unknown) => string | undefined;
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
