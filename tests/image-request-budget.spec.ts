import { describe, expect, it } from 'vitest'
import type { ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm'
import {
  IMAGE_OFFLOAD_COUNT_QUANTUM,
  MAX_REQUEST_IMAGE_BYTES,
  MAX_REQUEST_IMAGES,
  base64BytesOf,
  inlineBytesOf,
  planImageOffload,
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

/** One assistant message carrying the given images. */
function producedOf(images: readonly ImageBlock[]): RequestMessage {
  return { role: 'assistant', content: [{ type: 'text', text: '生成好了' }, ...images] }
}

describe('image request budget', () => {
  it('charges the exact base64 length of the bytes actually sent', () => {
    // Not an estimate: the adapter inlines the whole object and encodes it, so
    // 4/3 with padding is the exact number of characters on the wire.
    expect(inlineBytesOf(3)).toBe(4)
    expect(inlineBytesOf(1)).toBe(4)
    expect(inlineBytesOf(1000)).toBe(1336)
  })

  it('falls back to the stored size when no request version was derived', () => {
    expect(base64BytesOf(imageOf(1000))).toBe(1336)
    // A hand-built request can omit `bytes`; treating that as the whole budget
    // would offload an entire conversation over one missing field.
    for (const bytes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(base64BytesOf(imageOf(bytes))).toBe(0)
    }
  })

  it('asks for nothing when the request is within budget', () => {
    const small = Array.from({ length: 10 }, () => imageOf(200_000))
    expect(planImageOffload([turnOf(small)])).toBe(0)
  })

  it('asks for an offload once the byte budget is exceeded', () => {
    // Five 8 MiB images: 10.7 MiB of base64 each, well past 20 MiB together.
    const heavy = Array.from({ length: 5 }, () => imageOf(8 * 1024 * 1024))
    const count = planImageOffload([turnOf(heavy)])
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(heavy.length)
  })

  it('asks for an offload once the occurrence budget is exceeded', () => {
    // A conversation of many tiny images is the other way past the limit; a
    // byte-only budget would never fire on it.
    const many = Array.from({ length: MAX_REQUEST_IMAGES + 5 }, () => imageOf(1000))
    expect(planImageOffload([turnOf(many)])).toBeGreaterThan(0)
  })

  it('ignores occurrences the surface already offloaded', () => {
    // The count is what the harness still has to remove. Counting marked
    // occurrences again would make the retry fail with the same demand forever.
    const kept = [imageOf(200_000)]
    const dropped = Array.from({ length: 30 }, () => imageOf(8 * 1024 * 1024, true))
    expect(planImageOffload([turnOf([...kept, ...dropped])])).toBe(0)
  })

  it('never counts a picture the host cannot select and the route never sends', () => {
    // Assistant images are excluded twice over: `conversion.ts` does not replay
    // them and the host reactor does not select an assistant node. Counting them
    // would name a selection that can never be recorded, so the conversation
    // would fail every request with no way out.
    const produced = Array.from({ length: 8 }, () => imageOf(8 * 1024 * 1024))
    expect(planImageOffload([producedOf(produced)])).toBe(0)
  })

  it('counts only the input side of a mixed history', () => {
    // Two user images well over budget plus any amount of model output: the
    // answer must be satisfiable by offloading the user ones alone.
    const mixed = [
      turnOf([imageOf(8 * 1024 * 1024), imageOf(8 * 1024 * 1024)]),
      producedOf([imageOf(8 * 1024 * 1024), imageOf(8 * 1024 * 1024)]),
    ]
    const count = planImageOffload(mixed)
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(2)
  })

  it('names a count that actually clears the budget when offloaded', () => {
    // The number is an instruction, not a diagnostic: offloading exactly this
    // many oldest occurrences has to leave a request that fits.
    const heavy = Array.from({ length: 12 }, () => imageOf(8 * 1024 * 1024))
    const messages = [turnOf(heavy)]
    const count = planImageOffload(messages)
    expect(count).toBeGreaterThan(0)
    const offloaded = messages.map((message) => ({
      ...message,
      content: message.content.map((block, index) => (
        block.type === 'image' && index < count ? { ...block, offloaded: true as const } : block
      )),
    }))
    expect(planImageOffload(offloaded as RequestMessage[])).toBe(0)
  })

  it('advances past the minimum, so a slightly larger history keeps the same prefix', () => {
    // Removing only what is needed would drop one more image every turn, and each
    // removal resets prompt-cache reuse from the first changed image. The count
    // quantum keeps the prefix identical for a history that grew by one picture.
    const base = Array.from({ length: 12 }, () => imageOf(8 * 1024 * 1024))
    const grown = [...base, imageOf(1024)]
    expect(planImageOffload([turnOf(grown)])).toBe(planImageOffload([turnOf(base)]))
  })

  it('never asks for more occurrences than the history has', () => {
    // A quantum larger than the conversation would demand removals that do not
    // exist, which the host cannot satisfy either.
    const heavy = Array.from({ length: 3 }, () => imageOf(8 * 1024 * 1024))
    expect(planImageOffload([turnOf(heavy)])).toBeLessThanOrEqual(heavy.length)
    expect(IMAGE_OFFLOAD_COUNT_QUANTUM).toBeLessThan(MAX_REQUEST_IMAGES)
  })

  it('keeps the ceiling at the reference adapter bound', () => {
    // dsh-llm-pi-ai enforces the same 20 MiB for its base64 representation.
    expect(MAX_REQUEST_IMAGE_BYTES).toBe(20 * 1024 * 1024)
  })
})
