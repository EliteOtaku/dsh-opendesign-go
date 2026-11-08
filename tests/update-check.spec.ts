import { describe, expect, it, vi } from 'vitest'
import {
  compareVersions,
  fetchLatestRelease,
  fetchLatestTag,
  parseLatestRelease,
  parseLatestTag,
  parseVersionLine,
  snapshotOf,
  versionStateOf,
} from '../src/update-check.ts'

/** Minimal fetch double returning one canned response. */
function respondWith(body: unknown, ok = true): typeof fetch {
  return (async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('compareVersions', () => {
  it('orders dotted versions numerically, not lexically', () => {
    // The whole point: as strings "0.10.0" < "0.9.0", which would hide an update.
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('0.1.2', '0.1.10')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
  })

  it('treats equal versions as equal, including differing lengths', () => {
    expect(compareVersions('0.1.2', '0.1.2')).toBe(0)
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
  })

  it('ignores a prerelease suffix', () => {
    // This decides "is the user behind", and a suffix on either side would need
    // prerelease ordering that changes nothing the reader cares about.
    expect(compareVersions('0.1.2-rc.1', '0.1.2')).toBe(0)
    expect(compareVersions('0.1.3-beta', '0.1.2')).toBeGreaterThan(0)
  })

  it('does not crash on malformed input', () => {
    expect(() => compareVersions('', '')).not.toThrow()
    expect(compareVersions('abc', '0.0.0')).toBe(0)
  })
})

describe('parseLatestRelease', () => {
  it('reads the registry document', () => {
    expect(parseLatestRelease({ version: '0.2.0', homepage: 'https://example.test' }))
      .toEqual({ version: '0.2.0', homepage: 'https://example.test' })
  })

  it('rejects a body without a usable version', () => {
    // Returning undefined keeps a malformed response from being read as "no
    // update available", which would be a silent lie.
    expect(parseLatestRelease(null)).toBeUndefined()
    expect(parseLatestRelease({})).toBeUndefined()
    expect(parseLatestRelease({ version: '' })).toBeUndefined()
    expect(parseLatestRelease({ version: 42 })).toBeUndefined()
  })
})


describe('fetchLatestRelease', () => {
  it('reads the published version', async () => {
    const release = await fetchLatestRelease(respondWith({ version: '0.2.0' }))
    expect(release?.version).toBe('0.2.0')
  })

  it('stays quiet on a non-2xx response', async () => {
    expect(await fetchLatestRelease(respondWith({}, false))).toBeUndefined()
  })

  it('stays quiet when the request throws', async () => {
    // Offline, a blocked proxy, or DNS failure must not surface as an error: it
    // says nothing about whether the plugin works.
    const failing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    await expect(fetchLatestRelease(failing)).resolves.toBeUndefined()
  })

  it('stays quiet when the body is not JSON', async () => {
    const badJson = (async () => ({
      ok: true,
      json: async () => { throw new Error('not json') },
    })) as unknown as typeof fetch
    await expect(fetchLatestRelease(badJson)).resolves.toBeUndefined()
  })
})

describe('parseLatestTag', () => {
  it('reads the newest version out of the tag list', () => {
    expect(parseLatestTag([{ name: 'v0.1.13' }, { name: 'v0.1.12' }, { name: 'v0.1.11' }])).toBe('0.1.13')
  })

  it('takes the maximum rather than trusting the order', () => {
    // GitHub documents the order as newest-first but does not promise it, and a
    // mis-ordered page would otherwise report an old version as the newest.
    expect(parseLatestTag([{ name: 'v0.1.9' }, { name: 'v0.1.13' }, { name: 'v0.1.10' }])).toBe('0.1.13')
  })

  it('skips tags that are not a dotted version', () => {
    expect(parseLatestTag([{ name: 'docs-snapshot' }, { name: 'v0.1.13' }, { name: 'nightly' }])).toBe('0.1.13')
  })

  it('rejects a body that is not a tag list', () => {
    expect(parseLatestTag(null)).toBeUndefined()
    expect(parseLatestTag({})).toBeUndefined()
    expect(parseLatestTag([{ name: 'no-version-here' }, { nope: true }, null])).toBeUndefined()
  })
})

describe('fetchLatestTag', () => {
  it('reads the newest tag', async () => {
    await expect(fetchLatestTag(respondWith([{ name: 'v0.2.0' }, { name: 'v0.1.13' }]))).resolves.toBe('0.2.0')
  })

  it('sends the headers GitHub requires, since this call carries no credential', async () => {
    const calls: { url: string, init?: RequestInit }[] = []
    const recording = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { ok: true, json: async () => [{ name: 'v0.2.0' }] }
    }) as unknown as typeof fetch

    await fetchLatestTag(recording)

    expect(calls[0]?.url).toContain('/tags')
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['user-agent']).toBe('dsh-opendesign-go')
    expect(headers.accept).toBe('application/vnd.github+json')
  })

  it('stays quiet on a non-2xx response', async () => {
    // A rate-limited or missing repository says nothing about whether the plugin
    // works, so it must not surface as an error.
    await expect(fetchLatestTag(respondWith([], false))).resolves.toBeUndefined()
  })

  it('stays quiet when the request throws', async () => {
    const failing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    await expect(fetchLatestTag(failing)).resolves.toBeUndefined()
  })
})


