/**
 * Retry for a cached field the host refused to write.
 *
 * Every cached field is a poll of the outside world written into the profile
 * document, and each write makes the host take the profile's writer lock and
 * rewrite the whole composition document. That lock is shared with everything
 * else the host does, so a write can be refused for a reason that has nothing to
 * do with the value: the App rewriting its own composition at the same moment,
 * or a plugin install holding the lock for longer than the host's two-second
 * wait. The refusal is transient, and the next attempt a few seconds later
 * lands.
 *
 * Two kinds of field need this. `usageJson` and `reportJson` are republished by
 * a timer, so a missed write heals itself on the next poll. The two written
 * once per change — `diagnosticsJson` (deduplicated against what was already
 * published) and `updateJson` (one boot-time registry check) — would otherwise
 * stay wrong until the process restarts. That is not hypothetical: a write
 * refused at boot left the settings page reporting twelve declared models while
 * fourteen were registered.
 *
 * The retry is bounded, and every attempt recomputes the value: the plugin never
 * queues a stale snapshot, and a host that truly cannot write hears about it a
 * few times rather than forever.
 *
 * @module dsh-opendesign-go/cache-retry
 */
import { systemClock } from './throttle.ts'
import type { ThrottleClock } from './throttle.ts'

/** One value ready to publish, plus the identity that decides whether it changed. */
export interface CacheSnapshot {
  /**
   * What the value says, excluding any timestamp.
   *
   * The timestamp moves on every poll while the facts rarely do, so deduplication
   * keys on the facts alone: a field is republished when it has something new to
   * say, not because time passed.
   */
  readonly fingerprint: string
  /** The exact text to store, timestamp included. */
  readonly json: string
}

/** Retry control for one cached field. */
export interface CacheRetry {
  /**
   * Publish the current value, retrying while the host refuses it.
   *
   * A newer call supersedes the running chain: it recomputes the value anyway,
   * and two chains would race for the same lock.
   * @param snapshot - builds the value to publish; called once per attempt.
   * @param store - writes it; resolves true once the document carries it.
   * @returns whether the value reached the document within the retry budget.
   */
  publish(snapshot: () => CacheSnapshot, store: (json: string) => Promise<boolean>): Promise<boolean>
  /** Drop any pending retry, for example when the plugin is disposed. */
  dispose(): void
  /** Whether a retry is currently waiting. */
  readonly pending: boolean
}

/**
 * Build a retry controller.
 * @param options - the delays before each retry, an optional clock for tests, and
 * observers for the retry and for giving up.
 * @returns the controller.
 */
export function createCacheRetry(options: {
  delays: readonly number[]
  clock?: ThrottleClock
  /** Called before each wait, so a retry is visible in the log. */
  onRetry?: (delayMs: number, attempt: number) => void
  /** Called after the last attempt was refused; the caller reports it. */
  onGiveUp?: (attempts: number) => void
}): CacheRetry {
  const { delays, clock = systemClock, onRetry, onGiveUp } = options
  /** Which chain owns the field; bumping it retires the running one. */
  let current = 0
  let handle: unknown
  /** Wakes the sleep early when a newer chain or a disposal cancels it. */
  let wake: (() => void) | undefined
  /** Fingerprint the document was last seen to carry. */
  let stored: string | undefined

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
    const done = (): void => {
      handle = undefined
      wake = undefined
      resolve()
    }
    wake = done
    handle = clock.setTimer(ms, done)
  })

  /** Retire the running chain and drop its timer, if any. */
  const stop = (): void => {
    current += 1
    if (handle !== undefined) clock.clearTimer(handle)
    handle = undefined
    const pending = wake
    wake = undefined
    pending?.()
  }

  return {
    async publish(snapshot, store): Promise<boolean> {
      stop()
      const mine = current
      // The watermark advances only on a stored value. Recording it before the
      // write is what made one refusal permanent: every later poll found the
      // fingerprint already known and returned without touching the document.
      for (let attempt = 0; ; attempt += 1) {
        if (mine !== current) return false
        const { fingerprint, json } = snapshot()
        if (fingerprint === stored) return true
        if (await store(json)) {
          stored = fingerprint
          return true
        }
        const delayMs = delays[attempt]
        if (delayMs === undefined) {
          onGiveUp?.(attempt + 1)
          return false
        }
        onRetry?.(delayMs, attempt + 1)
        await sleep(delayMs)
      }
    },
    dispose(): void {
      stop()
    },
    get pending(): boolean {
      return handle !== undefined
    },
  }
}
