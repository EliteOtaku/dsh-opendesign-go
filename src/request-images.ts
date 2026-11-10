/**
 * Turn retained image references into the exact bytes this route will send.
 *
 * Chat Completions has no Files upload and this gateway has no separate upload
 * endpoint, so every image in the history rides the request body as a `data:`
 * URL. Sending the stored object unchanged is what made a long conversation
 * unbounded: one real session carried 28 images at 41.30 MB raw, which is
 * 55.06 MB once base64-encoded, re-sent on every single request. The reverse
 * proxy in front of the gateway answered 413 with an HTML body, and compaction
 * failed the same way because it sends the same history.
 *
 * The harness already defines the answer for exactly this problem. An adapter
 * declares the dimensions and byte ceiling it wants through
 * `imageRequestTarget`, and the attachment store derives (and caches) a request
 * version at that ceiling through `readImageRequest`. `dsh-llm-deepseek` and
 * `dsh-llm-pi-ai` both use 4,194,304 pixels and 1,048,576 bytes, which is what
 * {@link DEFAULT_REQUEST_IMAGE_POLICY} copies. On the session above the same
 * history becomes 22.86 MB raw / 30.48 MB encoded — half the body, with every
 * picture still visible to the model.
 *
 * Projecting is strictly better than dropping: a downscaled screenshot is still
 * an image the model can read, while an offloaded one becomes placeholder text.
 * The budget in `image-request-budget.ts` remains as the last resort for a
 * history that is over the line even after projection.
 *
 * @module dsh-opendesign-go/request-images
 */
import { readFileSync } from 'node:fs'
import type { ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm'
import { mediaTypeOf } from './image-bytes.ts'
import type { AttachmentsSeam } from './image-bytes.ts'

/** Dimensions and byte ceiling one request image is derived at. */
export interface RequestImagePolicy {
  /** Pixels the derived image may cover; the store keeps the source below it. */
  readonly maxPixels: number
  /** Encoded bytes the derived image should aim for. */
  readonly maxBytes: number
}

/**
 * The policy this route asks for.
 *
 * Deliberately the same numbers the bundled adapters use rather than a figure
 * measured against this gateway: the gateway documents no limit, so matching the
 * reference behaviour keeps one request's images identical in cost to a DeepSeek
 * or pi-ai one, and leaves the measured 413 margin to the byte budget.
 */
export const DEFAULT_REQUEST_IMAGE_POLICY: RequestImagePolicy = Object.freeze({
  maxPixels: 4_194_304,
  maxBytes: 1_048_576,
})

/** One projected image, ready to inline. */
export interface PreparedImage {
  /** `data:` URL carrying the projected bytes. */
  readonly dataUrl: string
  /** Encoded byte length of the projected image, which is what the body carries. */
  readonly bytes: number
}

/** Projected images of one request, keyed by durable attachment id. */
export type PreparedImageIndex = ReadonlyMap<string, PreparedImage>

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
export function requestImageDimensions(
  width: number,
  height: number,
  maxPixels: number,
): { width: number, height: number } {
  if (!(width > 0) || !(height > 0) || !(maxPixels > 0)) return { width, height }
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)))
  if (scale === 1) return { width, height }
  if (width >= height) {
    let nextWidth = Math.max(1, Math.floor(width * scale))
    let nextHeight = Math.max(1, Math.round(nextWidth * height / width))
    while (nextWidth * nextHeight > maxPixels && nextWidth > 1) {
      nextWidth -= 1
      nextHeight = Math.max(1, Math.round(nextWidth * height / width))
    }
    return { width: nextWidth, height: nextHeight }
  }
  let nextHeight = Math.max(1, Math.floor(height * scale))
  let nextWidth = Math.max(1, Math.round(nextHeight * width / height))
  while (nextWidth * nextHeight > maxPixels && nextHeight > 1) {
    nextHeight -= 1
    nextWidth = Math.max(1, Math.round(nextHeight * width / height))
  }
  return { width: nextWidth, height: nextHeight }
}

/**
 * The target one attachment is projected to under a policy.
 * @param attachment - durable reference carrying the source dimensions.
 * @param policy - pixel and byte ceiling.
 * @returns the target to hand the store.
 */