describe('parseVersionLine', () => {
  const CURRENT = '0.1.16'
  /** Read one raw snapshot at a fixed local version. */
  const line = (raw: unknown, current = CURRENT) =>
    parseVersionLine(typeof raw === 'string' ? raw : JSON.stringify(raw), current)

  it('reads both sources and reports nothing to do when neither is ahead', () => {
    expect(line({ current: CURRENT, npm: '0.1.14', github: '0.1.16', checkedAt: '2026-11-08T09:00:00.000Z' }))
      .toEqual({
        current: CURRENT,
        npm: '0.1.14',
        github: '0.1.16',
        checkedAt: '2026-11-08T09:00:00.000Z',
        aheadOf: [],
        stale: false,
        writtenBy: undefined,
      })
  })

  it('names only the sources that are strictly newer', () => {
    expect(line({ current: CURRENT, npm: '0.1.16', github: '0.1.17' }).aheadOf).toEqual(['github'])
    expect(line({ current: CURRENT, npm: '0.1.17', github: '0.1.15' }).aheadOf).toEqual(['npm'])
    expect(line({ current: CURRENT, npm: '0.1.17', github: '0.1.17' }).aheadOf).toEqual(['npm', 'github'])
    // Equal is not ahead: an installed copy must never be told to update to itself.
    expect(line({ current: CURRENT, npm: CURRENT, github: CURRENT }).aheadOf).toEqual([])
  })

  it('keeps a source that did not answer as unknown instead of "no update"', () => {
    const onlyTag = line({ current: CURRENT, github: '0.1.16' })
    expect(onlyTag.npm).toBeUndefined()
    expect(onlyTag.github).toBe('0.1.16')

    const nothing = line({ current: CURRENT })
    expect(nothing.npm).toBeUndefined()
    expect(nothing.github).toBeUndefined()
  })

  it('reads the 0.1.15 shape once, so an upgrade does not lose the card', () => {
    expect(line({ current: CURRENT, latest: '0.1.17', githubLatest: '0.1.18' }))
      .toEqual({
        current: CURRENT,
        npm: '0.1.17',
        github: '0.1.18',
        checkedAt: undefined,
        aheadOf: ['npm', 'github'],
        stale: false,
        writtenBy: undefined,
      })
  })

  it('refuses remote numbers written by another build', () => {
    // The field persists across upgrades; last build's remote versions answer
    // last build's question, so showing them would state a fact about the wrong
    // question.
    expect(line({ current: '0.1.15', npm: '0.1.17', github: '0.1.18' }))
      .toEqual({
        current: CURRENT,
        npm: undefined,
        github: undefined,
        checkedAt: undefined,
        aheadOf: [],
        stale: true,
        writtenBy: '0.1.15',
      })
  })

  it('treats unreadable input as "nothing known" rather than throwing', () => {
    const empty = {
      current: CURRENT,
      npm: undefined,
      github: undefined,
      checkedAt: undefined,
      aheadOf: [],
      stale: false,
      writtenBy: undefined,
    }
    for (const raw of [undefined, '', '{', 'null', '[]', '42', '"x"']) {
      expect(() => parseVersionLine(raw, CURRENT)).not.toThrow()
    }
    expect(parseVersionLine(undefined, CURRENT)).toEqual(empty)
    expect(parseVersionLine('', CURRENT)).toEqual(empty)
    expect(parseVersionLine('{', CURRENT)).toEqual(empty)
    expect(parseVersionLine(JSON.stringify({ npm: '0.1.17' }), CURRENT)).toEqual(empty)
  })
})

