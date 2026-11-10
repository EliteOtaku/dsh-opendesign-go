/**
 * Register the OpenDesign image-generation tool on a host context.
 *
 * This is the shape `dsh-image-gen` uses, and it is not a stylistic choice: a
 * generated picture has to arrive as a **tool result**. Attaching it to the
 * assistant turn instead fails three ways at once — the bundled adapters reject
 * assistant images with `UNSUPPORTED_CONTENT`, `dsh-compaction-image-offload`
 * cannot select an assistant occurrence, and a picture counted against the
 * request budget that cannot be offloaded leaves the conversation in a state it
 * can never leave.
 *
 * The tool is named `opendesign_generate_image` rather than `generate_image`
 * because `dsh-image-gen` may be mounted in the same profile; two global tools
 * with one name is a registration failure, and the two names differ anyway in
 * which account pays for the call.
 *
 * @module dsh-opendesign-go/image-tool-register
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock, ImageBlock } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { IMAGE_TOOL_NAME, generateForTool } from './image-tool.ts'
import type { ImageToolDependencies, ToolImage } from './image-tool.ts'

/**
 * Text plus one image block per committed reference.
 * @param text - the sentence the model reads first.
 * @param images - committed images, in reply order.
 * @returns content blocks, text first.
 */
export function imageBlocks(text: string, images: readonly ToolImage[]): ContentBlock[] {
  const blocks: ContentBlock[] = [{ type: 'text', text }]
  for (const image of images) {
    const block: ImageBlock = {
      type: 'image',
      attachment: {
        attachmentId: image.attachmentId as ImageBlock['attachment']['attachmentId'],
        mediaType: image.mediaType as ImageBlock['attachment']['mediaType'],
        bytes: image.bytes,
        width: image.width,
        height: image.height,
        ...(image.name === undefined ? {} : { name: image.name }),
      },
    }
    blocks.push(block)
  }
  return blocks
}

/**
 * Model-facing content of one successful call.
 *
 * The pictures are included so they reach the next turn's context: a tool result
 * that only named the attachment would make the model describe a picture it never
 * received.
 * @param images - committed images, in reply order.
 * @param model - model that served the call.
 * @returns text describing the result plus one block per picture.
 */
export function renderImages(images: readonly ToolImage[], model: string): ContentBlock[] {
  const count = images.length === 1 ? 'one picture' : `${images.length} pictures`
  const shapes = images.map((image) => `${image.width}x${image.height}`).join(', ')
  const text = `Generated ${count} with ${model} (${shapes}). `
    + 'The result is attached below and already committed to the conversation; '
    + 'respond about it directly rather than calling read or other tools to locate it.'
  return imageBlocks(text, images)
}

/**
 * The tool definition, unbound so a test can inspect it without a host.
 *
 * The model ids are deliberately not an enum: `generateForTool` reads the catalog
 * on every call, so a model added by a refresh is accepted without re-registering
 * the tool.
 * @param deps - configuration, credential, and store seams.
 * @returns the registry-ready definition.
 */
export function createImageTool(deps: ImageToolDependencies): ToolDefinition {
  return defineTool({
    name: IMAGE_TOOL_NAME,
    description:
      'Generate one picture with an OpenDesign image model (gpt-image-2, seedream-5.0, nano-banana-2, ...). '
      + 'Use it only when the user actually asks for a new picture: the call bills the OpenDesign account. '
      + 'The picture is committed to the conversation and returned to you in this tool result, so you can see it '
      + 'without reading any file. Do not offer a description instead of calling it, and do not call it to test '
      + 'whether it works.',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description:
          'Complete visual description: subject, composition, style, lighting, and any exact text that must appear '
          + 'in the picture. One self-contained instruction; the image model sees nothing else from the conversation.',
      },
      model: {
        type: 'string',
        description:
          'OMIT unless the user names a specific image model. Omission uses the first image model this account '
          + 'grants, which is right for almost every request.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          images: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                attachmentId: { type: 'string', required: true },
                mediaType: { type: 'string', required: true },
                bytes: { type: 'integer', required: true },
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
                name: { type: 'string' },
              },
            },
          },
          model: { type: 'string', required: true },
        },
      },
      render: (_args, value) => renderImages(value.images, value.model),
    },
    presentResult: (_args, result) => ({
      card: 'generic',
      title: result.isError ? 'Image generation failed' : 'Generated image',
      // Straight from the projected result, so the card shows the same pictures
      // the model received rather than a second derivation of them.
      content: result.content,
    }),
    async execute(args, exec) {
      // A cancellation that arrives before dispatch bills the account nothing.
      exec.signal.throwIfAborted()
      return await generateForTool(deps, { prompt: args.prompt, ...(args.model === undefined ? {} : { model: args.model }) })
    },
  })
}

/**
 * Register the tool on one context and return its disposer.
 * @param ctx - context that owns a tool registry.
 * @param deps - configuration, credential, and store seams.
 * @returns the exact disposer that unregisters the tool.
 */
export function registerImageTool(ctx: Context, deps: ImageToolDependencies): () => void {
  return ctx.tools.register(createImageTool(deps))
}
