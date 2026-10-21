/**
 * OpenDesign Chat Completions inference adapter (M2).
 *
 * One streaming call per request: the harness vocabulary is projected by
 * `conversion.ts`, the wire call is a single `POST {baseURL}/chat/completions`
 * with `stream: true`, and the SSE response is translated back into
 * {@link StreamChunk}s. Provider failures are named by `gateway-error.ts` so the
 * harness keeps owning retry and recovery.
 *
 * Deliberately out of scope here: request/idle deadlines from the plugin
 * configuration, protocol selection (Responses/Anthropic) and replay state.
 * Those arrive with M6 and the later milestones; this adapter sends the M2
 * protocol only.
 *
 * @module dsh-opendesign-go/adapter
 */
import {
  ACCOUNT_QUOTA_EXCEEDED_CODE,
  INVALID_CREDENTIAL_CODE as INVALID_CREDENTIAL,
  LlmAdapter,
  LlmError,
  QUOTA_EXCEEDED_CODE,
  ToolCallId,
  assertUsableApiKey,
  attributionHeaders,
  errorChain,
} from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { accountsOf } from './accounts.ts'
import type {
  FinishReason,
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
  TokenUsage,
} from '@deepseek-ai/dsh-llm'
import { listSeedModels, seedModel } from './catalog.ts'
import { DEFAULT_REASONING_EFFORT, REASONING_EFFORTS, paramsOf } from './model-params.ts'
import type { ModelParams } from './model-params.ts'
import { estimatePromptTokens, fitMaxTokens, reservedOutputTokens, usableInputTokens } from './output-budget.ts'
import { DISPLAY_NAME, type OpenDesignConfig } from './config-contract.ts'
import { toChatMessages, toChatTools } from './conversion.ts'
import type { ImageDataUrlResolver } from './conversion.ts'
import {
  GATEWAY_CODES,
  classifyGatewayFailure,
  emptyResponseFailure,
  type GatewayFailureDetail,
} from './gateway-error.ts'

/** Stable provider-neutral code for a credential the caller never supplied. */
const MISSING_CREDENTIAL = 'MISSING_CREDENTIAL'

/** Package name prefixed to credential diagnostics. */
const PACKAGE_NAME = 'dsh-opendesign-go'

/** What one adapter instance reads from the plugin. */
export interface OpenDesignAdapterOptions {
  /** Current plugin configuration; read per request so settings changes apply. */
  config: () => OpenDesignConfig
  /**
   * Resolve one account's API key by credential reference.
   * @param ref - reference of the account to resolve.
   * @returns the usable key, or undefined when that account has none stored.
   */
  resolveApiKey: (ref: string) => Promise<string | undefined>
  /**
   * Pin one account as the one subsequent requests should use.
   *
   * Called only after an account has actually produced output, so a failing
   * account is never promoted just by being tried.
   * @param ref - the account that succeeded.
   */
  onAccountSettled?: (ref: string) => void
  /**
   * Report the token usage of one finished call so it can be priced and
   * recorded.
   *
   * Called once per call that produced a usage chunk. A call that failed before
   * reporting usage costs nothing measurable and is not recorded: counting it
   * would make the ledger claim spend that never happened.
   * @param call - the model, the account that served it, and its usage.
   */
  onUsage?: (call: { model: string, accountRef: string, usage: TokenUsage }) => void
  /**
   * Turn one durable image reference into an inline data URL.
   *
   * Absent means this host has no attachment service, so image content projects
   * to the harness placeholder text instead of bytes. The resolver is asked only
   * for models whose catalog entry declares the image modality, so a text-only
   * model never receives image bytes.
   * @param attachment - the durable reference carried by an image block.
   * @returns a `data:` URL, or undefined when the bytes are not readable.
   */
  imageDataUrl?: (attachment: unknown) => string | undefined
}

