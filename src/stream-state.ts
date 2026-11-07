/**
 * Streaming state shared by every wire protocol this adapter speaks.
 *
 * Both Chat Completions and Responses describe the same output — some thinking,
 * some text, some tool calls, then a stop reason and a token count — so the
 * accumulator, the block indices and the token accounting live here once, and a
 * protocol module only translates its own events into that vocabulary. Keeping
 * one definition is what stops the two surfaces from disagreeing about, say,
 * whether cached input is counted inside the input total.
 *
 * @module dsh-opendesign-go/stream-state
 */
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'

/** One text or reasoning block accumulated while streaming. */
export interface TextBlockState {
  /** Block index this accumulation owns. */
  readonly index: number
  /** Assembled text so far. */
  text: string
}

/** One tool call accumulated while streaming. */
export interface ToolCallState {
  /** Block index this call owns. */
  readonly index: number
  /** Provider id correlating the call with its result. */
  readonly id: ToolCallId
  /** Declared tool name; empty until the provider names it. */
  name: string
  /** Raw JSON arguments, assembled incrementally. */
  arguments: string
}

/** Per-response streaming state shared by the protocol translators. */
export interface StreamState {
  /** Next free block index. */
  nextIndex: number
  /** Open text block, if the response produced one. */
  text: TextBlockState | undefined
  /** Open reasoning block, if the response produced one. */
  reasoning: TextBlockState | undefined
  /** Open tool calls, keyed by the provider's own per-response item key. */
  readonly toolCalls: Map<number | string, ToolCallState>
  /** Terminal stop reason once the provider names one. */
  finishReason: FinishReason | undefined
  /** Token accounting once the provider reports it. */
  usage: TokenUsage | undefined
  /** Blocks that carried content; zero means the response was degenerate. */
  contentBlocks: number
}

/**
 * Create the empty state for one response.
 * @returns a fresh accumulator.
 */
export function createStreamState(): StreamState {
  return {
    nextIndex: 0,
    text: undefined,
    reasoning: undefined,
    toolCalls: new Map(),
    finishReason: undefined,
    usage: undefined,
    contentBlocks: 0,
  }
}

/**
 * Allocate the next block index.
 * @param state - per-response streaming state.
 * @returns the index this block owns for the whole response.
 */
export function takeIndex(state: StreamState): number {
  const index = state.nextIndex
  state.nextIndex += 1
  return index
}

/**
 * Append to the open text block, opening it on first use.
 * @param state - per-response streaming state.
 * @param text - increment to append.
 * @param chunks - accumulator for emitted chunks.
 */
export function appendText(state: StreamState, text: string, chunks: StreamChunk[]): void {
  if (text === '') return
  if (state.text === undefined) {
    state.text = { index: takeIndex(state), text: '' }
    state.contentBlocks += 1
    chunks.push({ type: 'block-start', index: state.text.index, blockType: 'text' })
  }
  state.text.text += text
  chunks.push({ type: 'text-delta', index: state.text.index, text })
}

/**
 * Append to the open reasoning block, opening it on first use.
 * @param state - per-response streaming state.
 * @param text - increment to append.
 * @param chunks - accumulator for emitted chunks.
 */
export function appendReasoning(state: StreamState, text: string, chunks: StreamChunk[]): void {
  if (text === '') return
  if (state.reasoning === undefined) {
    state.reasoning = { index: takeIndex(state), text: '' }
    state.contentBlocks += 1
    chunks.push({ type: 'block-start', index: state.reasoning.index, blockType: 'reasoning' })
  }
  state.reasoning.text += text
  chunks.push({ type: 'reasoning-delta', index: state.reasoning.index, text })
}

/**
 * Close every block still open, in first-seen order.
 * @param state - per-response streaming state.
 * @returns the `block-end` chunks carrying each assembled block.
 */
