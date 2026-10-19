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
      // Prove the policy landed: without this line a page that never receives a
      // describe mirror is indistinguishable from a page whose transport is
      // merely slow.
      const writable = (settings as { writable?: boolean }).writable
      const entries = typeof (settings as { describe?: unknown }).describe === 'function'
        ? (settings as { describe(options?: unknown): { ns: string }[] }).describe()
          .map((row) => row.ns)
        : []
      ctx.logger.info(
        `llm-opendesign-go: settings attached (writable=${String(writable)}, entry "${PROFILE_ENTRY_ID}" `
        + `${entries.includes(PROFILE_ENTRY_ID) ? 'present' : 'ABSENT'} among ${entries.length} forms)`,
      )
      return dispose
    })
  })
}
