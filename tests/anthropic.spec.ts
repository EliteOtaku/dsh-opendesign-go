/**
 * Anthropic Messages surface contract tests.
 *
 * Every wire fact asserted here was measured against the gateway rather than
 * taken from the documentation, because several differ: `anthropic-version` is
 * mandatory, `reasoning_effort` is inert while `thinking: disabled` is not, and
 * `input_tokens` excludes the cache read instead of including it. The adapter
 * tests at the end check the request this surface actually sends.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ToolCallId,
  createAssistantMessage,
  createSystemMessage,
  createToolResultMessage,
} from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  anthropicUsage,
  mapAnthropicStop,
  toAnthropicRequest,
  toAnthropicTools,
  translateAnthropicEvent,
} from '../src/anthropic.ts'
import { createStreamState } from '../src/stream-state.ts'
import { OpenDesignAdapter } from '../src/adapter.ts'
import { ANTHROPIC_VERSION } from '../src/config-contract.ts'
import type { OpenDesignConfig } from '../src/config-contract.ts'

const MODEL = 'deepseek-v4.1-flash'

/** Build one minimal request, overridable per test. */
function request(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'dsh-opendesign-go',
    model: MODEL,
    messages: [{ role: 'user', content: [{ type: 'text', text: '你好' }] }],
    ...overrides,
  }
}

/** Feed raw JSON events through the translator and collect every chunk. */
function translate(payloads: readonly unknown[]): StreamChunk[] {
  const state = createStreamState()
  const chunks: StreamChunk[] = []
  for (const payload of payloads) chunks.push(...translateAnthropicEvent(state, JSON.stringify(payload)))
  return chunks
}

/** The `message_delta` event that carries the real counts and stop reason. */
function messageDelta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: {
      input_tokens: 35,
      output_tokens: 30,
      cache_read_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    },
    ...overrides,
  }
}

describe('toAnthropicRequest', () => {
  it('hoists every system-level message into the top-level `system` field', () => {
    // This surface has one `system` string and no system role, so a later
    // guidance message has nowhere else to go: dropping it would silently
    // change the request's instructions.
    const projected = toAnthropicRequest({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [
        createSystemMessage('历史提示'),
        { role: 'user', content: [{ type: 'text', text: '问题' }] },
        createSystemMessage('插入提示'),
        { role: 'user', content: [{ type: 'text', text: '继续' }] },
      ],
    })

    expect(projected.system).toBe('历史提示\n\n插入提示')
    expect(projected.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: '问题' }] },
      { role: 'user', content: [{ type: 'text', text: '继续' }] },
    ])
  })

  it('merges the one-shot system prompt ahead of the history prompts', () => {
    const projected = toAnthropicRequest({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [createSystemMessage('历史提示'), { role: 'user', content: [{ type: 'text', text: '问题' }] }],
      system: '请求提示',
    })

    expect(projected.system).toBe('请求提示\n\n历史提示')
  })

  it('projects a tool call as tool_use and its result as a user tool_result', () => {
    const callId = ToolCallId('call_1')
    const projected = toAnthropicRequest({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [
        createAssistantMessage({
          content: [{ type: 'tool-call', id: callId, name: 'get_weather', arguments: '{"city":"北京"}' }],
          source: { provider: 'dsh-opendesign-go', model: MODEL },
        }),
        createToolResultMessage({ callId, content: [{ type: 'text', text: '晴' }], isError: false }),
      ],
    })

    // The arguments are a parsed object here, not the raw JSON text.
    expect(projected.messages).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'call_1', name: 'get_weather', input: { city: '北京' } }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '晴' }],
      },
    ])
  })

  it('folds a run of tool results into one user turn', () => {
    // One assistant turn may issue several calls whose results arrive as
    // consecutive messages; this surface expects them together.
    const first = ToolCallId('call_a')
    const second = ToolCallId('call_b')
    const projected = toAnthropicRequest({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [
        createAssistantMessage({
          content: [
            { type: 'tool-call', id: first, name: 'f', arguments: '{}' },
            { type: 'tool-call', id: second, name: 'f', arguments: '{}' },
          ],
          source: { provider: 'dsh-opendesign-go', model: MODEL },
        }),
        createToolResultMessage({ callId: first, content: [{ type: 'text', text: '一' }], isError: false }),
        createToolResultMessage({ callId: second, content: [{ type: 'text', text: '二' }], isError: false }),
      ],
    })

    expect(projected.messages).toHaveLength(2)
    expect(projected.messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'call_a', content: '一' },
        { type: 'tool_result', tool_use_id: 'call_b', content: '二' },
      ],
    })
  })

  it('sends an image as base64 source with the media type split out', () => {
    const projected = toAnthropicRequest(
      request({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '看图' },
            {
              type: 'image',
              attachment: { attachmentId: 'a1', mediaType: 'image/png', bytes: 0, width: 1, height: 1 },
            },
          ],
        }],
      }),
      () => 'data:image/png;base64,AAAA',
    )

    expect(projected.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '看图' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      ],
    })
  })

  it('maps tool schemas onto `input_schema`', () => {
    const tools = toAnthropicTools(request({
      tools: [{ name: 'get_weather', description: '查天气', parameters: { type: 'object' } }],
    }))

    expect(tools).toEqual([
      { name: 'get_weather', description: '查天气', input_schema: { type: 'object' } },
    ])
  })

  it('reports the absence of tools rather than an empty array', () => {
    expect(toAnthropicTools(request())).toBeUndefined()
  })
})

