import { describe, expect, it } from 'vitest'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_RECOVERED_PROVIDERS,
  callsFromSessionText,
  parseRecoveredProviders,
  decodeFrames,
  readSessionLog,
  scanSessions,
} from '../src/session-usage.ts'

/** A fixed instant so assertions on `at` stay readable. */
const T0 = 1_700_000_000_000

/**
 * Sentinel for "the event has no `time` field at all".
 *
 * A plain `undefined` default would be silently replaced by the default value,
 * so the field has to be removed explicitly to model the case under test.
 */
const NO_TIME = Symbol('no-time')

/**
 * One `assistant/message` event in the shape the harness writes.
 *
 * `time` is a parameter rather than a literal so a test can build the malformed
 * events the reader has to survive without hand-writing JSON strings.
 */
function messageEvent(
  provider: string,
  model: string,
  usage: Record<string, number>,
  time: unknown = T0,
): string {
  const event: Record<string, unknown> = {
    type: 'assistant/message',
    seq: 1,
    data: {
      turn: 0,
      step: 0,
      message: { role: 'assistant', content: [], source: { kind: 'model', provider, model } },
      usage,
    },
  }
  if (time !== NO_TIME) event.time = time
  return JSON.stringify(event)
}

/** Write one session log made of one frame per line. */
function writeLog(root: string, workspace: string, session: string, lines: readonly string[]): void {
  const dir = join(root, workspace, session)
  mkdirSync(dir, { recursive: true })
  const frames = lines.map((line) => zstdCompressSync(Buffer.from(`${line}\n`, 'utf8')))
  writeFileSync(join(dir, 'session.v4.jsonl.zstd'), Buffer.concat(frames))
}

describe('callsFromSessionText', () => {
  it('reads provider, model and usage from the nested event shape', () => {
    // The provider lives at data.message.source.provider, not at the top level;
    // a flat read silently finds nothing, which is how this was first broken.
    const text = messageEvent('opendesign', 'deepseek-v4.1-flash', {
      inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 0,
    })
    const calls = callsFromSessionText(text)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      provider: 'opendesign',
      model: 'deepseek-v4.1-flash',
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 50,
      cacheWriteTokens: 0,
      at: T0,
    })
  })

  it('counts this plugin route as the same subscription', () => {
    const text = messageEvent('dsh-opendesign-go', 'deepseek-v4.1-flash', { inputTokens: 5 })
    expect(callsFromSessionText(text)[0]?.provider).toBe('dsh-opendesign-go')
  })

  it('ignores other providers', () => {
    // Counting unrelated providers would inflate OpenDesign spend with traffic
    // that never touched the subscription.
    const text = messageEvent('wb-proxy', 'glm-5.3-flash', { inputTokens: 900 })
    expect(callsFromSessionText(text)).toEqual([])
  })

  it('ignores events that are not assistant messages', () => {
    const text = JSON.stringify({
      type: 'request/header',
      data: { header: { config: { provider: 'opendesign', model: 'deepseek-v4.1-flash' } } },
    })
    expect(callsFromSessionText(text)).toEqual([])
  })

  it('survives a truncated tail and unparsable lines', () => {
    const good = messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 7 })
    const text = `${good}\n{"type":"assistant/mess\n\n`
    const calls = callsFromSessionText(text)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.inputTokens).toBe(7)
  })

  it('treats a missing usage field as zero rather than NaN', () => {
    const text = messageEvent('opendesign', 'deepseek-v4.1-flash', {})
    expect(callsFromSessionText(text)[0]?.inputTokens).toBe(0)
  })

  it('records the event time as epoch milliseconds', () => {
    const text = messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 1 }, 1_600_000_000_123)
    expect(callsFromSessionText(text)[0]?.at).toBe(1_600_000_000_123)
  })

  it('skips events with a missing or unusable time', () => {
    // A call with no timestamp cannot be placed in a window, and a NaN would
    // poison any later sum, so the event is dropped instead of guessed at.
    const good = messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 3 }, T0)
    const text = [
      messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 1 }, NO_TIME),
      messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 2 }, 'not-a-number'),
      messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 9 }, Number.NaN),
      good,
    ].join('\n')
    const calls = callsFromSessionText(text)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.inputTokens).toBe(3)
    expect(calls.every((call) => Number.isFinite(call.at))).toBe(true)
  })

  it('honours a custom provider list', () => {
    const text = [
      messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 1 }),
      messageEvent('my-mirror', 'deepseek-v4.1-flash', { inputTokens: 2 }),
    ].join('\n')
    const calls = callsFromSessionText(text, ['my-mirror'])
    expect(calls).toHaveLength(1)
    expect(calls[0]?.provider).toBe('my-mirror')
  })

  it('falls back to the default list when no provider list is given', () => {
    const text = messageEvent('dsh-opendesign-go', 'deepseek-v4.1-flash', { inputTokens: 4 })
    expect(callsFromSessionText(text, DEFAULT_RECOVERED_PROVIDERS)).toHaveLength(1)
  })
})

