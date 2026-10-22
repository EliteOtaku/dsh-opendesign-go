#!/usr/bin/env node
/**
 * Copy the built bundles into an installed DSH profile and prove the copy landed.
 *
 * This exists because the profile can be rebuilt from its `github:` dependency
 * at any time, silently restoring whatever that repository's HEAD contains. A
 * `cp` that "succeeds" while the destination is later replaced is
 * indistinguishable from a bug in the plugin, which is exactly how several
 * rounds of this plugin were debugged against the wrong code.
 *
 * So the copy is verified by digest, and a mismatch fails loudly.
 *
 * Usage: node scripts/sync-profile.mjs [--profile desktop] [--link]
 */
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const profileIndex = process.argv.indexOf('--profile')
const profileName = profileIndex === -1 ? 'desktop' : process.argv[profileIndex + 1]
const useLink = process.argv.includes('--link')
const installed = join(homedir(), '.dsh', 'profiles', profileName, 'node_modules', 'dsh-opendesign-go')

/** SHA-256 of one file. */
function digestOf(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Every file below a directory, as paths relative to it. */
function filesUnder(directory) {
  const found = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) found.push(relative(directory, full))
    }
  }
  walk(directory)
  return found.sort()
}

if (!existsSync(installed)) {
  console.error(`sync-profile: ${installed} is absent; install the plugin in the app first`)
  process.exit(1)
}

if (useLink) {
  // A directory junction keeps the profile's copy and the source identical no
  // matter how often the profile is reinstalled from its dependency spec.
  const real = join(root, 'lib')
  const target = join(installed, 'lib')
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  symlinkSync(real, target, 'junction')
  console.log(`sync-profile: lib/ linked to ${real}`)
  process.exit(0)
}

const failures = []

// Mirror the whole lib/ tree, not just the two entry bundles. The declaration
// files travel with the runtime: leaving them behind makes the profile describe
// a different build than the one it runs, which is the exact confusion this
// script exists to prevent.
const libRoot = join(root, 'lib')
for (const name of filesUnder(libRoot)) {
  const source = join(libRoot, name)
  const target = join(installed, 'lib', name)
  mkdirSync(dirname(target), { recursive: true })
  // Write to a temporary name first: a partly written bundle is worse than an
  // old one, because the Host may load it during the copy.
  const temp = `${target}.sync`
  copyFileSync(source, temp)
  renameSync(temp, target)
  if (digestOf(source) !== digestOf(target)) failures.push(`lib/${name}: digest mismatch after copy`)
}

for (const name of ['package.json', 'cordis.patch.yml']) {
  const source = join(root, name)
  const target = join(installed, name)
  if (!existsSync(source)) continue
  copyFileSync(source, target)
  if (digestOf(source) !== digestOf(target)) failures.push(`${name}: digest mismatch after copy`)
}

if (failures.length > 0) {
  console.error('sync-profile: FAILED')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

const stamp = statSync(join(installed, 'lib', 'index.js')).mtime.toISOString()
console.log(`sync-profile: lib/ mirrored (${filesUnder(libRoot).length} files) into ${profileName} (mtime ${stamp})`)
