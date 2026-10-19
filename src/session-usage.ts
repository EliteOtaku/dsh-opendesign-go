/**
 * Recover spend from sessions this plugin did not serve.
 *
 * The plugin can only meter calls that go through its own adapter, so traffic
 * sent to OpenDesign through a plain provider entry — the DSH "custom model"
 * route, which points at the same `/v1` endpoint with the same key — is
 * invisible to the live ledger. That is not a small gap: it was the only way to
 * use the subscription before this plugin existed, so the whole history sits
 * there.
 *
 * The session logs do retain it. Each `assistant/message` event carries the
 * `provider`, the exact `model`, and the response `usage`, so the missing spend
 * can be recomputed from local files with no network call and no credential.
 *
 * This reads those logs read-only. It never writes to `~/.dsh/sessions`, and a
 * log it cannot decompress is skipped rather than failing the sweep.
 *
 * @module dsh-opendesign-go/session-usage
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/** One recovered call. */
export interface RecoveredCall {
  /** Provider id recorded by the harness, e.g. `opendesign`. */
  readonly provider: string
  /** Exact model id. */
  readonly model: string
  /** Prompt tokens excluding cache reads, as the log records them. */
  readonly inputTokens: number
  /** Completion tokens. */
  readonly outputTokens: number
  /** Prompt tokens served from cache. */
  readonly cacheReadTokens: number
  /** Cache-write tokens, when recorded. */
  readonly cacheWriteTokens: number
}

/**
 * Provider ids treated as this subscription.
 *
 * `opendesign` is the hand-configured custom-model route; `dsh-opendesign-go` is
 * this plugin. Both bill the same subscription, so both are counted.
 */
const OPEN_DESIGN_PROVIDERS = new Set(['opendesign', 'dsh-opendesign-go'])

/** Zstandard frame magic, used to walk a concatenated multi-frame log. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * Decompress every frame of one session log.
 *
 * The harness appends each event as its own frame, so a single
 * `zstdDecompressSync` call stops after the first one and silently reports a
 * nearly empty session. Walking the magic bytes is what makes the rest readable.
 * @param path - absolute path to a `session.v4.jsonl.zstd` file.
 * @returns the concatenated plaintext, or undefined when it cannot be read.
 */
export function readSessionLog(path: string): string | undefined {
  let bytes: Buffer
  try {
    bytes = readFileSync(path)
  } catch {
    return undefined
  }
  let text = ''
  let offset = 0
  while (offset < bytes.length) {
    try {
      text += zstdDecompressSync(bytes.subarray(offset)).toString('utf8')
    } catch {
      // A truncated tail is normal for a log being appended; keep what decoded.
      break
    }
    const next = bytes.indexOf(ZSTD_MAGIC, offset + 4)
    if (next < 0) break
    offset = next
  }
  return text
}

/**
 * Extract OpenDesign calls from one decoded session log.
 *
 * Only `assistant/message` events carry usage. A line that parses but is another
 * event type is skipped; a line that does not parse at all is skipped too,
 * because a partially written tail must not discard the whole log.
 * @param text - decoded session JSONL.
 * @returns the recovered calls, in log order.
 */
export function callsFromSessionText(text: string): RecoveredCall[] {
  const calls: RecoveredCall[] = []
  for (const line of text.split('\n')) {
    if (line.length === 0) continue
    // Cheap rejects first: parsing every line of a large log is the expensive
    // part, and most lines are neither the right type nor this provider.
    if (!line.includes('"assistant/message"')) continue
    if (!line.includes('opendesign')) continue
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row === null || typeof row !== 'object') continue
    const call = callOf(row as Record<string, unknown>)
    if (call !== undefined) calls.push(call)
  }
  return calls
}

/**
 * Read one event as a recovered call.
 * @param row - parsed session event.
 * @returns the call, or undefined when this event is not a billable one.
 */
function callOf(row: Record<string, unknown>): RecoveredCall | undefined {
  // An `assistant/message` event nests the route under `data.message.source`
  // and the tokens under `data.usage`; the provider is not a top-level field,
  // which is why a flat read finds nothing.
  const data = row.data
  if (data === null || typeof data !== 'object') return undefined
  const d = data as Record<string, unknown>
  const message = d.message
  if (message === null || typeof message !== 'object') return undefined
  const source = (message as Record<string, unknown>).source
  if (source === null || typeof source !== 'object') return undefined
  const src = source as Record<string, unknown>
  const provider = src.provider
  const model = src.model
  if (typeof provider !== 'string' || !OPEN_DESIGN_PROVIDERS.has(provider)) return undefined
  if (typeof model !== 'string' || model.length === 0) return undefined
  const usage = d.usage
  if (usage === null || typeof usage !== 'object') return undefined
  const u = usage as Record<string, unknown>
  const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0)
  return {
    provider,
    model,
    inputTokens: num(u.inputTokens),
    outputTokens: num(u.outputTokens),
    cacheReadTokens: num(u.cacheReadTokens),
    cacheWriteTokens: num(u.cacheWriteTokens),
  }
}

/**
 * Walk every session log under a root and collect OpenDesign calls.
 *
 * Sessions are stored under `<root>/<workspace-slug>/<session-id>/`, so the walk
 * is two levels deep by design rather than recursive: a deeper search would
 * touch unrelated trees.
 * @param root - absolute `~/.dsh/sessions` directory.
 * @returns every recovered call.
 */
export function scanSessions(root: string): RecoveredCall[] {
  if (!existsSync(root)) return []
  const calls: RecoveredCall[] = []
  let workspaces: string[]
  try {
    workspaces = readdirSync(root)
  } catch {
    return []
  }
  for (const workspace of workspaces) {
    const workspacePath = join(root, workspace)
    try {
      if (!statSync(workspacePath).isDirectory()) continue
    } catch {
      continue
    }
    let sessions: string[]
    try {
      sessions = readdirSync(workspacePath)
    } catch {
      continue
    }
    for (const session of sessions) {
      const logPath = join(workspacePath, session, 'session.v4.jsonl.zstd')
      if (!existsSync(logPath)) continue
      const text = readSessionLog(logPath)
      if (text === undefined) continue
      calls.push(...callsFromSessionText(text))
    }
  }
  return calls
}
