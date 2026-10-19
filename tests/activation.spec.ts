import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../src/index.ts'

/**
 * Regression guard for entry activation.
 *
 * A throw inside `apply` does not surface as a failed request: it aborts the
 * entry's activation, so the settings service never lists the plugin in
 * `describe()`. The page then renders but reports its namespace as
 * `unavailable`, with `writable=true` and `revision=undefined` — a state that
 * looks like a client bug and is not.
 *
 * `ctx.set()` without a matching `ctx.provide()` is exactly such a throw, so it
 * is pinned here.
 */
describe('plugin activation', () => {
  it('applies on a real Cordis context without throwing', () => {
    const ctx = new Context()
    expect(() => { plugin.apply(ctx as never) }).not.toThrow()
  })

  it('publishes its usage service only after providing it', () => {
    const ctx = new Context()
    plugin.apply(ctx as never)
    // Reading it back proves provide+set ran in the required order.
    expect(ctx.get('openDesignGoUsage')).toBeDefined()
  })
})
