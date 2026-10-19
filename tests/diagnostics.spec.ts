import { describe, expect, it } from 'vitest'
import { parseRouteDiagnostics } from '../src/diagnostics.ts'

describe('parseRouteDiagnostics', () => {
  it('reads the cached routing state', () => {
    const value = parseRouteDiagnostics(JSON.stringify({
      registered: true,
      enabled: true,
      credentialResolved: true,
      triedRef: 'OPENDESIGN_API_KEY',
      modelCount: 12,
      asOf: '2026-10-19T07:00:00.000Z',
    }))
    expect(value?.registered).toBe(true)
    expect(value?.modelCount).toBe(12)
    expect(value?.triedRef).toBe('OPENDESIGN_API_KEY')
  })

  it('keeps a registration failure so the page can name it', () => {
    const value = parseRouteDiagnostics(JSON.stringify({
      registered: false,
      enabled: true,
      credentialResolved: true,
      triedRef: 'X',
      modelCount: 12,
      lastError: 'provider already registered',
      asOf: '2026-10-19T07:00:00.000Z',
    }))
    expect(value?.registered).toBe(false)
    expect(value?.lastError).toBe('provider already registered')
  })

  it('treats absence and malformed values as unknown, not as "off"', () => {
    // Reporting a broken diagnostic as "route not registered" would send the
    // reader chasing the wrong cause.
    expect(parseRouteDiagnostics(undefined)).toBeUndefined()
    expect(parseRouteDiagnostics('')).toBeUndefined()
    expect(parseRouteDiagnostics('{')).toBeUndefined()
    expect(parseRouteDiagnostics('{"registered":true}')).toBeUndefined()
  })
})
