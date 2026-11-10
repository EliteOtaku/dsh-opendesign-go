/**
 * Read the model catalog the gateway grants this account.
 *
 * `GET {baseURL}/models` answers per entitlement: a Go key returns the fourteen
 * Design Plan models, and a Plus or Pro key returns those plus the models that
 * tier pays for. That makes it the only source that cannot disagree with what
 * the account may actually call — a hard-coded table either omits a tier's
 * models or advertises models the account cannot use, and the second failure is
 * a 403 the user sees as "the plugin is broken".
 *
 * The shape is the gateway's own, so several plausible envelopes are accepted
 * and anything unrecognised reads as "no catalog this start" rather than an
 * error. The caller falls back to the bundled list.
 *
 * One field matters beyond the id: whether the entry produces text. The catalog
 * mixes chat models and image-generation models, and the two need different
 * endpoints, so an id list alone cannot say which request to send.
 *
 * @module dsh-opendesign-go/catalog-fetch
 */

/** Deadline for the catalog request; the endpoint answers well under this. */
const MODELS_TIMEOUT_MS = 15_000

/** One catalog entry as the gateway described it. */
export interface GatewayModelEntry {
  /** Exact model id. */
  readonly id: string
  /**
   * Output modalities the entry declared, or undefined when it declared none.
   *
   * Forwarded rather than interpreted here: the catalog module owns the rule
   * that decides what counts as an image model, so the fetch stays a parser.
   */
  readonly outputModalities?: readonly string[]
}

/**
 * Read the output modalities out of one entry.
 *
 * Two shapes appear in the wild: a top-level `output_modalities` array, and the
 * Anthropic-style `architecture.output_modalities` nested under `architecture`.
 * Both are tried, and anything else reads as "not declared".
 * @param row - one catalog entry.
 * @returns declared modalities, or undefined.
 */
function outputModalitiesOf(row: Record<string, unknown>): string[] | undefined {
  const direct = row.output_modalities
  if (Array.isArray(direct)) {
    const clean = direct.filter((value): value is string => typeof value === 'string' && value.length > 0)
    if (clean.length > 0) return clean
  }
  const nested = row.architecture
  if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
    const declared = (nested as Record<string, unknown>).output_modalities
    if (Array.isArray(declared)) {
      const clean = declared.filter((value): value is string => typeof value === 'string' && value.length > 0)
      if (clean.length > 0) return clean
    }
  }
  return undefined
}

/**
 * Pull entries out of whichever envelope the gateway used.
 * @param body - parsed JSON.
 * @returns entries in order, deduplicated by id, or undefined when unrecognised.
 */
function entriesOf(body: unknown): GatewayModelEntry[] | undefined {
  const rows = Array.isArray(body)
    ? body
    : (body !== null && typeof body === 'object'
      ? ((body as Record<string, unknown>).data ?? (body as Record<string, unknown>).models)
      : undefined)
  if (!Array.isArray(rows)) return undefined

  const entries: GatewayModelEntry[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    const id = record.id
    if (typeof id !== 'string' || id.length === 0) continue
    if (seen.has(id)) continue
    seen.add(id)
    const outputModalities = outputModalitiesOf(record)
    entries.push(outputModalities === undefined ? { id } : { id, outputModalities })
  }
  // An empty list is a real answer — an account with no entitlement — and is
  // returned as such so the caller can tell it from a failed read.
  return entries
}

/**
 * Ask the gateway which models this account may use.
 *
 * Never throws: this runs while the plugin is activating, and an unreachable or
 * unhappy gateway must degrade to the bundled list rather than fail the start.
 * @param baseURL - inference base URL, with or without a trailing slash.
 * @param apiKey - the selected account's key.
 * @param fetchImpl - fetch implementation, injected for tests.
 * @param timeoutMs - request deadline.
 * @returns the entries, or undefined when the catalog could not be read.
 */
export async function fetchGatewayModels(
  baseURL: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = MODELS_TIMEOUT_MS,
): Promise<GatewayModelEntry[] | undefined> {
  const base = baseURL.replace(/\/+$/u, '')
  try {
    const response = await fetchImpl(`${base}/models`, {
      headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return undefined
    return entriesOf(await response.json())
  } catch {
    return undefined
  }
}
