/**
 * Adapter contract tests: the M2 wire mapping is exercised against a stubbed
 * global `fetch` that returns canned SSE bodies, so no gateway is contacted.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BlockAssembler,
  LlmError,
  ToolCallId,
  createAssistantMessage,
  createSystemMessage,
  createToolResultMessage,
} from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { OpenDesignAdapter } from '../src/adapter.ts'
import { toChatMessages, toChatTools } from '../src/conversion.ts'
import type { OpenDesignConfig } from '../src/config-contract.ts'

const CONFIG: OpenDesignConfig = {
  enabled: true,
  apiKeyEnv: 'OPENDESIGN_API_KEY',
  accounts: null,
  autoSwitch: false,
  baseURL: 'https://gateway.test/v1',
  requestTimeoutMs: 120_000,
  streamIdleTimeoutMs: 30_000,
}

const MODEL = 'deepseek-v4.1-flash'

/** Build one adapter reading the fixture configuration. */
function adapterWith(apiKey: string | undefined = 'sk-test'): OpenDesignAdapter {
  return new OpenDesignAdapter({
    config: () => CONFIG,
    resolveApiKey: async () => apiKey,
  })
}

/** Build one adapter whose credential reference resolves to nothing. */
function adapterWithoutKey(): OpenDesignAdapter {
  return new OpenDesignAdapter({
    config: () => CONFIG,
    resolveApiKey: async () => undefined,
  })
}

/** Build one minimal request, overridable per test. */
function request(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'dsh-opendesign-go',
    model: MODEL,
    messages: [{ role: 'user', content: [{ type: 'text', text: '你好' }] }],
    ...overrides,
  }
}

/** Collect a whole chunk stream. */
async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

/** Settle a stream into its thrown error, so both instance and code are assertable. */
async function failureOf(stream: AsyncIterable<StreamChunk>): Promise<unknown> {
  return collect(stream).then(
    () => undefined,
    (error: unknown) => error,
  )
}

/** Build an SSE response body from raw `data:` payloads. */
function sse(payloads: readonly string[], status = 200): Response {
  const body = payloads.map((payload) => `data: ${payload}\n\n`).join('')
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } })
}

/** Build a JSON response body. */
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
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