export function requestImageTarget(
  attachment: ImageBlock['attachment'],
  policy: RequestImagePolicy = DEFAULT_REQUEST_IMAGE_POLICY,
): { width: number, height: number, maxBytes: number } {
  const { width, height } = requestImageDimensions(attachment.width, attachment.height, policy.maxPixels)
  return { width, height, maxBytes: policy.maxBytes }
}

/**
 * Every distinct non-offloaded image occurrence in one request, in order.
 *
 * Deduplicated by attachment id because the store caches one derived version per
 * (attachment, policy) pair: the same screenshot pasted twice is one decode, and
 * asking twice would be wasted work rather than a different answer.
 * @param messages - request history already carrying the surface's offload marks.
 * @returns durable references in first-appearance order.
 */
export function imageRefsOf(messages: readonly RequestMessage[]): ImageBlock['attachment'][] {
  const seen = new Set<string>()
  const refs: ImageBlock['attachment'][] = []
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== 'image') continue
      if (block.offloaded === true) continue
      const id = String(block.attachment.attachmentId)
      if (seen.has(id)) continue
      seen.add(id)
      refs.push(block.attachment)
    }
  }
  return refs
}

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
export async function prepareRequestImages(
  messages: readonly RequestMessage[],
  store: AttachmentsSeam,
  warn: (message: string) => void,
  signal?: AbortSignal,
  policy: RequestImagePolicy = DEFAULT_REQUEST_IMAGE_POLICY,
): Promise<PreparedImageIndex> {
  const refs = imageRefsOf(messages)
  const index = new Map<string, PreparedImage>()
  for (const attachment of refs) {
    const prepared = await prepareOne(attachment, store, warn, signal, policy)
    if (prepared !== undefined) index.set(String(attachment.attachmentId), prepared)
  }
  return index
}

/**
 * Project one reference, preferring the store's derived version.
 * @param attachment - durable reference to derive.
 * @param store - mounted attachment store.
 * @param warn - sink for failures.
 * @param signal - cancellation.
 * @param policy - pixel and byte ceiling.
 * @returns the projected image, or undefined when nothing could be read.
 */
async function prepareOne(
  attachment: ImageBlock['attachment'],
  store: AttachmentsSeam,
  warn: (message: string) => void,
  signal: AbortSignal | undefined,
  policy: RequestImagePolicy,
): Promise<PreparedImage | undefined> {
  if (typeof store.readImageRequest === 'function') {
    try {
      const derived = await store.readImageRequest(attachment, requestImageTarget(attachment, policy), signal)
      const bytes = derived.data.byteLength
      if (bytes > 0) {
        return {
          dataUrl: `data:${derived.mediaType};base64,${Buffer.from(derived.data).toString('base64')}`,
          bytes,
        }
      }
      warn(`llm-opendesign-go: derived image ${String(attachment.attachmentId)} was empty; using the stored object`)
    } catch (error) {
      // A store that cannot derive this format is not a broken store: the
      // original bytes are still a legal request body, just larger.
      warn(`llm-opendesign-go: could not derive a request version (${String(error)}); using the stored object`)
    }
  }
  return readStored(attachment, store, warn)
}

/**
 * Read one stored object as a `data:` URL, without deriving a version.
 * @param attachment - durable reference to read.
 * @param store - mounted attachment store.
 * @param warn - sink for read failures.
 * @returns the inline image, or undefined when the bytes are not readable.
 */
function readStored(
  attachment: ImageBlock['attachment'],
  store: AttachmentsSeam,
  warn: (message: string) => void,
): PreparedImage | undefined {
  if (typeof store.imageHostPath !== 'function') return undefined
  let path: string | undefined
  try {
    path = store.imageHostPath(attachment)
  } catch (error) {
    warn(`llm-opendesign-go: could not locate image bytes (${String(error)})`)
    return undefined
  }
  if (path === undefined || path.length === 0) return undefined
  try {
    const data = readFileSync(path)
    return {
      dataUrl: `data:${mediaTypeOf(path)};base64,${data.toString('base64')}`,
      bytes: data.byteLength,
    }
  } catch (error) {
    warn(`llm-opendesign-go: could not read image bytes (${String(error)})`)
    return undefined
  }
}
