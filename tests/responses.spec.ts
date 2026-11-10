/**
 * Responses-surface contract tests.
 *
 * The projection and the event translator are pure, so they are asserted
 * directly. The adapter tests at the end check the wire request the surface
 * actually sends — that is the part a user switching protocols observes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ToolCallId,
  createAssistantMessage,
  createSystemMessage,
  createToolResultMessage,
} from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  mapResponsesStop,
  toResponsesRequest,
  toResponsesTools,
  translateResponsesEvent,
} from '../src/responses.ts'
import { createStreamState } from '../src/stream-state.ts'
import { OpenDesignAdapter } from '../src/adapter.ts'
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
  for (const payload of payloads) chunks.push(...translateResponsesEvent(state, JSON.stringify(payload)))
  return chunks
}

/** The terminal event a completed response carries, with usage. */
function completed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'response.completed',
    response: {
      status: 'completed',
      incomplete_details: null,
      usage: {
        input_tokens: 10,
        output_tokens: 2,
        total_tokens: 12,
        input_tokens_details: { cached_tokens: 0, cached_read_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
      ...overrides,
    },
  }
}

describe('toResponsesRequest', () => {
  it('hoists the leading system message into `instructions`', () => {
    const projected = toResponsesRequest({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [createSystemMessage('历史提示'), { role: 'user', content: [{ type: 'text', text: '问题' }] }],
    })

    // Sending the prompt as a message as well would duplicate it in two roles.
    expect(projected.instructions).toBe('历史提示')
    expect(projected.input).toEqual([{ role: 'user', content: '问题' }])
  })

  it('merges the one-shot system prompt ahead of the leading system message', () => {
    const projected = toResponsesRequest({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [createSystemMessage('历史提示'), { role: 'user', content: [{ type: 'text', text: '问题' }] }],
      system: '请求提示',
    })

    expect(projected.instructions).toBe('请求提示\n\n历史提示')
  })

  it('keeps a system message that is not leading', () => {
    // Only the first message can become `instructions`; a later one has to
    // travel as a message or its content would be lost.
    const projected = toResponsesRequest({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [
        { role: 'user', content: [{ type: 'text', text: '问题' }] },
        createSystemMessage('插入提示'),
        { role: 'user', content: [{ type: 'text', text: '继续' }] },
      ],
    })

    expect(projected.instructions).toBeUndefined()
    expect(projected.input).toHaveLength(3)
    expect(projected.input[1]).toEqual({ role: 'system', content: '插入提示' })
  })

  it('projects an assistant tool call and its result as a paired exchange', () => {
    const callId = ToolCallId('call_1')
    const projected = toResponsesRequest({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [
        createAssistantMessage({
          content: [{ type: 'tool-call', id: callId, name: 'get_weather', arguments: '{"city":"Paris"}' }],
          source: { provider: 'dsh-opendesign-go', model: MODEL },
        }),
        createToolResultMessage({ callId, content: [{ type: 'text', text: '晴' }], isError: false }),
      ],
    })

    expect(projected.input).toEqual([
      { type: 'function_call', call_id: 'call_1', name: 'get_weather', arguments: '{"city":"Paris"}' },
      { type: 'function_call_output', call_id: 'call_1', output: '晴' },
    ])
  })

  it('carries assistant text alongside the tool call it issued', () => {
    const callId = ToolCallId('call_2')
    const projected = toResponsesRequest({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [
        createAssistantMessage({
          content: [
            { type: 'text', text: '我查一下' },
            { type: 'tool-call', id: callId, name: 'get_weather', arguments: '{}' },
          ],
          source: { provider: 'dsh-opendesign-go', model: MODEL },
        }),
        createToolResultMessage({ callId, content: [{ type: 'text', text: '晴' }], isError: false }),
      ],
    })

    expect(projected.input[0]).toEqual({ role: 'assistant', content: '我查一下' })
    expect(projected.input[1]).toMatchObject({ type: 'function_call', call_id: 'call_2' })
    expect(projected.input[2]).toMatchObject({ type: 'function_call_output', call_id: 'call_2' })
  })

  it('projects image content to input_image parts when a resolver is supplied', () => {
    const image = { type: 'image', attachment: { id: 'attachment-1' } } as unknown as ContentBlock
    const url = 'data:image/png;base64,AAAA'
    const projected = toResponsesRequest(
      {
        provider: 'dsh-opendesign-go',
        model: MODEL,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'look' }, image] }],
      },
      () => url,
    )

    expect(projected.input[0]).toEqual({
      role: 'user',
      content: [
        { type: 'input_text', text: 'look' },
        { type: 'input_image', image_url: url },
      ],
    })
  })

  it('lifts the images out of a tool result into the next user turn', () => {
    // A `function_call_output` carries a string here, so a picture a tool
    // returned has to ride in a following user item.
    const callId = ToolCallId('call_3')
    const image = { type: 'image', attachment: { id: 'attachment-3' } } as unknown as ContentBlock
    const projected = toResponsesRequest(
      {
        provider: 'dsh-opendesign-go',
        model: MODEL,
        messages: [
          createAssistantMessage({
            content: [{ type: 'tool-call', id: callId, name: 'screenshot', arguments: '{}' }],
            source: { provider: 'dsh-opendesign-go', model: MODEL },
          }),
          createToolResultMessage({ callId, content: [{ type: 'text', text: 'here' }, image], isError: false }),
        ],
      },
      () => 'data:image/png;base64,BBBB',
    )

    expect(projected.input[1]).toEqual({ type: 'function_call_output', call_id: 'call_3', output: 'here' })
    expect(projected.input[2]).toMatchObject({ role: 'user' })
    expect(JSON.stringify(projected.input[2])).toContain('input_image')
  })

  it('omits tools and instructions when the request declares neither', () => {
    const projected = toResponsesRequest(request())

    expect(projected.tools).toBeUndefined()
    expect(projected.instructions).toBeUndefined()
    expect(projected.input).toEqual([{ role: 'user', content: '你好' }])
  })
})

