import { describe, expect, it } from 'vitest'
import { ACCOUNTS_NAMESPACE, REMOTE_PACKAGE, accountsRemote } from '../src/remote-contract.ts'

describe('accounts remote descriptor', () => {
  it('declares exactly one method, so there is a single write path', () => {
    expect(accountsRemote.descriptors).toHaveLength(1)
    expect(accountsRemote.descriptors[0]?.method).toBe('execute')
  })

  it('binds the method to the service this plugin provides', () => {
    const descriptor = accountsRemote.descriptors[0]
    // The Host resolves `service` by key; a mismatch means the call lands on a
    // service nobody published.
    expect(descriptor?.service).toBe(ACCOUNTS_NAMESPACE)
    expect(descriptor?.namespace).toBe(ACCOUNTS_NAMESPACE)
  })

  it('uses a direct invocation, so the page never names an implementation', () => {
    expect(accountsRemote.descriptors[0]?.invocation).toEqual({ kind: 'direct' })
  })

  it('carries a stable, package-scoped id', () => {
    const id = accountsRemote.descriptors[0]?.id
    expect(id).toContain(REMOTE_PACKAGE)
    expect(id).toContain(ACCOUNTS_NAMESPACE)
  })

  it('validates its argument before the host sees it', () => {
    const codec = accountsRemote.descriptors[0]?.parameters?.[0]?.codec as { schema: { parse(value: unknown): unknown } }
    expect(() => codec.schema.parse({ kind: 'add', id: 'a', name: 'n', key: 'k' })).not.toThrow()
    expect(() => codec.schema.parse({ kind: 'nope' })).toThrow()
  })

  it('validates the result the host returns', () => {
    const codec = accountsRemote.descriptors[0]?.result as { schema: { parse(value: unknown): unknown } }
    expect(codec.schema.parse('applied')).toBe('applied')
    expect(() => codec.schema.parse('ok')).toThrow()
  })
})
