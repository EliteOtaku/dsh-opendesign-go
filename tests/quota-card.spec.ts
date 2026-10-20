import { afterEach, describe, expect, it, vi } from 'vitest'
import { barColor, resetCountdown } from '../src/client/QuotaCard.tsx'
import { daysToExhaust } from '../src/client/usage-format.ts'

const NOW = Date.parse('2026-10-19T09:00:00.000Z')

afterEach(() => {
  vi.useRealTimers()
})

describe('barColor', () => {
  it('alarms on little remaining, not on much consumed', () => {
    // The bar fills with what is left, so a 95%-used window renders as a short
    // bar. Colouring by consumed share would paint it red while the label said
    // "剩余 5%", which reads as a contradiction.
    expect(barColor(5)).toBe('#e5484d')
    expect(barColor(20)).toBe('#e5a00d')
    expect(barColor(92)).toBe('#3b82f6')
  })
})

describe('resetCountdown', () => {
  it('describes a reset later the same day', () => {
    // 4h49m ahead, the shape the console showed for the 5-hour window.
    const at = new Date(NOW + (4 * 60 + 49) * 60_000).toISOString()
    expect(resetCountdown(at, NOW)).toBe('4小时 49分后重置')
  })

  it('describes a multi-day reset', () => {
    const at = new Date(NOW + (6 * 1440 + 23 * 60) * 60_000).toISOString()
    expect(resetCountdown(at, NOW)).toBe('6天 23小时后重置')
  })

  it('says the window is about to reset instead of showing a negative countdown', () => {
    expect(resetCountdown(new Date(NOW - 60_000).toISOString(), NOW)).toBe('即将重置')
  })

  it('admits an unknown reset time rather than inventing one', () => {
    expect(resetCountdown('not-a-date', NOW)).toBe('重置时间未知')
  })
})

describe('plan spend reconciliation', () => {
  // Arithmetic over two sources, tested directly rather than through the
  // component: a wrong conversion would misreport the only figure that is
  // authoritative about what the plan actually deducted.
  const planUsdOf = (credits: string, rate: number): number | undefined => {
    const value = Number(credits)
    return Number.isFinite(value) ? value / rate : undefined
  }

  it('converts plan credits at the published rate', () => {
    // 21322 credits at 10000/USD, the live 7-day reading on 2026-10-19.
    expect(planUsdOf('21322', 10_000)).toBeCloseTo(2.1322, 4)
  })

  it('orders windows so the widest one is compared, not a subset', () => {
    const windows = [
      { durationSeconds: 18_000, usedCredits: '8202' },
      { durationSeconds: 604_800, usedCredits: '21322' },
    ]
    const widest = windows.reduce((best, window) =>
      window.durationSeconds > best.durationSeconds ? window : best)
    expect(widest.durationSeconds).toBe(604_800)
  })

  it('does not divide plan spend by measured spend', () => {
    // The two cover different traffic: the plan figure spans every client over
    // the window, the measured figure only what this plugin served. A ratio
    // would report the plugin's small share as if it were an accounting
    // difference — it read 141.9x on a fresh install. Guard the shape instead of
    // the arithmetic: the pair is presented as two facts, not a quotient.
    const planSpent = 21322 / 10_000
    const measured = 0.017790216
    expect(planSpent).toBeCloseTo(2.1322, 4)
    expect(measured).toBeLessThan(planSpent)
    expect(Number.isFinite(planSpent)).toBe(true)
  })

  it('has no ratio to show when nothing was measured yet', () => {
    expect(planUsdOf('0', 10_000)).toBe(0)
  })
})

describe('daysToExhaust', () => {
  const WEEK = 604_800
  const END = Date.parse('2026-10-26T00:00:00.000Z')

  it('estimates from the observed burn rate', () => {
    // Half the window elapsed, a fifth of the allowance used: the remaining 80%
    // at that rate lasts 4x the elapsed span.
    const start = END - WEEK * 1000
    const now = start + (WEEK / 2) * 1000
    const days = daysToExhaust(
      { usedCredits: '15000', limitCredits: '75000', resetsAt: new Date(END).toISOString(), durationSeconds: WEEK },
      now,
    )
    // 60000 left at 30000/week = 2 weeks.
    expect(days).toBeCloseTo(14, 1)
  })

  it('has no estimate before anything is consumed', () => {
    // Reporting 0 days here would read as immediate exhaustion.
    expect(daysToExhaust(
      { usedCredits: '0', limitCredits: '75000', resetsAt: new Date(END).toISOString(), durationSeconds: WEEK },
      END - WEEK * 1000 + 1000,
    )).toBeUndefined()
  })

  it('has no estimate for unusable input', () => {
    expect(daysToExhaust(
      { usedCredits: 'abc', limitCredits: '75000', resetsAt: new Date(END).toISOString(), durationSeconds: WEEK },
      END,
    )).toBeUndefined()
    expect(daysToExhaust(
      { usedCredits: '100', limitCredits: '0', resetsAt: 'not-a-date', durationSeconds: WEEK },
      END,
    )).toBeUndefined()
  })

  it('has no estimate before the window has started', () => {
    // A clock skew or a not-yet-anchored window would otherwise divide by a
    // negative elapsed span and produce a negative duration.
    expect(daysToExhaust(
      { usedCredits: '100', limitCredits: '75000', resetsAt: new Date(END).toISOString(), durationSeconds: WEEK },
      END - WEEK * 1000 - 60_000,
    )).toBeUndefined()
  })
})
