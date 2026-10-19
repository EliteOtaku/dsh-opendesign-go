#!/usr/bin/env node
/**
 * Verify that a DSH profile can actually load this plugin.
 *
 * The desktop profile is managed by the Electron app, which installs the
 * dependency and the `dsh.profile.bundles` entry separately. When one lands
 * without the other the app refuses to boot with
 * `cannot resolve profile bundle "dsh-opendesign-go"`, or silently never loads
 * the plugin. This script checks the four facts that must all hold, so a
 * half-installed profile is caught before a restart.
 *
 *   node scripts/verify-profile.mjs [--profile desktop]
 *
 * @module scripts/verify-profile
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

const PACKAGE = 'dsh-opendesign-go'

/**
 * Every external module the built Host bundle actually imports.
 *
 * Derived from the artifact rather than kept as a hand-written list: a list
 * silently misses a dependency added later, and the failure it hides is the
 * worst kind — `ctx.inject` on a service whose package cannot resolve simply
 * never fires, so the feature looks unimplemented instead of broken.
 * @returns bare module specifiers, deduplicated.
 */
function runtimeDepsOf() {
  const bundlePath = join(rootDir, 'lib', 'index.js')
  if (!existsSync(bundlePath)) return []
  const source = readFileSync(bundlePath, 'utf8')
  const found = new Set()
  for (const match of source.matchAll(/^import\s[^'"]*from\s*['"]([^'"]+)['"]/gm)) {
    const specifier = match[1]
    if (specifier.startsWith('.') || specifier.startsWith('node:')) continue
    found.add(specifier)
  }
  return [...found]
}

const profileIndex = process.argv.indexOf('--profile')
const profileName = profileIndex === -1 ? 'desktop' : process.argv[profileIndex + 1]
const profileDir = join(homedir(), '.dsh', 'profiles', profileName)

/** One collected check. */
const results = []

/**
 * Record one check.
 * @param {string} label - what was checked.
 * @param {boolean} ok - whether it held.
 * @param {string} detail - what was found.
 */
function check(label, ok, detail) {
  results.push({ label, ok, detail })
}

if (!existsSync(join(profileDir, 'package.json'))) {
  console.error(`verify-profile: no profile at ${profileDir}`)
  process.exit(2)
}

const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
const dependency = manifest.dependencies?.[PACKAGE]
const bundles = manifest.dsh?.profile?.bundles ?? []
const installedDir = join(profileDir, 'node_modules', PACKAGE)

check('dependency declared', dependency !== undefined, dependency ?? 'missing from dependencies')
check('node_modules present', existsSync(installedDir), existsSync(installedDir) ? installedDir : 'not installed')
check('bundle registered', bundles.includes(PACKAGE), bundles.includes(PACKAGE) ? 'listed in dsh.profile.bundles' : 'missing from dsh.profile.bundles')

// Build output must reach the profile. A package directory that exists but has
// no lib/ loads as a plugin with no entry, which the Host shows as a surface
// that does nothing — the hardest kind of failure to attribute.
if (existsSync(installedDir)) {
  const missingArtifacts = ['index.js', 'client.js']
    .filter((name) => !existsSync(join(installedDir, 'lib', name)))
  check(
    'build artifacts present',
    missingArtifacts.length === 0,
    missingArtifacts.length === 0 ? 'index.js + client.js' : `missing lib/${missingArtifacts.join(', lib/')}`,
  )
}

if (existsSync(installedDir)) {
  const require = createRequire(join(installedDir, 'lib', 'index.js'))
  const runtimeDeps = runtimeDepsOf()
  const unresolved = runtimeDeps.filter((name) => {
    try {
      require.resolve(name)
      return false
    } catch {
      return true
    }
  })
  check('runtime deps resolve', unresolved.length === 0, unresolved.length === 0 ? `${runtimeDeps.length} resolved` : `cannot resolve ${unresolved.join(', ')}`)

  const clientPath = join(installedDir, 'lib', 'client.js')
  if (existsSync(clientPath)) {
    const client = readFileSync(clientPath, 'utf8')
    const enveloped = client.startsWith('window.__ModuleLoader__.load(') && !/^import\s/m.test(client)
    check('client bundle injectable', enveloped, enveloped ? 'module-loader envelope' : 'ESM client would fail the web boot')

    // The page runs inside the browser shell, which supplies its own modules
    // through `window.__ModuleLoader__`'s `require`. Those are expected to be
    // absent from this package's node_modules, so only genuinely unresolvable
    // third-party imports are a failure.
    const SHELL_PROVIDED = new Set(['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'])
    const clientDeps = [...new Set([...client.matchAll(/require\(['"]([^'"]+)['"]\)/g)]
      .map((match) => match[1])
      .filter((name) => !name.startsWith('.') && !name.startsWith('node:')))]
    const unresolvedClient = clientDeps.filter((name) => {
      if (SHELL_PROVIDED.has(name)) return false
      try {
        require.resolve(name)
        return false
      } catch {
        return true
      }
    })
    check(
      'client deps resolve',
      unresolvedClient.length === 0,
      unresolvedClient.length === 0
        ? `${clientDeps.length} resolved (${clientDeps.filter((name) => SHELL_PROVIDED.has(name)).length} shell-provided)`
        : `cannot resolve ${unresolvedClient.join(', ')}`,
    )
  }
}

for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.label.padEnd(22)} ${result.detail}`)
}

const failed = results.filter((result) => !result.ok)
if (failed.length > 0) {
  console.error(`\nverify-profile: ${failed.length} check(s) failed for profile "${profileName}"`)
  console.error('Fix the profile before restarting the app; a partial install can block the boot.')
  process.exit(1)
}
console.log(`\nverify-profile: profile "${profileName}" can load ${PACKAGE}`)
