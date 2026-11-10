/**
 * Serve the gateway's image-generation models as a tool.
 *
 * These ids arrive in the same `/models` list as the chat models, but they are
 * not chat models: `POST /chat/completions` answers them with an error and the
 * only surface that serves them is `POST /images/generations`. Advertising them
 * like chat models is what made selecting one fail every time.
 *
 * The fix is not a hidden endpoint and not a hidden model. The harness carries a
 * generated picture back through exactly one shape: a **tool result**. That is
 * what `dsh-image-gen` does, and it is the only shape that works, for three
 * reasons that each independently rule out attaching the image to the assistant
 * turn:
 *
 * - `dsh-llm-deepseek` and `dsh-llm-pi-ai` both document that images are accepted
 *   only in user and tool-result messages; assistant-side images are explicitly
 *   `UNSUPPORTED_CONTENT`.
 * - `dsh-compaction-image-offload` walks `user/message` and `tool/result` events
 *   only, so an assistant image can never be offloaded.
 * - Anything counted against the request budget but impossible to offload is a
 *   request that fails forever. Attaching the picture to the assistant turn is
 *   therefore not merely unusual, it is a state the session cannot leave.
 *
 * A tool result is in scope for all three: the model receives the picture, the
 * host can offload it when the conversation gets heavy, and the conversation
 * gallery renders it from the durable reference.
 *
 * Generation happens only when the model asks for it, so a turn that merely
 * mentions a picture costs nothing.
 *
 * @module dsh-opendesign-go/image-tool
 */
import { LlmError } from '@deepseek-ai/dsh-llm'
import { catalogRowsOf, parseCatalog } from './catalog.ts'
import { GATEWAY_CODES } from './gateway-error.ts'
import { extensionOf, generateImages } from './image-generation.ts'
import type { AttachmentsSeam } from './image-bytes.ts'
import type { OpenDesignConfig } from './config-contract.ts'

/** Tool name; distinct from `dsh-image-gen`'s `generate_image`, which may be mounted too. */
export const IMAGE_TOOL_NAME = 'opendesign_generate_image'

/** One image committed to the store, as the tool result carries it. */
export interface ToolImage {
  readonly attachmentId: string
  readonly mediaType: string
  readonly bytes: number
  readonly width: number
  readonly height: number
  readonly name?: string
}

/** The validated result of one generation call. */
export interface ImageToolResult {
  readonly images: ToolImage[]
  /** Model that served the call, echoed back so the reply can name it. */
  readonly model: string
}

/** Images one call produced, and what to tell the caller. */
export interface ImageToolDependencies {
  /** Current plugin configuration; read per call so settings changes apply. */
  readonly config: () => OpenDesignConfig
  /** Resolve one account's API key by credential reference. */
  readonly resolveApiKey: (ref: string) => Promise<string | undefined>
  /** Current attachment store, or undefined when none is mounted. */
  readonly attachments: () => AttachmentsSeam | undefined
  /** Fetch implementation, injected so the call can be exercised without a gateway. */
  readonly fetchImpl?: typeof fetch
}

/**
 * Image model ids this account may call, in catalog order.
 * @param config - configuration snapshot carrying the catalog.
 * @returns the enabled image ids; empty when the account has none.
 */
export function imageModelsOf(config: OpenDesignConfig): string[] {
  const rows = catalogRowsOf(parseCatalog(config.catalogJson))
  const enabled = config.enabledModels ?? []
  return rows
    .filter((row) => row.imageGeneration === true)
    .filter((row) => enabled.length === 0 || enabled.includes(row.id))
    .map((row) => row.id)
}

/**
 * Pick the image model one call should use.
 *
 * An explicit id wins, because the tool declares the ids it accepts as an enum
 * and the model may have been told which one is best for the job. Otherwise the
 * first enabled image model is used: the account pays for every one of them, and
 * refusing without a selection would make a plain "draw a cat" fail on an account
 * that plainly can draw.
 * @param requested - model name the caller passed, when any.
 * @param config - configuration snapshot carrying the catalog.
 * @returns the model id to call.
 * @throws LlmError - `INVALID_REQUEST` when the id is not an image model this
 * account may use, or the account has none.
 */
export function resolveImageModel(requested: string | undefined, config: OpenDesignConfig): string {
  const available = imageModelsOf(config)
  if (requested !== undefined && requested.length > 0) {
    if (available.includes(requested)) return requested
    throw new LlmError(
      `OpenDesign: ${requested} is not an image model this account may use`
      + (available.length === 0 ? ' (it has none)' : `; choose one of ${available.join(', ')}`),
      GATEWAY_CODES.invalidRequest,
    )
  }
  const first = available[0]
  if (first === undefined) {
    throw new LlmError(
      'OpenDesign: this account grants no image-generation model, so nothing can be generated',
      GATEWAY_CODES.unsupported,
    )
  }
  return first
}

/**
 * Generate one image and commit it to the attachment store.
 *
 * A picture the store refuses to keep is a failure, not a partial success: a tool
 * result pointing at an attachment that was never written would render as a
 * broken image with no explanation.
 * @param deps - configuration, credential, and store seams.
 * @param args - prompt and optional model from the tool call.
 * @returns the committed images.
 * @throws LlmError - gateway failure, missing credential, or an unusable reply.
 */
export async function generateForTool(
  deps: ImageToolDependencies,
  args: { readonly prompt: string, readonly model?: string, readonly size?: string },
): Promise<ImageToolResult> {
  const config = deps.config()
  const store = deps.attachments()
  if (store?.saveImage === undefined) {
    throw new LlmError(
      'OpenDesign: this host has no attachment store, so a generated image could not be kept',
      GATEWAY_CODES.unsupported,
    )
  }
  const model = resolveImageModel(args.model, config)
  const baseURL = config.baseURL.replace(/\/+$/u, '')
  if (baseURL === '') throw new LlmError('OpenDesign: baseURL is not configured', GATEWAY_CODES.invalidRequest)

  const ref = config.apiKeyEnv
  const apiKey = await deps.resolveApiKey(ref)
  if (apiKey === undefined) {
    throw new LlmError(
      `OpenDesign: no API key resolved for ${ref}; set it in the Models settings or the launching environment`,
      'MISSING_CREDENTIAL',
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, config.requestTimeoutMs)
  timer.unref?.()
  let generated
  try {
    generated = await generateImages({
      model,
      prompt: args.prompt,
      ...(args.size === undefined || args.size.length === 0 ? {} : { size: args.size }),
      // The API key already carries `/v1` in `baseURL`, so the surface is the
      // bare `/images/...` path; joining both was the 404 this route used to
      // answer with.
      url: `${baseURL}/images/generations`,
      apiKey,
      signal: controller.signal,
      ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
    })
  } finally {
    clearTimeout(timer)
  }

  const images: ToolImage[] = []
  for (const image of generated) {
    const saved = await store.saveImage({
      data: image.data,
      mediaType: image.mediaType,
      name: `${model}.${extensionOf(image.mediaType)}`,
    })
    images.push({
      attachmentId: String(saved.attachmentId),
      mediaType: saved.mediaType,
      bytes: saved.bytes,
      width: saved.width,
      height: saved.height,
      name: `${model}.${extensionOf(image.mediaType)}`,
    })
  }
  if (images.length === 0) {
    throw new LlmError(
      'OpenDesign: the image reply carried no picture this route could store',
      GATEWAY_CODES.invalidRequest,
    )
  }
  return { images, model }
}
