/**
 * Smoke-test the shipped `lib/` artifact through the real Cordis runtime.
 *
 * This is the check that a consumer actually gets after installing the package:
 * it imports the built entry (not `src/`) and mounts it on a fresh Context.
 * A failure here means the published artifact cannot load, even if the sources
 * type-check.
 *
 * @module scripts/plugin-smoke
 */
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../lib/index.js'

/**
 * Fail the process with one line of context.
 * @param {unknown} condition - truthy when the check passed.
 * @param {string} message - what failed.
 */
function assert(condition, message) {
  if (!condition) {
    console.error(`plugin-smoke: FAIL — ${message}`)
    process.exit(1)
  }
}

assert(plugin.name === 'llm-opendesign-go', `unexpected module name: ${String(plugin.name)}`)
assert(typeof plugin.apply === 'function', 'apply is not exported as a function')

const ctx = new Context()
ctx.plugin(plugin)
await new Promise((resolve) => setTimeout(resolve, 50))

const lines = []
plugin.apply({ logger: { info: (message) => lines.push(message) } })
assert(lines.length === 1, `apply should log exactly once, saw ${lines.length}`)
assert(lines[0].includes('llm-opendesign-go'), `unexpected mount log: ${lines[0]}`)

console.log('plugin-smoke: built artifact loads and mounts on Cordis')
