/**
 * Host half of the settings surface.
 *
 * On a modern host (0.2.x) the profile editor edits the composition entry's
 * config directly, so the plugin only has to opt that entry into editing; the
 * client page reads and writes the same entry through `configForms`. The
 * schema still validates every write, so a bad value is refused where it is
 * typed instead of at the next request.
 *
 * @module dsh-opendesign-go/host-settings
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the settings plugin's Context merge (ctx.settings).
import type {} from '@deepseek-ai/dsh-settings'
import { PROFILE_ENTRY_ID } from './config-contract.ts'

/** The subset of the modern settings service this plugin relies on. */
interface ProfileSettings {
  /** Opt this entry's config into profile editing without an automatic schema. */
  configure(presentation: { auto: boolean }, owner: unknown): () => void
  /** Current profile accepts edits. */
  readonly writable?: boolean
  /** Read one entry's form, including the revision a write must fence against. */
  describe?(options?: unknown): { ns: string, revision: number }[]
  /** Merge fields into one entry's config. */
  update?(ns: string, patch: object, expectedRevision?: number): Promise<void>
}

/**
 * Attach this plugin's entry to the host settings service.
 *
 * Older hosts expose only a namespace-scoped section installer; this plugin
 * targets the modern profile-entry surface and leaves the legacy path to a
 * later milestone rather than guessing at a contract the target does not ship.
 * @param ctx - host context that may carry a settings service.
 */
export function installHostSettings(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = (settingsCtx as { settings?: Partial<ProfileSettings> }).settings
    if (settings === undefined || typeof settings.configure !== 'function') {
      ctx.logger.warn(
        `llm-opendesign-go: no profile settings service; the page will stay read-only (entry "${PROFILE_ENTRY_ID}")`,
      )
      return
    }
    settingsCtx.effect(() => {
      const dispose = settings.configure!({ auto: false }, ctx.fiber)
      // Report exactly what the host sees: whether this entry reached a form at
      // all, and which namespaces did. A page receiving no mirror is otherwise
      // indistinguishable from a plugin that failed to activate.
      const writable = (settings as { writable?: boolean }).writable
      const rows = typeof settings.describe === 'function'
        ? (settings.describe.call(settings) as { ns: string, autoGenerate?: boolean }[])
        : []
      const own = rows.find((row) => row.ns === PROFILE_ENTRY_ID)
      ctx.logger.info(
        `llm-opendesign-go: settings attached (writable=${String(writable)}, forms=${rows.length}, `
        + `own=${own === undefined ? 'ABSENT' : `present(auto=${String(own.autoGenerate)})`}, `
        + `ns=[${rows.map((row) => row.ns).join(', ')}])`,
      )
      return dispose
    })
  })
}

/**
 * Expose a writer for the quota cache.
 *
 * The page reads `usageJson` from the config mirror, so the host publishes a
 * reading by writing that field. Keeping the write here means the plugin never
 * keeps a second copy of the quota state: one document, one source of truth.
 * @param ctx - host context that may carry a settings service.
 * @returns a writer, or undefined when this host cannot write settings.
 */
export function usageWriterOf(ctx: Context): ((json: string) => Promise<void>) | undefined {
  const settings = ctx.get('settings') as ProfileSettings | undefined
  if (settings === undefined || typeof settings.update !== 'function'
    || typeof settings.describe !== 'function' || settings.writable !== true) return undefined
  return async (json: string) => {
    // Fence on the revision just read: a concurrent edit from the page must win
    // rather than be silently overwritten by a quota refresh.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = settings.describe!().find((candidate) => candidate.ns === PROFILE_ENTRY_ID)
      if (row === undefined) return
      try {
        await settings.update!(PROFILE_ENTRY_ID, { usageJson: json }, row.revision)
        return
      } catch (error) {
        if (attempt === 2) {
          ctx.logger.warn(`llm-opendesign-go: could not cache the quota reading (${String(error)})`)
        }
      }
    }
  }
}

/**
 * Expose the host's current settings projection so the page can report why it
 * sees no form. Kept separate from {@link installHostSettings} so a host
 * without the modern service still answers with an empty list rather than
 * throwing during activation.
 * @param ctx - host context that may carry a settings service.
 * @returns a reader returning every namespace the host currently exposes.
 */
export function describeNamespacesOf(ctx: Context): () => string[] {
  return () => {
    const settings = ctx.get('settings') as
      | { describe?: (options?: unknown) => { ns: string }[] }
      | undefined
    if (settings === undefined || typeof settings.describe !== 'function') return []
    try {
      return settings.describe().map((row) => row.ns)
    } catch {
      return []
    }
  }
}