/**
 * Build a model's effort list, defaulting to the full set when it is unknown.
 *
 * The default effort is clamped into the offered list: leaving it at `medium`
 * for a model that only takes low/high/max would preselect a value the gateway
 * then rejects on the first request.
 * @param params - resolved parameters, or undefined for an unknown model id.
 * @returns the efforts to advertise and the one to preselect.
 */
function reasoningFor(params: ModelParams | undefined): { efforts: { id: ReasoningEffortId, name: string }[], defaultEffort: ReasoningEffortId } {
  const allowed = params?.reasoningEfforts
  const efforts = (allowed === undefined
    ? REASONING_EFFORTS.map((effort) => effort.id)
    : REASONING_EFFORTS.filter((effort) => allowed.includes(effort.id)).map((effort) => effort.id))
  const offered = efforts.length === 0 ? REASONING_EFFORTS.map((effort) => effort.id) : efforts
  const fallback = offered.includes(DEFAULT_REASONING_EFFORT) ? DEFAULT_REASONING_EFFORT : offered[0]!
  return {
    efforts: REASONING_EFFORTS
      .filter((effort) => offered.includes(effort.id))
      .map((effort) => ({ id: ReasoningEffortId(effort.id), name: effort.name })),
    defaultEffort: ReasoningEffortId(fallback),
  }
}

/** One text or reasoning block accumulated while streaming. */
interface TextBlockState {
  readonly index: number
  text: string
}

/** One tool call accumulated while streaming. */
interface ToolCallState {
  readonly index: number
  readonly id: ToolCallId
  name: string
  arguments: string
}

/** Per-response streaming state shared by the SSE translator helpers. */
interface StreamState {
  /** Next free block index. */
  nextIndex: number
  /** Open text block, if the response produced one. */
  text: TextBlockState | undefined
  /** Open reasoning block, if the response produced one. */
  reasoning: TextBlockState | undefined
  /** Open tool calls, keyed by the provider's per-message tool-call index. */
  readonly toolCalls: Map<number, ToolCallState>
  /** Terminal stop reason once the provider names one. */
  finishReason: FinishReason | undefined
  /** Token accounting once the provider reports it. */
  usage: TokenUsage | undefined
  /** Blocks that carried content; zero means the response was degenerate. */
  contentBlocks: number
}

/**
 * Stream one model call.
 *
 * The chunk contract is owned by {@link StreamChunk}: every open block is
 * started before its deltas and closed with its assembled block, usage is
 * emitted before the terminal finish, and nothing follows the finish.
 */
export class OpenDesignAdapter extends LlmAdapter {
  readonly #options: OpenDesignAdapterOptions

  /**
   * @param options - configuration and credential accessors supplied by the plugin.
   */
  constructor(options: OpenDesignAdapterOptions) {
    super()
    this.#options = options
  }

