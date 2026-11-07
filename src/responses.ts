/**
 * Project the harness request vocabulary onto the Responses wire shape, and
 * translate its event stream back into {@link StreamChunk}s.
 *
 * The two surfaces describe the same conversation in different shapes, so this
 * module is the whole of the difference on the request side: tools lose their
 * `function` wrapper and grow a flat `name`, a tool result becomes a
 * `function_call_output` item keyed by `call_id`, and the system prompt is sent
 * as `instructions` instead. On the response side the events are named rather
 * than indexed — `response.output_text.delta`,
 * `response.reasoning_summary_text.delta`,
 * `response.function_call_arguments.delta` — and there is no
 * `choices`, no `finish_reason` and no per-event usage: the terminal
 * `response.completed` (or `response.incomplete`) carries the counts.
 *
 * The functions here are pure, so both mappings are testable without a gateway.
 *
 * @module dsh-opendesign-go/responses
 */
import type { GenerateOptions, RequestMessage, ToolSchema } from '@deepseek-ai/dsh-llm'
import { mergeSystem, partsOf } from './conversion.ts'
import type { ImageDataUrlResolver } from './conversion.ts'
import {
  appendReasoning,
  appendText,
  closeOpenBlocks,
  isRecord,
  takeIndex,
  toTokenUsage,
  toolCallId,
} from './stream-state.ts'
import type { StreamState } from './stream-state.ts'
import { classifyGatewayFailure } from './gateway-error.ts'
import type { FinishReason, StreamChunk } from '@deepseek-ai/dsh-llm'

/** One `input_text` content part. */
interface ResponsesTextPart {
  readonly type: 'input_text'
  readonly text: string
}

/** One `input_image` content part. */
interface ResponsesImagePart {
  readonly type: 'input_image'
  readonly image_url: string
}

/** Content is a bare string unless the message carries images. */
type ResponsesContent = string | readonly (ResponsesTextPart | ResponsesImagePart)[]

/** One conversation item: a message, or one half of a tool exchange. */
type ResponsesItem =
  | { readonly role: string, readonly content: ResponsesContent }
  | { readonly type: 'function_call', readonly call_id: string, readonly name: string, readonly arguments: string }
  | { readonly type: 'function_call_output', readonly call_id: string, readonly output: string }

/**
 * Whether one item is half of a tool exchange rather than a message.
 *
 * A message carries no `type` discriminator — the wire accepts a bare
 * `{role, content}` — so membership is decided by the presence of the field.
 * @param item - one projected item.
 * @returns whether this is a `function_call` or `function_call_output`.
 */
function isCallItem(
  item: ResponsesItem,
): item is Exclude<ResponsesItem, { readonly role: string }> {
  return 'type' in item
}

/** One flat `tools[]` declaration; Responses has no `function` wrapper. */
interface ResponsesTool {
  readonly type: 'function'
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
}

/** The request body this adapter sends to `/responses`. */
export interface ResponsesRequest {
  /** System prompt, hoisted out of the message list. */
  readonly instructions?: string
  /** Conversation items, in order. */
  readonly input: readonly ResponsesItem[]
  /** Tool declarations, absent when the request declares none. */
  readonly tools?: readonly ResponsesTool[]
}

/**
 * Build wire content from text and images.
 * @param text - visible text.
 * @param images - data URLs in message order.
 * @returns wire content; a bare string when there are no images.
 */
function contentOf(text: string, images: readonly string[]): ResponsesContent {
  if (images.length === 0) return text
  const parts: (ResponsesTextPart | ResponsesImagePart)[] = []
  if (text !== '') parts.push({ type: 'input_text', text })
  for (const url of images) parts.push({ type: 'input_image', image_url: url })
  return parts
}

/**
 * Text that introduces images lifted out of a tool result.
 *
 * The same note the Chat Completions projection uses: a `function_call_output`
 * carries a string here, so a picture it returned rides in the next user turn.
 */
const HOISTED_TOOL_IMAGES_NOTE = '(Image content from the preceding tool result.)'

/**
 * Project one request message.
 * @param message - harness request message.
 * @param resolveImage - route image resolver, absent for text-only routes.
 * @returns the items this message becomes, and images to append after them.
 */
