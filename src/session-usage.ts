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
  /**
   * Event time in epoch milliseconds, from the event's top-level `time`.
   *
   * Carried so recovered spend can be placed in the same time windows as the
   * live ledger; without it the two sources could only be compared as totals.
   */
  readonly at: number
}

/**
 * Provider ids treated as this subscription by default.
 *
 * `opendesign` is the hand-configured custom-model route; `dsh-opendesign-go` is
 * this plugin. Both bill the same subscription, so both are counted. A user who
 * renamed or duplicated the route can extend this through configuration, which
 * is why it is a list rather than a hard-coded set.
 */
export const DEFAULT_RECOVERED_PROVIDERS: readonly string[] = ['opendesign', 'dsh-opendesign-go']

/** Options for {@link scanSessions}. */
export interface ScanOptions {
  /** Only count calls at or after this epoch-ms instant; omitted means no bound. */
  readonly since?: number | undefined
  /** Provider ids to count; omitted means {@link DEFAULT_RECOVERED_PROVIDERS}. */
  readonly providers?: readonly string[] | undefined
}

/** Zstandard frame magic, used to walk a concatenated multi-frame log. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * Parse a configured provider list.
 *
 * Configuration reaches this as one string, so the separator is fixed here.
 * Blank items are dropped because a trailing comma in a settings field is an
 * ordinary typo, and an empty result falls back to the defaults so that clearing
 * the field restores the standard routes instead of silently counting nothing.
 * @param raw - comma-separated provider ids, as stored in settings.
 * @returns the configured ids, or the default list when nothing usable was given.
 */
export function parseRecoveredProviders(raw: string | undefined): readonly string[] {
  if (raw === undefined) return DEFAULT_RECOVERED_PROVIDERS
  const providers = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  return providers.length === 0 ? DEFAULT_RECOVERED_PROVIDERS : providers
}

/**
 * Find every candidate frame start in a concatenated log.
 *
 * A magic sequence can legitimately occur inside a compressed payload, so these
 * are candidates rather than boundaries; {@link readSessionLog} confirms each
 * one by trying to decode the slice between it and the next candidate.
 * @param bytes - the whole log file.
 * @returns ascending offsets of each magic occurrence.
 */
function frameStarts(bytes: Buffer): number[] {
  const starts: number[] = []
  let offset = bytes.indexOf(ZSTD_MAGIC, 0)
  while (offset >= 0) {
    starts.push(offset)
    offset = bytes.indexOf(ZSTD_MAGIC, offset + 4)
  }
  return starts
}

/**
 * Decompress a concatenated frame log one frame at a time.
 *
 * Extracted from {@link readSessionLog} so the frame-boundary logic can be
 * exercised against a decompressor that chains frames, which is what some Node
 * 24.x builds do. The local runtime here does not, so a test that only used the
 * real one would pass whether or not the algorithm were correct.
 *
 * @param bytes - the whole log file.
 * @param decompress - one-shot decoder, defaulting to the runtime's zstd.
 * @returns the concatenated plaintext; frames that do not decode end the walk.
 */
export function decodeFrames(
  bytes: Buffer,
  decompress: (slice: Buffer) => Buffer = zstdDecompressSync,
): string {
  const starts = frameStarts(bytes)
  if (starts.length === 0) {
    // Not a zstd log. A fixture or a future format may still be plain text, so
    // hand it back as-is rather than reporting an empty session.
    return bytes.toString('utf8')
  }
  let text = ''
  let index = 0
  while (index < starts.length) {
    const start = starts[index]
    if (start === undefined) break
    // Widen the slice until it decodes. A payload containing the magic bytes
    // splits one frame in two, and only the widened slice is valid zstd.
    let decoded: string | undefined
    let next = index + 1
    while (next <= starts.length) {
      const end = next < starts.length ? starts[next] : bytes.length
      if (end === undefined) break
      try {
        decoded = decompress(bytes.subarray(start, end)).toString('utf8')
        break
      } catch {
        next += 1
      }
    }
    // A truncated tail is normal for a log being appended; keep what decoded.
    if (decoded === undefined) break
    text += decoded
    index = next
  }
  return text
}

