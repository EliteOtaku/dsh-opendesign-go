import { describe, expect, it } from 'vitest'
import type { ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm'
import {
  DEFAULT_REQUEST_IMAGE_POLICY,
  imageRefsOf,
  prepareRequestImages,
  requestImageDimensions,
  requestImageTarget,
} from '../src/request-images.ts'
import type { AttachmentsSeam } from '../src/image-bytes.ts'

/** One image block of known stored dimensions. */
function imageOf(id: string, width: number, height: number, offloaded = false): ImageBlock {
  return {
    type: 'image',
    attachment: {
      attachmentId: `sha256:${id}`,
      mediaType: 'image/png',
      bytes: width * height,
      width,
      height,
    } as ImageBlock['attachment'],
    ...(offloaded ? { offloaded: true as const } : {}),
  }
}

/** One user message carrying the given images. */
function turnOf(images: readonly ImageBlock[]): RequestMessage {
  return { role: 'user', content: [...images] }
}

/** A store double that records every derivation request. */
function storeDouble(options: { readonly fail?: boolean, readonly data?: Uint8Array } = {}) {
  const asked: { id: string, width: number, height: number, maxBytes: number }[] = []
  const seam: AttachmentsSeam = {
    readImageRequest: async (ref, target) => {
      const attachment = ref as ImageBlock['attachment']
      asked.push({
        id: String(attachment.attachmentId),
        width: target.width,
        height: target.height,
        maxBytes: target.maxBytes,
      })
      if (options.fail === true) throw new Error('decoder refused this format')
      return {
        data: options.data ?? Uint8Array.from([1, 2, 3, 4]),
        bytes: (options.data ?? Uint8Array.from([1, 2, 3, 4])).byteLength,
        mediaType: 'image/jpeg',
      }
    },
  }
  return { asked, seam }
}

describe('request image projection', () => {
  it('derives an oversize image down to the pixel ceiling', () => {
    // The measured failure: a 3000x2000 upload was re-sent at full size on every
    // request. Scaling by area is what the harness's own helper does.
    expect(requestImageDimensions(3000, 2000, 4_194_304)).toEqual({ width: 2508, height: 1672 })
    expect(requestImageDimensions(4000, 3000, 4_194_304)).toEqual({ width: 2364, height: 1773 })
  })

  it('leaves an image that already fits untouched', () => {
    // Never upscale: a small screenshot must cost exactly what it already costs.
    expect(requestImageDimensions(800, 600, 4_194_304)).toEqual({ width: 800, height: 600 })
    expect(requestImageDimensions(2048, 2048, 4_194_304)).toEqual({ width: 2048, height: 2048 })
  })

  it('declares the same 4 Mpx / 1 MiB policy the bundled adapters use', () => {
    // Matching the reference policy is the point: one request's images then cost
    // the same here as on a DeepSeek or pi-ai route.
    expect(DEFAULT_REQUEST_IMAGE_POLICY).toEqual({ maxPixels: 4_194_304, maxBytes: 1_048_576 })
    const target = requestImageTarget(imageOf('a', 3000, 2000).attachment)
    expect(target).toEqual({ width: 2508, height: 1672, maxBytes: 1_048_576 })
  })

  it('asks the store for exactly the target it declared', async () => {
    const { asked, seam } = storeDouble()
    const index = await prepareRequestImages([turnOf([imageOf('a', 3000, 2000)])], seam, () => {})
    expect(asked).toEqual([{ id: 'sha256:a', width: 2508, height: 1672, maxBytes: 1_048_576 }])
    expect(index.get('sha256:a')?.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('decodes and identifies one occurrence once, however often it appears', async () => {
    // The store caches per (attachment, policy); asking twice is wasted work,
    // not a different answer.
    const { asked, seam } = storeDouble()
    const twice = [turnOf([imageOf('a', 3000, 2000)]), turnOf([imageOf('a', 3000, 2000)])]
    const index = await prepareRequestImages(twice, seam, () => {})
    expect(asked).toHaveLength(1)
    expect(index.size).toBe(1)
  })

  it('skips occurrences the surface already offloaded', () => {
    // An offloaded occurrence projects to placeholder text, so deriving bytes
    // for it would be work whose result is never sent.
    const refs = imageRefsOf([turnOf([imageOf('a', 10, 10), imageOf('b', 10, 10, true)])])
    expect(refs.map((ref) => String(ref.attachmentId))).toEqual(['sha256:a'])
  })

  it('falls back to the stored object when the store cannot derive a version', async () => {
    // A format the decoder refuses is not a broken store: the original bytes are
    // still a legal request body, just larger.
    const warnings: string[] = []
    const seam: AttachmentsSeam = {
      readImageRequest: async () => { throw new Error('decoder refused this format') },
      imageHostPath: () => undefined,
    }
    const index = await prepareRequestImages([turnOf([imageOf('a', 10, 10)])], seam, (message) => { warnings.push(message) })
    expect(warnings.some((line) => line.includes('decoder refused'))).toBe(true)
    // No host path either, so the occurrence is absent and the projection layer
    // substitutes the harness placeholder rather than inventing bytes.
    expect(index.size).toBe(0)
  })

  it('never throws for an image it cannot prepare', async () => {
    // One unreadable picture must not take down a request whose text is fine.
    const seam: AttachmentsSeam = {
      readImageRequest: async () => { throw new Error('boom') },
      imageHostPath: () => { throw new Error('also boom') },
    }
    await expect(prepareRequestImages([turnOf([imageOf('a', 10, 10)])], seam, () => {})).resolves.toBeDefined()
  })
})
