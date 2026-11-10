import { describe, expect, it } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { imageModelsOf, resolveImageModel } from '../src/image-tool.ts'
import { imageBlocks, renderImages } from '../src/image-tool-register.ts'
import type { ToolImage } from '../src/image-tool.ts'
import type { OpenDesignConfig } from '../src/config-contract.ts'

/** A configuration granting the given catalog rows. */
function configOf(ids: readonly string[], imageIds: readonly string[], enabled: readonly string[] = []): OpenDesignConfig {
  return {
    catalogJson: JSON.stringify({ source: 'gateway', ids, imageIds }),
    enabledModels: enabled,
  } as unknown as OpenDesignConfig
}

/** One committed image record. */
const IMAGE: ToolImage = {
  attachmentId: 'sha256:7f3a',
  mediaType: 'image/png',
  bytes: 1024,
  width: 1024,
  height: 1024,
  name: 'seedream-5.0.png',
}

describe('image tool model selection', () => {
  it('lists the image models this account may actually call', () => {
    const config = configOf(['deepseek-v4.1-flash', 'seedream-5.0', 'gpt-image-2'], ['seedream-5.0', 'gpt-image-2'])
    expect(imageModelsOf(config)).toEqual(['seedream-5.0', 'gpt-image-2'])
  })

  it('honours the enabled list, so a disabled image model is not called', () => {
    // Hiding a row is opt-in in this plugin; the tool must agree with the picker
    // rather than quietly using a model the user unticked.
    const config = configOf(['seedream-5.0', 'gpt-image-2'], ['seedream-5.0', 'gpt-image-2'], ['gpt-image-2'])
    expect(imageModelsOf(config)).toEqual(['gpt-image-2'])
  })

  it('uses the first granted model when the call names none', () => {
    const config = configOf(['seedream-5.0', 'gpt-image-2'], ['seedream-5.0', 'gpt-image-2'])
    expect(resolveImageModel(undefined, config)).toBe('seedream-5.0')
  })

  it('refuses a named model the account cannot call, and says what it can call', () => {
    // A model id is a paid resource: silently substituting another one would bill
    // for a picture the caller did not ask for.
    const config = configOf(['seedream-5.0'], ['seedream-5.0'])
    expect(() => resolveImageModel('gpt-image-2', config)).toThrow(LlmError)
    expect(() => resolveImageModel('gpt-image-2', config)).toThrow(/seedream-5\.0/u)
  })

  it('refuses when the account grants no image model at all', () => {
    const config = configOf(['deepseek-v4.1-flash'], [])
    expect(() => resolveImageModel(undefined, config)).toThrow(/grants no image-generation model/u)
  })
})

describe('image tool result', () => {
  it('renders the picture into the tool result, not just its name', () => {
    // The whole reason generation is a tool: the model has to receive the
    // picture. A result naming only the attachment would make it describe an
    // image it never saw.
    const blocks = renderImages([IMAGE], 'seedream-5.0')
    expect(blocks.map((block) => block.type)).toEqual(['text', 'image'])
    const image = blocks[1]
    expect(image).toEqual({
      type: 'image',
      attachment: {
        attachmentId: 'sha256:7f3a',
        mediaType: 'image/png',
        bytes: 1024,
        width: 1024,
        height: 1024,
        name: 'seedream-5.0.png',
      },
    })
  })

  it('says how big the picture is, so the model need not guess', () => {
    const blocks = renderImages([IMAGE], 'seedream-5.0')
    const text = blocks[0]!
    expect(text.type).toBe('text')
    expect((text as { text: string }).text).toContain('1024x1024')
    expect((text as { text: string }).text).toContain('seedream-5.0')
  })

  it('counts a batch correctly', () => {
    const blocks = imageBlocks('Generated 2 pictures.', [IMAGE, { ...IMAGE, attachmentId: 'sha256:aa11' }])
    expect(blocks.filter((block) => block.type === 'image')).toHaveLength(2)
  })
})