  /**
   * Describe the single route this adapter serves.
   * @param provider - registered provider route.
   * @returns display metadata whose id equals the route.
   */
  providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: DISPLAY_NAME }
  }

  /**
   * Advertise the models the user left enabled.
   *
   * An empty enabled list means "all", so a fresh install shows the full
   * catalog; hiding a model is opt-in. Filtering here rather than in the picker
   * means a disabled model is absent from every consumer, including the
   * composer, not merely hidden from one list.
   * @param provider - registered provider route.
   * @returns the enabled rows, in display order.
   */
  async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const enabled = this.#options.config().enabledModels ?? []
    const rows = listSeedModels(provider)
    if (enabled.length === 0) return rows
    return rows.filter((row) => enabled.includes(row.id))
  }

  /**
   * Resolve metadata for one exact model.
   *
   * Routing accepts ids outside the seed catalog, so an unknown id resolves to
   * itself instead of failing; the catalog stays advisory.
   *
   * The returned metadata is what the picker renders: `context` drives the
   * context-window display and truncation warnings, `defaultMaxTokens` caps
   * output, and `reasoning` is what makes a reasoning-effort selector appear at
   * all. Omitting any of them is why the selector was missing.
   * @param provider - registered provider route.
   * @param model - exact model id from the request.
   * @param _signal - cancellation for this lookup; the seed needs none.
   * @returns provider/model identity plus resolved parameters.
   */
  async resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    const row = seedModel(model)
    const params = paramsOf(model, this.#options.config().modelParams)
    // Offer only what this model takes. The gateway rejects a value its
    // neighbour accepts — GLM answers 400 outside low/high/max, and Kimi stops at
    // xhigh — so a shared list both errored on some models and hid the top level
    // on others.
    const reasoning = reasoningFor(params)
    if (row === undefined) {
      // An unknown id keeps the full list: the id is newer than this build and
      // its accepted set is unknown, so hiding levels would be the worse error.
      return { provider, id: model, name: model, reasoning: reasoningFor(undefined) }
    }
    return {
      provider,
      id: row.id,
      name: row.name,
      // Modalities come from MODEL_DEFAULTS, never from the seed row. The seed
      // table carries only id and name, so reading it here left every model
      // declaring no input modality — and the host's image tool refuses to read
      // an image unless the resolved route names `image` explicitly, which made
      // "this model cannot see images" the reported symptom of a table mismatch.
      ...(params === undefined ? {} : {
        inputModalities: params.inputModalities,
        // The harness compares conversation size against this number and never
        // subtracts the output reservation, so it is told what input may fill.
        // Reporting the advertised window here made every compaction decision
        // late by the reservation, and a conversation at 60% of the window was
        // still refused by the provider as too long.
        context: { contextWindow: usableInputTokens(params.contextWindow, params.maxTokens) },
        defaultMaxTokens: reservedOutputTokens(params.contextWindow, params.maxTokens),
      }),
      reasoning,
    }
  }

  /**
   * Stream one Chat Completions call.
   * @param options - fully assembled request.
   * @returns the translated chunk stream.
   * @throws LlmError - classified gateway failure, missing credential, or an
   * empty response.
   */
  /**
   * The image resolver to use for one model, if any.
   *
   * Gated on the declared modality: sending image parts to a text-only model is
   * an error at the provider, and the harness has a placeholder for exactly that
   * case, so gating here keeps the failure out of the request entirely.
   * @param model - exact model id.
   * @returns the resolver, or undefined when this model cannot take images.
   */
  #imageResolverFor(model: string): ImageDataUrlResolver | undefined {
    const resolve = this.#options.imageDataUrl
    if (resolve === undefined) return undefined
    const params = paramsOf(model, this.#options.config().modelParams)
    if (params === undefined || !params.inputModalities.includes('image')) return undefined
    return resolve
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const config = this.#options.config()
    // Account fallback is decided once, from the same configuration snapshot
    // every attempt shares: the selected account first, then the rest of the
    // list in order when auto-switch is on. Nothing re-reads the list mid-call,
    // so a settings edit cannot change the roster between attempts.
    const candidates = config.autoSwitch ? accountsOf(config).map((account) => account.apiKeyEnv) : [config.apiKeyEnv]
    let lastFailure: unknown
    for (const ref of candidates) {
      const apiKey = await this.#apiKey(ref)
      const response = await dispatch(options, config, apiKey, this.#imageResolverFor(options.model))
      if (!response.ok) {
        lastFailure = classifyGatewayFailure(await readFailure(response))
        // Only a rejected credential or exhausted quota justifies trying the
        // next subscription; a timeout or a malformed request would fail
        // identically everywhere.
        if (config.autoSwitch && isRetryableAccountFailure(lastFailure)
          && candidates.indexOf(ref) < candidates.length - 1) continue
        throw lastFailure
      }
      const body = response.body
      if (body === null) throw emptyResponseFailure()
      let usage: TokenUsage | undefined
      for await (const chunk of consumeSse(body)) {
        // Promote the account only once it has produced real output: an account
        // that fails after streaming began must not become the new default.
        if (chunk.type === 'block-end') this.#options.onAccountSettled?.(ref)
        // Keep the terminal usage chunk so the ledger can price this call. The
        // chunk is captured, not consumed: it is still yielded below.
        if (chunk.type === 'usage') usage = chunk.usage
        yield chunk
      }
      if (usage !== undefined) this.#options.onUsage?.({ model: options.model, accountRef: ref, usage })
      return
    }
    throw lastFailure ?? new LlmError('OpenDesign: no usable account', MISSING_CREDENTIAL)
  }

  /**
   * Resolve and validate one account's API key.
   * @param ref - credential reference of the account.
   * @returns the trimmed, usable key.
   * @throws LlmError - `MISSING_CREDENTIAL` when nothing resolved, or the
   * harness's `INVALID_CREDENTIAL` when the value cannot be a header value.
   */
  async #apiKey(ref: string): Promise<string> {
    const raw = await this.#options.resolveApiKey(ref)
    if (raw === undefined) {
      throw new LlmError(
        `OpenDesign: no API key resolved for ${ref}; set it in the Models settings or the launching environment`,
        MISSING_CREDENTIAL,
      )
    }
    return assertUsableApiKey(raw, PACKAGE_NAME, ref)
  }
}

