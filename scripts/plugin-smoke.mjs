/**
 * Smoke-test the shipped `lib/` artifact through the real Cordis runtime.
 *
 * This is what a consumer actually gets after installing the package: it
 * imports the built entry (not `src/`) and mounts it. A failure here means the
 * published artifact cannot load, even if the sources type-check.
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
assert(Array.isArray(plugin.GO_DESIGN_PLAN_MODELS), 'the Go model seed is not exported')
assert(plugin.GO_DESIGN_PLAN_MODELS.length === 12, `expected 12 Design Plan models, saw ${plugin.GO_DESIGN_PLAN_MODELS.length}`)

// 1) The real Cordis runtime must accept the module. This is the check that
//    proves the bundle has no host-internal import and no top-level throw.
const ctx = new Context()
ctx.plugin(plugin)
await new Promise((resolve) => setTimeout(resolve, 50))

// 2) Mounting against a minimal host surface must reach the plugin body and
//    report through the host logger instead of throwing at load.
const lines = []
const noop = () => {}
const provided = new Map()
/** Cleanups for whatever the plugin registered; run before the process exits. */
const disposers = []
/** A context stub carrying every member the plugin calls during activation. */
const surface = (getter) => ({
  logger: { info: (m) => lines.push(m), warn: (m) => lines.push(m), error: (m) => lines.push(m) },
  effect: (fn) => {
    const dispose = fn()
    const cleanup = () => {
      if (typeof dispose === 'function') dispose()
    }
    // Collected so the process can exit: the plugin starts a quota-refresh
    // interval, and a smoke test that leaves it running never terminates.
    disposers.push(cleanup)
    return cleanup
  },
  get: getter,
  // `provide` then `set` is the documented order, and omitting either makes the
  // real runtime throw inside apply — which this smoke test exists to catch
  // before the Host does.
  on: () => noop,
  provide: (name) => { provided.set(name, undefined) },
  set: (name, value) => {
    if (!provided.has(name)) throw new Error(`cannot set property "${name}" without provide`)
    provided.set(name, value)
  },
  inject: (_deps, callback) => {
    // The child mirrors a host with no settings or attachments service: the
    // plugin must degrade to a log line instead of throwing.
    callback(surface(getter))
  },
})
const stub = surface(() => undefined)
plugin.apply(stub)
assert(lines.some((line) => line.includes('llm-opendesign-go')), 'apply did not report through the host logger')

// Release every interval the plugin started, or Node keeps the loop alive.
for (const dispose of disposers) dispose()

console.log('plugin-smoke: built artifact loads and mounts on Cordis')
