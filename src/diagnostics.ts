/**
 * Diagnostics for "why are no models in the picker".
 *
 * The route only exists while a credential resolves, the plugin is enabled, and
 * `registerAdapter` succeeded. When any of those is false the model list is
 * simply absent from the selector, with nothing in the UI to say which — so the
 * state is published into the config document and rendered on the page.
 *
 * @module dsh-opendesign-go/diagnostics
 */

/** One snapshot of the routing state, as the host sees it. */
export interface RouteDiagnostics {
  /** Whether `registerAdapter` has an active handle. */
  readonly registered: boolean
  /** Value of the `enabled` switch at the last attempt. */
  readonly enabled: boolean
  /** Whether the selected account's credential resolved. */
  readonly credentialResolved: boolean
  /** Credential reference that was tried. */
  readonly triedRef: string
  /** Why registration failed, when it did. */
  readonly lastError?: string
  /** How many models the adapter advertises. */
  readonly modelCount: number
  /** When this snapshot was taken, ISO timestamp. */
  readonly asOf: string
}

/**
 * Read a cached route diagnostic back from the config document.
 *
 * A malformed document yields undefined rather than a guess: the whole point of
 * this field is to be trustworthy when something is wrong.
 * @param raw - serialized diagnostics, or empty string.
 * @returns the diagnostics, or undefined when absent or unusable.
 */
export function parseRouteDiagnostics(raw: string | undefined): RouteDiagnostics | undefined {
  if (raw === undefined || raw.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const row = parsed as Record<string, unknown>
  if (typeof row.registered !== 'boolean' || typeof row.enabled !== 'boolean'
    || typeof row.credentialResolved !== 'boolean' || typeof row.triedRef !== 'string') return undefined
  return {
    registered: row.registered,
    enabled: row.enabled,
    credentialResolved: row.credentialResolved,
    triedRef: row.triedRef,
    ...(typeof row.lastError === 'string' ? { lastError: row.lastError } : {}),
    modelCount: typeof row.modelCount === 'number' ? row.modelCount : 0,
    asOf: typeof row.asOf === 'string' ? row.asOf : '',
  }
}