/**
 * Decompress every frame of one session log.
 *
 * The harness appends each event as its own frame, so the plaintext is a
 * concatenation of several frames. Getting all of them requires care in two
 * directions. Decompressing once and stopping leaves only the first frame, which
 * is how this was first broken: a 530KB log decoded to 280 bytes. But walking
 * with `decompress(buffer.subarray(offset))` is wrong in the other direction on
 * runtimes whose buffered zstd call already consumes concatenated frames — each
 * pass returns every remaining frame, so frames overlap and calls are counted
 * more than once.
 *
 * Slicing at frame boundaries removes the dependence on that runtime detail: a
 * slice holds exactly one frame, so one decode yields exactly one event's worth
 * of text whether or not the runtime chains frames on its own.
 *
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
  return decodeFrames(bytes)
}

/**
 * Extract OpenDesign calls from one decoded session log.
 *
 * Only `assistant/message` events carry usage. A line that parses but is another
 * event type is skipped; a line that does not parse at all is skipped too,
 * because a partially written tail must not discard the whole log.
 * @param text - decoded session JSONL.
 * @param providers - provider ids to count; omitted means the default list.
 * @returns the recovered calls, in log order.
 */
export function callsFromSessionText(
  text: string,
  providers: readonly string[] = DEFAULT_RECOVERED_PROVIDERS,
): RecoveredCall[] {
  const wanted = providerSetOf(providers)
  const needles = providers.filter((provider) => provider.length > 0)
  const calls: RecoveredCall[] = []
  for (const line of text.split('\n')) {
    if (line.length === 0) continue
    // Cheap rejects first: parsing every line of a large log is the expensive
    // part, and most lines are neither the right type nor this provider.
    if (!line.includes('"assistant/message"')) continue
    if (!needles.some((needle) => line.includes(needle))) continue
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row === null || typeof row !== 'object') continue
    const call = callOf(row as Record<string, unknown>, wanted)
    if (call !== undefined) calls.push(call)
  }
  return calls
}

/**
 * Build the membership test for one scan.
 *
 * Blank entries are dropped so that an explicit empty list counts nothing
 * instead of matching every event through an empty-string hit.
 * @param providers - provider ids to count.
 * @returns the ids as a set, for exact comparison.
 */
function providerSetOf(providers: readonly string[]): ReadonlySet<string> {
  return new Set(providers.filter((provider) => provider.length > 0))
}

/**
 * Read one event as a recovered call.
 * @param row - parsed session event.
 * @param providers - provider ids this scan counts.
 * @returns the call, or undefined when this event is not a billable one.
 */
function callOf(row: Record<string, unknown>, providers: ReadonlySet<string>): RecoveredCall | undefined {
  // A call without a usable timestamp cannot be placed in a billing window, and
  // a NaN would poison every downstream sum, so such an event is dropped rather
  // than defaulted to "now" — that would invent billable spend at read time.
  const at = row.time
  if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) return undefined
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
  if (typeof provider !== 'string' || !providers.has(provider)) return undefined
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
    at,
  }
}

/**
 * Walk every session log under a root and collect OpenDesign calls.
 *
 * Sessions are stored under `<root>/<workspace-slug>/<session-id>/`, so the walk
 * is two levels deep by design rather than recursive: a deeper search would
 * touch unrelated trees.
 * @param root - absolute `~/.dsh/sessions` directory.
 * @param options - time bound and provider list; omitted means no bound and the
 *   default providers.
 * @returns every matching recovered call.
 */
export function scanSessions(root: string, options?: ScanOptions): RecoveredCall[] {
  if (!existsSync(root)) return []
  const providers = options?.providers ?? DEFAULT_RECOVERED_PROVIDERS
  const since = options?.since
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
      for (const call of callsFromSessionText(text, providers)) {
        // Inclusive so a window that starts exactly at a recorded call keeps it,
        // matching how the live ledger bounds its own windows.
        if (since !== undefined && call.at < since) continue
        calls.push(call)
      }
    }
  }
  return calls
}
