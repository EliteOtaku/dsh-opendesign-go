/**
 * Project the harness request vocabulary onto OpenAI Chat Completions wire
 * shapes.
 *
 * M2 speaks Chat Completions only: images, files and deferred tool
 * declarations arrive in later milestones, so this module names what it cannot
 * carry instead of dropping it silently. The functions here are pure, so the
 * mapping is testable without a gateway.
 *
 * @module dsh-opendesign-go/conversion
 */
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, RequestMessage, ToolSchema } from '@deepseek-ai/dsh-llm'
import { GATEWAY_CODES } from './gateway-error.ts'

/** One `function` tool call inside an assistant message. */
interface ChatToolCall {
  readonly id: string
  readonly type: 'function'
  readonly function: {
    readonly name: string
    readonly arguments: string
  }
}

/** One Chat Completions message; only the fields this adapter emits. */
interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool'
  readonly content: string
  readonly tool_calls?: readonly ChatToolCall[]
  readonly tool_call_id?: string
}

/** One `tools[]` declaration. */
interface ChatTool {
  readonly type: 'function'
  readonly function: {
    readonly name: string
    readonly description: string
    readonly parameters: Record<string, unknown>
  }
}

/**
 * Name one content block this protocol cannot carry yet.
 * @param message - diagnostic naming the block and its message role.
 * @returns the error the projection throws.
 */
function unsupportedBlock(message: string): LlmError {
  return new LlmError(message, GATEWAY_CODES.unsupported)
}

/**
 * Read the visible text of one block list.
 *
 * Reasoning is deliberately not echoed back: the provider derives it per
 * request and rejects a client-supplied copy. Tool blocks are projected by the
 * caller, so they contribute no text here.
 * @param blocks - model-facing blocks of one message.
 * @param where - role label used in the unsupported-block diagnostic.
 * @returns the concatenated text blocks.
 */
function textOf(blocks: readonly ContentBlock[], where: string): string {
  let text = ''
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        text += block.text
        break
      case 'reasoning':
      case 'tool-call':
      case 'tool-addition':
      case 'tool-removal':
        break
      case 'image':
        throw unsupportedBlock(
          `OpenDesign Chat Completions cannot carry image content yet (scheduled for M6); the ${where} contains one`,
        )
      case 'file':
        throw unsupportedBlock(
          `OpenDesign Chat Completions receives files as text handles; the ${where} still carries a raw file block`,
        )
      default:
        break
    }
  }
  return text
}

/**
 * Project one assistant message, including its tool calls.
 * @param content - assistant content blocks.
 * @returns the wire message, or undefined when it would carry nothing.
 */
function assistantMessage(content: readonly ContentBlock[]): ChatMessage | undefined {
  const text = textOf(content, 'assistant message')
  const toolCalls: ChatToolCall[] = []
  for (const block of content) {
    if (block.type !== 'tool-call') continue
    toolCalls.push({
      id: block.id,
      type: 'function',
      function: { name: block.name, arguments: block.arguments },
    })
  }
  // An assistant turn that produced neither visible text nor a tool call
  // (reasoning only) has nothing to replay; providers reject an empty turn.
  if (text === '' && toolCalls.length === 0) return undefined
  return toolCalls.length === 0
    ? { role: 'assistant', content: text }
    : { role: 'assistant', content: text, tool_calls: toolCalls }
}

/**
 * Project one request message onto a Chat Completions message.
 * @param message - harness request message.
 * @returns the wire message, or undefined when it would carry nothing.
 */
function toChatMessage(message: RequestMessage): ChatMessage | undefined {
  switch (message.role) {
    case 'system': {
      const text = textOf(message.content, 'system message')
      // `''` records "no system prompt"; an empty system message is rejected by
      // strict gateways, so it is not sent at all.
      return text === '' ? undefined : { role: 'system', content: text }
    }
    case 'developer': {
      // Tool additions/removals only matter to deferred declarations (M6); the
      // remaining text is system-level guidance and keeps that meaning.
      const text = textOf(message.content, 'developer message')
      return text === '' ? undefined : { role: 'system', content: text }
    }
    case 'user': {
      const text = textOf(message.content, 'user message')
      return text === '' ? undefined : { role: 'user', content: text }
    }
    case 'assistant':
      return assistantMessage(message.content)
    case 'tool': {
      const text = textOf(message.content, 'tool message')
      // A tool message answers a call, so it is always sent even when empty.
      return { role: 'tool', tool_call_id: message.toolCallId, content: text }
    }
  }
}

/**
 * Join the one-shot system prompt with the leading system-role message.
 * @param system - system prompt supplied through {@link GenerateOptions.system}.
 * @param existing - text of the leading system-role message.
 * @returns the merged prompt, request prompt first.
 */
function mergeSystem(system: string, existing: string): string {
  return existing === '' ? system : `${system}\n\n${existing}`
}

/**
 * Convert a harness request into Chat Completions `messages`.
 *
 * A one-shot `options.system` becomes the leading system message; when the
 * history already starts with one, the two texts merge instead of competing.
 * @param options - fully assembled request.
 * @returns OpenAI Chat Completions messages, in conversation order.
 */
export function toChatMessages(options: GenerateOptions): unknown[] {
  const messages: ChatMessage[] = []
  for (const message of options.messages) {
    const converted = toChatMessage(message)
    if (converted !== undefined) messages.push(converted)
  }

  const system = options.system
  if (system !== undefined && system.trim() !== '') {
    const first = messages[0]
    if (first !== undefined && first.role === 'system') {
      messages[0] = { role: 'system', content: mergeSystem(system, first.content) }
    } else {
      messages.unshift({ role: 'system', content: system })
    }
  }

  return messages
}

/**
 * Convert harness tool schemas into Chat Completions `tools`.
 *
 * `deferLoading` is not projected: this adapter always declares the complete
 * active tool list, which is the non-deferred behaviour the flag opts out of.
 * @param options - fully assembled request.
 * @returns the tools array, or undefined when the request declares none.
 */
export function toChatTools(options: GenerateOptions): unknown[] | undefined {
  const tools = options.tools
  if (tools === undefined || tools.length === 0) return undefined
  return tools.map(toChatTool)
}

/**
 * Project one tool schema.
 * @param tool - harness tool declaration.
 * @returns the OpenAI `function` tool declaration.
 */
function toChatTool(tool: ToolSchema): ChatTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }
}
