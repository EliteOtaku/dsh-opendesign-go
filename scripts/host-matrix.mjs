/**
 * Check the built artifact against more than one DSH host version.
 *
 * The package declares its host range as `engines.dsh` and every peer range
 * as `>=0.2.0-rc.1`, but a range in `package.json` is a promise, not evidence.
 * This script turns it into evidence: for each host version it installs that
 * version's peer set into a throwaway directory and then asks three questions
 * in increasing strength.
 *
 *   1. symbols  — does every `@deepseek-ai` symbol the artifact imports still
 *                 exist? A renamed or dropped export breaks at first call, not
 *                 at import, so a successful mount alone does not prove this.
 *   2. types    — do the sources still type-check against that version's
 *                 published declarations? Catches signature drift that leaves
 *                 the symbol in place, e.g. a widened parameter or a moved
 *                 optional.
 *   3. mount    — does the real Cordis runtime accept the built entry?
 *
 * Only the newest host version needs a full `npm ci`; older ones get their
 * peers installed into a temporary prefix, which is why this stays cheap
 * enough to run on every push.
 *
 * @module scripts/host-matrix
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))

/**
 * Host versions this package claims to support.
 *
 * The endpoints matter more than the middle: `0.2.0-rc.1` is the lowest
 * version `engines.dsh` allows, and the newest published version is what a
 * fresh install receives. Release candidates of one line add install cost
 * without testing a distinct API surface — no removal happens between them.
 *
 * The alpha of the next line is the exception: it is the first build that may
 * remove something the previous line still had, so it is the only entry here
 * that can fail while every rc before it passes. `0.2.2-alpha.2` is listed for
 * that reason. Reaching it needs the peer range to admit a prerelease, which it
 * does: the host itself checks peers with `includePrerelease: true`.
 */
const HOSTS = (process.env.HOST_MATRIX_VERSIONS ?? '0.2.0-rc.1,0.2.0-rc.2,0.2.1-rc.2,0.2.2-alpha.2')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean)

/** Registry archive host for `npm install`, honouring the caller's proxy. */
const npmArgs = ['--no-audit', '--no-fund', '--loglevel=error']

/**
 * Resolve the command that runs npm without a shell.
 *
 * `npm` and `npm.cmd` are launcher scripts, not executables: with `shell:
 * false` they fail with EINVAL on Windows, and going through a shell raises
 * DEP0190 because a shell concatenates arguments without escaping them. The
 * npm entry point is a JavaScript file, so the portable answer is to run it
 * with the current Node binary.
 * @returns {{command: string, prefix: string[]}} executable plus leading args.
 */
function npmCommand() {
  const candidates = [
    // Standard installs keep npm beside the Node executable.
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return { command: process.execPath, prefix: [candidate] }
  }
  // Last resort: let the shell find npm. Correct, only noisier.
  return { command: 'npm', prefix: [], shell: true }
}

/**
 * Run a command and return its outcome instead of exiting.
 * @param {string} command - executable.
 * @param {readonly string[]} args - arguments.
 * @param {string} cwd - working directory.
 * @returns {{ok: boolean, out: string}} combined output and success flag.
 */
function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: options.shell === true,
    timeout: 15 * 60_000,
  })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  if (result.error !== undefined && out === '') {
    return { ok: false, out: result.error.message }
  }
  return { ok: result.status === 0, out }
}

/**
 * Peer packages to install at an exact version.
 *
 * `cordis` is versioned on its own 4.x line, so pinning it to the host version
 * would ask npm for a version that never existed. It is left to resolve from
 * the peer range instead.
 */
const VERSIONED_PEERS = Object.keys(pkg.peerDependencies).filter(
  (name) => name.startsWith('@deepseek-ai/') && name !== '@deepseek-ai/cordis',
)

/**
 * Recursively collect emitted JavaScript from the built artifact.
 * @param {string} dir - directory to walk.
 * @returns {string[]} absolute file paths.
 */
function jsFiles(dir) {
  if (!existsSync(dir)) return []
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...jsFiles(full))
    else if (entry.name.endsWith('.js')) found.push(full)
  }
  return found
}

/**
 * Symbols the artifact imports from every `@deepseek-ai` package.
 * @param {readonly string[]} files - emitted JavaScript.
 * @returns {Map<string, Set<string>>} package to imported names.
 */
function importedSymbols(files) {
  const wanted = new Map()
  const pattern = /import\s*\{([^}]+)\}\s*from\s*['"](@deepseek-ai\/[^'"]+)['"]/g
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    let match
    while ((match = pattern.exec(text)) !== null) {
      const names = match[1]
        .split(',')
        .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean)
      if (!wanted.has(match[2])) wanted.set(match[2], new Set())
      for (const name of names) wanted.get(match[2]).add(name)
    }
  }
  return wanted
}

/**
 * Verify that every imported symbol resolves at the installed versions.
 *
 * The check runs inside the probe directory on purpose. Bare specifiers resolve
 * by walking up from the importing file, so importing from here would resolve
 * against this repository's `node_modules` — the versions already installed —
 * and would prove nothing about the host under test. A `file://` URL pointing at
 * the package directory does not work either: ESM has no directory resolution,
 * so it fails with "Directory import is not supported". Running a script whose
 * own location is inside the probe is the only form that uses the probe's tree.
 *
 * @param {Map<string, Set<string>>} wanted - package to imported names.
 * @param {string} probeDir - directory whose `node_modules` is authoritative.
 * @returns {{missing: string[]}} human-readable gaps.
 */
