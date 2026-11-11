import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

/** Quota readings the mocked `vela` reader was asked for. */
const reads: number[] = []

vi.mock('../src/vela-locate.ts', () => ({
  locateVela: () => ({ path: '/fake/vela', via: 'test' }),
}))

vi.mock('../src/vela-billing.ts', () => ({
  // A usable reading is all the cadence needs; the numbers are irrelevant here.
  readVelaUsage: async () => {
    reads.push(Date.now())
    return {
      asOf: new Date().toISOString(),
      tier: 'go',
      eligible: true,
      windows: [{
        status: 'ok',
        durationSeconds: 18_000,
        usedCredits: '1',
        limitCredits: '50000',
        remainingCredits: '49999',
        percentUsed: 0,
        resetsAt: new Date(Date.now() + 18_000_000).toISOString(),
      }],
    }
  },
}))

// Activation also asks the version endpoints and the gateway catalog. Both are
// network calls with nothing to do with the cadence under test, and a test must
// not need a network to answer this question.
vi.mock('../src/update-check.ts', () => ({
  fetchLatestRelease: async () => undefined,
  fetchLatestTag: async () => undefined,
  snapshotOf: () => ({ current: '0.0.0', checkedAt: 0 }),
}))

vi.mock('../src/catalog-fetch.ts', () => ({
  fetchGatewayModels: async () => [],
}))

import * as plugin from '../src/index.ts'

/**
 * The 60-second poll is the steady state, so a run has to keep reading after a
 * success. The regression this pins: the success path used to set the retry
 * counter to `maxRetries` — the "give up" value — so `readDue` answered false
 * forever and the card froze on that one reading while the plan kept spending.
 */
describe('quota polling after a readable answer', () => {
  beforeEach(() => {
    reads.length = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads again on the next interval instead of stopping at the first success', async () => {
    const ctx = new Context()
    plugin.apply(ctx as never, { useVelaCredential: true } as never)

    // The activation read happens outside the timer, so this is the baseline.
    await vi.advanceTimersByTimeAsync(0)
    const startup = reads.length
    expect(startup).toBeGreaterThan(0)

    await vi.advanceTimersByTimeAsync(61_000)
    expect(reads.length).toBe(startup + 1)

    // A second interval proves the counter was cleared, not merely decremented.
    await vi.advanceTimersByTimeAsync(61_000)
    expect(reads.length).toBe(startup + 2)
  })
})
