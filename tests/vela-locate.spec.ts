import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { platform } from 'node:os'
import { locateVela } from '../src/vela-locate.ts'

const NAME = platform() === 'win32' ? 'vela.exe' : 'vela'

/**
 * `locateVela` takes its existence probe and install roots as parameters, so
 * these tests describe the search order rather than whatever happens to be
 * installed on the machine running them — this repository's own development
 * machine has the OpenDesign app, and a test that assumed otherwise would pass
 * or fail by accident.
 */
describe('locateVela', () => {
  it('prefers an explicit override', () => {
    const found = locateVela(
      { OPENDESIGN_VELA_PATH: '/custom/vela', PATH: '/path-dir' },
      (path) => path === '/custom/vela' || path === join('/path-dir', NAME),
      ['/app-root'],
    )
    expect(found).toEqual({ path: '/custom/vela', via: 'env' })
  })

  it('ignores an override pointing at nothing', () => {
    expect(locateVela({ OPENDESIGN_VELA_PATH: '/missing', PATH: '' }, () => false, [])).toBeUndefined()
  })

  it('prefers the app-bundled copy over PATH, because that one shares the login', () => {
    const bundled = join('/app-root', NAME)
    const found = locateVela(
      { PATH: '/path-dir' },
      (path) => path === bundled || path === join('/path-dir', NAME),
      ['/app-root'],
    )
    expect(found).toEqual({ path: bundled, via: 'open-design-install' })
  })

  it('falls back to PATH when the app is not installed', () => {
    const onPath = join('/path-dir', NAME)
    const found = locateVela({ PATH: '/path-dir' }, (path) => path === onPath, ['/app-root'])
    expect(found).toEqual({ path: onPath, via: 'path' })
  })

  it('returns undefined when nothing is found', () => {
    expect(locateVela({ PATH: '/a:/b' }, () => false, ['/app-root'])).toBeUndefined()
  })

  it('skips empty PATH entries instead of probing the cwd', () => {
    const found = locateVela({ PATH: '::' }, (path) => path === NAME, [])
    expect(found).toBeUndefined()
  })
})
