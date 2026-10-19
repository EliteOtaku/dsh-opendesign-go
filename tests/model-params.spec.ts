import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REASONING_EFFORT,
  MAX_CONTEXT_WINDOW,
  MAX_MAX_TOKENS,
  isModelEnabled,
  MIN_CONTEXT_WINDOW,
  MIN_MAX_TOKENS,
  MODEL_DEFAULTS,
  REASONING_EFFORTS,
  paramsOf,
  parseEnabledModels,
  parseModelParams,
} from '../src/model-params.ts'

describe('gateway model defaults', () => {
  it('covers every model the Go plan grants', () => {
    // A model without defaults loses its context display and output cap, which
    // silently truncates conversations instead of failing visibly.
    expect(Object.keys(MODEL_DEFAULTS)).toHaveLength(12)
  })

  it('uses the vendor-published DeepSeek limits, not the gateway metadata', () => {
    // DeepSeek documents 1M context and a 384K output maximum. The gateway's
    // metadata.output_budget says 128000, but a request asking for 384000 is
    // accepted, so that field is broadcast metadata rather than a limit — and
    // both endpoints return the same system_fingerprint, so this is the same
    // model behind a pass-through.
    expect(MODEL_DEFAULTS['deepseek-v4.1-flash']?.contextWindow).toBe(1_000_000)
    expect(MODEL_DEFAULTS['deepseek-v4.1-flash']?.maxTokens).toBe(384_000)
    expect(MODEL_DEFAULTS['deepseek-v4-pro']?.maxTokens).toBe(384_000)
  })

  it('gives the retired DeepSeek ids the limits of the model that serves them', () => {
    // The docs state both ids now route to DeepSeek-V4.1-Flash-1017.
    expect(MODEL_DEFAULTS['deepseek-v4-flash']?.maxTokens).toBe(384_000)
    expect(MODEL_DEFAULTS['deepseek-v4-flash-vision-exp']?.maxTokens).toBe(384_000)
  })

  it('declares image input only where the gateway reports it', () => {
    expect(MODEL_DEFAULTS['deepseek-v4.1-flash']?.inputModalities).toContain('image')
    expect(MODEL_DEFAULTS['deepseek-v4-flash']?.inputModalities).toEqual(['text'])
  })
})

describe('parseModelParams', () => {
  it('reads overrides and drops unusable entries', () => {
    const parsed = parseModelParams(JSON.stringify({
      'a-model': { contextWindow: 5000, maxTokens: 100 },
      'b-model': { contextWindow: 7000 },
      'c-model': {},
      'd-model': { contextWindow: 'nope' },
    }))
    expect(parsed['a-model']).toEqual({ contextWindow: 5000, maxTokens: 100 })
    expect(parsed['b-model']).toEqual({ contextWindow: 7000 })
    expect(parsed['c-model']).toBeUndefined()
    expect(parsed['d-model']).toBeUndefined()
  })

  it('treats absent or malformed text as no overrides', () => {
    // Losing every default because one character is wrong would disable the
    // model list for a reason the user cannot see.
    expect(parseModelParams(undefined)).toEqual({})
    expect(parseModelParams('')).toEqual({})
    expect(parseModelParams('{')).toEqual({})
    expect(parseModelParams('[]')).toEqual({})
  })
})

describe('paramsOf', () => {
  it('returns the default when nothing is overridden', () => {
    expect(paramsOf('deepseek-v4.1-flash', {})?.maxTokens).toBe(384_000)
    expect(paramsOf('deepseek-v4.1-flash', undefined)?.maxTokens).toBe(384_000)
  })

  it('applies an override in range', () => {
    expect(paramsOf('deepseek-v4.1-flash', { 'deepseek-v4.1-flash': { maxTokens: 4096 } })?.maxTokens).toBe(4096)
  })

  it('ignores an out-of-range override instead of clamping it', () => {
    // Clamping would make the page claim a value the user never entered.
    expect(paramsOf('deepseek-v4.1-flash', { 'deepseek-v4.1-flash': { maxTokens: 0 } })?.maxTokens).toBe(384_000)
    expect(paramsOf('deepseek-v4.1-flash', { 'deepseek-v4.1-flash': { contextWindow: MAX_CONTEXT_WINDOW + 1 } })?.contextWindow).toBe(1_000_000)
  })

  it('keeps the default for a non-finite override', () => {
    expect(paramsOf('deepseek-v4.1-flash', { 'deepseek-v4.1-flash': { maxTokens: Number.NaN } })?.maxTokens).toBe(384_000)
  })

  it('returns undefined for an unknown model rather than inventing a window', () => {
    expect(paramsOf('not-a-model', {})).toBeUndefined()
  })

  it('exposes the documented bounds', () => {
    expect(MIN_CONTEXT_WINDOW).toBeLessThan(MAX_CONTEXT_WINDOW)
    expect(MAX_MAX_TOKENS).toBeGreaterThan(MIN_MAX_TOKENS)
  })
})

describe('enabled models', () => {
  it('treats an empty list as all enabled', () => {
    // A fresh install has an empty field; reading it as "none" would blank the
    // picker with no explanation.
    expect(parseEnabledModels('')).toEqual([])
    expect(isModelEnabled('deepseek-v4.1-flash', [])).toBe(true)
  })

  it('reads an explicit list and filters by it', () => {
    const enabled = parseEnabledModels(JSON.stringify(['a', 'b']))
    expect(enabled).toEqual(['a', 'b'])
    expect(isModelEnabled('a', enabled)).toBe(true)
    expect(isModelEnabled('c', enabled)).toBe(false)
  })

  it('ignores malformed text rather than disabling everything', () => {
    expect(parseEnabledModels('{')).toEqual([])
    expect(parseEnabledModels('{"a":1}')).toEqual([])
    expect(parseEnabledModels('[1,"b",null]')).toEqual(['b'])
  })
})

describe('reasoning efforts', () => {
  it('offers the four values the gateway honours', () => {
    expect(REASONING_EFFORTS.map((effort) => effort.id)).toEqual(['minimal', 'low', 'medium', 'high'])
  })

  it('names a default that is one of the offered values', () => {
    expect(REASONING_EFFORTS.some((effort) => effort.id === DEFAULT_REASONING_EFFORT)).toBe(true)
  })
})
