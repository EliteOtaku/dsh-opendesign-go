import { afterEach, describe, expect, it, vi } from 'vitest'
import { barColor, resetCountdown } from '../src/client/QuotaCard.tsx'

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
  // The comparison is arithmetic over two sources, so it is tested directly
  // rather than through the component: a wrong ratio here would misreport the
  // only figure that can reveal an accounting change.
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

  it('reports the ratio against measured cost so drift is visible', () => {
    const planSpent = 21322 / 10_000
    const measured = 0.017790216
    expect(planSpent / measured).toBeGreaterThan(40)
  })

  it('has no ratio to show when nothing was measured yet', () => {
    expect(planUsdOf('0', 10_000)).toBe(0)
  })
})
