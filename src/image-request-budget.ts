/**
 * Keep one request's inline image bytes under the gateway's body limit.
 *
 * Chat Completions carries images as `data:` URLs inside the request body, and
 * this adapter has no Files upload, so every image in the conversation history
 * is re-sent — at its base64 length — on every request. A session that
 * accumulates screenshots or generated rasters therefore grows without bound
 * until the reverse proxy in front of the gateway refuses the body outright:
 *
 * ```
 * HTTP 413  <center>Content-Type: text/html</center> <center>nginx</center>
 * ```
 *
 * That failure is not recoverable from the conversation. Compaction has to send
 * the same history, so it fails identically, and every later request fails the
 * same way — the session is dead for this route while being perfectly fine on
 * any other.
 *
 * The harness owns the fix: define an `LlmImageRequestBudget` and fail with
 * `IMAGE_OFFLOAD_REQUIRED` naming how many of the oldest occurrences must be
 * dropped. `dsh-compaction-image-offload` records an `image/offload` selection
 * and retries, and the deriver then projects those occurrences as placeholder
 * text instead of bytes. This is the same contract `dsh-llm-deepseek`,
 * `dsh-llm-pi-ai` and the Command Code adapter follow, so one mechanism covers
 * every route.
 *
 * What this module must not do is drop images on its own. An unlogged projection
 * would leave the session log claiming bytes that were never sent, and the model
 * would silently be answering about pictures it never saw.
 *
 * @module dsh-opendesign-go/image-request-budget
 */
import { requiredImageOffload } from '@deepseek-ai/dsh-llm'
import type { ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm'

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
export const MAX_REQUEST_IMAGE_BYTES = 24 * 1024 * 1024

/**
 * Bytes removed per offload decision.
 *
 * Removing the minimum that clears the budget would make every new image offload
 * one more occurrence — one history rewrite per turn, and each rewrite ends
 * prompt-cache reuse from the first changed image. Advancing in whole quanta
 * means the removed prefix stays stable across several requests.
 */
export const IMAGE_OFFLOAD_BYTE_QUANTUM = 8 * 1024 * 1024

/** Image occurrences one request may carry, as a second, independent bound. */
export const MAX_REQUEST_IMAGES = 60

/** Occurrences removed per offload decision, mirroring the byte quantum. */
export const IMAGE_OFFLOAD_COUNT_QUANTUM = 20

/** How many oldest occurrences a route must still offload before this fits. */
export interface ImageRequestBudget {
  /** Inline base64 bytes one request may carry. */
  readonly maxBytes?: number
  /** Image occurrences one request may carry. */
  readonly maxImages?: number
  /** Bytes removed per decision. */
  readonly byteQuantum?: number
  /** Occurrences removed per decision. */
  readonly countQuantum?: number
}

/** The budget this route enforces when nothing overrides it. */
export const DEFAULT_IMAGE_REQUEST_BUDGET: ImageRequestBudget = Object.freeze({
  maxBytes: MAX_REQUEST_IMAGE_BYTES,
  maxImages: MAX_REQUEST_IMAGES,
  byteQuantum: IMAGE_OFFLOAD_BYTE_QUANTUM,
  countQuantum: IMAGE_OFFLOAD_COUNT_QUANTUM,
})

/**
 * Inline data URL length of one normalized attachment.
 * @param block - one retained image occurrence.
 * @returns its base64 length, from the recorded encoded byte count.
 */
export function base64BytesOf(block: ImageBlock): number {
  // `bytes` is the exact encoded length of the normalized object, which is what
  // this adapter reads and base64-encodes. 4/3 plus padding is the exact
  // expansion, not an estimate: the bytes are read whole, never streamed.
  const recorded = block.attachment.bytes
  // A reference without a usable count is not budgeted as zero for a reason: the
  // session log always records it, so the only way to reach this branch is a
  // hand-built request, and counting it as the whole budget would offload an
  // entire conversation over a missing field.
  if (!Number.isFinite(recorded) || recorded <= 0) return 0
  return Math.ceil(recorded / 3) * 4
}

/**
 * How many oldest occurrences must be offloaded before this request fits.
 *
 * Zero means the request is within budget and nothing may be dropped.
 * @param messages - request history already carrying the surface's offload marks.
 * @param budget - limits and removal quanta for this route.
 * @returns the count to name in an `IMAGE_OFFLOAD_REQUIRED` failure.
 */
export function overBudgetOffloadCount(
  messages: readonly RequestMessage[],
  budget: ImageRequestBudget = DEFAULT_IMAGE_REQUEST_BUDGET,
): number {
  return requiredImageOffload(
    messages,
    {
      representation: 'base64',
      ...(budget.maxBytes === undefined ? {} : { maxBytes: budget.maxBytes }),
      ...(budget.maxImages === undefined ? {} : { maxImages: budget.maxImages }),
      ...(budget.byteQuantum === undefined ? {} : { byteQuantum: budget.byteQuantum }),
      ...(budget.countQuantum === undefined ? {} : { countQuantum: budget.countQuantum }),
    },
    base64BytesOf,
  )
}
