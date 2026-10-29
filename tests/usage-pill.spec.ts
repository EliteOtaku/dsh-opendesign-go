import { describe, expect, it } from 'vitest'
import { pillLabel, pillWindows, worstRemaining } from '../src/client/UsagePill.tsx'
import { compactWindowLabel } from '../src/client/usage-format.ts'
import type { QuotaWindow, UsageSnapshot } from '../src/usage-contract.ts'

const NOW = '2026-10-29T05:00:00.000Z'

function window(overrides: Partial<QuotaWindow> & { durationSeconds: number }): QuotaWindow {
  return {
    status: 'ok',
    usedCredits: '2500',
    limitCredits: '50000',
    remainingCredits: '47500',
    percentUsed: 5,
    resetsAt: NOW,
    ...overrides,
  }
}

function snapshot(windows: readonly QuotaWindow[]): UsageSnapshot {
  return { asOf: NOW, tier: 'go', eligible: true, windows }
}

describe('compactWindowLabel', () => {
  it('abbreviates the windows the console reports', () => {
    // The pill shares the composer tool row with the submit button, so `5 小时`
    // would not fit; both labels are derived from the same duration.
    expect(compactWindowLabel(18_000)).toBe('5h')
    expect(compactWindowLabel(604_800)).toBe('7d')
  })

  it('keeps a smaller unit rather than rounding up to a day', () => {
    expect(compactWindowLabel(3_600)).toBe('1h')
    expect(compactWindowLabel(1_800)).toBe('30m')
  })
})

describe('pillWindows', () => {
  it('reads remaining, not consumed, so the pill agrees with the settings card', () => {
    const rows = pillWindows(snapshot([
      window({ durationSeconds: 18_000, percentUsed: 38 }),
      window({ durationSeconds: 604_800, percentUsed: 12 }),
    ]))
    expect(rows.map((row) => row.remaining)).toEqual([62, 88])
  })

  it('drops a window the console could not price instead of calling it zero', () => {
    // "No limit reported" and "nothing left" are different facts, and the pill
    // has no room to explain the difference.
    const rows = pillWindows(snapshot([
      window({ durationSeconds: 18_000, status: 'unknown', percentUsed: null }),
      window({ durationSeconds: 604_800, percentUsed: 12 }),
    ]))
    expect(rows.map((row) => row.durationSeconds)).toEqual([604_800])
  })

  it('clamps a reading the console over-reported', () => {
    const rows = pillWindows(snapshot([window({ durationSeconds: 18_000, percentUsed: 104 })]))
    expect(rows[0]?.remaining).toBe(0)
  })

  it('returns nothing when nothing has been read yet', () => {
    expect(pillWindows(undefined)).toEqual([])
  })
})

describe('pillLabel', () => {
  it('joins windows into one short line', () => {
    const rows = pillWindows(snapshot([
      window({ durationSeconds: 18_000, percentUsed: 38 }),
      window({ durationSeconds: 604_800, percentUsed: 12 }),
    ]))
    expect(pillLabel(rows)).toBe('5h 62% · 7d 88%')
  })

  it('is empty with no rows, so the caller can hide instead of rendering a dash', () => {
    expect(pillLabel([])).toBe('')
  })
})

describe('worstRemaining', () => {
  it('reports the tightest window: averaging would hide a nearly-spent week', () => {
    const rows = pillWindows(snapshot([
      window({ durationSeconds: 18_000, percentUsed: 10 }),
      window({ durationSeconds: 604_800, percentUsed: 96 }),
    ]))
    expect(worstRemaining(rows)).toBe(4)
  })

  it('treats an empty list as healthy rather than as exhausted', () => {
    expect(worstRemaining([])).toBe(100)
  })
})
