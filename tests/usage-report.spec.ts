import { describe, expect, it } from 'vitest'
import { parseReport } from '../src/usage-contract.ts'

/** A report as the host writes it. */
const VALID = JSON.stringify({
  since: 1_700_000_000_000,
  until: 1_700_100_000_000,
  calls: 3,
  inputTokens: 1500,
  outputTokens: 300,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0.42,
  unpricedCalls: 0,
  pricedAs: 'base-tier',
  models: [
    { model: 'deepseek-v4.1-flash', calls: 3, inputTokens: 1500, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.42, unpricedCalls: 0 },
  ],
})

describe('parseReport', () => {
  it('reads the cached local report', () => {
    const report = parseReport(VALID)
    expect(report?.calls).toBe(3)
    expect(report?.costUsd).toBeCloseTo(0.42, 6)
    expect(report?.models[0]?.model).toBe('deepseek-v4.1-flash')
  })

  it('treats absent or empty as no report rather than zero usage', () => {
    expect(parseReport(undefined)).toBeUndefined()
    expect(parseReport('')).toBeUndefined()
  })

  it('refuses a malformed document instead of fabricating figures', () => {
    expect(parseReport('{oops')).toBeUndefined()
    expect(parseReport('{}')).toBeUndefined()
    expect(parseReport('{"since":1,"until":2,"calls":3}')).toBeUndefined()
  })

  it('always reports base-tier pricing, whatever the document claimed', () => {
    // The label is a property of how this plugin prices, not of stored data, so
    // a stale or edited value cannot relabel it.
    const report = parseReport(JSON.stringify({ ...JSON.parse(VALID), pricedAs: 'exact-bill' }))
    expect(report?.pricedAs).toBe('base-tier')
  })

  it('skips unusable model rows but keeps the total', () => {
    const report = parseReport(JSON.stringify({
      ...JSON.parse(VALID),
      models: [{ model: 'ok', calls: 1, inputTokens: 1, outputTokens: 1, costUsd: 0 }, { model: 42 }],
    }))
    expect(report?.models).toHaveLength(1)
    expect(report?.calls).toBe(3)
  })
})
