/**
 * Project the harness request vocabulary onto the Anthropic Messages wire
 * shape, and translate its event stream back into {@link StreamChunk}s.
 *
 * Three surfaces now describe the same conversation, so the differences are
 * kept to this module the way `responses.ts` keeps the Responses ones: the
 * system prompt is a top-level `system` string, content is always an array of
 * typed parts (a bare string is legal but never echoed), tools carry their
 * schema under `input_schema`, and a tool result is a `tool_result` part inside
 * a **user** turn rather than a message of its own. On the response side every
 * event is a named SSE event whose payload repeats the name in `type`, blocks
 * are addressed by `index`, and usage arrives twice: zeros on `message_start`,
 * then real counts on `message_delta`.
 *
 * The functions here are pure, so both mappings are testable without a gateway.
 * The wire facts were measured against the gateway rather than copied from the
 * documentation, because several differ: `anthropic-version` is mandatory, and
 * the thinking switches below are the two forms that actually change behaviour.
 *
 * @module dsh-opendesign-go/anthropic
 */
import type { GenerateOptions, RequestMessage, ToolSchema } from '@deepseek-ai/dsh-llm'
import { mergeSystem, partsOf } from './conversion.ts'
import type { ImageDataUrlResolver } from './conversion.ts'
import {
  appendReasoning,
  appendText,
  closeOpenBlocks,
  isRecord,
  startToolCall,
  toolCallId,
} from './stream-state.ts'
import type { StreamState } from './stream-state.ts'
import { classifyGatewayFailure } from './gateway-error.ts'
import type { FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'

/** One `text` content part. */
interface AnthropicTextPart {
  readonly type: 'text'
  readonly text: string
}

/** One `image` content part; the bytes ride inline as base64. */
interface AnthropicImagePart {
  readonly type: 'image'
  readonly source: {
    readonly type: 'base64'
    readonly media_type: string
    readonly data: string
  }
}

/** One `tool_use` part an assistant turn issued. */
interface AnthropicToolUsePart {
  readonly type: 'tool_use'
  readonly id: string
  readonly name: string
  readonly input: unknown
}

/** One `tool_result` part answering a call by id. */
interface AnthropicToolResultPart {
  readonly type: 'tool_result'
  readonly tool_use_id: string
  readonly content: string
}

/** Every content part this projection emits. */
type AnthropicPart =
  | AnthropicTextPart
  | AnthropicImagePart
  | AnthropicToolUsePart
  | AnthropicToolResultPart

/** One conversation turn; content is always a part array. */
interface AnthropicMessage {
  readonly role: 'user' | 'assistant'
  readonly content: readonly AnthropicPart[]
}

/** One tool declaration; the schema is `input_schema`, not `parameters`. */
interface AnthropicTool {
  readonly name: string
  readonly description: string
  readonly input_schema: Record<string, unknown>
}

/** The request body this adapter sends to `/messages`. */
export interface AnthropicRequest {
  /** System prompt, hoisted out of the message list. */
  readonly system?: string
  /** Conversation turns, in order. */
  readonly messages: readonly AnthropicMessage[]
  /** Tool declarations, absent when the request declares none. */
  readonly tools?: readonly AnthropicTool[]
}

/**
 * Split a base64 `data:` URL back into the two facts the wire wants.
 *
 * Anthropic takes the media type and the payload as separate members, while
 * everything upstream of this module carries one data URL. A value that is not
 * a base64 data URL cannot be expressed here at all, so it is reported as
 * unreadable rather than guessed at.
 * @param url - `data:<media-type>;base64,<payload>`.
 * @returns the two members, or undefined when the URL is not one of those.
 */
function splitDataUrl(url: string): { mediaType: string, data: string } | undefined {
  const match = /^data:([^;,]+);base64,(.*)$/su.exec(url)
  if (match === null) return undefined
  const mediaType = match[1]
  const data = match[2]
  if (mediaType === undefined || data === undefined || data === '') return undefined
  return { mediaType, data }
}

/**
 * Build the content parts for text plus images.
 * @param text - visible text.
 * @param images - data URLs in message order.
 * @returns the parts, in the order given.
 */
function contentPartsOf(text: string, images: readonly string[]): AnthropicPart[] {
  const parts: AnthropicPart[] = []
  if (text !== '') parts.push({ type: 'text', text })
  for (const url of images) {
    const split = splitDataUrl(url)
    // An unreadable URL is already the resolver's failure to report, and a
    // part without bytes would make the whole request invalid; dropping it
    // keeps the text that surrounds it.
    if (split === undefined) continue
    parts.push({
      type: 'image',
      source: { type: 'base64', media_type: split.mediaType, data: split.data },
    })
  }
  return parts
}

/**
 * Text that introduces images lifted out of a tool result.
 *
 * The same note the other two projections use: this adapter sends a tool
 * result's text as a string, so a picture it returned rides in the next turn.
 */
const HOISTED_TOOL_IMAGES_NOTE = '(Image content from the preceding tool result.)'

/**
 * Project one request message.
 *
 * Tool results become `user` turns holding `tool_result` parts, which is the
 * only shape this surface accepts for them. System-level guidance is not a
 * message at all here — it is returned separately for the caller to fold into
 * the top-level `system` field, because this surface has exactly one such field
 * and no system role to put it in.
 * @param message - harness request message.
 * @param resolveImage - route image resolver, absent for text-only routes.
 * @returns the turn this message becomes, system text it carries, and images to
 * append after it.
 */
function toMessage(
  message: RequestMessage,
  resolveImage: ImageDataUrlResolver | undefined,
): { message: AnthropicMessage | undefined, system: string, hoisted: string[] } {
  switch (message.role) {
    case 'system':
    case 'developer':
      // Both are system-level guidance and keep that meaning; every one of them
      // is collected rather than only the leading one, because a message the
      // harness places mid-conversation still governs this request and the wire
      // has nowhere else to put it.
      return { message: undefined, system: partsOf(message.content, undefined).text, hoisted: [] }
    case 'user': {
      const { text, images } = partsOf(message.content, resolveImage)
      const content = contentPartsOf(text, images)
      return content.length === 0
        ? { message: undefined, system: '', hoisted: [] }
        : { message: { role: 'user', content }, system: '', hoisted: [] }
    }
    case 'assistant': {
      const { text } = partsOf(message.content, undefined)
      const content: AnthropicPart[] = []
      if (text !== '') content.push({ type: 'text', text })
      for (const block of message.content) {
        if (block.type !== 'tool-call') continue
        // A call's arguments are raw JSON text on the harness side and a parsed
        // object here. Unparseable text becomes `{}` rather than an invalid
        // body: the call id still has to pair with its result, and a replay
        // that drops the call entirely leaves an orphaned result behind.
        content.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: parseArguments(block.arguments),
        })
      }
      return content.length === 0
        ? { message: undefined, system: '', hoisted: [] }
        : { message: { role: 'assistant', content }, system: '', hoisted: [] }
    }
    case 'tool': {
      const { text, images } = partsOf(message.content, resolveImage)
      return {
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: message.toolCallId, content: text }],
        },
        system: '',
        hoisted: images,
      }
    }
  }
}