describe('OpenDesignAdapter.stream', () => {
  it('streams text deltas and closes the text block', async () => {
    stubFetch(
      sse([
        JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: '你好' }, finish_reason: null }] }),
        JSON.stringify({ choices: [{ index: 0, delta: { content: '，世界' }, finish_reason: null }] }),
        JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
        JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }),
        '[DONE]',
      ]),
    )

    const chunks = await collect(adapterWith().stream(request()))

    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '你好' },
      { type: 'text-delta', index: 0, text: '，世界' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '你好，世界' } },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('streams reasoning content before visible text', async () => {
    stubFetch(
      sse([
        JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: '想一想' }, finish_reason: null }] }),
        JSON.stringify({ choices: [{ index: 0, delta: { content: '答案' }, finish_reason: 'stop' }] }),
        '[DONE]',
      ]),
    )

    const chunks = await collect(adapterWith().stream(request()))

    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: '想一想' },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: '答案' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: '想一想' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: '答案' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('accumulates tool call deltas into one tool-call block', async () => {
    stubFetch(
      sse([
        JSON.stringify({
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  { index: 0, id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '' } },
                ],
              },
              finish_reason: null,
            },
          ],
        }),
        JSON.stringify({
          choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":' } }] }, finish_reason: null }],
        }),
        JSON.stringify({
          choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"Paris"}' } }] }, finish_reason: null }],
        }),
        JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
        '[DONE]',
      ]),
    )

    const chunks = await collect(adapterWith().stream(request()))

    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: 'call_1', name: 'get_weather', argumentsDelta: '' },
      { type: 'tool-call-delta', index: 0, id: 'call_1', argumentsDelta: '{"city":' },
      { type: 'tool-call-delta', index: 0, id: 'call_1', argumentsDelta: '"Paris"}' },
      {
        type: 'block-end',
        index: 0,
        block: { type: 'tool-call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Paris"}' },
      },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ])
  })

  it('produces a chunk stream the host assembler can assemble', async () => {
    stubFetch(
      sse([
        JSON.stringify({
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  { index: 0, id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '' } },
                ],
              },
              finish_reason: null,
            },
          ],
        }),
        JSON.stringify({
          choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":"Paris"}' } }] }, finish_reason: null }],
        }),
        JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
        '[DONE]',
      ]),
    )

    const assembler = new BlockAssembler()
    for (const chunk of await collect(adapterWith().stream(request()))) assembler.push(chunk)

    expect(assembler.blocks()).toEqual([
      { type: 'tool-call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Paris"}' },
    ])
    expect(assembler.finish).toEqual({ kind: 'tool-calls' })
    expect(assembler.message({ provider: 'dsh-opendesign-go', model: MODEL }).content).toEqual([
      { type: 'tool-call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Paris"}' },
    ])
  })

  it('maps aggregate prompt tokens into disjoint input and cache counts', async () => {    stubFetch(
      sse([
        JSON.stringify({ choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: 'stop' }] }),
        JSON.stringify({
          choices: [],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
            total_tokens: 120,
            prompt_tokens_details: { cached_tokens: 60 },
            completion_tokens_details: { reasoning_tokens: 5 },
          },
        }),
        '[DONE]',
      ]),
    )

    const chunks = await collect(adapterWith().stream(request()))
    const usage = chunks.find((chunk) => chunk.type === 'usage')

    expect(usage).toEqual({
      type: 'usage',
      usage: {
        inputTokens: 40,
        outputTokens: 20,
        totalTokens: 120,
        cacheReadTokens: 60,
        reasoningTokens: 5,
      },
    })
  })

  it('classifies a 401 response through the gateway classifier', async () => {
    stubFetch(
      json(
        { error: { code: 'unauthorized', message: 'Invalid API key provided', type: 'authentication_error' } },
        401,
      ),
    )

    const failure = await failureOf(adapterWith().stream(request()))

    expect(failure).toBeInstanceOf(LlmError)
    expect(failure).toMatchObject({ code: 'AUTH' })
  })

  it('fails with EMPTY_RESPONSE when the stream carried no content', async () => {
    stubFetch(
      sse([
        JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: 'stop' }] }),
        '[DONE]',
      ]),
    )

    const failure = await failureOf(adapterWith().stream(request()))

    expect(failure).toBeInstanceOf(LlmError)
    expect(failure).toMatchObject({ code: 'EMPTY_RESPONSE' })
  })

  it('fails with MISSING_CREDENTIAL before touching the network', async () => {
    const fetchMock = stubFetch(sse(['[DONE]']))

    const failure = await failureOf(adapterWithoutKey().stream(request()))

    expect(failure).toBeInstanceOf(LlmError)
    expect(failure).toMatchObject({ code: 'MISSING_CREDENTIAL' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the M2 wire request with attribution headers and the abort signal', async () => {
    const fetchMock = stubFetch(
      sse([
        JSON.stringify({ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] }),
        '[DONE]',
      ]),
    )
    const controller = new AbortController()

    await collect(
      adapterWith().stream(
        request({
          system: '你是助手',
          tools: [{ name: 'get_weather', description: '查天气', parameters: { type: 'object' } }],
          temperature: 0.3,
          maxTokens: 128,
          stop: ['END'],
          signal: controller.signal,
        }),
      ),
    )

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://gateway.test/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    // The dispatch signal also carries the configured deadline, so identity with
    // the caller's controller is not the contract — forwarding cancellation is.
    const forwarded = init.signal as AbortSignal
    expect(forwarded.aborted).toBe(false)
    controller.abort()
    expect(forwarded.aborted).toBe(true)

    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-test')
    expect(headers['content-type']).toBe('application/json')
    expect(headers['user-agent']).toBeTruthy()

    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: MODEL,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.3,
      max_tokens: 128,
      stop: ['END'],
    })
    expect(body.messages).toEqual([
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '你好' },
    ])
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: { name: 'get_weather', description: '查天气', parameters: { type: 'object' } },
      },
    ])
  })
})

