import { describe, expect, it } from 'vitest'
import { generateImages, imagesOf, sniffMediaType } from '../src/image-generation.ts'

/** Settle a rejected promise into its error, so both instance and code are assertable. */
async function thrownBy(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => undefined,
    (error: unknown) => error,
  )
}

/** A one-pixel PNG, so the fixture bytes are a real image rather than junk. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
])
const PNG_B64 = Buffer.from(PNG).toString('base64')

/** A fetch double returning one canned JSON body. */
function respondWith(body: unknown, status = 200): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch
}

/** The request every case sends unless it overrides one field. */
const REQUEST = {
  model: 'seedream-5.0',
  prompt: '一只柴犬在雪山上看夕阳',
  url: 'https://gateway.test/v1/images/generations',
  apiKey: 'sk-test',
  signal: new AbortController().signal,
}

describe('sniffMediaType', () => {
  it('reads the format from the bytes, not from the model name', () => {
    expect(sniffMediaType(PNG)).toBe('image/png')
    expect(sniffMediaType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    // RIFF....WEBP
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    expect(sniffMediaType(webp)).toBe('image/webp')
    expect(sniffMediaType(Uint8Array.from([0x47, 0x49, 0x46, 0x38]))).toBe('image/gif')
  })

  it('defaults to PNG, which is what these endpoints return', () => {
    expect(sniffMediaType(Uint8Array.from([1, 2, 3, 4]))).toBe('image/png')
    expect(sniffMediaType(new Uint8Array())).toBe('image/png')
  })
})

describe('imagesOf', () => {
  it('reads the OpenAI envelope', () => {
    const images = imagesOf({ data: [{ b64_json: PNG_B64 }] })
    expect(images).toHaveLength(1)
    expect(images[0]?.mediaType).toBe('image/png')
    expect(Buffer.from(images[0]!.data)).toEqual(Buffer.from(PNG))
  })

  it('tolerates the envelopes relays use', () => {
    expect(imagesOf({ images: [{ b64_json: PNG_B64 }] })).toHaveLength(1)
    expect(imagesOf([{ b64_json: PNG_B64 }])).toHaveLength(1)
    expect(imagesOf([{ image: PNG_B64 }])).toHaveLength(1)
  })

  it('skips a member it cannot decode instead of failing the whole reply', () => {
    const images = imagesOf({
      data: [
        { b64_json: '' },
        { url: 'https://example.test/x.png' },
        { b64_json: PNG_B64 },
        null,
        'nope',
      ],
    })
    expect(images).toHaveLength(1)
  })

  it('answers an empty list for a body it does not recognise', () => {
    // An empty list is turned into a named failure by the caller; returning a
    // fake image would be worse than reporting a reply this route cannot store.
    for (const body of [null, 42, 'text', {}, { data: 'nope' }]) {
      expect(imagesOf(body)).toEqual([])
    }
  })
})

describe('generateImages', () => {
  it('posts the model and prompt to the images endpoint with the credential', async () => {
    const calls: { url: string, init?: RequestInit }[] = []
    const recording = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG_B64 }] }) }
    }) as unknown as typeof fetch

    await generateImages({ ...REQUEST, fetchImpl: recording } as never)

    expect(calls[0]?.url).toBe('https://gateway.test/v1/images/generations')
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-test')
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>
    expect(body.model).toBe('seedream-5.0')
    expect(body.prompt).toBe(REQUEST.prompt)
    expect(body.n).toBe(1)
  })

  it('passes a requested size through and omits it otherwise', async () => {
    const bodies: Record<string, unknown>[] = []
    const recording = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG_B64 }] }) }
    }) as unknown as typeof fetch

    await generateImages({ ...REQUEST, size: '1024x1024', fetchImpl: recording } as never)
    await generateImages({ ...REQUEST, fetchImpl: recording } as never)

    expect(bodies[0]?.size).toBe('1024x1024')
    expect(bodies[1] === undefined ? 'absent' : ('size' in bodies[1] ? 'present' : 'absent')).toBe('absent')
  })

  it('classifies a gateway error envelope through the shared taxonomy', async () => {
    // Routing on this code is how the harness decides to retry, fail the
    // account, or stop; the image path must not invent its own codes.
    const failing = respondWith({ error: { code: 'invalid_api_key', message: 'bad key' } }, 401)
    const error = await thrownBy(generateImages({ ...REQUEST, fetchImpl: failing } as never))
    expect((error as { code: string }).code).toBe('INVALID_CREDENTIAL')
  })

  it('names the status when the body is not JSON', async () => {
    // The nginx 413 page is exactly this: HTML with no gateway envelope.
    const html = (async () => ({
      ok: false,
      status: 413,
      text: async () => '<html><center>nginx</center></html>',
    })) as unknown as typeof fetch
    const error = await thrownBy(generateImages({ ...REQUEST, fetchImpl: html } as never))
    expect((error as Error).message).toContain('413')
  })

  it('fails rather than returning nothing when the reply carried no bytes', async () => {
    // An empty success would render an assistant turn with no image and no
    // reason, which is indistinguishable from the bug this route fixes.
    const empty = respondWith({ data: [{ revised_prompt: 'x' }] })
    const error = await thrownBy(generateImages({ ...REQUEST, fetchImpl: empty } as never))
    expect((error as { code: string }).code).toBe('INVALID_REQUEST')
    expect((error as Error).message).toContain('no image bytes')
  })

  it('reports a transport failure as a server error', async () => {
    const offline = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    const error = await thrownBy(generateImages({ ...REQUEST, fetchImpl: offline } as never))
    expect((error as { code: string }).code).toBe('SERVER')
  })
})
