import { describe, expect, it } from 'vitest'
import {
  creditsToNumber,
  percentUsedOf,
  retainedReading,
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

describe('retainedReading', () => {
  const good: UsageSnapshot = {
    asOf: '2026-11-11T09:00:15.251Z',
    tier: 'go',
    eligible: true,
    windows: [
      {
        status: 'ok',
        durationSeconds: 18000,
        usedCredits: '11485',
        limitCredits: '50000',
        remainingCredits: '38515',
        percentUsed: 23,
        resetsAt: '2026-11-11T12:43:19.840Z',
      },
    ],
    wallet: { balanceUsd: '1.00' },
    creditsPerUsd: 10_000,
  }

  it('keeps the last numbers and the time they were read', () => {
    // A failed read has no quota to report. Publishing it as-is emptied the
    // card, so one transient upstream 503 looked like a broken setup; the page
    // already renders "部分数据缺失" plus the reading's own timestamp.
    const failed: UsageSnapshot = {
      asOf: '2026-11-11T09:12:00.000Z',
      tier: '',
      eligible: false,
      windows: [],
      error: 'vela billing funding-check failed: 503 billing_preflight_unavailable',
    }
    const reading = retainedReading(good, failed)
    expect(reading.windows).toHaveLength(1)
    expect(reading.wallet?.balanceUsd).toBe('1.00')
    expect(reading.creditsPerUsd).toBe(10_000)
    // The numbers keep the time they were actually read, so the page can say
    // they are older than they look instead of presenting them as current.
    expect(reading.asOf).toBe('2026-11-11T09:00:15.251Z')
    expect(reading.error).toBe(failed.error)
  })

  it('never returns stale figures without saying they are stale', () => {
    // A failure without a message would leave the page showing old bars as if
    // they were current; the fallback keeps that from happening.
    const reading = retainedReading(good, {
      asOf: '2026-11-11T09:12:00.000Z', tier: '', eligible: false, windows: [],
    })
    expect(reading.error).toBe('额度读取失败')
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