/**
 * Whether a failure justifies trying the next account.
 * @param failure - classified failure from one attempt.
 * @returns true only for a rejected credential or exhausted quota.
 */
export function isRetryableAccountFailure(failure: unknown): boolean {
  if (!(failure instanceof LlmError)) return false
  return failure.code === INVALID_CREDENTIAL
    || failure.code === QUOTA_EXCEEDED_CODE
    || failure.code === ACCOUNT_QUOTA_EXCEEDED_CODE
}

/**
 * Send one streaming Chat Completions request.
 * @param options - fully assembled request.
 * @param config - configuration snapshot supplying the endpoint.
 * @param apiKey - validated credential.
 * @returns the raw HTTP response, whatever its status.
 * @throws LlmError - `INVALID_REQUEST` when no endpoint is configured, or
 * `SERVER` for a transport failure that is not cancellation.
 */
async function dispatch(
  options: GenerateOptions,
  config: OpenDesignConfig,
  apiKey: string,
  resolver: ImageDataUrlResolver | undefined,
): Promise<Response> {
  const baseURL = config.baseURL.replace(/\/+$/u, '')
  if (baseURL === '') throw new LlmError('OpenDesign: baseURL is not configured', GATEWAY_CODES.invalidRequest)

  const body: Record<string, unknown> = {
    model: options.model,
    messages: toChatMessages(options, resolver),
    stream: true,
    stream_options: { include_usage: true },
  }
  const tools = toChatTools(options)
  if (tools !== undefined) body.tools = tools
  if (options.temperature !== undefined) body.temperature = options.temperature
  // A caller-provided cap wins; otherwise the model's own output budget is used,
  // because leaving the field out lets the provider pick an output size that
  // overflows the window it just measured the input against.
  const params = paramsOf(options.model, config.modelParams)
  const requested = options.maxTokens ?? params?.maxTokens
  if (requested !== undefined) {
    // The provider checks input + max_tokens against the window before running
    // anything, so a large advertised output cap refuses otherwise-valid input.
    // The reservation is clamped to what is actually left, which is the only way
    // both "use the model's real output budget" and "accept a long prompt" hold.
    const fitted = params === undefined
      ? requested
      : fitMaxTokens(requested, params.contextWindow, estimatePromptTokens(body.messages as unknown[], tools))
    if (fitted !== undefined) body.max_tokens = fitted
  }
  // The gateway honours `reasoning_effort`: the four values change
  // `reasoning_tokens` in the response rather than being ignored.
  if (options.reasoningEffort !== undefined) body.reasoning_effort = options.reasoningEffort
  if (options.stop !== undefined && options.stop.length > 0) body.stop = options.stop

  const headers: Record<string, string> = {
    ...attributionHeaders(),
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    accept: 'text/event-stream',
  }

  const signal = deadlineSignal(options.signal, config.requestTimeoutMs)

  try {
    return await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (cause) {
    // The caller's own cancellation is the harness's `aborted` finish, not a
    // provider failure. Our deadline expiring is a timeout, and must be named.
    if (options.signal?.aborted === true) throw cause
    if (isAbortError(cause)) {
      throw new LlmError(`OpenDesign request exceeded ${config.requestTimeoutMs}ms`, GATEWAY_CODES.timeout, { cause })
    }
    throw new LlmError(`OpenDesign transport failure: ${errorChain(cause)}`, GATEWAY_CODES.server, { cause })
  }
}

/**
 * Combine the caller's cancellation with this dispatch's deadline.
 * @param signal - caller cancellation, when supplied.
 * @param timeoutMs - dispatch deadline in milliseconds; non-positive disables it.
 * @returns one signal that aborts on either source, or undefined when neither applies.
 */
function deadlineSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal | undefined {
  const timeout = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
  if (signal === undefined) return timeout
  if (timeout === undefined) return signal
  return AbortSignal.any([signal, timeout])
}

/**
 * Read the structured failure facts of a non-2xx response.
 * @param response - failed HTTP response.
 * @returns the facts `classifyGatewayFailure` routes on.
 */
async function readFailure(response: Response): Promise<GatewayFailureDetail> {
  let raw = ''
  try {
    raw = await response.text()
  } catch {
    raw = ''
  }
  const fallback = raw.trim() === '' ? `HTTP ${response.status}` : raw.trim().slice(0, 500)

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: response.status, message: fallback }
  }
  if (!isRecord(parsed)) return { status: response.status, message: fallback }

  const error = parsed.error
  if (isRecord(error)) return { status: response.status, ...failureDetailFromError(error, fallback) }
  const message = typeof parsed.message === 'string' ? parsed.message : fallback
  return { status: response.status, message }
}