function checkSymbols(wanted, probeDir) {
  const plan = [...wanted].map(([name, symbols]) => ({ name, symbols: [...symbols].sort() }))
  // The plan travels through a file, not argv: on Windows `spawnSync` runs
  // through a shell, and a JSON argument carrying quotes and braces arrives
  // mangled, which made the probe fail before it imported anything.
  writeFileSync(join(probeDir, 'symbols.json'), JSON.stringify(plan))
  writeFileSync(
    join(probeDir, 'symbols.mjs'),
    [
      "import { readFileSync } from 'node:fs'",
      "const plan = JSON.parse(readFileSync(new URL('./symbols.json', import.meta.url), 'utf8'))",
      'const missing = []',
      'for (const { name, symbols } of plan) {',
      '  let mod',
      '  try {',
      '    mod = await import(name)',
      '  } catch (error) {',
      // An optional peer the host did not provide is not a compatibility gap:
      // the plugin must degrade, and the `mount` step proves that separately.
      '    missing.push(name + ": not resolvable (" + String(error.message).split("\\n")[0] + ")")',
      '    continue',
      '  }',
      '  const absent = symbols.filter((symbol) => mod[symbol] === undefined)',
      '  if (absent.length > 0) missing.push(name + ": " + absent.join(", "))',
      '}',
      'console.log(JSON.stringify(missing))',
    ].join('\n'),
  )
  const result = run('node', ['symbols.mjs'], probeDir)
  if (!result.ok) return { missing: [`symbol probe failed: ${result.out.split('\n').slice(-4).join(' ')}`] }
  try {
    return { missing: JSON.parse(result.out.trim().split('\n').pop() ?? '[]') }
  } catch {
    return { missing: [`symbol probe returned unparseable output: ${result.out.slice(0, 200)}`] }
  }
}

/**
 * Check one host version end to end.
 * @param {string} version - DSH host version under test.
 * @returns {Promise<{version: string, ok: boolean, steps: Array<{name: string, ok: boolean, detail: string}>}>}
 */
async function checkHost(version) {
  const probe = mkdtempSync(join(tmpdir(), `host-matrix-${version}-`))
  const steps = []
  const record = (name, ok, detail = '') => steps.push({ name, ok, detail })

  try {
    writeFileSync(join(probe, 'package.json'), JSON.stringify({ name: 'host-probe', private: true, type: 'module' }, null, 2))

    const peers = VERSIONED_PEERS.map((name) => `${name}@${version}`)
    const npm = npmCommand()
    const installed = run(
      npm.command,
      [...npm.prefix, 'install', ...npmArgs, ...peers, 'typescript@5', '@types/node'],
      probe,
      npm,
    )
    if (!installed.ok) {
      record('install', false, installed.out.split('\n').slice(-6).join('\n'))
      return { version, ok: false, steps }
    }
    record('install', true, `${VERSIONED_PEERS.length} peers at ${version}`)

    // The artifact under test is what consumers receive, so the probe mounts
    // `lib/`, never `src/`.
    cpSync(join(repoRoot, 'lib'), join(probe, 'lib'), { recursive: true })

    const { missing } = checkSymbols(importedSymbols(jsFiles(join(probe, 'lib'))), probe)
    record('symbols', missing.length === 0, missing.join('; '))

    // Type-check a copy of the sources against this version's declarations,
    // with the probe's `node_modules` authoritative.
    cpSync(join(repoRoot, 'src'), join(probe, 'src'), { recursive: true })
    for (const file of ['tsconfig.json', 'tsconfig.host.json']) {
      if (existsSync(join(repoRoot, file))) cpSync(join(repoRoot, file), join(probe, file))
    }
    const typecheck = run('node', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.host.json', '--noEmit'], probe)
    record('types', typecheck.ok, typecheck.ok ? '' : typecheck.out.split('\n').slice(0, 12).join('\n'))

    // Mounting proves no host-internal import and no activation throw.
    writeFileSync(
      join(probe, 'mount.mjs'),
      [
        "import { Context } from '@deepseek-ai/cordis'",
        "import * as plugin from './lib/index.js'",
        "if (plugin.name !== 'llm-opendesign-go') throw new Error('module name: ' + String(plugin.name))",
        "if (typeof plugin.apply !== 'function') throw new Error('apply is not a function')",
        'const ctx = new Context()',
        'ctx.plugin(plugin)',
        'await new Promise((resolve) => setTimeout(resolve, 80))',
        "console.log('mounted')",
      ].join('\n'),
    )
    const mount = run('node', ['mount.mjs'], probe)
    record('mount', mount.ok, mount.ok ? '' : mount.out.split('\n').slice(-8).join('\n'))

    return { version, ok: steps.every((step) => step.ok), steps }
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
}

if (!existsSync(join(repoRoot, 'lib', 'index.js'))) {
  console.error('host-matrix: FAIL — lib/index.js is missing; run `npm run compile` first')
  process.exit(1)
}

const results = []
for (const version of HOSTS) {
  process.stdout.write(`host-matrix: ${version} … `)
  const result = await checkHost(version)
  results.push(result)
  console.log(result.ok ? 'ok' : 'FAIL')
  for (const step of result.steps) {
    console.log(`  ${step.ok ? '✓' : '✗'} ${step.name}${step.detail ? ` — ${step.detail}` : ''}`)
  }
}

const summary = results.map((r) => `${r.version}=${r.ok ? 'ok' : 'fail'}`).join(', ')
const failed = results.filter((r) => !r.ok)
if (failed.length > 0) {
  console.error(`\nhost-matrix: FAIL — ${failed.map((r) => r.version).join(', ')} (${summary})`)
  process.exit(1)
}
console.log(`\nhost-matrix: PASS — ${summary}`)
