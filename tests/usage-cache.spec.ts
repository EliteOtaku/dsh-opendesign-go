import { describe, expect, it } from 'vitest'
import { parseUsage } from '../src/usage-contract.ts'

/** A well-formed cached snapshot, as the host writes it. */
const VALID = JSON.stringify({
  asOf: '2026-10-19T03:00:00.000Z',
  tier: 'go',
  eligible: true,
  windows: [
    {
      status: 'ok',
      durationSeconds: 18000,
      usedCredits: '0',
      limitCredits: '50000',
      remainingCredits: '50000',
      percentUsed: 0,
      resetsAt: '2026-10-19T04:31:15.000Z',
    },
    {
      status: 'ok',
      durationSeconds: 604800,
      usedCredits: '0',
      limitCredits: '150000',
      remainingCredits: '150000',
      percentUsed: 0,
      resetsAt: '2026-10-25T23:31:15.000Z',
    },
  ],
  wallet: { balanceUsd: '1.50', subscriptionPeriodEnd: '2026-11-19T00:00:00.000Z' },
})

describe('parseUsage', () => {
  it('reads the shape the host caches', () => {
    const snapshot = parseUsage(VALID)
    expect(snapshot?.tier).toBe('go')
    expect(snapshot?.windows).toHaveLength(2)
    // The real console reports credits, not dollars: 50000 for the 5-hour window.
    expect(snapshot?.windows[0]?.limitCredits).toBe('50000')
    expect(snapshot?.wallet?.balanceUsd).toBe('1.50')
  })

  it('treats an absent or empty cache as "never read", not as zero usage', () => {
    expect(parseUsage(undefined)).toBeUndefined()
    expect(parseUsage('')).toBeUndefined()
  })

  it('degrades to no reading when the document was edited into nonsense', () => {
    expect(parseUsage('{')).toBeUndefined()
    expect(parseUsage('null')).toBeUndefined()
    expect(parseUsage('{"asOf":"x"}')).toBeUndefined()
    expect(parseUsage('{"asOf":"x","tier":"go","eligible":true,"windows":"no"}')).toBeUndefined()
  })

  it('drops unusable windows instead of rendering them as zero', () => {
    const snapshot = parseUsage(JSON.stringify({
      asOf: '2026-10-19T03:00:00.000Z',
      tier: 'go',
      eligible: true,
      windows: [
        { durationSeconds: 18000, usedCredits: '0', limitCredits: '50000', remainingCredits: '50000', resetsAt: 'x' },
        { durationSeconds: 'bad' },
      ],
    }))
    expect(snapshot?.windows).toHaveLength(1)
  })

  it('keeps an error reading so the page can explain the failure', () => {
    const snapshot = parseUsage(JSON.stringify({
      asOf: '2026-10-19T03:00:00.000Z',
      tier: '',
      eligible: false,
      windows: [],
      error: 'console session expired or invalid',
    }))
    expect(snapshot?.error).toBe('console session expired or invalid')
    expect(snapshot?.windows).toEqual([])
  })

  it('accepts a reading with no wallet', () => {
    const snapshot = parseUsage(JSON.stringify({
      asOf: '2026-10-19T03:00:00.000Z', tier: 'go', eligible: true, windows: [],
    }))
    expect(snapshot?.wallet).toBeUndefined()
  })
})