/**
 * Extract the gateway error object's identifying fields.
 * @param error - parsed `error` member.
 * @param fallback - message to use when the object carries none.
 * @returns the failure facts, omitting absent members.
 */
function failureDetailFromError(error: Record<string, unknown>, fallback: string): GatewayFailureDetail {
  const code = typeof error.code === 'string' ? error.code : undefined
  const type = typeof error.type === 'string' ? error.type : undefined
  const message = typeof error.message === 'string' ? error.message : fallback
  return {
    message,
    ...(code === undefined ? {} : { code }),
    ...(type === undefined ? {} : { type }),
  }
}

/**
 * Translate one SSE byte stream into chunks.
 * @param body - response body stream.
 * @returns the translated chunks, ending with usage (when reported) and one finish.
 * @throws LlmError - an in-band gateway error, or an empty response.
 */
async function* consumeSse(body: NonNullable<Response['body']>): AsyncGenerator<StreamChunk> {
  const state: StreamState = {
    nextIndex: 0,
    text: undefined,
    reasoning: undefined,
    toolCalls: new Map(),
    finishReason: undefined,
    usage: undefined,
    contentBlocks: 0,
  }
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []
  let done = false

  /** Flush one accumulated SSE event. */
  const flushEvent = (): StreamChunk[] => {
    const payload = dataLines.join('\n')
    dataLines = []
    if (payload === '') return []
    if (payload === '[DONE]') {
      done = true
      return []
    }
    return translateEvent(state, payload)
  }

  /** Consume one SSE line. */
  const consumeLine = (line: string): StreamChunk[] => {
    if (line === '') return flushEvent()
    // A comment line (`: keep-alive`) carries no data.
    if (line.startsWith(':')) return []
    if (!line.startsWith('data:')) return []
    dataLines.push(line.slice(5).replace(/^ /u, ''))
    return []
  }

  try {
    while (!done) {
      const result = await reader.read()
      if (result.done) break
      buffer += decoder.decode(result.value, { stream: true })

      let lineEnd = buffer.indexOf('\n')
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd).replace(/\r$/u, '')
        buffer = buffer.slice(lineEnd + 1)
        for (const chunk of consumeLine(line)) yield chunk
        if (done) break
        lineEnd = buffer.indexOf('\n')
      }
    }

    if (!done) {
      // Flush the decoder and any line that arrived without a trailing newline.
      buffer += decoder.decode()
      if (buffer !== '') {
        for (const chunk of consumeLine(buffer.replace(/\r$/u, ''))) yield chunk
      }
      for (const chunk of flushEvent()) yield chunk
    }
  } finally {
    // Releasing the body also covers a consumer that stops before `[DONE]`.
    await reader.cancel().catch(() => undefined)
  }

  if (state.contentBlocks === 0) throw emptyResponseFailure()

  for (const chunk of closeOpenBlocks(state)) yield chunk
  if (state.usage !== undefined) yield { type: 'usage', usage: state.usage }
  yield { type: 'finish', reason: state.finishReason ?? { kind: 'stop' } }
}

