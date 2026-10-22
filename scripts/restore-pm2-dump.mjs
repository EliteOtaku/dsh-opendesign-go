/**
 * Merge the saved pm2 dump back to the nine apps it held before this session.
 *
 * `pm2 save` rewrites the dump from the *live* process list, so starting one app
 * on a freshly spawned daemon truncated eight others (six trading bots, two
 * stremio servers). That is silent: nothing warns, and the loss only surfaces
 * the next time someone runs `pm2 resurrect`. The pre-save backup is the only
 * record of those definitions, so it is merged back here.
 *
 * Usage: node scripts/restore-pm2-dump.mjs [--backup <path>] [--dump <path>]
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const argument = (flag, fallback) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? fallback : process.argv[index + 1]
}

const dump = argument('--dump', join(homedir(), '.pm2', 'dump.pm2'))
const backup = argument('--backup', `${dump}.bak-20261022`)

for (const path of [dump, backup]) {
  if (!existsSync(path)) {
    console.error(`restore-pm2-dump: ${path} is absent`)
    process.exit(1)
  }
}

const current = JSON.parse(readFileSync(dump, 'utf8'))
const previous = JSON.parse(readFileSync(backup, 'utf8'))

if (!Array.isArray(current) || !Array.isArray(previous)) {
  console.error('restore-pm2-dump: both files must be JSON arrays of pm2 app definitions')
  process.exit(1)
}

const byName = new Map()
for (const app of previous) byName.set(app.name, app)
// A live app wins: its env and args are what the running daemon actually holds.
for (const app of current) byName.set(app.name, { ...(byName.get(app.name) ?? {}), ...app })

const merged = [...byName.values()]
if (merged.length <= current.length) {
  console.log(`restore-pm2-dump: nothing to restore (dump already holds ${current.length} app(s))`)
  process.exit(0)
}

copyFileSync(dump, `${dump}.pre-restore`)
writeFileSync(dump, `${JSON.stringify(merged, null, 2)}\n`)
console.log(`restore-pm2-dump: ${current.length} -> ${merged.length} apps`)
for (const app of merged) console.log(`  - ${app.name}`)