describe('toChatMessages', () => {
  it('merges a one-shot system prompt with the leading system message', () => {
    const messages = toChatMessages({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [createSystemMessage('历史提示'), { role: 'user', content: [{ type: 'text', text: '问题' }] }],
      system: '请求提示',
    })

    expect(messages).toEqual([
      { role: 'system', content: '请求提示\n\n历史提示' },
      { role: 'user', content: '问题' },
    ])
  })

  it('projects assistant tool calls and tool results', () => {
    const callId = ToolCallId('call_1')
    const messages = toChatMessages({
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

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '晴' },
    ])
  })

  it('projects image content to image_url parts when a resolver is supplied', () => {
    const image = { type: 'image', attachment: { id: 'attachment-1' } } as unknown as ContentBlock
    const url = 'data:image/png;base64,AAAA'
    const messages = toChatMessages(
      {
        provider: 'dsh-opendesign-go',
        model: MODEL,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: 'look' }, image],
        }],
      },
      () => url,
    ) as { role: string, content: unknown }[]

    expect(messages[0]?.content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url } },
    ])
  })

  it('replaces an image with placeholder text when the route cannot carry it', () => {
    // A conversation that already contains an image must stay usable on a
    // text-only model, and the placeholder names the image so the model is not
    // silently told there was none.
    const image = { type: 'image', attachment: { id: 'attachment-1' } } as unknown as ContentBlock
    const messages = toChatMessages({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [{ role: 'user', content: [image] }],
    }) as { role: string, content: unknown }[]

    // The harness placeholder is deterministic text naming the attachment, not
    // the raw block: the point is that the model learns an image existed.
    const content = String(messages[0]?.content)
    expect(typeof messages[0]?.content).toBe('string')
    expect(content).toContain('image omitted')
    expect(content).toContain('text only')
  })

  it('keeps an image-only user turn instead of dropping it', () => {
    const image = { type: 'image', attachment: { id: 'attachment-2' } } as unknown as ContentBlock
    const messages = toChatMessages(
      {
        provider: 'dsh-opendesign-go',
        model: MODEL,
        messages: [{ role: 'user', content: [image] }],
      },
      () => 'data:image/png;base64,BBBB',
    ) as { role: string, content: unknown }[]

    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } },
    ])
  })
})

describe('toChatTools', () => {
  it('omits tools when the request declares none', () => {
    expect(toChatTools(request())).toBeUndefined()
  })

  it('maps tool schemas onto function declarations', () => {
    expect(
      toChatTools(
        request({ tools: [{ name: 'get_weather', description: '查天气', parameters: { type: 'object' } }] }),
      ),
    ).toEqual([
      {
        type: 'function',
        function: { name: 'get_weather', description: '查天气', parameters: { type: 'object' } },
      },
    ])
  })
})

describe('OpenDesignAdapter.resolveModel', () => {
  /**
   * The host's image tool calls `llm.resolveModelInfo` and refuses the read
   * unless the resolved route names `image` explicitly. `resolveModel` used to
   * take modalities from the seed row, which carries only id and name, so every
   * model resolved with no modality at all and reading an image failed with
   * "this model does not declare image input" even for a vision model.
   */
  it('declares image input for a model whose vendor table allows it', async () => {
    const resolved = await adapterWith().resolveModel('dsh-opendesign-go', 'deepseek-v4.1-flash')
    expect(resolved.inputModalities).toContain('image')
  })

  it('declares text only for a model documented as text-only', async () => {
    // DeepSeek's pricing table marks 图像理解 as 不支持 for V4-Pro, and the
    // gateway answers 404 "No endpoints found that support image input" for Hy4.
    const pro = await adapterWith().resolveModel('dsh-opendesign-go', 'deepseek-v4-pro')
    expect(pro.inputModalities).toEqual(['text'])
    const hy = await adapterWith().resolveModel('dsh-opendesign-go', 'hy4-preview')
    expect(hy.inputModalities).toEqual(['text'])
  })

  it('agrees with the picker for every seeded model', async () => {
    // The picker reads listModels, the request path reads resolveModel. A
    // disagreement between them is invisible until a capability is used.
    const adapter = adapterWith()
    const listed = await adapter.listModels('dsh-opendesign-go')
    for (const row of listed) {
      const resolved = await adapter.resolveModel('dsh-opendesign-go', row.id)
      expect(resolved.inputModalities, `modality mismatch for ${row.id}`).toEqual(row.inputModalities)
    }
  })

  it('omits context and max tokens for a model newer than this build', async () => {
    const resolved = await adapterWith().resolveModel('dsh-opendesign-go', 'unreleased-model')
    expect(resolved.context).toBeUndefined()
    expect(resolved.defaultMaxTokens).toBeUndefined()
    expect(resolved.inputModalities).toBeUndefined()
  })
})

