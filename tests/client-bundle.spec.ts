/**
 * Regression guard for the shipped client bundle format.
 *
 * DSH injects client plugins as ordinary scripts and supplies
 * `window.__ModuleLoader__`; a top-level `import` there is not a local bug but a
 * failed web boot ("2 entries did not activate"), which refuses to start the
 * desktop app. These assertions are cheap and fail the build before that can
 * reach a user.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
const body = source.replace(/^[\s\S]*?factory: \(require\) => \{/, '')

describe('shipped client bundle', () => {
  it('registers through the host module loader instead of being an ES module', () => {
    expect(source.startsWith('window.__ModuleLoader__.load({ id: "dsh-opendesign-go"')).toBe(true)
    expect(source.trimEnd().endsWith('return module.exports; } });')).toBe(true)
  })

  it('carries no top-level import or export statement', () => {
    expect(source).not.toMatch(/^import\s/m)
    expect(source).not.toMatch(/^export\s/m)
  })

  it('reaches host-supplied dependencies only through the injected require', () => {
    const required = [...body.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1])
    expect(required.length).toBeGreaterThan(0)
    for (const name of required) {
      expect(['react', 'react-dom', 'react/jsx-runtime'].includes(name) || name.startsWith('@deepseek-ai/')).toBe(true)
    }
  })

  it('embeds no absolute path from the machine that built it', () => {
    // The bundle is committed, so anything machine-specific in it makes
    // `build.mjs --check` fail on every other checkout — which is exactly how CI
    // broke: esbuild stamps namespace modules with `// <path>` comments, and an
    // absolute resolve path put the builder's home directory in the artifact.
    // Kept to the prefixes a build machine actually has, so an `https://` URL or
    // a regex literal in the sources cannot trip it.
    expect(source).not.toMatch(/\b[A-Za-z]:[\\/]/) // Windows drive path
    for (const prefix of ['/home/', '/Users/', '/root/', '/builds/', '/runner/']) {
      expect(source).not.toContain(prefix)
    }
  })
})
