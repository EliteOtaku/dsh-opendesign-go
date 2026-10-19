import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetCountdown } from '../src/client/QuotaCard.tsx'

const NOW = Date.parse('2026-10-19T09:00:00.000Z')

afterEach(() => {
  vi.useRealTimers()
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
