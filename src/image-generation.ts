/**
 * Route the gateway's image-generation models to their own endpoint.
 *
 * The gateway lists image models in the same `/models` catalog as chat models,
 * but they are not chat models: `POST /chat/completions` answers them with an
 * error, and the only surface that serves them is `POST /images/generations`
 * (the OpenAI Images shape this gateway implements). Selecting one in the
 * session picker therefore failed every time, which is the reported bug.
 *
 * The fix is not to hide them. They are entitled, they are callable, and the
 * harness can carry an image back: `ImageBlock` is role-neutral and the
 * conversation renders a committed assistant image through the same attachment
 * gallery as a user upload. So this module does the two halves the chat path
 * cannot: build the Images request, and decode the reply into bytes the
 * attachment store can keep.
 *
 * @module dsh-opendesign-go/image-generation
 */
import { LlmError } from '@deepseek-ai/dsh-llm'
import { GATEWAY_CODES, classifyGatewayFailure } from './gateway-error.ts'

/** Raster formats the attachment store accepts. */
export type GeneratedMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** One generated image, decoded and typed. */
export interface GeneratedImage {
  /** Encoded bytes, already decoded from base64. */
  readonly data: Uint8Array
  /** Media type verified from the bytes themselves. */
  readonly mediaType: GeneratedMediaType
}

/** What one image request needs. */
export interface ImageGenerationRequest {
  /** Model id exactly as the catalog lists it. */
  readonly model: string
  /** The instruction, taken from the turn's visible text. */
  readonly prompt: string
  /** Requested `size`, when the turn asked for one. */
  readonly size?: string
  /** Absolute endpoint, e.g. `https://…/v1/images/generations`. */
  readonly url: string
  /** Validated credential. */
  readonly apiKey: string
  /** Cancellation and deadline for the whole exchange. */
  readonly signal: AbortSignal
  /** Fetch implementation, injected so the request can be exercised without a gateway. */
  readonly fetchImpl?: typeof fetch
}

/**
 * Media type for base64 bytes the endpoint did not label.
 *
 * The Images endpoint returns base64 without a media type in the common case,
 * and every format this store accepts has a fixed signature — cheaper and more
 * reliable than trusting a model id.
 * @param bytes - decoded image bytes.
 * @returns the media type to declare.
 */
export function sniffMediaType(bytes: Uint8Array): GeneratedMediaType {
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  // WebP: RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  // GIF: GIF8
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  // The store re-encodes or rejects rather than guessing, and PNG is the
  // format every OpenAI-compatible image endpoint returns by default.
  return 'image/png'
}

/**
 * Pull the generated images out of whatever envelope the endpoint used.
 *
 * OpenAI's shape is `{ data: [{ b64_json }] }`. Relays serving the same models
 * sometimes answer `{ data: [{ url }] }` or a bare array; a `url` member cannot
 * be turned into durable bytes without a second fetch, so those members are
 * skipped rather than guessed at — the caller then reports a reply it could not
 * use instead of an empty success.
 * @param body - parsed JSON response.
 * @returns decoded images in reply order, possibly empty.
 */
export function imagesOf(body: unknown): GeneratedImage[] {
  const rows = Array.isArray(body)
    ? body
    : (body !== null && typeof body === 'object'
      ? ((body as Record<string, unknown>).data ?? (body as Record<string, unknown>).images)
      : undefined)
  if (!Array.isArray(rows)) return []

  const images: GeneratedImage[] = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    const encoded = record.b64_json ?? record.b64Json ?? record.image
    if (typeof encoded !== 'string' || encoded.length === 0) continue
    const data = new Uint8Array(Buffer.from(encoded, 'base64'))
    // A member that decodes to nothing is one lost image, not a failed request:
    // the reply may carry several and the caller decides whether any arrived.
    if (data.byteLength === 0) continue
    images.push({ data, mediaType: sniffMediaType(data) })
  }
  return images
}

/**
 * Read one failed Images response into the taxonomy the harness routes on.
 *
 * The body may be the gateway's `{ error: { code, message, type } }` envelope or
 * something with no JSON at all — the nginx 413 page is exactly that — so the
 * status is always kept and the raw text becomes the message when parsing fails.
 * @param response - non-ok response.
 * @returns a classified failure.
 */
export async function failureOf(response: Response): Promise<LlmError> {
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
    return classifyGatewayFailure({ status: response.status, message: fallback })
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return classifyGatewayFailure({ status: response.status, message: fallback })
  }
  const error = (parsed as Record<string, unknown>).error
  if (error === null || typeof error !== 'object' || Array.isArray(error)) {
    const message = (parsed as Record<string, unknown>).message
    return classifyGatewayFailure({
      status: response.status,
      message: typeof message === 'string' ? message : fallback,
    })
  }
  const fields = error as Record<string, unknown>
  return classifyGatewayFailure({
    status: response.status,
    ...(typeof fields.code === 'string' ? { code: fields.code } : {}),
    ...(typeof fields.type === 'string' ? { type: fields.type } : {}),
    message: typeof fields.message === 'string' ? fields.message : fallback,
  })
}

/**
 * Ask the gateway to generate images for one prompt.
 *
 * Never retries: the harness owns retry, and an image request retried here would
 * bill twice for output nobody kept.
 * @param request - model, prompt, endpoint, and credential.
 * @returns decoded images in reply order; never empty.
 * @throws LlmError - classified gateway failure, a transport failure, or a reply
 * that carried no image bytes this adapter can decode.
 */
export async function generateImages(request: ImageGenerationRequest): Promise<GeneratedImage[]> {
  const body: Record<string, unknown> = { model: request.model, prompt: request.prompt, n: 1 }
  if (request.size !== undefined && request.size.length > 0) body.size = request.size

  let response: Response
  try {
    response = await (request.fetchImpl ?? fetch)(request.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${request.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: request.signal,
    })
  } catch (error) {
    if (request.signal.aborted) throw error
    throw new LlmError(`OpenDesign image request failed: ${String(error)}`, GATEWAY_CODES.server, { cause: error })
  }

  if (!response.ok) throw await failureOf(response)

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch (error) {
    throw new LlmError(`OpenDesign image reply was not JSON: ${String(error)}`, GATEWAY_CODES.invalidRequest, { cause: error })
  }
  const images = imagesOf(parsed)
  if (images.length === 0) {
    throw new LlmError(
      'OpenDesign returned no image bytes: the reply carried no base64 payload this route can store',
      GATEWAY_CODES.invalidRequest,
    )
  }
  return images
}
