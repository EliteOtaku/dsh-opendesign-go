/**
 * Leading-edge throttle for publishing a derived value into the profile.
 *
 * Every settings write makes the host lock the profile directory and rewrite the
 * whole composition document, which recomposes the plugin tree. A report
 * published once per model call would therefore rebuild the tree once per call,
 * which is far more expensive than the report is worth — the page is only read
 * while someone is looking at it.
 *
 * Leading edge rather than trailing: the first call after a quiet period goes
 * out at once, so a single request still updates the page immediately. Only a
 * burst is spread out.
 *
 * @module dsh-opendesign-go/throttle
 */

/** The clock and timer surface, injected so tests need no real waiting. */
export interface ThrottleClock {
  /** Current time in milliseconds. */
  now(): number
  /** Run `callback` after `ms` milliseconds; the handle is opaque. */
  setTimer(ms: number, callback: () => void): unknown
  /** Cancel a handle returned by {@link ThrottleClock.setTimer}. */
  clearTimer(handle: unknown): void
}

/** Leading-edge throttle over an arbitrary publish action. */
export interface Throttle {
  /**
   * Ask for a publish.
   *
   * Publishes now when the previous publish is older than the interval; otherwise
   * schedules exactly one publish for the moment the interval expires, however
   * many requests arrive meanwhile.
   * @param force - publish now regardless of the interval, cancelling any
   * scheduled publish; used when the user asked for the value explicitly.
   */
  request(force?: boolean): void
  /** Cancel a scheduled publish so a disposed plugin leaves no timer behind. */
  dispose(): void
  /** Whether a publish is currently scheduled. */
  readonly pending: boolean
}

/**
 * Build a throttle.
 * @param options - interval, clock, and the action to run at most that often.
 * @returns the throttle.
 */
export function createThrottle(options: {
  intervalMs: number
  clock: ThrottleClock
  publish: () => void
}): Throttle {
  const { intervalMs, clock, publish } = options
  /** When the last publish actually ran; undefined before the first one. */
  let lastAt: number | undefined
  let handle: unknown
  let scheduled = false

  return {
    request(force = false): void {
      const now = clock.now()
      const earliest = lastAt === undefined ? now : lastAt + intervalMs
      if (force || now >= earliest) {
        if (scheduled) clock.clearTimer(handle)
        scheduled = false
        handle = undefined
        lastAt = now
        publish()
        return
      }
      if (scheduled) return
      scheduled = true
      handle = clock.setTimer(earliest - now, () => {
        scheduled = false
        handle = undefined
        lastAt = clock.now()
        publish()
      })
    },
    dispose(): void {
      if (scheduled) clock.clearTimer(handle)
      scheduled = false
      handle = undefined
    },
    get pending(): boolean {
      return scheduled
    },
  }
}

/** Throttle clock backed by the host's real timers. */
export const systemClock: ThrottleClock = {
  now: () => Date.now(),
  setTimer: (ms, callback) => setTimeout(callback, ms),
  clearTimer: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>) },
}