function toItems(
  message: RequestMessage,
  resolveImage: ImageDataUrlResolver | undefined,
): { items: ResponsesItem[], hoisted: string[] } {
  switch (message.role) {
    case 'system':
    case 'developer': {
      // Both are system-level guidance and keep that meaning; the field itself
      // is hoisted into `instructions` by the caller.
      const text = partsOf(message.content, undefined).text
      return text === '' ? { items: [], hoisted: [] } : { items: [{ role: 'system', content: text }], hoisted: [] }
    }
    case 'user': {
      const { text, images } = partsOf(message.content, resolveImage)
      if (text === '' && images.length === 0) return { items: [], hoisted: [] }
      return { items: [{ role: 'user', content: contentOf(text, images) }], hoisted: [] }
    }
    case 'assistant': {
      const { text } = partsOf(message.content, undefined)
      const calls: ResponsesItem[] = []
      for (const block of message.content) {
        if (block.type !== 'tool-call') continue
        calls.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: block.arguments,
        })
      }
      const items: ResponsesItem[] = []
      // An assistant turn that produced neither text nor a tool call (reasoning
      // only) has nothing to replay; providers reject an empty turn.
      if (text !== '') items.push({ role: 'assistant', content: text })
      items.push(...calls)
      return { items, hoisted: [] }
    }
    case 'tool': {
      const { text, images } = partsOf(message.content, resolveImage)
      // A tool result is always sent, because it answers a call by id.
      return {
        items: [{ type: 'function_call_output', call_id: message.toolCallId, output: text }],
        hoisted: images,
      }
    }
  }
}

/**
 * Convert a harness request into a Responses request body.
 *
 * The system prompt becomes `instructions`, which the gateway honours in place
 * of a system message; when the history also opens with one, the two texts
 * merge instead of competing, exactly as the Chat Completions projection does.
 * @param options - fully assembled request.
 * @param resolveImage - route image resolver, absent for text-only routes.
 * @returns the request members this adapter sets.
 */
export function toResponsesRequest(
  options: GenerateOptions,
  resolveImage?: ImageDataUrlResolver,
): ResponsesRequest {
  const input: ResponsesItem[] = []
  let leadingSystem = ''
  // One assistant turn may issue several tool calls whose results arrive as a
  // run of consecutive `tool` messages. Those stay adjacent, and the images
  // they returned are emitted once after the last of them.
  let lifted: string[] = []
  const flushLifted = (): void => {
    if (lifted.length === 0) return
    input.push({ role: 'user', content: contentOf(HOISTED_TOOL_IMAGES_NOTE, lifted) })
    lifted = []
  }

  for (const message of options.messages) {
    const converted = toItems(message, resolveImage)
    if (converted.items.length === 0) continue
    const first = converted.items[0]!
    const isToolResult = isCallItem(first) && first.type === 'function_call_output'
    if (!isToolResult) flushLifted()
    for (const item of converted.items) input.push(item)
    if (converted.hoisted.length > 0) lifted.push(...converted.hoisted)
  }
  flushLifted()

  // The leading system message is the natural place for `instructions`: sending
  // both would duplicate one prompt in two roles.
  const [head, ...rest] = input
  if (head !== undefined && !isCallItem(head) && head.role === 'system') {
    leadingSystem = typeof head.content === 'string' ? head.content : ''
    input.length = 0
    input.push(...rest)
  }

  const system = options.system
  const instructions = system === undefined || system.trim() === ''
    ? (leadingSystem === '' ? undefined : leadingSystem)
    : mergeSystem(system, leadingSystem)

  const tools = toResponsesTools(options)
  return {
    ...(instructions === undefined ? {} : { instructions }),
    input,
    ...(tools === undefined ? {} : { tools }),
  }
}

/**
 * Convert harness tool schemas into Responses `tools`.
 *
 * `deferLoading` is not projected: this adapter always declares the complete
 * active tool list, which is the non-deferred behaviour the flag opts out of.
 * @param options - fully assembled request.
 * @returns the tools array, or undefined when the request declares none.
 */
export function toResponsesTools(options: GenerateOptions): ResponsesTool[] | undefined {
  const tools = options.tools
  if (tools === undefined || tools.length === 0) return undefined
  return tools.map(toResponsesTool)
}

/**
 * Project one tool schema.
 * @param tool - harness tool declaration.
 * @returns the flat Responses function declaration.
 */
function toResponsesTool(tool: ToolSchema): ResponsesTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }
}

/**
 * Text carried by one reasoning summary event.
 * @param event - parsed `response.reasoning_summary_text.delta` payload.
 * @returns the increment, or undefined when this event carries none.
 */
function reasoningDelta(event: Record<string, unknown>): string | undefined {
  const delta = event.delta
  return typeof delta === 'string' && delta !== '' ? delta : undefined
}

/**
 * Read the tool-call item key of one event.
 *
 * Responses names each output item with `output_index`, so unlike Chat
 * Completions there is no separate per-message tool index to key on.
 * @param event - parsed event payload.
 * @returns the key, or undefined when the event carries none.
 */
function itemKey(event: Record<string, unknown>): number | undefined {
  const index = event.output_index
  return typeof index === 'number' && Number.isFinite(index) ? index : undefined
}

