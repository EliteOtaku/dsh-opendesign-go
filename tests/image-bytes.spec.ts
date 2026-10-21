import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { imageResolverOf, mediaTypeOf } from '../src/image-bytes.ts'

/**
 * These tests exist because every failure in this module is invisible.
 *
 * A resolver that answers `undefined` does not throw; the request carries the
 * harness placeholder text instead, and the user sees a model that "cannot see
 * images". The seam was in fact reading the attachment store from a context that
 * never declared it, so it answered `undefined` for every image while all other
 * behaviour looked correct. Each branch is pinned here so that failure has to
 * fail a test rather than reach a user.
 */
describe('image bytes', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  /** Write one file with known bytes and return its path. */
  const fixture = (name: string, bytes: Buffer): string => {
    const dir = mkdtempSync(join(tmpdir(), 'opendesign-image-'))
    dirs.push(dir)
    const path = join(dir, name)
    writeFileSync(path, bytes)
    return path
  }

  it('turns a store path into a data URL carrying the exact bytes', () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10])
    const path = fixture('shot.png', bytes)
    const resolve = imageResolverOf(() => ({ imageHostPath: () => path }), () => undefined)
    expect(resolve({ attachmentId: 'sha256:abc' })).toBe(`data:image/png;base64,${bytes.toString('base64')}`)
  })

  it('declares the media type the store normalized to', () => {
    for (const [name, media] of [
      ['a.jpg', 'image/jpeg'],
      ['a.jpeg', 'image/jpeg'],
      ['a.webp', 'image/webp'],
      ['a.gif', 'image/gif'],
      ['a.png', 'image/png'],
      ['a.unknown', 'image/png'],
    ] as const) {
      const path = fixture(name, Buffer.from([1]))
      const resolve = imageResolverOf(() => ({ imageHostPath: () => path }), () => undefined)
      expect(resolve({}), `${name} should declare ${media}`).toMatch(new RegExp(`^data:${media};base64,`))
    }
  })

  it('answers undefined when no store is mounted, so the caller can use a placeholder', () => {
    const resolve = imageResolverOf(() => undefined, () => undefined)
    expect(resolve({ attachmentId: 'sha256:abc' })).toBeUndefined()
  })

  it('answers undefined when the store keeps no local file for the reference', () => {
    const resolve = imageResolverOf(() => ({ imageHostPath: () => undefined }), () => undefined)
    expect(resolve({})).toBeUndefined()
  })

  it('answers undefined when the store cannot map paths at all', () => {
    const resolve = imageResolverOf(() => ({}), () => undefined)
    expect(resolve({})).toBeUndefined()
  })

  it('reports a read failure instead of throwing into the request', () => {
    const warnings: string[] = []
    const resolve = imageResolverOf(
      () => ({ imageHostPath: () => join(tmpdir(), 'opendesign-does-not-exist', 'x.png') }),
      (message) => { warnings.push(message) },
    )
    expect(resolve({})).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('could not read image bytes')
  })

  it('reads the store lazily, so a late mount is still used', () => {
    const bytes = Buffer.from('late')
    const path = fixture('late.png', bytes)
    let store: { imageHostPath?: (ref: unknown) => string | undefined } | undefined
    const resolve = imageResolverOf(() => store, () => undefined)
    // Before the mount there are no bytes; the same resolver must pick the store
    // up afterwards rather than being fixed at the moment it was created.
    expect(resolve({})).toBeUndefined()
    store = { imageHostPath: () => path }
    expect(resolve({})).toBe(`data:image/png;base64,${bytes.toString('base64')}`)
  })

  it('falls back to PNG for an extension the store never produces', () => {
    expect(mediaTypeOf('C:\\cache\\attachment.bin')).toBe('image/png')
    expect(mediaTypeOf('C:\\cache\\ATTACHMENT.JPEG')).toBe('image/jpeg')
  })
})
