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
      ctx.logger.info(
        `llm-opendesign-go: this host does not expose profile settings; edit "${PROFILE_ENTRY_ID}" in the profile instead`,
      )
      return
    }
    settingsCtx.effect(() => settings.configure!({ auto: false }, ctx.fiber))
  })
}