describe('readSessionLog', () => {
  it('reads every frame, not just the first', () => {
    // The harness appends one frame per event. A single decompress call reports a
    // nearly empty session, which is why a naive read found 1 line in a 500KB log.
    const dir = mkdtempSync(join(tmpdir(), 'od-session-'))
    try {
      const path = join(dir, 'session.v4.jsonl.zstd')
      const lines = [
        messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 1 }),
        messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 2 }),
        messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 3 }),
      ]
      const frames = lines.map((line) => zstdCompressSync(Buffer.from(`${line}\n`, 'utf8')))
      writeFileSync(path, Buffer.concat(frames))

      const text = readSessionLog(path)
      expect(text?.split('\n').filter(Boolean)).toHaveLength(3)
      expect(callsFromSessionText(text ?? '')).toHaveLength(3)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns undefined for a path that does not exist', () => {
    expect(readSessionLog(join(tmpdir(), 'od-missing', 'session.v4.jsonl.zstd'))).toBeUndefined()
  })

  it('does not double-count frames on a runtime that chains them', () => {
    // Node's buffered zstd call gained the ability to consume concatenated
    // frames in some 24.x builds. The earlier walk fed it `bytes.subarray(offset)`
    // and then advanced to the next magic, so on such a runtime every pass
    // returned all remaining frames and three events were counted as five.
    //
    // This machine's runtime does not chain, so the real decompressor cannot
    // reproduce the bug. `decodeFrames` takes a decoder for exactly this reason:
    // `chaining` below decodes every remaining frame in one pass, which is the
    // behaviour that broke.
    const dir = mkdtempSync(join(tmpdir(), 'od-chain-'))
    try {
      const path = join(dir, 'session.v4.jsonl.zstd')
      const lines = Array.from({ length: 5 }, (_, index) =>
        messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: index + 1 }),
      )
      const frames = lines.map((line) => zstdCompressSync(Buffer.from(`${line}\n`, 'utf8')))
      const bytes = Buffer.concat(frames)
      writeFileSync(path, bytes)

      /** A decoder that returns every remaining frame, like some 24.x builds. */
      const chaining = (slice: Buffer): Buffer => {
        let out = ''
        let rest = slice
        while (rest.length > 0) {
          try {
            out += zstdDecompressSync(rest).toString('utf8')
          } catch {
            break
          }
          const next = rest.indexOf(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), 4)
          if (next < 0) break
          rest = rest.subarray(next)
        }
        return Buffer.from(out, 'utf8')
      }

      // Sanity: the mock really does chain, or this test proves nothing.
      expect(chaining(bytes).toString('utf8').split('\n').filter(Boolean)).toHaveLength(5)

      const text = decodeFrames(bytes, chaining)
      expect(text.split('\n').filter(Boolean)).toHaveLength(5)
      expect(callsFromSessionText(text).map((call) => call.inputTokens)).toEqual([1, 2, 3, 4, 5])

      // The real decoder must agree with the chaining one.
      expect(callsFromSessionText(readSessionLog(path) ?? '').map((call) => call.inputTokens)).toEqual([1, 2, 3, 4, 5])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps a frame whose payload happens to contain the magic bytes', () => {
    // The walk treats magic bytes as candidate boundaries, so a compressed
    // payload containing that sequence splits one frame in two. Widening the
    // slice until it decodes is what recovers it; without that, the rest of the
    // log would be dropped as undecodable.
    const dir = mkdtempSync(join(tmpdir(), 'od-magic-'))
    try {
      const path = join(dir, 'session.v4.jsonl.zstd')
      // Incompressible content keeps the magic sequence inside the payload.
      const filler = Array.from({ length: 4096 }, (_, index) => (index * 2654435761) % 251)
      const line = messageEvent('opendesign', 'deepseek-v4.1-flash', {
        inputTokens: 7,
        cacheReadTokens: filler.reduce((sum, value) => sum + value, 0),
      })
      writeFileSync(path, Buffer.concat([
        zstdCompressSync(Buffer.from(`${line}\n`)),
        zstdCompressSync(Buffer.from(`${messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 8 })}\n`)),
      ]))

      const calls = callsFromSessionText(readSessionLog(path) ?? '')
      expect(calls.map((call) => call.inputTokens)).toEqual([7, 8])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads a plain-text log that carries no zstd frames', () => {
    // A fixture or a future format has no frames at all; reporting an empty
    // session for readable text would look like "no spend" rather than "unread".
    const dir = mkdtempSync(join(tmpdir(), 'od-plain-'))
    try {
      const path = join(dir, 'session.v4.jsonl.zstd')
      writeFileSync(path, `${messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 9 })}\n`)
      expect(callsFromSessionText(readSessionLog(path) ?? '').map((call) => call.inputTokens)).toEqual([9])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('scanSessions', () => {
  it('walks the two-level layout and skips unrelated directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-sessions-'))
    try {
      const session = join(root, '--workspace--', 'session-id')
      mkdirSync(session, { recursive: true })
      const line = messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 42 })
      writeFileSync(join(session, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(`${line}\n`)))
      // A stray file at workspace level must not be treated as a session.
      writeFileSync(join(root, '--workspace--', 'stray.txt'), 'x')

      const calls = scanSessions(root)
      expect(calls).toHaveLength(1)
      expect(calls[0]?.inputTokens).toBe(42)
      expect(calls[0]?.at).toBe(T0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns an empty list when the root is absent', () => {
    expect(scanSessions(join(tmpdir(), 'od-no-sessions-here'))).toEqual([])
  })

  it('keeps only calls at or after the since instant', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-since-'))
    try {
      writeLog(root, '--ws--', 's1', [
        messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 1 }, T0 - 1_000),
        messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 2 }, T0),
        messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 3 }, T0 + 1_000),
      ])
      // The bound is inclusive so a call recorded exactly at the window start is
      // kept, matching how the live ledger bounds its own windows.
      const calls = scanSessions(root, { since: T0 })
      expect(calls.map((call) => call.inputTokens)).toEqual([2, 3])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('counts only the configured providers', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-providers-'))
    try {
      writeLog(root, '--ws--', 's1', [
        messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 1 }),
        messageEvent('my-mirror', 'deepseek-v4.1-flash', { inputTokens: 2 }),
        messageEvent('my-mirror', 'deepseek-v4.1-flash', { inputTokens: 3 }),
      ])
      const calls = scanSessions(root, { providers: ['my-mirror'] })
      expect(calls).toHaveLength(2)
      expect(calls.map((call) => call.provider)).toEqual(['my-mirror', 'my-mirror'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('drops timed-out events while walking logs', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-notime-'))
    try {
      writeLog(root, '--ws--', 's1', [
        messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 1 }, NO_TIME),
        messageEvent('opendesign', 'deepseek-v4.1-flash', { inputTokens: 2 }, T0),
      ])
      const calls = scanSessions(root)
      expect(calls).toHaveLength(1)
      expect(Number.isNaN(calls[0]?.at)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('parseRecoveredProviders', () => {
  it('returns the built-in routes when nothing is configured', () => {
    expect(parseRecoveredProviders(undefined)).toEqual(DEFAULT_RECOVERED_PROVIDERS)
    expect(parseRecoveredProviders('')).toEqual(DEFAULT_RECOVERED_PROVIDERS)
  })

  it('falls back to the defaults when the value carries no usable entry', () => {
    // A field of only separators must restore the standard routes, not silently
    // count nothing — an empty list would look like "no spend", not "unset".
    expect(parseRecoveredProviders('   ')).toEqual(DEFAULT_RECOVERED_PROVIDERS)
    expect(parseRecoveredProviders(' , ,, ')).toEqual(DEFAULT_RECOVERED_PROVIDERS)
  })

  it('splits on commas and trims every entry', () => {
    expect(parseRecoveredProviders(' opendesign , my-mirror ')).toEqual(['opendesign', 'my-mirror'])
  })

  it('ignores blank entries left by stray separators', () => {
    expect(parseRecoveredProviders('a,, b ,')).toEqual(['a', 'b'])
  })

  it('keeps a single configured provider', () => {
    expect(parseRecoveredProviders('my-mirror')).toEqual(['my-mirror'])
  })
})
