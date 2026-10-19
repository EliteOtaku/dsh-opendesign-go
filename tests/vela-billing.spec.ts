import { describe, expect, it } from 'vitest'
import { readVelaUsage } from '../src/vela-billing.ts'

/**
 * These tests exercise the failure paths only.
 *
 * A successful read needs a real `vela` binary with a live login, which a test
 * cannot assume. What must be pinned is the opposite: a broken or absent CLI
 * yields a snapshot carrying `error` and never a fabricated number, because a
 * wrong quota bar is worse than an absent one.
 */
describe('readVelaUsage', () => {
  it('reports a missing binary as an error snapshot, not a throw', async () => {
    const snapshot = await readVelaUsage('/definitely/not/here/vela', 'ws-1')
    expect(snapshot.error).toBeDefined()
    expect(snapshot.windows).toEqual([])
    expect(snapshot.eligible).toBe(false)
  })

  it('still carries a timestamp so the page can show when it tried', async () => {
    const snapshot = await readVelaUsage('/definitely/not/here/vela', 'ws-1')
    expect(Number.isNaN(Date.parse(snapshot.asOf))).toBe(false)
  })

  it('explains an undetermined workspace instead of guessing one', async () => {
    // No explicit id and a binary that cannot answer means the workspace is
    // genuinely unknown; inventing one would read someone else's numbers.
    const snapshot = await readVelaUsage('/definitely/not/here/vela', undefined)
    expect(snapshot.error).toBeDefined()
    expect(snapshot.windows).toEqual([])
  })
})
