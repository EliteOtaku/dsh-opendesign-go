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
 * Expose a writer for the quota cache.
 *
 * The page reads `usageJson` from the config mirror, so the host publishes a
 * reading by writing that field. Keeping the write here means the plugin never
 * keeps a second copy of the quota state: one document, one source of truth.
 * @param ctx - host context that may carry a settings service.
 * @returns a writer, or undefined when this host cannot write settings.
 */
/**
 * Expose a writer for one cached field.
 *
 * The page reads these fields from the config mirror, so the host publishes a
 * value by writing it. Keeping the write here means the plugin never keeps a
 * second copy of the state: one document, one source of truth.
 * @param ctx - host context that may carry a settings service.
 * @returns a writer for a named field, or undefined when this host cannot write.
 */
export declare function fieldWriterOf(ctx: Context): ((field: string, json: string) => Promise<void>) | undefined;
/**
 * Expose the host's current settings projection so the page can report why it
 * sees no form. Kept separate from {@link installHostSettings} so a host
 * without the modern service still answers with an empty list rather than
 * throwing during activation.
 * @param ctx - host context that may carry a settings service.
 * @returns a reader returning every namespace the host currently exposes.
 */
export declare function describeNamespacesOf(ctx: Context): () => string[];