describe('translateAnthropicEvent', () => {
  it('translates thinking, text and the terminal events into chunks', () => {
    const state = createStreamState()
    const chunks: StreamChunk[] = []
    const feed = (payloads: readonly unknown[]): void => {
      for (const payload of payloads) chunks.push(...translateAnthropicEvent(state, JSON.stringify(payload)))
    }
    feed([
      { type: 'message_start', message: { id: 'm1', usage: { input_tokens: 0, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '想一想' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '你好' } },
      { type: 'content_block_stop', index: 1 },
      messageDelta(),
      { type: 'message_stop' },
    ])

    expect(chunks[0]).toMatchObject({ type: 'block-start', blockType: 'reasoning' })
    expect(chunks[1]).toMatchObject({ type: 'reasoning-delta', text: '想一想' })
    expect(chunks.some((chunk) => chunk.type === 'text-delta' && chunk.text === '你好')).toBe(true)
    // The translator owns the chunks up to `message_stop`; usage and the finish
    // chunk are emitted by the adapter after the stream ends, so only the
    // assembled counts are asserted here.
    expect(state.usage).toMatchObject({ inputTokens: 35, outputTokens: 30 })
    expect(state.finishReason).toEqual({ kind: 'stop' })
    expect(chunks.at(-1)).toMatchObject({ type: 'block-end' })
  })

  it('opens a tool call at content_block_start and appends its argument deltas', () => {
    const state = createStreamState()
    const chunks: StreamChunk[] = []
    for (const payload of [
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'call_1', name: 'get_weather', input: {} },
      },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"city"' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: ':"北京"}' } },
      messageDelta({ delta: { stop_reason: 'tool_use', stop_sequence: null } }),
      { type: 'message_stop' },
    ]) chunks.push(...translateAnthropicEvent(state, JSON.stringify(payload)))

    expect(chunks[0]).toMatchObject({ type: 'block-start', blockType: 'tool-call' })
    const deltas = chunks.filter((chunk) => chunk.type === 'tool-call-delta')
    expect(deltas).toHaveLength(2)
    const end = chunks.find((chunk) => chunk.type === 'block-end')
    expect(end).toMatchObject({
      block: { type: 'tool-call', id: 'call_1', name: 'get_weather', arguments: '{"city":"北京"}' },
    })
    expect(state.finishReason).toEqual({ kind: 'tool-calls' })
  })

  it('takes the real counts from message_delta, not the zeros on message_start', () => {
    const state = createStreamState()
    for (const payload of [
      { type: 'message_start', message: { usage: { input_tokens: 0, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
      messageDelta({ usage: { input_tokens: 245, output_tokens: 7, cache_read_input_tokens: 2432 } }),
      { type: 'message_stop' },
    ]) translateAnthropicEvent(state, JSON.stringify(payload))

    // Disjoint counts: 245 uncached + 2432 cached were measured to add up to the
    // cold prompt, so the cache share must NOT be subtracted from input again.
    expect(state.usage).toMatchObject({
      inputTokens: 245,
      outputTokens: 7,
      cacheReadTokens: 2432,
      totalTokens: 2684,
    })
  })

  it('throws a classified failure for an in-band error event', () => {
    // The gateway reports quota and credential failures as `error` events inside
    // an otherwise 200 stream, so they must not be swallowed as keep-alives.
    expect(() => translate([
      { type: 'error', error: { type: 'authentication_error', message: 'api key not found' } },
    ])).toThrow(/api key/)
  })

  it('keeps pings and unknown events out of the chunk stream', () => {
    const state = createStreamState()

    expect(translateAnthropicEvent(state, 'not json')).toEqual([])
    expect(translateAnthropicEvent(state, JSON.stringify({ type: 'ping' }))).toEqual([])
    expect(translateAnthropicEvent(state, JSON.stringify({ type: 'content_block_stop', index: 0 }))).toEqual([])
  })
})

describe('anthropicUsage', () => {
  it('sums both cache-creation windows into the write count', () => {
    const usage = anthropicUsage({
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 100,
      cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 30 },
    })

    expect(usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 100,
      cacheWriteTokens: 50,
      totalTokens: 165,
    })
  })

  it('omits the cache members when the gateway reports zero', () => {
    const usage = anthropicUsage({
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    })

    expect(usage).not.toHaveProperty('cacheReadTokens')
    expect(usage).not.toHaveProperty('cacheWriteTokens')
  })

  it('reports nothing when either count is missing', () => {
    expect(anthropicUsage({ input_tokens: 10 })).toBeUndefined()
    expect(anthropicUsage({ output_tokens: 5 })).toBeUndefined()
  })
})

