import { describe, expect, it } from 'vitest'
import { fetchGatewayModels } from '../src/catalog-fetch.ts'

/** A fetch double returning one canned JSON body. */
function respondWith(body: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, json: async () => body })) as unknown as typeof fetch
}

const BASE = 'https://amr-link.open-design.ai/v1'

describe('fetchGatewayModels', () => {
  it('reads the OpenAI-shaped list the gateway returns', async () => {
    const body = { data: [{ id: 'deepseek-v4.1-flash' }, { id: 'claude-sonnet-5.5' }] }
    await expect(fetchGatewayModels(BASE, 'key', respondWith(body))).resolves.toEqual([
      'deepseek-v4.1-flash',
      'claude-sonnet-5.5',
    ])
  })

  it('tolerates a bare array and a models key', async () => {
    // The endpoint is the gateway's, not a standard anyone documented; accepting
    // the three shapes it could plausibly take is cheaper than a 403-shaped bug
    // report from a user whose account answers differently.
    await expect(fetchGatewayModels(BASE, 'key', respondWith([{ id: 'a' }, { id: 'b' }])))
      .resolves.toEqual(['a', 'b'])
    await expect(fetchGatewayModels(BASE, 'key', respondWith({ models: [{ id: 'c' }] })))
      .resolves.toEqual(['c'])
  })

  it('drops duplicates and entries without a usable id', async () => {
    const body = { data: [{ id: 'a' }, { id: 'a' }, { id: '' }, { id: 42 }, {}, null] }
    await expect(fetchGatewayModels(BASE, 'key', respondWith(body))).resolves.toEqual(['a'])
  })

  it('returns undefined for a body it does not recognise', async () => {
    await expect(fetchGatewayModels(BASE, 'key', respondWith({ nope: true }))).resolves.toBeUndefined()
    await expect(fetchGatewayModels(BASE, 'key', respondWith(null))).resolves.toBeUndefined()
  })

  it('returns undefined on a non-2xx response', async () => {
    // A rejected key and a broken gateway both mean "no catalog this start"; the
    // caller falls back rather than distinguishing them.
    await expect(fetchGatewayModels(BASE, 'key', respondWith({ data: [{ id: 'a' }] }, false)))
      .resolves.toBeUndefined()
  })

  it('returns undefined rather than throwing when the request fails', async () => {
    // This runs in the activation path: an offline start must not be an error.
    const failing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    await expect(fetchGatewayModels(BASE, 'key', failing)).resolves.toBeUndefined()
  })

  it('sends the key as a bearer token against the models path', async () => {
    const calls: { url: string, init?: RequestInit }[] = []
    const recording = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { ok: true, json: async () => ({ data: [{ id: 'a' }] }) }
    }) as unknown as typeof fetch

    await fetchGatewayModels(BASE, 'secret-key', recording)

    expect(calls[0]?.url).toBe('https://amr-link.open-design.ai/v1/models')
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret-key')
  })

  it('strips a trailing slash from the base URL', async () => {
    const calls: string[] = []
    const recording = (async (url: string) => {
      calls.push(url)
      return { ok: true, json: async () => ({ data: [] }) }
    }) as unknown as typeof fetch

    await fetchGatewayModels('https://amr-link.open-design.ai/v1/', 'k', recording)
    expect(calls[0]).toBe('https://amr-link.open-design.ai/v1/models')
  })
})
