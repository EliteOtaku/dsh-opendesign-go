import { describe, expect, it, vi } from 'vitest'
import {
  compareVersions,
  fetchLatestRelease,
  fetchLatestTag,
  parseLatestRelease,
  parseLatestTag,
  parseUpdate,
  pendingUpdate,
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

describe('pendingUpdate', () => {
  it('reports only a strictly newer version', () => {
    expect(pendingUpdate('0.1.2', { version: '0.1.3', homepage: undefined })).toBe('0.1.3')
    expect(pendingUpdate('0.1.2', { version: '0.1.2', homepage: undefined })).toBeUndefined()
    expect(pendingUpdate('0.1.2', { version: '0.1.1', homepage: undefined })).toBeUndefined()
  })

  it('says nothing when the registry was unreachable', () => {
    expect(pendingUpdate('0.1.2', undefined)).toBeUndefined()
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

describe('parseUpdate', () => {
  it('reads a pending update', () => {
    expect(parseUpdate(JSON.stringify({ current: '0.1.2', latest: '0.2.0' })))
      .toEqual({ current: '0.1.2', latest: '0.2.0', githubLatest: undefined, homepage: undefined })
  })

  it('keeps the notice when only the repository tag is ahead', () => {
    // A tag is pushed before the registry answers, so a card that required both
    // sources to be ahead would stay silent during the one window where the
    // GitHub route has something to install.
    expect(parseUpdate(JSON.stringify({ current: '0.1.2', latest: '0.1.2', githubLatest: '0.2.0' })))
      .toEqual({ current: '0.1.2', latest: undefined, githubLatest: '0.2.0', homepage: undefined })
  })

  it('suppresses a stale notice that no longer represents an upgrade', () => {
    // The field persists across upgrades; without this check a stale value would
    // render "newer version 0.1.0（当前 0.1.2）".
    expect(parseUpdate(JSON.stringify({ current: '0.1.2', latest: '0.1.0' }))).toBeUndefined()
    expect(parseUpdate(JSON.stringify({ current: '0.1.2', latest: '0.1.2' }))).toBeUndefined()
    expect(parseUpdate(JSON.stringify({ current: '0.1.2', latest: '0.1.2', githubLatest: '0.1.2' }))).toBeUndefined()
  })

  it('treats absent or malformed input as no notice', () => {
    expect(parseUpdate(undefined)).toBeUndefined()
    expect(parseUpdate('')).toBeUndefined()
    expect(parseUpdate('{')).toBeUndefined()
    expect(parseUpdate(JSON.stringify({ latest: '0.2.0' }))).toBeUndefined()
  })
})
