import { describe, expect, it } from 'vitest'
import type { ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm'
import {
  MAX_REQUEST_IMAGE_BYTES,
  MAX_REQUEST_IMAGES,
  base64BytesOf,
  overBudgetOffloadCount,
} from '../src/image-request-budget.ts'

/** One image occurrence of a known encoded size. */
function imageOf(bytes: number, offloaded = false): ImageBlock {
  return {
    type: 'image',
    attachment: { attachmentId: `sha256:${bytes}`, mediaType: 'image/png', bytes, width: 1, height: 1 } as ImageBlock['attachment'],
    ...(offloaded ? { offloaded: true as const } : {}),
  }
}

/** One user message carrying the given images. */
function turnOf(images: readonly ImageBlock[]): RequestMessage {
  return { role: 'user', content: [...images] }
}

describe('image request budget', () => {
  it('charges the exact base64 length of the recorded bytes', () => {
    // Not an estimate: the adapter reads the stored object whole and encodes it,
    // so 4/3 with padding is the exact number of characters on the wire.
    expect(base64BytesOf(imageOf(3))).toBe(4)
    expect(base64BytesOf(imageOf(1))).toBe(4)
    expect(base64BytesOf(imageOf(1000))).toBe(1336)
  })

  it('counts a reference with no usable byte count as free instead of infinite', () => {
    // A hand-built request can omit `bytes`; treating that as the whole budget
    // would offload an entire conversation over one missing field.
    for (const bytes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(base64BytesOf(imageOf(bytes))).toBe(0)
    }
  })

  it('asks for nothing when the request is within budget', () => {
    // The reported failure was a request of 20 images / 16.68 MB raw, i.e. 22.24
    // MB of base64. Anything at that size must ask for an offload.
    const small = Array.from({ length: 10 }, () => imageOf(200_000))
    expect(overBudgetOffloadCount([turnOf(small)])).toBe(0)
  })

  it('asks for an offload once the byte budget is exceeded', () => {
    // Five 8 MiB images: 13.3 MiB of base64 each, well past 24 MiB together.
    const heavy = Array.from({ length: 5 }, () => imageOf(8 * 1024 * 1024))
    const count = overBudgetOffloadCount([turnOf(heavy)])
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(heavy.length)
  })

  it('asks for an offload once the occurrence budget is exceeded', () => {
    // A conversation of many tiny images is the other way past the limit; a
    // byte-only budget would never fire on it.
    const many = Array.from({ length: MAX_REQUEST_IMAGES + 5 }, () => imageOf(1000))
    expect(overBudgetOffloadCount([turnOf(many)])).toBeGreaterThan(0)
  })

  it('ignores occurrences the surface already offloaded', () => {
    // The count is what the harness still has to remove. Counting marked
    // occurrences again would make the retry fail with the same demand forever.
    const kept = [imageOf(200_000)]
    const dropped = Array.from({ length: 30 }, () => imageOf(8 * 1024 * 1024, true))
    expect(overBudgetOffloadCount([turnOf([...kept, ...dropped])])).toBe(0)
  })

  it('advances in whole quanta, so a slightly larger history asks for the same prefix', () => {
    // Removing only what is needed would drop one more image every turn, and
    // each removal resets prompt-cache reuse from the first changed image. The
    // byte quantum rounds the target up, so a request that grew a little still
    // names the same prefix as the one before it.
    const base = Array.from({ length: 12 }, () => imageOf(8 * 1024 * 1024))
    const grown = [...base, imageOf(1024)]
    expect(overBudgetOffloadCount([turnOf(grown)]))
      .toBe(overBudgetOffloadCount([turnOf(base)]))
  })

  it('names a count that actually clears the budget when offloaded', () => {
    // The number is an instruction, not a diagnostic: offloading exactly this
    // many oldest occurrences has to leave a request that fits.
    const heavy = Array.from({ length: 12 }, () => imageOf(8 * 1024 * 1024))
    const messages = [turnOf(heavy)]
    const count = overBudgetOffloadCount(messages)
    expect(count).toBeGreaterThan(0)
    const offloaded = messages.map((message) => ({
      ...message,
      content: message.content.map((block, index) => (
        block.type === 'image' && index < count ? { ...block, offloaded: true as const } : block
      )),
    }))
    expect(overBudgetOffloadCount(offloaded as RequestMessage[])).toBe(0)
  })

  it('keeps the ceiling under the smallest measured gateway body limit', () => {
    // Command Code's gateway measured ≈50.17 MB; this sits well below so text,
    // tool declarations and framing still fit beside the images.
    expect(MAX_REQUEST_IMAGE_BYTES).toBeLessThan(30 * 1024 * 1024)
  })
})
