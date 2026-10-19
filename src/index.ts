/**
 * dsh-opendesign-go — OpenDesign Go plan adapter for DeepSeek Harness.
 *
 * M1 skeleton: the plugin mounts and logs, nothing else is registered yet.
 * Later milestones add the inference route, live catalog, usage windows,
 * accounts and the settings section on top of this entry.
 *
 * @module dsh-opendesign-go
 */
import type { Context } from '@deepseek-ai/cordis'

/** Plugin module name; stable, and declared in dsh-plugin.naming.json. */
export const name = 'llm-opendesign-go'

/**
 * Mount the plugin for one composition entry.
 * @param ctx - the Cordis context this plugin is loaded into.
 */
export function apply(ctx: Context): void {
  ctx.logger.info('llm-opendesign-go: mounted (M1 skeleton)')
}