describe('toResponsesTools', () => {
  it('omits tools when the request declares none', () => {
    expect(toResponsesTools(request())).toBeUndefined()
  })

  it('maps tool schemas onto flat function declarations', () => {
    // Responses has no `function` wrapper, which is the whole shape difference.
    expect(
      toResponsesTools(request({ tools: [{ name: 'get_weather', description: '查天气', parameters: { type: 'object' } }] })),
    ).toEqual([
      { type: 'function', name: 'get_weather', description: '查天气', parameters: { type: 'object' } },
    ])
  })
})

describe('mapResponsesStop', () => {
  it('reads a truncated response as a token limit', () => {
    expect(mapResponsesStop('incomplete', 'length', false)).toEqual({ kind: 'max-tokens' })
  })

  it('reads a completed response that emitted a call as tool calls', () => {
    expect(mapResponsesStop('completed', undefined, true)).toEqual({ kind: 'tool-calls' })
  })

  it('reads a plain completion as stop', () => {
    expect(mapResponsesStop('completed', undefined, false)).toEqual({ kind: 'stop' })
  })
})

describe('translateResponsesEvent', () => {
  it('streams text deltas and closes the text block on completion', () => {
    const chunks = translate([
      { type: 'response.created', response: { id: 'resp_1', status: 'in_progress', output: [] } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: '你好' },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: '，世界' },
      completed(),
    ])

    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '你好' },
      { type: 'text-delta', index: 0, text: '，世界' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '你好，世界' } },
    ])
  })

  it('streams the reasoning summary before the visible text', () => {
    const chunks = translate([
      { type: 'response.reasoning_summary_text.delta', output_index: 0, summary_index: 0, delta: '想一想' },
      { type: 'response.output_text.delta', output_index: 1, content_index: 0, delta: '答案' },
      completed(),
    ])

    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: '想一想' },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: '答案' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: '想一想' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: '答案' } },
    ])
  })

  it('assembles a tool call from the item key, its name and its argument deltas', () => {
    // Responses keys the call by `output_index` and identifies it by `call_id`;
    // the name arrives once, the arguments arrive character by character.
    const chunks = translate([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'fc_1', type: 'function_call', call_id: 'call_9', name: 'get_weather', arguments: null },
      },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: '' },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"city":' },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: '"Paris"}' },
      completed(),
    ])

    expect(chunks[0]).toEqual({ type: 'block-start', index: 0, blockType: 'tool-call' })
    expect(chunks[1]).toEqual({
      type: 'tool-call-delta',
      index: 0,
      id: 'call_9',
      name: 'get_weather',
      argumentsDelta: '',
    })
    expect(chunks[3]).toEqual({
      type: 'tool-call-delta',
      index: 0,
      id: 'call_9',
      name: 'get_weather',
      argumentsDelta: '"Paris"}',
    })
    expect(chunks.at(-1)).toEqual({
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id: 'call_9', name: 'get_weather', arguments: '{"city":"Paris"}' },
    })
  })

  it('ignores argument deltas for an item it never saw added', () => {
    // Losing the header means the call cannot correlate with its result, so a
    // partial arguments string would be worse than silence.
    expect(translate([{ type: 'response.function_call_arguments.delta', output_index: 7, delta: '{}' }])).toEqual([])
  })

  it('closes every call it opened even when two share one output index', () => {
    // Responses keys calls by `output_index`, which a gateway can also reuse.
    // Only the newest call stays in the routing table, so the earlier one is
    // reachable only through the ordered list — losing it would drop a call the
    // model did ask for.
    const state = createStreamState()
    const chunks: StreamChunk[] = []
    for (const event of [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'function_call', call_id: 'call_a', name: 'read' },
      },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"url":"u"}' },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'function_call', call_id: 'call_b', name: 'bash' },
      },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"command":"ls"}' },
      { type: 'response.completed', response: { status: 'completed' } },
    ]) chunks.push(...translateResponsesEvent(state, JSON.stringify(event)))

    const closes = chunks.filter((chunk) => chunk.type === 'block-end')
    expect(closes.map((chunk) => chunk.type === 'block-end' ? chunk.block : undefined)).toEqual([
      { type: 'tool-call', id: 'call_a', name: 'read', arguments: '{"url":"u"}' },
      { type: 'tool-call', id: 'call_b', name: 'bash', arguments: '{"command":"ls"}' },
    ])
  })

  it('reports usage and a token-limit finish for a truncated response', () => {
    const state = createStreamState()
    const chunks: StreamChunk[] = []
    for (const event of [
      { type: 'response.output_text.delta', output_index: 0, delta: '半句' },
      {
        type: 'response.incomplete',
        response: {
          status: 'incomplete',
          incomplete_details: { reason: 'length' },
          usage: { input_tokens: 5, output_tokens: 40, total_tokens: 45 },
        },
      },
    ]) chunks.push(...translateResponsesEvent(state, JSON.stringify(event)))

    // `response.incomplete` replaces `response.completed` as the terminal event.
    expect(chunks.at(-1)).toEqual({
      type: 'block-end',
      index: 0,
      block: { type: 'text', text: '半句' },
    })
    expect(state.finishReason).toEqual({ kind: 'max-tokens' })
    expect(state.usage).toEqual({ inputTokens: 5, outputTokens: 40, totalTokens: 45 })
  })

  it('reads cached input out of `cached_read_tokens` as well as `cached_tokens`', () => {
    // Responses spells the same fact twice; counting both would double the cache.
    const state = createStreamState()
    translateResponsesEvent(state, JSON.stringify(completed({
      usage: {
        input_tokens: 300,
        output_tokens: 4,
        total_tokens: 304,
        input_tokens_details: { cached_tokens: 256, cached_read_tokens: 256 },
      },
    })))

    expect(state.usage).toEqual({ inputTokens: 44, outputTokens: 4, totalTokens: 304, cacheReadTokens: 256 })
  })

  it('carries the reasoning-token count through', () => {
    const state = createStreamState()
    translateResponsesEvent(state, JSON.stringify(completed({
      usage: {
        input_tokens: 6,
        output_tokens: 30,
        total_tokens: 36,
        output_tokens_details: { reasoning_tokens: 24 },
      },
    })))

    expect(state.usage?.reasoningTokens).toBe(24)
  })

  it('raises a gateway failure carried by `response.failed`', () => {
    expect(() =>
      translate([
        {
          type: 'response.failed',
          response: { status: 'failed', error: { code: 'insufficient_quota', message: '额度用完了' } },
        },
      ]),
    ).toThrow(/额度/)
  })

  it('keeps non-JSON and unknown events out of the chunk stream', () => {
    const state = createStreamState()

    expect(translateResponsesEvent(state, 'not json')).toEqual([])
    expect(translateResponsesEvent(state, JSON.stringify({ type: 'response.in_progress' }))).toEqual([])
    expect(translateResponsesEvent(state, JSON.stringify({ type: 'response.something.new', delta: 'x' }))).toEqual([])
  })
})

