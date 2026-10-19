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
import { join } from 'node:path'

const PACKAGE = 'dsh-opendesign-go'
const RUNTIME_DEPS = [
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-launch-environment',
  '@deepseek-ai/schemastery',
]

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

if (existsSync(installedDir)) {
  const require = createRequire(join(installedDir, 'lib', 'index.js'))
  const unresolved = RUNTIME_DEPS.filter((name) => {
    try {
      require.resolve(name)
      return false
    } catch {
      return true
    }
  })
  check('runtime deps resolve', unresolved.length === 0, unresolved.length === 0 ? `${RUNTIME_DEPS.length} resolved` : `cannot resolve ${unresolved.join(', ')}`)

  const clientPath = join(installedDir, 'lib', 'client.js')
  if (existsSync(clientPath)) {
    const client = readFileSync(clientPath, 'utf8')
    const enveloped = client.startsWith('window.__ModuleLoader__.load(') && !/^import\s/m.test(client)
    check('client bundle injectable', enveloped, enveloped ? 'module-loader envelope' : 'ESM client would fail the web boot')
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