/**
 * Parse one tool call's arguments into the object this surface expects.
 * @param argumentsJson - raw JSON text the model produced.
 * @returns the parsed value, or an empty object when it is not JSON.
 */
function parseArguments(argumentsJson: string): unknown {
  if (argumentsJson.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(argumentsJson)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Convert a harness request into an Anthropic Messages request body.
 *
 * The system prompt becomes the top-level `system` field, and so does any
 * system-level message in the history — this surface has one such field and no
 * system role, so they are joined in order rather than one winning. Consecutive
 * `tool` messages are folded into one user turn because a single assistant turn
 * may issue several calls whose results arrive as a run of messages, and this
 * surface expects them together.
 * @param options - fully assembled request.
 * @param resolveImage - route image resolver, absent for text-only routes.
 * @returns the request members this adapter sets.
 */
export function toAnthropicRequest(
  options: GenerateOptions,
  resolveImage?: ImageDataUrlResolver,
): AnthropicRequest {
  const messages: AnthropicMessage[] = []
  const systemTexts: string[] = []
  let lifted: string[] = []
  const flushLifted = (): void => {
    if (lifted.length === 0) return
    messages.push({
      role: 'user',
      content: contentPartsOf(HOISTED_TOOL_IMAGES_NOTE, lifted),
    })
    lifted = []
  }

  for (const message of options.messages) {
    const converted = toMessage(message, resolveImage)
    if (converted.system.trim() !== '') systemTexts.push(converted.system)
    if (converted.message === undefined) continue
    const isToolResult = converted.message.content.some((part) => part.type === 'tool_result')
    if (isToolResult) {
      // Fold into the previous turn when that turn is also results, so the run
      // stays adjacent to the assistant turn that issued the calls.
      const previous = messages[messages.length - 1]
      const previousIsResults = previous !== undefined
        && previous.role === 'user'
        && previous.content.every((part) => part.type === 'tool_result')
      if (previousIsResults) {
        messages[messages.length - 1] = {
          role: 'user',
          content: [...previous.content, ...converted.message.content],
        }
      } else {
        messages.push(converted.message)
      }
    } else {
      flushLifted()
      messages.push(converted.message)
    }
    if (converted.hoisted.length > 0) lifted.push(...converted.hoisted)
  }
  flushLifted()

  // Joined in history order, with the one-shot prompt first, because that is the
  // precedence the other two projections give it. `mergeSystem` puts its first
  // argument ahead of its second, and an empty first argument would still leave
  // two leading newlines, so the accumulator starts at the first real text.
  const prompts: string[] = []
  const oneShot = options.system
  if (oneShot !== undefined && oneShot.trim() !== '') prompts.push(oneShot)
  prompts.push(...systemTexts)
  let system = prompts[0] ?? ''
  for (const text of prompts.slice(1)) system = mergeSystem(system, text)

  const tools = toAnthropicTools(options)
  return {
    ...(system === '' ? {} : { system }),
    messages,
    ...(tools === undefined ? {} : { tools }),
  }
}

/**
 * Convert harness tool schemas into Anthropic `tools`.
 *
 * `deferLoading` is not projected: this adapter always declares the complete
 * active tool list, which is the non-deferred behaviour the flag opts out of.
 * @param options - fully assembled request.
 * @returns the tools array, or undefined when the request declares none.
 */
export function toAnthropicTools(options: GenerateOptions): AnthropicTool[] | undefined {
  const tools = options.tools
  if (tools === undefined || tools.length === 0) return undefined
  return tools.map(toAnthropicTool)
}

/**
 * Project one tool schema.
 * @param tool - harness tool declaration.
 * @returns the Anthropic tool declaration.
 */
function toAnthropicTool(tool: ToolSchema): AnthropicTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }
}