/**
 * Map a terminal status onto the harness vocabulary.
 *
 * Responses never sends `finish_reason`; the two facts that matter are whether
 * the response completed and whether it stopped short of its output budget.
 * @param status - `response.status` of the terminal event.
 * @param incompleteReason - `response.incomplete_details.reason`, when present.
 * @param sawToolCall - whether this response emitted a tool call.
 * @returns the harness finish reason.
 */
export function mapResponsesStop(
  status: string | undefined,
  incompleteReason: string | undefined,
  sawToolCall: boolean,
): FinishReason {
  if (status === 'incomplete' && incompleteReason === 'length') return { kind: 'max-tokens' }
  if (sawToolCall) return { kind: 'tool-calls' }
  return { kind: 'stop' }
}

/**
 * Translate one Responses SSE payload into chunks.
 * @param state - per-response streaming state.
 * @param payload - decoded SSE data payload.
 * @returns chunks to emit, in order.
 */
export function translateResponsesEvent(state: StreamState, payload: string): StreamChunk[] {
  let event: unknown
  try {
    event = JSON.parse(payload)
  } catch {
    // Keep-alives and non-JSON payloads carry no model content.
    return []
  }
  if (!isRecord(event)) return []

  const chunks: StreamChunk[] = []

  // A failure inside a 200 stream: `response.failed` carries the same error
  // object a non-2xx body would.
  if (event.type === 'response.failed') {
    const response = isRecord(event.response) ? event.response : undefined
    const error = response !== undefined && isRecord(response.error) ? response.error : undefined
    throw classifyGatewayFailure(
      error === undefined
        ? { message: 'OpenDesign Responses stream reported a failure' }
        : {
            message: typeof error.message === 'string' ? error.message : 'OpenDesign Responses stream reported a failure',
            ...(typeof error.code === 'string' ? { code: error.code } : {}),
            ...(typeof error.type === 'string' ? { type: error.type } : {}),
          },
    )
  }

  if (event.type === 'error') {
    const error = isRecord(event.error) ? event.error : event
    throw classifyGatewayFailure({
      message: typeof error.message === 'string' ? error.message : 'OpenDesign Responses stream reported an error',
      ...(typeof error.code === 'string' ? { code: error.code } : {}),
      ...(typeof error.type === 'string' ? { type: error.type } : {}),
    })
  }

  switch (event.type) {
    case 'response.output_text.delta': {
      const delta = event.delta
      if (typeof delta === 'string') appendText(state, delta, chunks)
      break
    }
    case 'response.reasoning_summary_text.delta': {
      const delta = reasoningDelta(event)
      if (delta !== undefined) appendReasoning(state, delta, chunks)
      break
    }
    case 'response.output_item.added': {
      const item = isRecord(event.item) ? event.item : undefined
      if (item === undefined || item.type !== 'function_call') break
      const key = itemKey(event)
      const callId = item.call_id
      // Without a provider id the call cannot correlate with its result.
      if (key === undefined || typeof callId !== 'string' || callId === '') break
      const name = typeof item.name === 'string' ? item.name : ''
      const call = { index: takeIndex(state), id: toolCallId(callId), name, arguments: '' }
      state.toolCalls.set(key, call)
      state.contentBlocks += 1
      chunks.push({ type: 'block-start', index: call.index, blockType: 'tool-call' })
      break
    }
    case 'response.function_call_arguments.delta': {
      const key = itemKey(event)
      if (key === undefined) break
      const call = state.toolCalls.get(key)
      if (call === undefined) break
      const delta = typeof event.delta === 'string' ? event.delta : ''
      call.arguments += delta
      chunks.push({
        type: 'tool-call-delta',
        index: call.index,
        id: call.id,
        name: call.name,
        argumentsDelta: delta,
      })
      break
    }
    case 'response.completed':
    case 'response.incomplete': {
      const response = isRecord(event.response) ? event.response : undefined
      if (response === undefined) break
      if (isRecord(response.usage)) {
        const usage = toTokenUsage(response.usage)
        if (usage !== undefined) state.usage = usage
      }
      if (state.finishReason !== undefined) break
      const status = typeof response.status === 'string' ? response.status : undefined
      const details = isRecord(response.incomplete_details) ? response.incomplete_details : undefined
      const reason = details !== undefined && typeof details.reason === 'string' ? details.reason : undefined
      state.finishReason = mapResponsesStop(status, reason, state.toolCalls.size > 0)
      chunks.push(...closeOpenBlocks(state))
      break
    }
    default:
      // `created`, `in_progress`, the `.done` echoes and the part wrappers carry
      // no increment this adapter does not already have.
      break
  }

  return chunks
}
