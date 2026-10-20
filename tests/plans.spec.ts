import { describe, expect, it } from 'vitest'
import {
  PLAN_SPECS,
  parsePlanOverrides,
  parseBaseline,
  planOf,
} from '../src/plans.ts'
import type { PlanTier } from '../src/plans.ts'

describe('PLAN_SPECS', () => {
  it('carries the four published tiers at their advertised values', () => {
    // Read from the official pricing page on 2026-10-20; a change here means
    // the page moved, so the failure should name the tier.
    expect(PLAN_SPECS.go).toEqual({ monthlyUsd: 10, monthlyCapUsd: 120 })
    expect(PLAN_SPECS.plus).toEqual({ monthlyUsd: 20, monthlyCapUsd: 180 })
    expect(PLAN_SPECS.pro).toEqual({ monthlyUsd: 100, monthlyCapUsd: 480 })
    expect(PLAN_SPECS.max).toEqual({ monthlyUsd: 200, monthlyCapUsd: 900 })
  })

  it('publishes exactly those tiers', () => {
    expect(Object.keys(PLAN_SPECS).sort()).toEqual(['go', 'max', 'plus', 'pro'])
  })
})

describe('parsePlanOverrides', () => {
  it('returns an empty map for missing or blank input', () => {
    expect(parsePlanOverrides(undefined)).toEqual({})
    expect(parsePlanOverrides('')).toEqual({})
    expect(parsePlanOverrides('   ')).toEqual({})
    expect(parsePlanOverrides(',, ,')).toEqual({})
  })

  it('reads the documented `tier:cap` pairs', () => {
    expect(parsePlanOverrides('go:150')).toEqual({ go: 150 })
    expect(parsePlanOverrides('go:150,plus:200')).toEqual({ go: 150, plus: 200 })
    expect(parsePlanOverrides(' go:150 , plus:200 ')).toEqual({ go: 150, plus: 200 })
    expect(parsePlanOverrides('max:999.5')).toEqual({ max: 999.5 })
  })

  it('ignores an unknown tier but keeps its neighbours', () => {
    expect(parsePlanOverrides('ultra:500')).toEqual({})
    expect(parsePlanOverrides('ultra:500,go:150')).toEqual({ go: 150 })
    expect(parsePlanOverrides('GO:150')).toEqual({})
  })

  it('ignores a non-positive cap but keeps its neighbours', () => {
    expect(parsePlanOverrides('go:0')).toEqual({})
    expect(parsePlanOverrides('go:-10')).toEqual({})
    expect(parsePlanOverrides('go:-10,plus:200')).toEqual({ plus: 200 })
  })

  it('ignores a malformed pair but keeps its neighbours', () => {
    expect(parsePlanOverrides('go')).toEqual({})
    expect(parsePlanOverrides('go:')).toEqual({})
    expect(parsePlanOverrides(':150')).toEqual({})
    expect(parsePlanOverrides('go:1:5')).toEqual({})
    expect(parsePlanOverrides('go=150')).toEqual({})
    // `1e3` and `1_000` are numbers in JavaScript but not in this format, and
    // accepting them would hide a typo behind a plausible-looking cap.
    expect(parsePlanOverrides('go:1e3')).toEqual({})
    expect(parsePlanOverrides('go:1_000')).toEqual({})
    expect(parsePlanOverrides('go:NaN')).toEqual({})
    expect(parsePlanOverrides('go:abc,pro:480')).toEqual({ pro: 480 })
  })

  it('lets the last duplicate win so a value can be appended', () => {
    expect(parsePlanOverrides('go:150,go:175')).toEqual({ go: 175 })
  })
})

describe('planOf', () => {
  it('returns the built-in spec when nothing is overridden', () => {
    expect(planOf('go', {})).toEqual({ monthlyUsd: 10, monthlyCapUsd: 120 })
    expect(planOf('max', {})).toEqual({ monthlyUsd: 200, monthlyCapUsd: 900 })
  })

  it('applies an override to the cap only', () => {
    const overrides = parsePlanOverrides('go:150,plus:200')
    expect(planOf('go', overrides)).toEqual({ monthlyUsd: 10, monthlyCapUsd: 150 })
    expect(planOf('plus', overrides)).toEqual({ monthlyUsd: 20, monthlyCapUsd: 200 })
  })

  it('never lets an override rewrite monthlyUsd', () => {
    // The fee is a fact of the purchase; only the cap is the user's claim.
    const spec = planOf('pro', parsePlanOverrides('pro:800.25'))
    expect(spec?.monthlyCapUsd).toBe(800.25)
    expect(spec?.monthlyUsd).toBe(100)
  })

  it('returns undefined for a tier it does not publish', () => {
    expect(planOf('ultra', {})).toBeUndefined()
    expect(planOf('', {})).toBeUndefined()
    expect(planOf('GO', {})).toBeUndefined()
    // An override for one tier must not make another tier resolvable.
    expect(planOf('ultra', { go: 150 })).toBeUndefined()
  })

  it('falls back to the built-in cap when a hand-built override is unusable', () => {
    // Callers can build the map without the parser, so a bad number must not
    // reach the UI as `$NaN`.
    const broken = { go: Number.NaN, plus: 0 } as Partial<Record<PlanTier, number>>
    expect(planOf('go', broken)).toEqual({ monthlyUsd: 10, monthlyCapUsd: 120 })
    expect(planOf('plus', broken)).toEqual({ monthlyUsd: 20, monthlyCapUsd: 180 })
  })

  it('does not mutate the built-in table', () => {
    const spec = planOf('go', parsePlanOverrides('go:999'))
    expect(spec?.monthlyCapUsd).toBe(999)
    expect(PLAN_SPECS.go.monthlyCapUsd).toBe(120)
  })
})

describe('parseBaseline', () => {
  it('reads a recorded baseline', () => {
    const value = parseBaseline(JSON.stringify({ at: 1_760_000_000_000, credits: 21322, measuredUsd: 0.0178 }))
    expect(value).toEqual({ at: 1_760_000_000_000, credits: 21322, measuredUsd: 0.0178 })
  })

  it('treats absent and malformed input as not aligned', () => {
    // Reporting a broken field as a zero baseline would make the increment look
    // like the window total, which is the exact confusion this feature exists
    // to remove.
    expect(parseBaseline(undefined)).toBeUndefined()
    expect(parseBaseline('')).toBeUndefined()
    expect(parseBaseline('{')).toBeUndefined()
    expect(parseBaseline('{"at":1}')).toBeUndefined()
  })

  it('defaults a missing measured figure to zero', () => {
    // The plugin may have served nothing before the user pressed align.
    const value = parseBaseline(JSON.stringify({ at: 1_760_000_000_000, credits: 5 }))
    expect(value?.measuredUsd).toBe(0)
  })

  it('rejects impossible values instead of showing a negative increment', () => {
    expect(parseBaseline(JSON.stringify({ at: -1, credits: 5 }))).toBeUndefined()
    expect(parseBaseline(JSON.stringify({ at: 1_760_000_000_000, credits: -5 }))).toBeUndefined()
  })
})
