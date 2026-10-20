/**
 * Browser half of the plugin: the "OpenDesign Go" settings page.
 *
 * The page edits the composition entry's own config through `ctx.configForms`,
 * so every write goes through the same Host validation the composition layer
 * uses. M4a registers the section with the enable switch and the model list;
 * accounts and quota windows arrive in M4b.
 *
 * @module dsh-opendesign-go/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/**
 * Required services. `configForms` owns the entry's config transport; `slots`
 * owns the settings panel. The section declaration is contributed by the
 * settings shell, whose activation order is not constrained, so registration
 * waits through `slots.inject`.
 *
 * `remote` grants the Remote transport. The namespace itself is a separate
 * service that only exists after `$mount` resolves, so it is **not** listed
 * here: declaring it at this level would park the whole plugin on a service
 * that does not exist yet. The controller injects it after mounting.
 */
export declare const inject: string[];
/**
 * Register the settings page for one client mount.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
