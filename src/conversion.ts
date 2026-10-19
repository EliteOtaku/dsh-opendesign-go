/**
 * Project the harness request vocabulary onto OpenAI Chat Completions wire
 * shapes.
 *
 * Chat Completions carries images as `content` parts rather than a string, so a
 * message with images projects to an array while a text-only one keeps the
 * simpler string form. Deferred tool declarations are still named as
 * unsupported rather than dropped silently. The functions here are pure, so the
 * mapping is testable without a gateway.
 *
 * @module dsh-opendesign-go/conversion
 */
import { LlmError, textOnlyImageText } from '@deepseek-ai/dsh-llm'
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

/** One `image_url` content part. */
interface ChatImagePart {
  readonly type: 'image_url'
  readonly image_url: { readonly url: string }
}

/** One `text` content part, used only when a message also has images. */
interface ChatTextPart {
  readonly type: 'text'
  readonly text: string
}

/** Content is a bare string unless the message carries images. */
type ChatContent = string | readonly (ChatTextPart | ChatImagePart)[]

/** One Chat Completions message; only the fields this adapter emits. */
interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool'
  readonly content: ChatContent
  readonly tool_calls?: readonly ChatToolCall[]
  readonly tool_call_id?: string
}

/**
 * Resolve one durable image reference to an inline data URL.
 *
 * The harness stores normalized bytes on disk, so the adapter reads them and
 * base64-encodes them: Chat Completions accepts `data:` URLs for `image_url`
 * and this avoids depending on a host-visible upload endpoint.
 */
export type ImageDataUrlResolver = (attachment: unknown) => string | undefined

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
 * Split one block list into visible text and inline images.
 *
 * Reasoning is deliberately not echoed back: the provider derives it per
 * request and rejects a client-supplied copy. Tool blocks are projected by the
 * caller, so they contribute nothing here.
 *
 * An image the route cannot carry is replaced by its harness placeholder text
 * rather than throwing: a conversation that already contains an image must stay
 * usable on a text-only model, and the placeholder names the image and its path
 * so the model is not silently lied to.
 * @param blocks - model-facing blocks of one message.
 * @param resolveImage - turns one durable reference into a data URL, or
 * undefined when this route cannot carry images.
 * @returns text and image parts.
 */
function partsOf(
  blocks: readonly ContentBlock[],
  resolveImage: ImageDataUrlResolver | undefined,
): { text: string, images: string[] } {
  let text = ''
  const images: string[] = []
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
      case 'image': {
        const url = block.offloaded === true ? undefined : resolveImage?.(block.attachment)
        if (url === undefined) {
          const placeholder = textOnlyImageText(block.attachment)
          text += text.length > 0 ? '\n' + placeholder : placeholder
        } else {
          images.push(url)
        }
        break
      }
      case 'file':
        throw unsupportedBlock(
          'OpenDesign Chat Completions receives files as text handles; a raw file block reached projection',
        )
      default:
        break
    }
  }
  return { text, images }
}

/**
 * Build wire content from text and images.
 *
 * A text-only message keeps the bare-string form, which every compatible server
 * accepts; only a message with images needs the parts array.
 * @param text - visible text.
 * @param images - data URLs in message order.
 * @returns wire content.
 */
function contentOf(text: string, images: readonly string[]): ChatContent {
  if (images.length === 0) return text
  const parts: (ChatTextPart | ChatImagePart)[] = []
  if (text.length > 0) parts.push({ type: 'text', text })
  for (const url of images) parts.push({ type: 'image_url', image_url: { url } })
  return parts
}

/**
 * Project one assistant message, including its tool calls.
 * @param content - assistant content blocks.
 * @param resolveImage - route image resolver, absent for text-only routes.
 * @returns the wire message, or undefined when it would carry nothing.
 */
function assistantMessage(
  content: readonly ContentBlock[],
  resolveImage: ImageDataUrlResolver | undefined,
): ChatMessage | undefined {
  const { text, images } = partsOf(content, resolveImage)
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
  const wireContent = contentOf(text, images)
  return toolCalls.length === 0
    ? { role: 'assistant', content: wireContent }
    : { role: 'assistant', content: wireContent, tool_calls: toolCalls }
}

/**
 * Project one request message onto a Chat Completions message.
 * @param message - harness request message.
 * @param resolveImage - route image resolver, absent for text-only routes.
 * @returns the wire message, or undefined when it would carry nothing.
 */
function toChatMessage(
  message: RequestMessage,
  resolveImage: ImageDataUrlResolver | undefined,
): ChatMessage | undefined {
  switch (message.role) {
    case 'system': {
      const text = partsOf(message.content, undefined).text
      // `''` records "no system prompt"; an empty system message is rejected by
      // strict gateways, so it is not sent at all.
      return text === '' ? undefined : { role: 'system', content: text }
    }
    case 'developer': {
      // Tool additions/removals only matter to deferred declarations (M6); the
      // remaining text is system-level guidance and keeps that meaning.
      const text = partsOf(message.content, undefined).text
      return text === '' ? undefined : { role: 'system', content: text }
    }
    case 'user': {
      const { text, images } = partsOf(message.content, resolveImage)
      // An image-only turn is legal: it carries no text but still says something.
      if (text === '' && images.length === 0) return undefined
      return { role: 'user', content: contentOf(text, images) }
    }
    case 'assistant':
      return assistantMessage(message.content, resolveImage)
    case 'tool': {
      const text = partsOf(message.content, undefined).text
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
export function toChatMessages(
  options: GenerateOptions,
  resolveImage?: ImageDataUrlResolver,
): unknown[] {
  const messages: ChatMessage[] = []
  for (const message of options.messages) {
    const converted = toChatMessage(message, resolveImage)
    if (converted !== undefined) messages.push(converted)
  }

  const system = options.system
  if (system !== undefined && system.trim() !== '') {
    const first = messages[0]
    if (first !== undefined && first.role === 'system') {
      // The leading system message is text-only by construction, so its
      // content is always the bare string this merge expects.
      messages[0] = {
        role: 'system',
        content: mergeSystem(system, typeof first.content === 'string' ? first.content : ''),
      }
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