describe('OpenDesignAdapter image dispatch', () => {
  /** One user turn carrying a single durable image reference. */
  const imageRequest = (model: string): GenerateOptions => ({
    provider: 'dsh-opendesign-go',
    model,
    messages: [{
      role: 'user',
      content: [{ type: 'image', attachment: { attachmentId: 'sha256:ab' } } as unknown as ContentBlock],
    }],
  })

  /** The wire content of the single user message a stub captured. */
  const wireContent = (fetchMock: ReturnType<typeof stubFetch>): unknown => {
    const init = fetchMock.mock.calls[0]![1]
    const body = JSON.parse(String(init.body)) as { messages: { role: string, content: unknown }[] }
    return body.messages.at(-1)?.content
  }

  it('sends image bytes for a model that declares image input', async () => {
    // The resolver is only reachable through the declared modality. When either
    // half of that pairing regresses, the request carries placeholder text and
    // the model answers as though it never saw a picture — a failure that looks
    // like a model limitation, so both halves are pinned here.
    const fetchMock = stubFetch(sse([
      JSON.stringify({ choices: [{ index: 0, delta: { content: '看到' }, finish_reason: 'stop' }] }),
      '[DONE]',
    ]))
    const url = 'data:image/png;base64,AAAA'
    const adapter = new OpenDesignAdapter({
      config: () => CONFIG,
      resolveApiKey: async () => 'sk-test',
      imageDataUrl: () => url,
    })
    await collect(adapter.stream(imageRequest(MODEL)))
    expect(wireContent(fetchMock)).toEqual([{ type: 'image_url', image_url: { url } }])
  })

  it('projects to placeholder text for a model documented as text-only', async () => {
    const fetchMock = stubFetch(sse([
      JSON.stringify({ choices: [{ index: 0, delta: { content: '看到' }, finish_reason: 'stop' }] }),
      '[DONE]',
    ]))
    const adapter = new OpenDesignAdapter({
      config: () => CONFIG,
      resolveApiKey: async () => 'sk-test',
      imageDataUrl: () => 'data:image/png;base64,AAAA',
    })
    await collect(adapter.stream(imageRequest('deepseek-v4-pro')))
    // Not sent as an image part, and not dropped either: the model is told an
    // image existed and could not be shown.
    const content = String(wireContent(fetchMock))
    expect(content).toContain('image omitted')
  })

  /** Every wire message a stub captured, in order. */
  const wireMessages = (
    fetchMock: ReturnType<typeof stubFetch>,
  ): { role: string, content: unknown }[] => {
    const init = fetchMock.mock.calls[0]![1]
    const body = JSON.parse(String(init.body)) as { messages: { role: string, content: unknown }[] }
    return body.messages
  }

  it('sends image bytes carried by a tool result', async () => {
    // `read_image` answers with the bytes it read, so the image lands in a tool
    // message rather than a user turn. Projecting that message without a
    // resolver silently replaced every tool-side image with placeholder text,
    // which reads as a model that cannot see pictures.
    const fetchMock = stubFetch(sse([
      JSON.stringify({ choices: [{ index: 0, delta: { content: '看到' }, finish_reason: 'stop' }] }),
      '[DONE]',
    ]))
    const url = 'data:image/jpeg;base64,BBBB'
    const adapter = new OpenDesignAdapter({
      config: () => CONFIG,
      resolveApiKey: async () => 'sk-test',
      imageDataUrl: () => url,
    })
    await collect(adapter.stream({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [
        { role: 'user', content: [{ type: 'text', text: '读一下这张图' }] },
        {
          role: 'assistant',
          content: [{
            type: 'tool-call',
            id: 'call_1',
            name: 'read_image',
            arguments: '{"path":"a.jpg"}',
          } as unknown as ContentBlock],
        },
        {
          role: 'tool',
          toolCallId: 'call_1',
          content: [{ type: 'image', attachment: { attachmentId: 'sha256:bb' } } as unknown as ContentBlock],
        },
      ],
    }))
    const messages = wireMessages(fetchMock)
    // The tool message itself stays text-only: an intermediary that rebuilds tool
    // content as a string would drop an image placed there, which is exactly the
    // failure the following user message avoids.
    expect(messages.at(-2)).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '' })
    expect(messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '(Image content from the preceding tool result.)' },
        { type: 'image_url', image_url: { url } },
      ],
    })
  })

  it('keeps parallel tool results adjacent to each other', async () => {
    // One assistant turn can issue several calls, and their results arrive as a
    // run of `tool` messages. Inserting the lifted images after the first result
    // would split that run, and a gateway that validates call/result pairing
    // rejects the request outright — a regression no image test would catch.
    const fetchMock = stubFetch(sse([
      JSON.stringify({ choices: [{ index: 0, delta: { content: '看到' }, finish_reason: 'stop' }] }),
      '[DONE]',
    ]))
    const first = 'data:image/png;base64:AAAA'
    const second = 'data:image/png;base64:BBBB'
    const queue = [first, second]
    const adapter = new OpenDesignAdapter({
      config: () => CONFIG,
      resolveApiKey: async () => 'sk-test',
      imageDataUrl: () => queue.shift(),
    })
    await collect(adapter.stream({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [
        { role: 'user', content: [{ type: 'text', text: '读这两张图' }] },
        {
          role: 'assistant',
          content: [
            { type: 'tool-call', id: 'call_1', name: 'read_image', arguments: '{"path":"a.png"}' },
            { type: 'tool-call', id: 'call_2', name: 'read_image', arguments: '{"path":"b.png"}' },
          ] as unknown as ContentBlock[],
        },
        {
          role: 'tool',
          toolCallId: 'call_1',
          content: [{ type: 'image', attachment: { attachmentId: 'sha256:aa' } } as unknown as ContentBlock],
        },
        {
          role: 'tool',
          toolCallId: 'call_2',
          content: [{ type: 'image', attachment: { attachmentId: 'sha256:bb' } } as unknown as ContentBlock],
        },
      ],
    }))
    const messages = wireMessages(fetchMock)
    expect(messages.map((row) => row.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'user'])
    expect(messages.at(-1)!.content).toEqual([
      { type: 'text', text: '(Image content from the preceding tool result.)' },
      { type: 'image_url', image_url: { url: first } },
      { type: 'image_url', image_url: { url: second } },
    ])
  })

  it('keeps tool text and lifts only the images out of it', async () => {
    // A tool result usually carries both: the path it read and the bytes. The
    // path stays on the tool message where the model expects it, and only the
    // pictures move.
    const fetchMock = stubFetch(sse([
      JSON.stringify({ choices: [{ index: 0, delta: { content: '看到' }, finish_reason: 'stop' }] }),
      '[DONE]',
    ]))
    const url = 'data:image/jpeg;base64:BBBB'
    const adapter = new OpenDesignAdapter({
      config: () => CONFIG,
      resolveApiKey: async () => 'sk-test',
      imageDataUrl: () => url,
    })
    await collect(adapter.stream({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [
        { role: 'user', content: [{ type: 'text', text: '读一下这张图' }] },
        {
          role: 'assistant',
          content: [{
            type: 'tool-call',
            id: 'call_1',
            name: 'read_image',
            arguments: '{"path":"a.jpg"}',
          } as unknown as ContentBlock],
        },
        {
          role: 'tool',
          toolCallId: 'call_1',
          content: [
            { type: 'text', text: '<path>a.jpg</path>' },
            { type: 'image', attachment: { attachmentId: 'sha256:bb' } } as unknown as ContentBlock,
          ],
        },
      ],
    }))
    const messages = wireMessages(fetchMock)
    expect(messages.at(-2)).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '<path>a.jpg</path>',
    })
    expect(messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '(Image content from the preceding tool result.)' },
        { type: 'image_url', image_url: { url } },
      ],
    })
  })

  it('sends no extra user turn when a tool result has no image', async () => {
    const fetchMock = stubFetch(sse([
      JSON.stringify({ choices: [{ index: 0, delta: { content: '看到' }, finish_reason: 'stop' }] }),
      '[DONE]',
    ]))
    const adapter = new OpenDesignAdapter({
      config: () => CONFIG,
      resolveApiKey: async () => 'sk-test',
      imageDataUrl: () => 'data:image/jpeg;base64:BBBB',
    })
    await collect(adapter.stream({
      provider: 'dsh-opendesign-go',
      model: MODEL,
      messages: [
        { role: 'user', content: [{ type: 'text', text: '读一下这张图' }] },
        {
          role: 'assistant',
          content: [{
            type: 'tool-call',
            id: 'call_1',
            name: 'read_image',
            arguments: '{"path":"a.jpg"}',
          } as unknown as ContentBlock],
        },
        {
          role: 'tool',
          toolCallId: 'call_1',
          content: [{ type: 'text', text: '<path>a.jpg</path>' }],
        },
      ],
    }))
    const messages = wireMessages(fetchMock)
    expect(messages.map((row) => row.role)).toEqual(['user', 'assistant', 'tool'])
  })
})
