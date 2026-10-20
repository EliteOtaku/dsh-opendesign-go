import { describe, expect, it } from 'vitest'
import { readDue } from '../src/quota-cadence.ts'

/**
 * The rule a user feels: flipping "read quota through the local login" must show
 * a number immediately, while a steady state must not spawn a CLI subprocess
 * every interval.
 */
describe('readDue', () => {
  const base = { changed: false, retries: 0, maxRetries: 6, wantsUsage: true }

  it('reads as soon as the configuration changes', () => {
    // The switch was just flipped and the user is looking at the card. Even with
    // retries exhausted, a change is a new question and deserves a read.
    expect(readDue({ ...base, changed: true, retries: 6 })).toBe(true)
    expect(readDue({ ...base, changed: true, wantsUsage: false })).toBe(true)
  })

  it('does not read when the configuration does not want quota', () => {
    // The vela source is off and there is no session to consult, so a read would
    // spawn a subprocess to learn nothing.
    expect(readDue({ ...base, wantsUsage: false })).toBe(false)
  })

  it('retries a failed read up to the cap, then stops', () => {
    // A reachable source recovers within a few attempts; an unreachable one must
    // not cost a subprocess per interval forever.
    expect(readDue({ ...base, retries: 0 })).toBe(true)
    expect(readDue({ ...base, retries: 5 })).toBe(true)
    expect(readDue({ ...base, retries: 6 })).toBe(false)
    expect(readDue({ ...base, retries: 99 })).toBe(false)
  })
})
