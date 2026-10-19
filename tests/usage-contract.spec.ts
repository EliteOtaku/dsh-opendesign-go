import { describe, expect, it } from 'vitest'
import {
  creditsToNumber,
  percentUsedOf,
  windowLabel,
} from '../src/usage-contract.ts'
import type { QuotaWindow, UsageSnapshot } from '../src/usage-contract.ts'

describe('windowLabel', () => {
  it('names the two windows the Go plan actually grants', () => {
    // Values read from the console payload, not from documentation.
    expect(windowLabel(18000)).toBe('5 小时')
    expect(windowLabel(604800)).toBe('7 天')
  })

  it('describes an unfamiliar window truthfully instead of guessing', () => {
    expect(windowLabel(3600)).toBe('1 小时')
    expect(windowLabel(172800)).toBe('2 天')
    expect(windowLabel(900)).toBe('15 分钟')
  })
})

describe('creditsToNumber', () => {
  it('accepts the decimal strings the console reports', () => {
    expect(creditsToNumber('0')).toBe(0)
    expect(creditsToNumber('120')).toBe(120)
    expect(creditsToNumber('0.25')).toBe(0.25)
    expect(creditsToNumber('1234.56')).toBe(1234.56)
  })

  it('refuses anything that is not a plain non-negative decimal', () => {
    expect(creditsToNumber('')).toBeNull()
    expect(creditsToNumber('-1')).toBeNull()
    expect(creditsToNumber('1e3')).toBeNull()
    expect(creditsToNumber('abc')).toBeNull()
    expect(creditsToNumber(' 1')).toBeNull()
  })
})

describe('percentUsedOf', () => {
  it('computes the share already consumed', () => {
    expect(percentUsedOf('0', '120')).toBe(0)
    expect(percentUsedOf('60', '120')).toBe(50)
    expect(percentUsedOf('120', '120')).toBe(100)
  })

  it('rounds to whole percent so the bar matches the console text', () => {
    expect(percentUsedOf('1', '3')).toBe(33)
    expect(percentUsedOf('2', '3')).toBe(67)
  })

  it('clamps instead of exceeding the bar', () => {
    expect(percentUsedOf('150', '120')).toBe(100)
  })

  it('returns null when the limit cannot support a percentage', () => {
    expect(percentUsedOf('10', '0')).toBeNull()
    expect(percentUsedOf('x', '120')).toBeNull()
  })
})

describe('snapshot vocabulary', () => {
  it('carries both windows plus the wallet that pays the overage', () => {
    const windows: QuotaWindow[] = [
      {
        status: 'ok',
        durationSeconds: 18000,
        usedCredits: '0',
        limitCredits: '0',
        remainingCredits: '0',
        percentUsed: null,
        resetsAt: '2026-10-19T10:00:00.000Z',
      },
    ]
    const snapshot: UsageSnapshot = {
      asOf: '2026-10-19T09:00:00.000Z',
      tier: 'go',
      eligible: true,
      windows,
      wallet: { balanceUsd: '1.50' },
    }
    expect(snapshot.windows).toHaveLength(1)
    expect(snapshot.wallet?.balanceUsd).toBe('1.50')
  })
})
