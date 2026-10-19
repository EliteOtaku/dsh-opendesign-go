import { describe, expect, it } from 'vitest'
import { zstdCompressSync } from 'node:zlib'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { callsFromSessionText, readSessionLog, scanSessions } from '../src/session-usage.ts'

/** One `assistant/message` event in the shape the harness writes. */
function messageEvent(provider: string, model: string, usage: Record<string, number>): string {
  return JSON.stringify({
    type: 'assistant/message',
    seq: 1,
    data: {
      turn: 0,
      step: 0,
      message: { role: 'assistant', content: [], source: { kind: 'model', provider, model } },
      usage,
    },
  })
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
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns an empty list when the root is absent', () => {
    expect(scanSessions(join(tmpdir(), 'od-no-sessions-here'))).toEqual([])
  })
})
