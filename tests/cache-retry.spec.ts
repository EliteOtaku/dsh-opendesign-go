import { describe, expect, it } from 'vitest'
import { createCacheRetry } from '../src/cache-retry.ts'
import type { ThrottleClock } from '../src/throttle.ts'

/**
 * Clock whose timers fire only when the test advances it.
 *
 * The real controller waits tens of seconds between attempts; every test here
 * must therefore observe the wait rather than serve it. Advancing also proves the
 * chain really armed a timer instead of spinning.
 */
interface FakeClock extends ThrottleClock {
  /** Run the earliest pending timer, if any. */
  advance(): void
  /** Number of timers still armed. */
  readonly armed: number
}

function fakeClock(): FakeClock {
  let now = 0
  let nextId = 1
  const timers = new Map<number, { at: number, callback: () => void }>()
  return {
    now: () => now,
    setTimer: (ms, callback) => {
      const id = nextId
      nextId += 1
      timers.set(id, { at: now + ms, callback })
      return id
    },
    clearTimer: (handle) => { timers.delete(handle as number) },
    advance: () => {
      const entries = [...timers.entries()].sort((left, right) => left[1].at - right[1].at)
      const first = entries[0]
      if (first === undefined) return
      timers.delete(first[0])
      now = first[1].at
      first[1].callback()
    },
    get armed() { return timers.size },
  }
}

/** One publishable value with a fixed fingerprint. */
const snapshot = (fingerprint: string): () => { fingerprint: string, json: string } => () => ({
  fingerprint,
  json: JSON.stringify({ fingerprint }),
})

/** Wait for queued microtasks so a pending `publish` can reach its first await. */
const settle = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve() }

describe('createCacheRetry', () => {
  it('stores once and skips the write while the fingerprint is unchanged', async () => {
    const clock = fakeClock()
    const retry = createCacheRetry({ delays: [1_000], clock })
    const stored: string[] = []
    const store = async (json: string): Promise<boolean> => { stored.push(json); return true }
    await retry.publish(snapshot('a'), store)
    await retry.publish(snapshot('a'), store)
    expect(stored).toHaveLength(1)
  })

  it('retries a refused write and stops as soon as one lands', async () => {
    const clock = fakeClock()
    const retry = createCacheRetry({ delays: [1_000, 5_000], clock })
    let attempts = 0
    const store = async (): Promise<boolean> => {
      attempts += 1
      return attempts >= 2
    }
    const done = retry.publish(snapshot('a'), store)
    await settle()
    expect(attempts).toBe(1)
    clock.advance()
    await expect(done).resolves.toBe(true)
    expect(attempts).toBe(2)
  })

  it('gives up after the last delay and reports how many attempts were made', async () => {
    const clock = fakeClock()
    const gaveUp: number[] = []
    const retry = createCacheRetry({
      delays: [1_000, 2_000],
      clock,
      onGiveUp: (attempts) => { gaveUp.push(attempts) },
    })
    let attempts = 0
    const done = retry.publish(snapshot('a'), async () => { attempts += 1; return false })
    await settle()
    clock.advance()
    await settle()
    clock.advance()
    await expect(done).resolves.toBe(false)
    // Three attempts for two delays: the first, then one after each wait.
    expect(attempts).toBe(3)
    expect(gaveUp).toEqual([3])
  })

  it('does not remember a refused value, so the next call tries again', async () => {
    // The bug this module exists for: recording the fingerprint before the write
    // succeeded made one refusal permanent, because every later poll matched the
    // remembered value and returned without touching the document.
    const clock = fakeClock()
    const retry = createCacheRetry({ delays: [], clock })
    const results = [false, true]
    let attempts = 0
    await retry.publish(snapshot('a'), async () => {
      attempts += 1
      return results.shift() ?? true
    })
    expect(attempts).toBe(1)
    await retry.publish(snapshot('a'), async () => {
      attempts += 1
      return true
    })
    expect(attempts).toBe(2)
  })

  it('recomputes the value on every attempt instead of replaying a stale one', async () => {
    const clock = fakeClock()
    const retry = createCacheRetry({ delays: [1_000], clock })
    const seen: string[] = []
    let round = 0
    const done = retry.publish(
      () => {
        round += 1
        return { fingerprint: `v${round}`, json: `json-${round}` }
      },
      async (json) => {
        seen.push(json)
        return json === 'json-2'
      },
    )
    await settle()
    clock.advance()
    await expect(done).resolves.toBe(true)
    expect(seen).toEqual(['json-1', 'json-2'])
  })

  it('lets a newer call supersede a waiting retry and drops its timer', async () => {
    const clock = fakeClock()
    const retry = createCacheRetry({ delays: [10_000], clock })
    let first = 0
    const stale = retry.publish(snapshot('a'), async () => { first += 1; return false })
    await settle()
    expect(retry.pending).toBe(true)
    const fresh = retry.publish(snapshot('b'), async () => true)
    await expect(fresh).resolves.toBe(true)
    // The superseded chain resolves instead of waiting out its timer.
    await expect(stale).resolves.toBe(false)
    expect(retry.pending).toBe(false)
    expect(first).toBe(1)
  })

  it('cancels a waiting retry when the plugin is disposed', async () => {
    const clock = fakeClock()
    const retry = createCacheRetry({ delays: [10_000], clock })
    const done = retry.publish(snapshot('a'), async () => false)
    await settle()
    expect(retry.pending).toBe(true)
    retry.dispose()
    expect(retry.pending).toBe(false)
    await expect(done).resolves.toBe(false)
  })

  it('reports each wait before taking it', async () => {
    const clock = fakeClock()
    const waits: number[] = []
    const retry = createCacheRetry({
      delays: [3_000, 12_000],
      clock,
      onRetry: (delayMs) => { waits.push(delayMs) },
    })
    const done = retry.publish(snapshot('a'), async () => false)
    await settle()
    clock.advance()
    await settle()
    clock.advance()
    await done
    expect(waits).toEqual([3_000, 12_000])
  })
})