export function closeOpenBlocks(state: StreamState): StreamChunk[] {
  const open: { index: number, chunk: StreamChunk }[] = []

  if (state.reasoning !== undefined) {
    const index = state.reasoning.index
    open.push({
      index,
      chunk: { type: 'block-end', index, block: { type: 'reasoning', text: state.reasoning.text } },
    })
    state.reasoning = undefined
  }

  if (state.text !== undefined) {
    const index = state.text.index
    open.push({ index, chunk: { type: 'block-end', index, block: { type: 'text', text: state.text.text } } })
    state.text = undefined
  }

  for (const call of state.toolCalls.values()) {
    open.push({
      index: call.index,
      chunk: {
        type: 'block-end',
        index: call.index,
        block: { type: 'tool-call', id: call.id, name: call.name, arguments: call.arguments },
      },
    })
  }
  state.toolCalls.clear()

  open.sort((left, right) => left.index - right.index)
  return open.map((entry) => entry.chunk)
}

/**
 * Map a usage object onto disjoint harness token counts.
 *
 * Both surfaces are accepted because both are in use: Chat Completions reports
 * `prompt_tokens`/`completion_tokens`, Responses reports
 * `input_tokens`/`output_tokens`, and either may carry the same facts in a
 * `*_details` child. `prompt_tokens`/`input_tokens` are aggregates that already
 * include cache hits, while {@link TokenUsage} counts uncached input separately,
 * so the cache share is subtracted out of `inputTokens`.
 * @param usage - provider usage object.
 * @returns disjoint token accounting, or undefined when the counts are absent.
 */
export function toTokenUsage(usage: Record<string, unknown>): TokenUsage | undefined {
  const promptTokens = firstNumber(usage.prompt_tokens, usage.input_tokens)
  const completionTokens = firstNumber(usage.completion_tokens, usage.output_tokens)
  if (promptTokens === undefined || completionTokens === undefined) return undefined

  const promptDetails = isRecord(usage.prompt_tokens_details)
    ? usage.prompt_tokens_details
    : isRecord(usage.input_tokens_details) ? usage.input_tokens_details : undefined
  const completionDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : isRecord(usage.output_tokens_details) ? usage.output_tokens_details : undefined

  // OpenAI reports hits under the details object; DeepSeek reports them as a
  // top-level prompt_cache_hit_tokens. Responses spells the details member
  // `cached_read_tokens` next to `cached_tokens`, so both are read.
  const cacheRead =
    firstNumber(
      promptDetails === undefined ? undefined : promptDetails.cached_tokens,
      promptDetails === undefined ? undefined : promptDetails.cached_read_tokens,
      usage.prompt_cache_hit_tokens,
    ) ?? 0
  // Neither surface prices cache writes here; accept the fields a cache-aware
  // gateway may add rather than inventing a value.
  const cacheWrite =
    firstNumber(
      promptDetails === undefined ? undefined : promptDetails.cache_write_tokens,
      usage.prompt_cache_write_tokens,
      usage.cache_creation_input_tokens,
    ) ?? 0
  const reasoningTokens =
    completionDetails === undefined ? undefined : numberValue(completionDetails.reasoning_tokens)

  return {
    inputTokens: Math.max(0, promptTokens - cacheRead - cacheWrite),
    outputTokens: completionTokens,
    // Both counters are aggregates, so their sum is the exact full-call total.
    totalTokens: promptTokens + completionTokens,
    ...(cacheRead === 0 ? {} : { cacheReadTokens: cacheRead }),
    ...(cacheWrite === 0 ? {} : { cacheWriteTokens: cacheWrite }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
  }
}

/**
 * Read one finite number.
 * @param value - candidate value.
 * @returns the number, or undefined when absent or non-finite.
 */
export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Return the first finite number among the candidates.
 * @param values - candidates in priority order.
 * @returns the first number, or undefined when none qualifies.
 */
export function firstNumber(...values: readonly unknown[]): number | undefined {
  for (const value of values) {
    const number = numberValue(value)
    if (number !== undefined) return number
  }
  return undefined
}

/**
 * Narrow an arbitrary value to a plain JSON object.
 * @param value - candidate value.
 * @returns whether the value is a non-null object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Brand a provider-supplied call id for the harness block vocabulary.
 * @param id - provider id.
 * @returns the same string as a tool-call id.
 */
export function toolCallId(id: string): ToolCallId {
  return ToolCallId(id)
}
