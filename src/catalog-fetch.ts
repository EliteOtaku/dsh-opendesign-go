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
 * @module dsh-opendesign-go/catalog-fetch
 */

/** Deadline for the catalog request; the endpoint answers well under this. */
const MODELS_TIMEOUT_MS = 15_000

/**
 * Pull ids out of whichever envelope the gateway used.
 * @param body - parsed JSON.
 * @returns the ids in order, deduplicated, or undefined when unrecognised.
 */
function idsOf(body: unknown): string[] | undefined {
  const rows = Array.isArray(body)
    ? body
    : (body !== null && typeof body === 'object'
      ? ((body as Record<string, unknown>).data ?? (body as Record<string, unknown>).models)
      : undefined)
  if (!Array.isArray(rows)) return undefined

  const ids: string[] = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const id = (row as Record<string, unknown>).id
    if (typeof id !== 'string' || id.length === 0) continue
    if (!ids.includes(id)) ids.push(id)
  }
  // An empty list is a real answer — an account with no entitlement — and is
  // returned as such so the caller can tell it from a failed read.
  return ids
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
 * @returns the model ids, or undefined when the catalog could not be read.
 */
export async function fetchGatewayModels(
  baseURL: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = MODELS_TIMEOUT_MS,
): Promise<string[] | undefined> {
  const base = baseURL.replace(/\/+$/u, '')
  try {
    const response = await fetchImpl(`${base}/models`, {
      headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return undefined
    return idsOf(await response.json())
  } catch {
    return undefined
  }
}