/**
 * Translate one `data:` payload into chunks.
 * @param state - per-response streaming state.
 * @param payload - decoded SSE data payload.
 * @returns chunks to emit, in order.
 */
function translateEvent(state: StreamState, payload: string): StreamChunk[] {
  let event: unknown
  try {
    event = JSON.parse(payload)
  } catch {
    // Keep-alives and non-JSON payloads carry no model content.
    return []
  }
  if (!isRecord(event)) return []

  // Some OpenAI-compatible gateways report a failure inside a 200 stream.
  if (isRecord(event.error)) {
    throw classifyGatewayFailure(failureDetailFromError(event.error, 'OpenDesign stream reported an error'))
  }

  if (isRecord(event.usage)) {
    const usage = toTokenUsage(event.usage)
    if (usage !== undefined) state.usage = usage
  }

  const chunks: StreamChunk[] = []
  const choices = event.choices
  if (!Array.isArray(choices)) return chunks

  // The adapter never requests `n`, so a response carries at most one choice.
  const choice = choices[0]
  if (!isRecord(choice)) return chunks

  const delta = choice.delta
  if (isRecord(delta)) collectDelta(state, delta, chunks)

  const finish = choice.finish_reason
  if (typeof finish === 'string' && finish !== '' && state.finishReason === undefined) {
    state.finishReason = mapFinishReason(finish)
    chunks.push(...closeOpenBlocks(state))
  }

  return chunks
}

/**
 * Translate one streaming delta into chunks.
 * @param state - per-response streaming state.
 * @param delta - the provider's delta object.
 * @param chunks - accumulator for emitted chunks.
 */
