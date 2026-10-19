import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'src', 'client', 'accounts-controller.ts'), 'utf8')

/**
 * Regression guards for the Host Remote calling convention.
 *
 * Every Remote method resolves to `{ ok: true, value } | { ok: false, error }`
 * and never rejects for a carrier problem. Reading a payload field straight off
 * the call result therefore fails with "cannot read properties of undefined",
 * while the channel still reports itself ready — which is exactly how four
 * rounds of this plugin's account channel were lost.
 */
describe('remote result envelope', () => {
  it('unwraps every Remote call instead of reading the envelope as data', () => {
    // Each call site must go through unwrap(); a bare `await settings.…` would
    // read `namespaces` off the envelope and get undefined.
    const bare = [...source.matchAll(/await (settings|credentials)\.(\w+)\(/g)]
      .filter((match) => {
        const before = source.slice(Math.max(0, match.index - 8), match.index)
        return !before.includes('unwrap(')
      })
      .map((match) => `${match[1]}.${match[2]}`)
    expect(bare).toEqual([])
  })

  it('reads describe() through the envelope', () => {
    expect(source).toMatch(/unwrap\(await settings\.describe\(\)\)/)
  })

  it('reads the namespace list from the payload, not the envelope', () => {
    expect(source).toMatch(/described\.namespaces/)
    expect(source).not.toMatch(/describe\(\)\.namespaces/)
  })

  it('has a single unwrap helper that reports the host error', () => {
    expect(source).toMatch(/function unwrap<T>/)
    expect(source).toMatch(/result\.ok/)
  })
})
