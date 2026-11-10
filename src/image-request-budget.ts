/**
 * Keep one request's inline image bytes under the gateway's body limit.
 *
 * Chat Completions carries images as `data:` URLs inside the request body, and
 * this adapter has no Files upload, so every image in the conversation history is
 * re-sent on every request. A session that accumulates screenshots or generated
 * rasters therefore grows without bound until the reverse proxy in front of the
 * gateway refuses the body outright:
 *
 * ```
 * HTTP 413  <center>Content-Type: text/html</center> <center>nginx</center>
 * ```
 *
 * That failure is not recoverable from the conversation. Compaction has to send
 * the same history, so it fails identically, and every later request fails the
 * same way — the session is dead for this route while being perfectly fine on any
 * other.
 *
 * Two mechanisms run in order, and both are needed:
 *
 * 1. `request-images.ts` derives every image at the route's declared dimensions
 *    and byte ceiling, so each occurrence costs what the reference adapters charge
 *    rather than whatever the user uploaded. On the measured session that alone
 *    takes the body from 55.06 MB to 30.48 MB.
 * 2. This module bounds what projection could not fix, through the harness's own
 *    `IMAGE_OFFLOAD_REQUIRED` contract: it names how many of the oldest
 *    occurrences must be dropped, `dsh-compaction-image-offload` records an
 *    `image/offload` selection, and the retry projects those occurrences as
 *    placeholder text. The same contract `dsh-llm-deepseek`, `dsh-llm-pi-ai` and
 *    the Command Code adapter follow, so one mechanism covers every route.
 *
 * What this module must not do is drop images on its own. An unlogged projection
 * would leave the session log claiming bytes that were never sent, and the model
 * would silently be answering about pictures it never saw.
 *
 * It must also count only what the request actually carries. Two kinds of
 * occurrence are excluded:
 *
 * - already-offloaded ones, because they project to placeholder text;
 * - assistant-side ones, because `conversion.ts` never replays them and the host
 *   reactor never selects an assistant node either. Counting a picture that is
 *   simultaneously impossible to send and impossible to offload is how a
 *   conversation reaches a failure it can never leave.
 *
 * @module dsh-opendesign-go/image-request-budget
 */
import { requiredImageOffload } from '@deepseek-ai/dsh-llm'
import type { ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm'

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
export const MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024

/**
 * Bytes one offload decision frees before the prefix stops growing.
 *
 * Removing only the minimum that clears the budget would make every new image
 * offload one more occurrence — one history rewrite per turn, and each rewrite
 * ends prompt-cache reuse from the first changed image. Advancing in whole quanta
 * means the removed prefix stays stable across several requests.
 */
export const IMAGE_OFFLOAD_BYTE_QUANTUM = 8 * 1024 * 1024

/** Image occurrences one request may carry, as a second, independent bound. */
export const MAX_REQUEST_IMAGES = 60

/** Occurrences one offload decision removes before the prefix stops growing. */
export const IMAGE_OFFLOAD_COUNT_QUANTUM = 20

/** How many oldest occurrences a route must still offload before this fits. */
export interface ImageRequestBudget {
  /** Inline bytes one request may carry, after base64 expansion. */
  readonly maxBytes?: number
  /** Image occurrences one request may carry. */
  readonly maxImages?: number
  /** Bytes one decision frees before the prefix stops growing. */
  readonly byteQuantum?: number
  /** Occurrences one decision removes before the prefix stops growing. */
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
 * Base64-expanded length of one encoded image.
 * @param encodedBytes - encoded length of the bytes actually sent.
 * @returns the length its `data:` URL adds to the body.
 */
export function inlineBytesOf(encodedBytes: number): number {
  if (!Number.isFinite(encodedBytes) || encodedBytes <= 0) return 0
  return Math.ceil(encodedBytes / 3) * 4
}

/**
 * Inline length of one occurrence, before any request version was derived.
 *
 * Only a fallback now that projection exists: it answers with the stored object's
 * encoded length, which is what the body carries when the store could not derive
 * a smaller version.
 * @param block - one retained image occurrence.
 * @returns its base64 length, from the recorded encoded byte count.
 */
export function base64BytesOf(block: ImageBlock): number {
  return inlineBytesOf(block.attachment.bytes)
}

/**
 * Whether one occurrence is both sent and selectable for offload.
 *
 * The host reactor walks `user/message` and `tool/result` events only, and
 * assistant images are not replayed by the projection either, so this predicate
 * is what keeps the demand describing exactly the set that costs body bytes.
 * @param message - request message carrying the occurrence.
 * @returns true when the occurrence costs body bytes this route can reclaim.
 */
export function isBudgeted(message: RequestMessage): boolean {
  return message.role === 'user' || message.role === 'tool'
}

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
export function planImageOffload(
  messages: readonly RequestMessage[],
  bytesOf: (block: ImageBlock) => number = base64BytesOf,
  budget: ImageRequestBudget = DEFAULT_IMAGE_REQUEST_BUDGET,
): number {
  const eligible = messages.filter(isBudgeted)
  // `requiredImageOffload` reads every `role`, so the filter above is what keeps
  // model output out of the demand; passing the unfiltered list is exactly the
  // bug that made a conversation of generated pictures unfixable.
  return requiredImageOffload(
    eligible,
    {
      representation: 'base64',
      ...(budget.maxBytes === undefined ? {} : { maxBytes: budget.maxBytes }),
      ...(budget.maxImages === undefined ? {} : { maxImages: budget.maxImages }),
      ...(budget.byteQuantum === undefined ? {} : { byteQuantum: budget.byteQuantum }),
      ...(budget.countQuantum === undefined ? {} : { countQuantum: budget.countQuantum }),
    },
    bytesOf,
  )
}
