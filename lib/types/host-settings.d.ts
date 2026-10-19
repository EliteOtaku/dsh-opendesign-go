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
import type { Context } from '@deepseek-ai/cordis';
/**
 * Attach this plugin's entry to the host settings service.
 *
 * Older hosts expose only a namespace-scoped section installer; this plugin
 * targets the modern profile-entry surface and leaves the legacy path to a
 * later milestone rather than guessing at a contract the target does not ship.
 * @param ctx - host context that may carry a settings service.
 */
export declare function installHostSettings(ctx: Context): void;
/**
 * Expose the host's current settings projection so the page can report why it
 * sees no form. Kept separate from {@link installHostSettings} so a host
 * without the modern service still answers with an empty list rather than
 * throwing during activation.
 * @param ctx - host context that may carry a settings service.
 * @returns a reader returning every namespace the host currently exposes.
 */
export declare function describeNamespacesOf(ctx: Context): () => string[];