describe('OpenDesignAdapter on the Responses surface', () => {
  const CONFIG: OpenDesignConfig = {
    enabled: true,
    apiKeyEnv: 'OPENDESIGN_API_KEY',
    accounts: null,
    autoSwitch: false,
    baseURL: 'https://gateway.test/v1',
    protocol: 'responses',
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

  it('posts to `/responses` with the surfaces own field names', async () => {
    const fetchMock = stubFetch(sse([
      JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'ok' }),
      JSON.stringify(completed()),
      '[DONE]',
    ]))

    const seen: StreamChunk[] = []
    for await (const chunk of adapterWith().stream(request({
      system: '你是助手',
      tools: [{ name: 'get_weather', description: '查天气', parameters: { type: 'object' } }],
      maxTokens: 128,
      reasoningEffort: 'high' as never,
      stop: ['END'],
    }))) seen.push(chunk)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://gateway.test/v1/responses')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: MODEL,
      stream: true,
      instructions: '你是助手',
      max_output_tokens: 128,
      reasoning: { effort: 'high' },
      stop: ['END'],
    })
    // Chat-only members must not leak onto this surface.
    expect(body).not.toHaveProperty('messages')
    expect(body).not.toHaveProperty('max_tokens')
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body).not.toHaveProperty('stream_options')
    expect(body.tools).toEqual([
      { type: 'function', name: 'get_weather', description: '查天气', parameters: { type: 'object' } },
    ])
    expect(seen.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('falls back to the Chat Completions surface when the protocol is chat', async () => {
    const fetchMock = stubFetch(sse([
      JSON.stringify({ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] }),
      '[DONE]',
    ]))

    for await (const _chunk of adapterWith({ ...CONFIG, protocol: 'chat' }).stream(request())) { /* drain */ }

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://gateway.test/v1/chat/completions')
  })
})
