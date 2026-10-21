import { describe, expect, it } from 'vitest'
import {
  MIN_OUTPUT_TOKENS,
  OUTPUT_RESERVE_FRACTION,
  estimatePromptTokens,
  fitMaxTokens,
  reservedOutputTokens,
  usableInputTokens,
} from '../src/output-budget.ts'

describe('output budget', () => {
  it('reserves a quarter of the window, capped by the model output limit', () => {
    // 1M window, 384K output: the quarter share wins.
    expect(reservedOutputTokens(1_000_000, 384_000)).toBe(250_000)
    // 1M window, 64K output: the model cap wins because it is smaller.
    expect(reservedOutputTokens(1_000_000, 64_000)).toBe(64_000)
    // 128K window, 128K output: a quarter, not the whole window.
    expect(reservedOutputTokens(128_000, 128_000)).toBe(32_000)
    expect(OUTPUT_RESERVE_FRACTION).toBe(0.25)
  })

  it('reports the input budget, which is what the harness measures against', () => {
    // Reporting the advertised window instead makes every compaction decision
    // late by the reservation, which is how a conversation at 60% of the window
    // was still refused as too long.
    expect(usableInputTokens(1_000_000, 384_000)).toBe(750_000)
    expect(usableInputTokens(1_000_000, 64_000)).toBe(936_000)
    // A model advertising an output as large as its window must not report zero.
    expect(usableInputTokens(262_144, 262_144)).toBe(196_608)
  })

  it('never reports a zero or negative window', () => {
    // Even a window smaller than the smallest sensible reservation stays usable.
    expect(usableInputTokens(1_000, 10_000)).toBeGreaterThan(0)
    expect(reservedOutputTokens(1_000, 10_000)).toBe(250)
    expect(usableInputTokens(0, 10_000)).toBe(0)
  })

  it('keeps the requested reservation when the prompt leaves room', () => {
    expect(fitMaxTokens(384_000, 1_048_576, 100_000)).toBe(384_000)
    expect(fitMaxTokens(4_096, 1_048_576, 900_000)).toBe(4_096)
  })

  it('clamps the reservation to the room left by the prompt', () => {
    // 1M window with a 900K prompt leaves ~148K; asking for 384K must not fail
    // the whole request when 148K is available.
    expect(fitMaxTokens(384_000, 1_048_576, 900_000)).toBe(148_576)
  })

  it('omits the reservation entirely when the prompt already fills the window', () => {
    // Sending any reservation here is refused, and sending the advertised one is
    // what produced "context window exceeded" at a third of the real window.
    expect(fitMaxTokens(384_000, 1_048_576, 1_048_000)).toBeUndefined()
    expect(fitMaxTokens(384_000, 1_048_576, 1_200_000)).toBeUndefined()
    expect(MIN_OUTPUT_TOKENS).toBe(1_024)
  })

  it('estimates ASCII and wide text at their own rates, not a shared average', () => {
    /** Strip the structural characters the JSON envelope adds. */
    const content = (text: string): unknown[] => [{ role: 'user', content: text }]
    const ascii = estimatePromptTokens(content('a'.repeat(3_500)), undefined)
    // Measured upstream at ~4.4 chars/token; the estimate sits below that so
    // token-dense text (code, JSON) is never under-counted.
    expect(ascii).toBeGreaterThanOrEqual(1_000)
    expect(ascii).toBeLessThanOrEqual(1_100)

    // CJK measured ~2 chars/token: twice the tokens per character of ASCII.
    const cjk = estimatePromptTokens(content('中'.repeat(2_000)), undefined)
    expect(cjk).toBeGreaterThanOrEqual(1_000)
    expect(cjk).toBeLessThanOrEqual(1_100)
  })

  it('charges an image a flat rate instead of the length of its data URL', () => {
    const huge = `data:image/jpeg;base64,${'A'.repeat(2_000_000)}`
    const estimated = estimatePromptTokens(
      [{ role: 'user', content: [{ type: 'image_url', image_url: { url: huge } }] }],
      undefined,
    )
    // A photograph costs ~1000 tokens upstream while its base64 payload is
    // ~2M characters; counting those would overstate it three orders of
    // magnitude and refuse requests that fit comfortably.
    expect(estimated).toBeLessThan(1_200)
  })

  it('counts tool declarations, because they ride in the same input budget', () => {
    const message = [{ role: 'user', content: 'hi' }]
    const withoutTools = estimatePromptTokens(message, undefined)
    const withTools = estimatePromptTokens(message, [
      { type: 'function', function: { name: 'a', description: 'b'.repeat(3_500), parameters: {} } },
    ])
    // 326 declarations cost ~163K tokens on this host's real tool set; ignoring
    // them makes every estimate a third too small.
    expect(withTools - withoutTools).toBeGreaterThanOrEqual(1_000)
    expect(withTools - withoutTools).toBeLessThanOrEqual(1_100)
  })
})
