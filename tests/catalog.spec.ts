import { describe, expect, it } from 'vitest'
import { GO_DESIGN_PLAN_MODELS, catalogRowsOf, displayNameOf, parseCatalog } from '../src/catalog.ts'

describe('parseCatalog', () => {
  const SNAPSHOT = {
    asOf: '2026-11-09T06:50:00.000Z',
    source: 'gateway',
    ids: ['deepseek-v4.1-flash', 'claude-sonnet-5.5'],
  }

  it('reads a gateway snapshot', () => {
    expect(parseCatalog(JSON.stringify(SNAPSHOT))).toEqual({
      asOf: '2026-11-09T06:50:00.000Z',
      source: 'gateway',
      ids: ['deepseek-v4.1-flash', 'claude-sonnet-5.5'],
      imageIds: [],
      error: undefined,
    })
  })

  it('keeps the image models apart from the chat models', () => {
    // Sending either kind to the other's endpoint fails, so the split is what
    // makes an entitled generation model usable at all.
    const raw = JSON.stringify({ ...SNAPSHOT, ids: ['gpt-6-luna', 'seedream-5.0'], imageIds: ['seedream-5.0'] })
    const snapshot = parseCatalog(raw)
    expect(snapshot?.ids).toEqual(['gpt-6-luna', 'seedream-5.0'])
    expect(snapshot?.imageIds).toEqual(['seedream-5.0'])
    expect(catalogRowsOf(snapshot)).toEqual([
      { id: 'gpt-6-luna', name: 'GPT-6 Luna' },
      { id: 'seedream-5.0', name: 'Seedream 5.0', imageGeneration: true },
    ])
  })

  it('drops an image id the snapshot no longer carries', () => {
    // The two lists are written together; a stale entry naming a model the
    // account lost must not resurrect it as an image row.
    const raw = JSON.stringify({ ...SNAPSHOT, ids: ['gpt-6-luna'], imageIds: ['seedream-5.0'] })
    expect(parseCatalog(raw)?.imageIds).toEqual([])
  })

  it('keeps the reason a fallback snapshot was written', () => {
    const raw = JSON.stringify({ ...SNAPSHOT, source: 'fallback', ids: ['a'], error: 'gateway said 403' })
    expect(parseCatalog(raw)?.error).toBe('gateway said 403')
    expect(parseCatalog(raw)?.source).toBe('fallback')
  })

  it('keeps an empty id list as a real answer', () => {
    // "This account grants nothing" is a different fact from "never asked", and
    // collapsing the two would make an entitlement problem look like a bug here.
    expect(parseCatalog(JSON.stringify({ source: 'gateway', ids: [] }))?.ids).toEqual([])
  })

  it('treats absent or malformed input as no snapshot', () => {
    for (const raw of [undefined, '', '{', 'null', '[]', '42']) {
      expect(() => parseCatalog(raw)).not.toThrow()
      expect(parseCatalog(raw)).toBeUndefined()
    }
    expect(parseCatalog(JSON.stringify({ source: 'gateway' }))).toBeUndefined()
  })
})

describe('displayNameOf', () => {
  it('uses the bundled name for a model it knows', () => {
    // The bundled table is the only source of officially spelled names; the
    // derivation below would turn this into "Deepseek V4.1 Flash".
    expect(displayNameOf('deepseek-v4.1-flash')).toBe('DeepSeek V4.1 Flash')
    expect(displayNameOf('gpt-6-luna')).toBe('GPT-6 Luna')
  })

  it('derives a readable name for a model it does not know', () => {
    expect(displayNameOf('claude-sonnet-5.5')).toBe('Claude Sonnet 5.5')
    expect(displayNameOf('kimi-k3.1-pro')).toBe('Kimi K3.1 Pro')
    expect(displayNameOf('gemini-3.8-flash')).toBe('Gemini 3.8 Flash')
  })

  it('leaves an id it cannot improve alone', () => {
    expect(displayNameOf('')).toBe('')
    expect(displayNameOf('weird')).toBe('Weird')
  })
})

describe('catalogRowsOf', () => {
  it('projects a snapshot into rows in the snapshot order', () => {
    const rows = catalogRowsOf({ asOf: undefined, source: 'gateway', ids: ['z-model', 'deepseek-v4-pro'], error: undefined })
    expect(rows.map((row) => row.id)).toEqual(['z-model', 'deepseek-v4-pro'])
    expect(rows[1]?.name).toBe('DeepSeek V4 Pro')
  })

  it('falls back to the bundled list when there is no snapshot', () => {
    const rows = catalogRowsOf(undefined)
    expect(rows.map((row) => row.id)).toEqual(GO_DESIGN_PLAN_MODELS.map((row) => row.id))
  })

  it('respects an empty snapshot instead of falling back', () => {
    expect(catalogRowsOf({ asOf: undefined, source: 'gateway', ids: [], error: undefined })).toEqual([])
  })
})
