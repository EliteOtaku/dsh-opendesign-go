import { describe, expect, it, vi } from 'vitest'
import { createThrottle } from '../src/throttle.ts'
import type { ThrottleClock } from '../src/throttle.ts'

/** A clock whose time only moves when a test says so. */
function fakeClock(): ThrottleClock & { advance(ms: number): void, timers: number } {
  let now = 0
  const timers: { at: number, callback: () => void }[] = []
  return {
    now: () => now,
    setTimer: (ms: number, callback: () => void) => {
      timers.push({ at: now + ms, callback })
      return timers.length - 1
    },
    clearTimer: (handle: unknown) => {
      timers[handle as number] = { at: Infinity, callback: () => undefined }
    },
    get timers() { return timers.filter((timer) => timer.at !== Infinity).length },
    advance(ms: number): void {
      now += ms
      for (const timer of [...timers]) {
        if (timer.at > now) continue
        timer.at = Infinity
        timer.callback()
      }
    },
  }
}

describe('createThrottle', () => {
  it('publishes the first request immediately', () => {
    const clock = fakeClock()
    const publish = vi.fn()
    const throttle = createThrottle({ intervalMs: 1_000, clock, publish })
    throttle.request()
    expect(publish).toHaveBeenCalledTimes(1)
    expect(throttle.pending).toBe(false)
  })

  it('collapses a burst into one trailing publish', () => {
    // The point of the throttle: a hundred model calls in nine seconds must not
    // become a hundred profile writes.
    const clock = fakeClock()
    const publish = vi.fn()
    const throttle = createThrottle({ intervalMs: 1_000, clock, publish })
    throttle.request()
    for (let index = 0; index < 90; index += 1) {
      clock.advance(10)
      throttle.request()
    }
    expect(publish).toHaveBeenCalledTimes(1)
    expect(throttle.pending).toBe(true)
    clock.advance(1_000)
    expect(publish).toHaveBeenCalledTimes(2)
    expect(throttle.pending).toBe(false)
  })

  it('publishes again once the interval has passed', () => {
    const clock = fakeClock()
    const publish = vi.fn()
    const throttle = createThrottle({ intervalMs: 1_000, clock, publish })
    throttle.request()
    clock.advance(999)
    throttle.request()
    expect(publish).toHaveBeenCalledTimes(1)
    clock.advance(2)
    // The scheduled publish fires at the interval boundary, before this request.
    expect(publish).toHaveBeenCalledTimes(2)
    clock.advance(1_000)
    throttle.request()
    expect(publish).toHaveBeenCalledTimes(3)
  })

  it('drops a scheduled publish when disposed', () => {
    const clock = fakeClock()
    const publish = vi.fn()
    const throttle = createThrottle({ intervalMs: 1_000, clock, publish })
    throttle.request()
    throttle.request()
    expect(throttle.pending).toBe(true)
    throttle.dispose()
    expect(throttle.pending).toBe(false)
    clock.advance(10_000)
    expect(publish).toHaveBeenCalledTimes(1)
  })
})