function collectDelta(state: StreamState, delta: Record<string, unknown>, chunks: StreamChunk[]): void {
  const content = delta.content
  if (typeof content === 'string' && content !== '') {
    if (state.text === undefined) {
      state.text = { index: takeIndex(state), text: '' }
      state.contentBlocks += 1
      chunks.push({ type: 'block-start', index: state.text.index, blockType: 'text' })
    }
    state.text.text += content
    chunks.push({ type: 'text-delta', index: state.text.index, text: content })
  }

  const reasoning = delta.reasoning_content
  if (typeof reasoning === 'string' && reasoning !== '') {
    if (state.reasoning === undefined) {
      state.reasoning = { index: takeIndex(state), text: '' }
      state.contentBlocks += 1
      chunks.push({ type: 'block-start', index: state.reasoning.index, blockType: 'reasoning' })
    }
    state.reasoning.text += reasoning
    chunks.push({ type: 'reasoning-delta', index: state.reasoning.index, text: reasoning })
  }

  const toolDeltas = delta.tool_calls
  if (!Array.isArray(toolDeltas)) return
  for (const item of toolDeltas) {
    if (!isRecord(item)) continue

    const toolIndex = typeof item.index === 'number' ? item.index : 0
    const id = typeof item.id === 'string' && item.id !== '' ? item.id : undefined
    const fn = isRecord(item.function) ? item.function : undefined
    const name = fn !== undefined && typeof fn.name === 'string' && fn.name !== '' ? fn.name : undefined
    const argumentsDelta = fn !== undefined && typeof fn.arguments === 'string' ? fn.arguments : undefined

    let call = state.toolCalls.get(toolIndex)
    if (call === undefined) {
      // Without a provider id the call cannot correlate with its result.
      if (id === undefined) continue
      call = { index: takeIndex(state), id: ToolCallId(id), name: name ?? '', arguments: '' }
      state.toolCalls.set(toolIndex, call)
      state.contentBlocks += 1
      chunks.push({ type: 'block-start', index: call.index, blockType: 'tool-call' })
    }
    if (name !== undefined) call.name = name

    const deltaArguments = argumentsDelta ?? ''
    call.arguments += deltaArguments
    chunks.push({
      type: 'tool-call-delta',
      index: call.index,
      id: call.id,
      ...(name === undefined ? {} : { name }),
      argumentsDelta: deltaArguments,
    })
  }
}

/**
 * Close every block still open, in first-seen order.
 * @param state - per-response streaming state.
 * @returns the `block-end` chunks carrying each assembled block.
 */
function closeOpenBlocks(state: StreamState): StreamChunk[] {
  const open: { index: number; chunk: StreamChunk }[] = []

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
 * Allocate the next block index.
 * @param state - per-response streaming state.
 * @returns the index this block owns for the whole response.
 */
function takeIndex(state: StreamState): number {
  const index = state.nextIndex
  state.nextIndex += 1
  return index
}

/**
 * Map an OpenAI `finish_reason` onto the harness vocabulary.
 * @param reason - provider stop reason.
 * @returns the harness finish reason.
 */
function mapFinishReason(reason: string): FinishReason {
  switch (reason) {
    case 'length':
      return { kind: 'max-tokens' }
    case 'tool_calls':
    case 'function_call':
      return { kind: 'tool-calls' }
    default:
      // `stop` and provider-specific endings (`content_filter`, `end_turn`, …)
      // all mean generation ended normally.
      return { kind: 'stop' }
  }
}

/**
 * Map an OpenAI usage object onto disjoint harness token counts.
 *
 * `prompt_tokens` is an aggregate that already includes cache hits, while
 * {@link TokenUsage} counts uncached input separately; the cache share is
 * subtracted out of `inputTokens`.
 * @param usage - provider usage object.
 * @returns disjoint token accounting, or undefined when the counts are absent.
 */
function toTokenUsage(usage: Record<string, unknown>): TokenUsage | undefined {
  const promptTokens = numberValue(usage.prompt_tokens)
  const completionTokens = numberValue(usage.completion_tokens)
  if (promptTokens === undefined || completionTokens === undefined) return undefined

  const promptDetails = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : undefined
  const completionDetails = isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : undefined

  // OpenAI reports hits under prompt_tokens_details; DeepSeek reports them as
  // a top-level prompt_cache_hit_tokens.
  const cacheRead =
    firstNumber(promptDetails === undefined ? undefined : promptDetails.cached_tokens, usage.prompt_cache_hit_tokens) ?? 0
  // Chat Completions has no cache-write counter of its own; accept the fields a
  // cache-aware gateway may add rather than inventing a value.
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
function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Return the first finite number among the candidates.
 * @param values - candidates in priority order.
 * @returns the first number, or undefined when none qualifies.
 */
function firstNumber(...values: readonly unknown[]): number | undefined {
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Recognize a fetch cancellation.
 * @param value - thrown value.
 * @returns whether it is an `AbortError`.
 */
function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === 'AbortError'
}
