import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenDesignAdapter, isRetryableAccountFailure } from '../src/adapter.ts'
import type { OpenDesignConfig } from '../src/config-contract.ts'
import { DEFAULT_BASE_URL } from '../src/config-contract.ts'
import { LlmError } from '@deepseek-ai/dsh-llm'

/** Minimal config with the two accounts this suite exercises. */
const CONFIG: OpenDesignConfig = {
  enabled: true,
  apiKeyEnv: 'OPENDESIGN_ACCOUNT_1',
  accounts: [
    { id: 'a', name: '主账号', apiKeyEnv: 'OPENDESIGN_ACCOUNT_1' },
    { id: 'b', name: '备用账号', apiKeyEnv: 'OPENDESIGN_ACCOUNT_2' },
  ],
  autoSwitch: true,
  sessionRef: '',
  workspaceId: '',
  baseURL: DEFAULT_BASE_URL,
  requestTimeoutMs: 1_800_000,
  streamIdleTimeoutMs: 300_000,
}

/** A one-line SSE body that produces a text block then finishes. */
function sseBody(text = 'ok'): string {
  return [
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: 'stop' }] })}`,
    'data: [DONE]',
    '',
  ].join('\n\n')
}

/** Build a request shaped like the harness would send. */
function request() {
  return {
    provider: 'dsh-opendesign-go',
    model: 'deepseek-v4.1-flash',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  } as never
}

/** Drain an async iterable into an array. */
async function collect(iterable: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = []
  for await (const chunk of iterable) out.push(chunk)
  return out
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('account fallback', () => {
  it('moves to the next account when the first credential is rejected', async () => {
    const attempts: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const authorization = (init.headers as Record<string, string>).authorization ?? ''
      attempts.push(authorization.replace('Bearer ', ''))
      if (authorization.endsWith('key-1')) {
        return new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: 'bad key' } }), { status: 401 })
      }
      return new Response(sseBody(), { status: 200 })
    }))

    const settled: string[] = []
    const adapter = new OpenDesignAdapter({
      config: () => CONFIG,
      resolveApiKey: async (ref) => (ref === 'OPENDESIGN_ACCOUNT_1' ? 'key-1' : 'key-2'),
      onAccountSettled: (ref) => { settled.push(ref) },
    })

    const chunks = await collect(adapter.stream(request()))

    expect(attempts).toEqual(['key-1', 'key-2'])
    expect(chunks.some((chunk) => (chunk as { type: string }).type === 'finish')).toBe(true)
    // Promotion happens only after output, and it names the account that worked.
    expect(settled).toEqual(['OPENDESIGN_ACCOUNT_2'])
  })

  it('does not try another account when auto-switch is off', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1
      return new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: 'bad key' } }), { status: 401 })
    }))

    const adapter = new OpenDesignAdapter({
      config: () => ({ ...CONFIG, autoSwitch: false }),
      resolveApiKey: async () => 'key-1',
    })

    await expect(collect(adapter.stream(request()))).rejects.toBeInstanceOf(LlmError)
    expect(calls).toBe(1)
  })

  it('does not fail over on a transport error that would repeat everywhere', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1
      return new Response('{"error":{"message":"bad request"}}', { status: 400 })
    }))

    const adapter = new OpenDesignAdapter({
      config: () => CONFIG,
      resolveApiKey: async () => 'key-1',
    })

    await expect(collect(adapter.stream(request()))).rejects.toBeInstanceOf(LlmError)
    expect(calls).toBe(1)
  })

  it('resolves a per-account key instead of one shared credential', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sseBody(), { status: 200 })))

    const adapter = new OpenDesignAdapter({
      config: () => CONFIG,
      resolveApiKey: async (ref) => { seen.push(ref); return 'key' },
    })

    await collect(adapter.stream(request()))
    expect(seen).toEqual(['OPENDESIGN_ACCOUNT_1'])
  })

  it('reports a missing credential for the account it actually tried', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const adapter = new OpenDesignAdapter({
      config: () => ({ ...CONFIG, autoSwitch: false }),
      resolveApiKey: async () => undefined,
    })

    await expect(collect(adapter.stream(request()))).rejects.toThrow(/OPENDESIGN_ACCOUNT_1/)
  })
})

describe('isRetryableAccountFailure', () => {
  it('treats a rejected credential and exhausted quota as retryable', () => {
    expect(isRetryableAccountFailure(new LlmError('x', 'INVALID_CREDENTIAL'))).toBe(true)
    expect(isRetryableAccountFailure(new LlmError('x', 'QUOTA'))).toBe(true)
    expect(isRetryableAccountFailure(new LlmError('x', 'ACCOUNT_QUOTA'))).toBe(true)
  })

  it('keeps everything else on the same account', () => {
    expect(isRetryableAccountFailure(new LlmError('x', 'SERVER'))).toBe(false)
    expect(isRetryableAccountFailure(new LlmError('x', 'TIMEOUT'))).toBe(false)
    expect(isRetryableAccountFailure(new Error('plain'))).toBe(false)
  })
})
