import { describe, expect, it } from 'vitest'
import { nextRetries, readDue } from '../src/quota-cadence.ts'

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

describe('nextRetries', () => {
  it('keeps the streak while reads keep failing', () => {
    // The cap only bounds a source that will not answer.
    expect(nextRetries(2, false)).toBe(2)
  })

  it('clears the streak after a usable read, so polling carries on', () => {
    // Regression: the success path used to set the counter to `maxRetries`,
    // which is the "give up" value. `readDue` then answered false for the rest
    // of the session and the card froze on the first reading — the reported
    // symptom was a quota card stuck at one timestamp while the numbers behind
    // it kept moving.
    const base = { changed: false, maxRetries: 6, wantsUsage: true }
    const afterSuccess = nextRetries(3, true)
    expect(afterSuccess).toBe(0)
    expect(readDue({ ...base, retries: afterSuccess })).toBe(true)
  })
})