describe('mapAnthropicStop', () => {
  it('maps the three reasons this surface sends', () => {
    expect(mapAnthropicStop('max_tokens', false)).toEqual({ kind: 'max-tokens' })
    expect(mapAnthropicStop('tool_use', false)).toEqual({ kind: 'tool-calls' })
    expect(mapAnthropicStop('end_turn', false)).toEqual({ kind: 'stop' })
  })

  it('treats a missing stop reason with an open call as a tool-call stop', () => {
    expect(mapAnthropicStop(undefined, true)).toEqual({ kind: 'tool-calls' })
    expect(mapAnthropicStop(undefined, false)).toEqual({ kind: 'stop' })
  })
})

describe('OpenDesignAdapter on the Anthropic surface', () => {
  const CONFIG: OpenDesignConfig = {
    enabled: true,
    apiKeyEnv: 'OPENDESIGN_API_KEY',
    accounts: null,
    autoSwitch: false,
    baseURL: 'https://gateway.test/v1',
    protocol: 'anthropic',
    requestTimeoutMs: 120_000,
    streamIdleTimeoutMs: 30_000,
  }

  /** Build one adapter reading a fixed configuration. */
  function adapterWith(config: OpenDesignConfig = CONFIG): OpenDesignAdapter {
    return new OpenDesignAdapter({ config: () => config, resolveApiKey: async () => 'sk-test' })
  }

  /** Build an SSE response body from raw `data:` payloads. */
  function sse(payloads: readonly string[]): Response {
    const body = payloads.map((payload) => `data: ${payload}\n\n`).join('')
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }

  /** Replace global `fetch` with a one-response stub and return the mock. */
  function stubFetch(response: Response) {
    const mock = vi.fn(async (_input: string, _init: RequestInit) => response)
    vi.stubGlobal('fetch', mock)
    return mock
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts to `/messages` with x-api-key, the version header and this surface\'s fields', async () => {
    const fetchMock = stubFetch(sse([
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }),
      JSON.stringify(messageDelta()),
      JSON.stringify({ type: 'message_stop' }),
    ]))

    const seen: StreamChunk[] = []
    for await (const chunk of adapterWith().stream(request({
      system: '你是助手',
      tools: [{ name: 'get_weather', description: '查天气', parameters: { type: 'object' } }],
      maxTokens: 4096,
      reasoningEffort: 'high' as never,
      stop: ['END'],
    }))) seen.push(chunk)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://gateway.test/v1/messages')
    const headers = init.headers as Record<string, string>
    // These two are wire requirements: without the version header the gateway
    // answers 400, and without x-api-key it answers 401.
    expect(headers['x-api-key']).toBe('sk-test')
    expect(headers['anthropic-version']).toBe(ANTHROPIC_VERSION)
    expect(headers.authorization).toBeUndefined()

    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: MODEL,
      stream: true,
      system: '你是助手',
      // `thinking`, not `reasoning_effort`: the latter was measured inert here.
      thinking: { type: 'enabled', budget_tokens: 4096 },
      stop_sequences: ['END'],
      tools: [{ name: 'get_weather', description: '查天气', input_schema: { type: 'object' } }],
    })
    // `max_tokens` is mandatory on this surface, so it is always present.
    expect(typeof body.max_tokens).toBe('number')

    expect(seen.at(-1)).toMatchObject({ type: 'finish' })
    expect(seen.some((chunk) => chunk.type === 'text-delta' && chunk.text === 'ok')).toBe(true)
  })

  it('disables thinking when the effort is none', async () => {
    const fetchMock = stubFetch(sse([
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }),
      JSON.stringify(messageDelta()),
      JSON.stringify({ type: 'message_stop' }),
    ]))

    for await (const _chunk of adapterWith().stream(request({ reasoningEffort: 'none' as never }))) {
      /* drain */
    }

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body))
    // Measured: this is the only switch that actually removes the thinking
    // block; every other effort value leaves the model's default on.
    expect(body.thinking).toEqual({ type: 'disabled' })
  })

  it('omits thinking entirely when the caller expressed no preference', async () => {
    const fetchMock = stubFetch(sse([
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }),
      JSON.stringify(messageDelta()),
      JSON.stringify({ type: 'message_stop' }),
    ]))

    for await (const _chunk of adapterWith().stream(request())) { /* drain */ }

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body))
    expect(body).not.toHaveProperty('thinking')
  })

  it('keeps the other two surfaces on their own paths and headers', async () => {
    // The switch is per request, so a regression in one branch is exactly the
    // kind of thing a user notices as "I picked the other protocol and it broke".
    for (const [protocol, path] of [
      ['chat', 'chat/completions'],
      ['responses', 'responses'],
    ] as const) {
      // Each protocol needs its own stream shape: the chat stub is reused only
      // for the two OpenAI-shaped surfaces.
      const fetchMock = stubFetch(protocol === 'chat'
        ? sse([
            JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
            '[DONE]',
          ])
        : sse([
            JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'ok' }),
            JSON.stringify({ type: 'response.completed', response: { status: 'completed' } }),
            '[DONE]',
          ]))
      for await (const _chunk of adapterWith({ ...CONFIG, protocol }).stream(request())) { /* drain */ }
      const [url, init] = fetchMock.mock.calls[0]!
      expect(url).toBe(`https://gateway.test/v1/${path}`)
      const headers = init.headers as Record<string, string>
      expect(headers.authorization).toBe('Bearer sk-test')
      expect(headers['x-api-key']).toBeUndefined()
      vi.unstubAllGlobals()
    }
  })
})
