/**
 * Reconcile the output reservation with the input budget.
 *
 * Chat Completions providers that this adapter talks to check
 * `input + max_tokens ≤ contextWindow` before running a request. The harness,
 * however, judges how full a conversation is from the context window alone and
 * never subtracts the output reservation, so a conversation at 60% of the window
 * can still be refused outright when the model advertises a large output cap.
 *
 * Two things follow, and both are handled here: the window reported to the
 * harness is the window *available to input*, and the reservation sent upstream
 * is clamped so that it always fits.
 *
 * @module dsh-opendesign-go/output-budget
 */

/**
 * Share of the context window that may be reserved for output.
 *
 * A quarter is enough to keep long answers from being truncated for ordinary
 * requests, and small enough that usable input stays recognisable as the model's
 * advertised window. Reserving the full advertised output cap instead would
 * leave some models with no input budget at all — a 256K-context model that also
 * advertises 256K output would report zero.
 */
export const OUTPUT_RESERVE_FRACTION = 0.25

/** Smallest reservation worth sending; below this a reply is cut mid-sentence. */
export const MIN_OUTPUT_TOKENS = 1_024

/**
 * Output tokens this model may reserve out of its window.
 * @param contextWindow - the model's advertised context window.
 * @param maxOutputTokens - the model's advertised maximum output.
 * @returns the reservation, never more than the window itself.
 */
export function reservedOutputTokens(contextWindow: number, maxOutputTokens: number): number {
  const share = Math.floor(contextWindow * OUTPUT_RESERVE_FRACTION)
  return Math.max(0, Math.min(maxOutputTokens, share, contextWindow))
}

/**
 * The part of the window a request may fill with input.
 *
 * This is what the harness is told the model's window is: it is the only number
 * that lets the harness decide when to compact, and reporting the advertised
 * window instead makes every compaction decision late by the size of the output
 * reservation.
 * @param contextWindow - the model's advertised context window.
 * @param maxOutputTokens - the model's advertised maximum output.
 * @returns the input budget, never zero.
 */
export function usableInputTokens(contextWindow: number, maxOutputTokens: number): number {
  const usable = contextWindow - reservedOutputTokens(contextWindow, maxOutputTokens)
  return usable > 0 ? usable : contextWindow
}

/**
 * Clamp the output reservation so the request fits the window.
 * @param requested - the reservation the caller or the model table asked for.
 * @param contextWindow - the model's advertised context window.
 * @param estimatedInputTokens - conservative estimate of this request's prompt.
 * @returns the reservation to send, or undefined when even the minimum cannot fit.
 */
export function fitMaxTokens(
  requested: number,
  contextWindow: number,
  estimatedInputTokens: number,
): number | undefined {
  const room = contextWindow - estimatedInputTokens
  if (!Number.isFinite(room)) return requested
  if (room < MIN_OUTPUT_TOKENS) {
    // The prompt already fills the window, so any reservation is refused. Omitting
    // the field is the only shape the provider accepts here; it then picks an
    // output size itself, which is small but is this request's only way through.
    return undefined
  }
  return requested > room ? Math.floor(room) : requested
}

/**
 * Conservative estimate of the prompt tokens a projected request will cost.
 *
 * Deliberately errs high: an over-estimate only shortens the reservation, while
 * an under-estimate is refused by the provider. ASCII text measured at ~4.4
 * characters per token and CJK at ~2, so runs are counted separately rather than
 * averaging the two. Image parts are counted at their documented per-image cap
 * rather than at the length of their base64 payload, which would overstate a
 * photograph by three orders of magnitude.
 * @param messages - projected Chat Completions messages.
 * @param tools - projected tool declarations, if any.
 * @param imageTokens - tokens to charge per image part.
 * @returns an estimate at or above the true prompt size.
 */
export function estimatePromptTokens(
  messages: readonly unknown[],
  tools: readonly unknown[] | undefined,
  imageTokens = 1_024,
): number {
  let asciiChars = 0
  let wideChars = 0
  let images = 0

  /** Walk one projected value, charging strings and image parts. */
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const char of value) {
        if (char.codePointAt(0)! < 0x80) asciiChars += 1
        else wideChars += 1
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (value === null || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (record.type === 'image_url') {
      images += 1
      return
    }
    for (const key of Object.keys(record)) walk(record[key])
  }

  walk(messages)
  if (tools !== undefined) walk(tools)

  // 3.5 chars/token for ASCII sits below the measured 4.4 so token-dense text
  // (code, JSON, punctuation) is not under-counted; wide characters measured 2.
  return Math.ceil(asciiChars / 3.5) + Math.ceil(wideChars / 2) + images * imageTokens
}
