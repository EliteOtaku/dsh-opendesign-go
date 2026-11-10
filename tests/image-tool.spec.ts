import { describe, expect, it } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { IMAGE_TOOL_NAME, imageModelsOf, resolveImageModel } from '../src/image-tool.ts'
import { createImageTool, imageBlocks, registerImageTool, renderImages } from '../src/image-tool-register.ts'
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
    // A list that names one image model is a statement about image models: the
    // one left out was unticked, and the tool must agree with the page rather
    // than quietly using a model the user turned off.
    const config = configOf(['seedream-5.0', 'gpt-image-2'], ['seedream-5.0', 'gpt-image-2'], ['gpt-image-2'])
    expect(imageModelsOf(config)).toEqual(['gpt-image-2'])
  })

  it('still generates for a model list saved before image ids existed', () => {
    // `enabledModels` is only written when the user flips something, so a list
    // saved by an older build names no image model at all. Reading that as "every
    // image model is off" would break generation for exactly the users who
    // customised their picker — which is the reported "generation model does not
    // work" case.
    const config = configOf(
      ['deepseek-v4.1-flash', 'gpt-6-luna', 'seedream-5.0'],
      ['seedream-5.0'],
      ['deepseek-v4.1-flash', 'gpt-6-luna'],
    )
    expect(imageModelsOf(config)).toEqual(['seedream-5.0'])
    expect(resolveImageModel(undefined, config)).toBe('seedream-5.0')
  })

  it('has nothing to offer when the catalog grants no image model', () => {
    // The other half of the same distinction: an absent image id here is a fact
    // about the account, not about a switch.
    const config = configOf(['deepseek-v4.1-flash'], [], ['deepseek-v4.1-flash'])
    expect(imageModelsOf(config)).toEqual([])
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

describe('image tool definition', () => {
  it('is accepted by the real defineTool schema compiler', () => {
    // `defineTool` validates the parameter and output schemas at construction, so
    // building the definition is itself the check that the contract it declares is
    // one the harness accepts — a tool whose schema is rejected cannot be
    // registered at all.
    const tool = createImageTool({
      config: () => ({ catalogJson: '', baseURL: 'https://gw.test/v1', apiKeyEnv: 'K', requestTimeoutMs: 1000 }) as unknown as OpenDesignConfig,
      resolveApiKey: async () => 'sk',
      attachments: () => undefined,
    })
    expect(tool.name).toBe(IMAGE_TOOL_NAME)
    expect(tool.parameters.required).toEqual(['prompt'])
    expect(Object.keys(tool.parameters.properties ?? {}).sort()).toEqual(['model', 'prompt'])
  })

  it('renders committed images into the result the model receives', () => {
    const tool = createImageTool({
      config: () => ({ catalogJson: '', baseURL: 'https://gw.test/v1', apiKeyEnv: 'K', requestTimeoutMs: 1000 }) as unknown as OpenDesignConfig,
      resolveApiKey: async () => 'sk',
      attachments: () => undefined,
    })
    const blocks = tool.output.render({ prompt: '一只柴犬' }, {
      model: 'seedream-5.0',
      images: [{
        attachmentId: 'sha256:7f3a',
        mediaType: 'image/png',
        bytes: 1024,
        width: 1024,
        height: 1024,
      }],
    })
    expect(blocks.map((block) => block.type)).toEqual(['text', 'image'])
  })
})

describe('image tool registration', () => {
  it('is accepted by a real ToolRuntime registry', async () => {
    // The strongest available check short of a full host: the real service, the
    // real layers, the real duplicate-name rejection. A definition that only
    // looks right in a type still fails here.
    const { Context, Service } = await import('@deepseek-ai/cordis')
    const { ToolRuntime } = await import('@deepseek-ai/dsh-tools')
    const hooks: unknown[] = []
    class SystemPrompt extends Service {
      static inject: string[] = []
      constructor(ctx: Context) { super(ctx, 'systemPrompt', true) }
      tools(fn: unknown): () => void { hooks.push(fn); return () => {} }
      section(): () => void { return () => {} }
    }
    const ctx = new Context()
    await ctx.plugin(SystemPrompt as never, {} as never)
    await ctx.plugin(ToolRuntime as never, { mode: 'native' })
    const registry = (ctx as unknown as { tools: { register: (definition: unknown) => () => void } }).tools
    expect(typeof registry.register).toBe('function')

    const dispose = registerImageTool(
      { tools: registry } as unknown as Parameters<typeof registerImageTool>[0],
      {
        config: () => ({ catalogJson: '', baseURL: 'https://gw.test/v1', apiKeyEnv: 'K', requestTimeoutMs: 1000 }) as unknown as OpenDesignConfig,
        resolveApiKey: async () => 'sk',
        attachments: () => undefined,
      },
    )
    expect(typeof dispose).toBe('function')
    dispose()
  })
})