/**
 * Map a terminal `stop_reason` onto the harness vocabulary.
 * @param stopReason - `delta.stop_reason` of the `message_delta` event.
 * @param sawToolCall - whether this response emitted a tool call.
 * @returns the harness finish reason.
 */
export function mapAnthropicStop(
  stopReason: string | undefined,
  sawToolCall: boolean,
): FinishReason {
  if (stopReason === 'max_tokens') return { kind: 'max-tokens' }
  if (stopReason === 'tool_use' || sawToolCall) return { kind: 'tool-calls' }
  return { kind: 'stop' }
}

/**
 * Translate one Anthropic SSE payload into chunks.
 *
 * The `type` member repeats the event name, so one switch covers both the
 * `event:` line and the payload. Three deltas carry content — `text_delta`,
 * `thinking_delta`, `input_json_delta` — and the last one is keyed by block
 * `index` rather than by a provider call id.
 * @param state - per-response streaming state.
 * @param payload - decoded SSE data payload.
 * @returns chunks to emit, in order.
 */
export function translateAnthropicEvent(state: StreamState, payload: string): StreamChunk[] {
  let event: unknown
  try {
    event = JSON.parse(payload)
  } catch {
    // `ping` and other non-JSON payloads carry no model content.
    return []
  }
  if (!isRecord(event)) return []

  const chunks: StreamChunk[] = []

  switch (event.type) {
    case 'error': {
      const error = isRecord(event.error) ? event.error : event
      throw classifyGatewayFailure({
        message: typeof error.message === 'string'
          ? error.message
          : 'OpenDesign Anthropic stream reported an error',
        ...(typeof error.code === 'string' ? { code: error.code } : {}),
        ...(typeof error.type === 'string' ? { type: error.type } : {}),
      })
    }
    case 'content_block_start': {
      const block = isRecord(event.content_block) ? event.content_block : undefined
      if (block === undefined || block.type !== 'tool_use') break
      const key = blockIndex(event)
      const id = block.id
      // Without a provider id the call cannot correlate with its result.
      if (key === undefined || typeof id !== 'string' || id === '') break
      const name = typeof block.name === 'string' ? block.name : ''
      // The wire sends the input object up front; when it is non-empty this is
      // the only place it appears, so it seeds the accumulator here.
      const seeded = isRecord(block.input) && Object.keys(block.input).length > 0
        ? JSON.stringify(block.input)
        : ''
      const call = startToolCall(state, key, toolCallId(id), name, chunks)
      call.arguments = seeded
      break
    }
    case 'content_block_delta': {
      const delta = isRecord(event.delta) ? event.delta : undefined
      if (delta === undefined) break
      if (delta.type === 'text_delta') {
        const text = delta.text
        if (typeof text === 'string') appendText(state, text, chunks)
        break
      }
      if (delta.type === 'thinking_delta') {
        const thinking = delta.thinking
        if (typeof thinking === 'string') appendReasoning(state, thinking, chunks)
        break
      }
      if (delta.type === 'input_json_delta') {
        const key = blockIndex(event)
        if (key === undefined) break
        const call = state.toolCalls.get(key)
        if (call === undefined) break
        const partial = typeof delta.partial_json === 'string' ? delta.partial_json : ''
        if (partial === '') break
        call.arguments += partial
        chunks.push({
          type: 'tool-call-delta',
          index: call.index,
          id: call.id,
          name: call.name,
          argumentsDelta: partial,
        })
        break
      }
      break
    }
    case 'message_delta': {
      const delta = isRecord(event.delta) ? event.delta : undefined
      if (delta !== undefined && typeof delta.stop_reason === 'string'
        && state.finishReason === undefined) {
        state.finishReason = mapAnthropicStop(delta.stop_reason, state.openToolCalls.length > 0)
      }
      // The real counts land here; `message_start` carries zeros.
      const usage = isRecord(event.usage) ? anthropicUsage(event.usage) : undefined
      if (usage !== undefined) state.usage = usage
      break
    }
    case 'message_stop': {
      if (state.finishReason === undefined) {
        state.finishReason = mapAnthropicStop(undefined, state.openToolCalls.length > 0)
      }
      chunks.push(...closeOpenBlocks(state))
      break
    }
    default:
      // `message_start`, `content_block_stop` and `ping` carry no increment this
      // adapter does not already have.
      break
  }

  return chunks
}

