/**
 * Turning a durable image reference into the bytes a request can carry.
 *
 * Kept apart from plugin activation because this is where an image silently
 * stops being an image: any failure here degrades to the harness placeholder
 * text, and a request that says `[image omitted because this model accepts text
 * only]` looks like a model limitation rather than a lookup that did not
 * resolve. The seam is passed in so each branch can be exercised directly.
 *
 * @module image-bytes
 */
import { readFileSync } from 'node:fs'

/** The one method this plugin uses from the host's attachment store. */
export interface AttachmentsSeam {
  /**
   * Resolve one durable image reference to its normalized bytes on disk.
   * @param ref - durable attachment reference.
   * @returns an absolute path, or undefined when the store keeps no local file.
   */
  readonly imageHostPath?: (ref: unknown) => string | undefined
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
export function mediaTypeOf(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

/**
 * Build a resolver from a store and a warning sink.
 *
 * Bytes are read synchronously because request projection is synchronous; these
 * are small normalized rasters and this runs once per image per request.
 * @param storeOf - current attachment store, or undefined when none is mounted.
 * @param warn - sink for read failures; never throws into the request path.
 * @returns a resolver that answers `undefined` instead of failing a request.
 */
export function imageResolverOf(
  storeOf: () => AttachmentsSeam | undefined,
  warn: (message: string) => void,
): (attachment: unknown) => string | undefined {
  return (attachment: unknown): string | undefined => {
    const store = storeOf()
    // No store means no bytes: the caller substitutes placeholder text that
    // names the image, so the model is told an image exists rather than being
    // handed a request that quietly lost it.
    if (store === undefined || typeof store.imageHostPath !== 'function') return undefined
    const path = store.imageHostPath(attachment)
    if (path === undefined || path.length === 0) return undefined
    try {
      return `data:${mediaTypeOf(path)};base64,${readFileSync(path).toString('base64')}`
    } catch (error) {
      warn(`llm-opendesign-go: could not read image bytes (${String(error)})`)
      return undefined
    }
  }
}
