import { describe, expect, it } from 'vitest'
import { costOf, summarize } from '../src/usage-ledger.ts'
import type { LedgerEntry } from '../src/usage-ledger.ts'
import { BASE_PRICES, priceOf } from '../src/pricing.ts'

const NOW = Date.parse('2026-10-19T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

/** One ledger entry with explicit cost. */
function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    at: NOW,
    model: 'deepseek-v4.1-flash',
    accountRef: 'OPENDESIGN_API_KEY',
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0.3,
    ...overrides,
  }
}

describe('price list', () => {
  it('carries the models the gateway actually serves', () => {
    expect(BASE_PRICES.length).toBe(35)
    const flash = priceOf('deepseek-v4.1-flash')
    expect(flash?.input).toBe(0.3)
    expect(flash?.output).toBe(1.2)
  })

  it('returns undefined for an unknown model instead of guessing a price', () => {
    expect(priceOf('not-a-model')).toBeUndefined()
  })
})

describe('costOf', () => {
  it('prices the three disjoint token buckets separately', () => {
    const price = { model: 'x', input: 1, output: 10, cacheRead: 0.1 }
    const cost = costOf(price, {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    })
    // 1 + 10 + 0.1
    expect(cost).toBeCloseTo(11.1, 6)
  })

  it('prices an absent rate as zero rather than failing', () => {
    // deepseek models publish no cacheWrite rate.
    const price = { model: 'x', input: 1, output: 1 }
    expect(costOf(price, { inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 999_999 })).toBe(1)
  })

  it('returns null when the model has no price', () => {
    expect(costOf(undefined, { inputTokens: 1000, outputTokens: 1000 })).toBeNull()
  })

  it('is zero for a call with no tokens', () => {
    expect(costOf({ model: 'x', input: 5, output: 5 }, { inputTokens: 0, outputTokens: 0 })).toBe(0)
  })
})

describe('summarize', () => {
  it('totals tokens and cost across models', () => {
    const report = summarize([
      entry({ model: 'a', inputTokens: 100, outputTokens: 10, costUsd: 0.5 }),
      entry({ model: 'b', inputTokens: 200, outputTokens: 20, costUsd: 0.25 }),
    ], NOW - DAY, NOW)
    expect(report.calls).toBe(2)
    expect(report.inputTokens).toBe(300)
    expect(report.outputTokens).toBe(30)
    expect(report.costUsd).toBeCloseTo(0.75, 6)
    expect(report.models).toHaveLength(2)
  })

  it('orders models by cost so the expensive one is first', () => {
    const report = summarize([
      entry({ model: 'cheap', costUsd: 0.01 }),
      entry({ model: 'pricey', costUsd: 9 }),
    ], NOW - DAY, NOW)
    expect(report.models[0]?.model).toBe('pricey')
  })

  it('counts tokens of an unpriced model but keeps it out of the dollar total', () => {
    const report = summarize([
      entry({ model: 'known', costUsd: 1, inputTokens: 100 }),
      entry({ model: 'unknown', costUsd: null, inputTokens: 500 }),
    ], NOW - DAY, NOW)
    // The tokens were really spent, so they are reported.
    expect(report.inputTokens).toBe(600)
    // But the money is incomplete, and the report says so.
    expect(report.costUsd).toBe(1)
    expect(report.unpricedCalls).toBe(1)
  })

  it('always labels the report as base-tier pricing', () => {
    expect(summarize([entry()], NOW - DAY, NOW).pricedAs).toBe('base-tier')
  })

  it('excludes entries outside the window', () => {
    const report = summarize([
      entry({ at: NOW - 40 * DAY, costUsd: 100 }),
      entry({ at: NOW, costUsd: 1 }),
    ], NOW - 30 * DAY, NOW)
    expect(report.calls).toBe(1)
    expect(report.costUsd).toBe(1)
  })

  it('reports an empty history as zeroes, not as missing data', () => {
    const report = summarize([], NOW - DAY, NOW)
    expect(report.calls).toBe(0)
    expect(report.models).toEqual([])
    expect(report.costUsd).toBe(0)
  })
})
