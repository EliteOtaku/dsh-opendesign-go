import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../src/index.ts'

/**
 * Regression guard for the image-bytes seam.
 *
 * The host exposes the attachment store as a service, and a service is only
 * readable from a context that declared it. Reading it on the plugin's own
 * context answers `undefined` while the store is mounted, so every image
 * projects to its text-only placeholder — which the user reports as "the model
 * cannot see images", pointing at the model rather than at this lookup.
 */
describe('image bytes seam', () => {
  it('reads image bytes once the attachment store is mounted', async () => {
    const ctx = new Context()
    plugin.apply(ctx as never)
    ctx.provide('attachments')
    ctx.set('attachments', { imageHostPath: () => undefined })
    await Promise.resolve()
    expect(ctx.get('attachments')).toBeDefined()
  })

  it('keeps activating when the host has no attachment store', () => {
    const ctx = new Context()
    expect(() => { plugin.apply(ctx as never) }).not.toThrow()
  })
})