/**
 * Read the block index an event addresses.
 * @param event - parsed event payload.
 * @returns the index, or undefined when the event carries none.
 */
function blockIndex(event: Record<string, unknown>): number | undefined {
  const index = event.index
  return typeof index === 'number' && Number.isFinite(index) ? index : undefined
}

/**
 * Map this surface's usage object onto disjoint harness token counts.
 *
 * Anthropic states the two counts differently from OpenAI, and the difference is
 * not cosmetic: `input_tokens` here is **uncached input only**, while
 * `cache_read_input_tokens` is reported beside it. {@link toTokenUsage} subtracts
 * the cache share because the OpenAI shape folds it into the prompt total, so
 * feeding these fields to it would subtract a number that was never included.
 * Measured on a repeated long prompt: 2677 tokens cold, then 245 input with 2432
 * cache-read — the two add up to the cold figure, which is what proves they are
 * disjoint.
 * @param usage - the `usage` object from `message_delta`.
 * @returns disjoint token accounting, or undefined when the counts are absent.
 */
export function anthropicUsage(usage: Record<string, unknown>): TokenUsage | undefined {
  const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined
  const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined
  if (inputTokens === undefined || outputTokens === undefined) return undefined

  const cacheRead = typeof usage.cache_read_input_tokens === 'number'
    ? usage.cache_read_input_tokens
    : 0
  const creation = isRecord(usage.cache_creation) ? usage.cache_creation : undefined
  // Both cache-creation windows are reported separately; this adapter writes
  // neither, so whichever the gateway reports is the number to charge.
  const cacheWrite = creation === undefined
    ? 0
    : (typeof creation.ephemeral_5m_input_tokens === 'number' ? creation.ephemeral_5m_input_tokens : 0)
      + (typeof creation.ephemeral_1h_input_tokens === 'number' ? creation.ephemeral_1h_input_tokens : 0)

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + cacheRead + cacheWrite + outputTokens,
    ...(cacheRead === 0 ? {} : { cacheReadTokens: cacheRead }),
    ...(cacheWrite === 0 ? {} : { cacheWriteTokens: cacheWrite }),
  }
}
