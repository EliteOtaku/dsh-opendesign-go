#!/usr/bin/env node
/**
 * Point the profile at this checkout with a directory junction.
 *
 * A plain copy or a `file:` dependency both lose to the profile's own
 * reinstall: pnpm rebuilds the package directory and the build output is either
 * replaced or absent, which the Host experiences as a plugin that will not load
 * (or, worse, a web boot that dies on a bare ESM client bundle).
 *
 * A junction makes the profile's copy *be* the checkout, so `npm run compile`
 * is enough — there is no sync step left to forget.
 *
 * Refuses to run while the desktop app is alive: replacing the directory under
 * a running Host leaves it pointing at a path that no longer resolves.
 *
 * Usage: node scripts/link-profile.mjs [--profile desktop] [--force]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const profileIndex = process.argv.indexOf('--profile')
const profileName = profileIndex === -1 ? 'desktop' : process.argv[profileIndex + 1]
const force = process.argv.includes('--force')
const profileDir = join(homedir(), '.dsh', 'profiles', profileName)
const target = join(profileDir, 'node_modules', 'dsh-opendesign-go')
const manifestPath = join(profileDir, 'package.json')
const PACKAGE = 'dsh-opendesign-go'

/** Whether the desktop app is running; replacing the link under it breaks it. */
function appRunning() {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq DeepSeek Harness.exe'], { encoding: 'utf8' })
    return /DeepSeek Harness\.exe/i.test(out)
  } catch {
    return false
  }
}

if (appRunning() && !force) {
  console.error('link-profile: the DSH desktop app is running. Quit it fully, then retry (or pass --force).')
  process.exit(1)
}

// Build first: a junction to a checkout with no lib/ is a plugin that cannot load.
execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs')], { stdio: 'inherit' })
for (const name of ['index.js', 'client.js']) {
  if (!existsSync(join(root, 'lib', name))) {
    console.error(`link-profile: lib/${name} is missing after the build`)
    process.exit(1)
  }
}

if (existsSync(target)) {
  // Remove via cmd so a junction is unlinked rather than followed: deleting
  // through the link would delete the checkout itself.
  execFileSync('cmd', ['/c', 'rmdir', target], { stdio: 'ignore' })
  if (existsSync(target)) execFileSync('cmd', ['/c', 'rmdir', '/S', '/Q', target], { stdio: 'ignore' })
}
execFileSync('cmd', ['/c', 'mklink', '/J', target, root], { stdio: 'inherit' })

// The junction alone is not enough: the composition has to name the bundle, or
// the Host never loads it and nothing reports why.
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.dsh = manifest.dsh ?? {}
manifest.dsh.profile = manifest.dsh.profile ?? {}
manifest.dsh.profile.bundles = manifest.dsh.profile.bundles ?? []
if (!manifest.dsh.profile.bundles.includes(PACKAGE)) {
  manifest.dsh.profile.bundles.push(PACKAGE)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`link-profile: added ${PACKAGE} to ${profileName} bundles`)
}
if (manifest.dependencies?.[PACKAGE] !== `file:${root.replace(/\\/g, '/')}`) {
  manifest.dependencies = manifest.dependencies ?? {}
  manifest.dependencies[PACKAGE] = `file:${root.replace(/\\/g, '/')}`
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`link-profile: pinned ${PACKAGE} to ${manifest.dependencies[PACKAGE]}`)
}

// Prove both artifacts exist through the link, which is what the Host reads.
for (const name of ['index.js', 'client.js']) {
  if (!existsSync(join(target, 'lib', name))) {
    console.error(`link-profile: ${name} is not reachable through the junction`)
    process.exit(1)
  }
}
console.log(`link-profile: ${target} -> ${root}`)
console.log('link-profile: run "npm run compile" to publish changes; no sync step needed')