describe('versionStateOf', () => {
  const BASE = {
    current: '0.1.16',
    npm: undefined,
    github: undefined,
    checkedAt: undefined,
    aheadOf: [],
    stale: false,
    writtenBy: undefined,
  } as const

  it('reports outdated as soon as any source is ahead', () => {
    expect(versionStateOf({ ...BASE, aheadOf: ['npm'] })).toBe('outdated')
    expect(versionStateOf({ ...BASE, aheadOf: ['github'] })).toBe('outdated')
    expect(versionStateOf({ ...BASE, aheadOf: ['npm', 'github'] })).toBe('outdated')
  })

  it('reports current only when both sources answered and neither is ahead', () => {
    expect(versionStateOf({ ...BASE, npm: '0.1.16', github: '0.1.16' })).toBe('current')
    expect(versionStateOf({ ...BASE, npm: '0.1.14', github: '0.1.15' })).toBe('current')
  })

  it('reports unknown when a source did not answer', () => {
    expect(versionStateOf({ ...BASE, npm: '0.1.16' })).toBe('unknown')
    expect(versionStateOf({ ...BASE, github: '0.1.16' })).toBe('unknown')
    expect(versionStateOf(BASE)).toBe('unknown')
  })
})


describe('snapshotOf', () => {
  const AT = new Date('2026-11-08T09:00:00.000Z')
  /** Parse the JSON back so the assertion reads as a shape, not a string. */
  const shape = (json: string): unknown => JSON.parse(json)

  it('records both sources when both answered', () => {
    expect(shape(snapshotOf({ version: '0.1.17', homepage: undefined }, '0.1.18', AT, '0.1.16')))
      .toEqual({ current: '0.1.16', npm: '0.1.17', github: '0.1.18', checkedAt: '2026-11-08T09:00:00.000Z' })
  })

  it('omits a source that did not answer instead of writing null', () => {
    // Absent and null would both serialize, but only absent means "not checked".
    expect(shape(snapshotOf(undefined, undefined, AT, '0.1.16')))
      .toEqual({ current: '0.1.16', checkedAt: '2026-11-08T09:00:00.000Z' })
    expect(shape(snapshotOf(undefined, '0.1.18', AT, '0.1.16')))
      .toEqual({ current: '0.1.16', github: '0.1.18', checkedAt: '2026-11-08T09:00:00.000Z' })
  })

  it('keeps a source that answered with a version behind this build', () => {
    // The registry can trail the repository; the number is still worth showing
    // so a missing button has a visible explanation.
    expect(shape(snapshotOf({ version: '0.1.14', homepage: undefined }, undefined, AT, '0.1.16')))
      .toEqual({ current: '0.1.16', npm: '0.1.14', checkedAt: '2026-11-08T09:00:00.000Z' })
  })
})
