/**
 * Browser half of the plugin: the "DSH OpenDesign Go" settings page.
 *
 * The page edits the composition entry's own config through `ctx.configForms`,
 * so every write goes through the same Host validation the composition layer
 * uses. M4a registers the section with the enable switch and the model list;
 * accounts and quota windows arrive in M4b.
 *
 * @module dsh-opendesign-go/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the slot registry Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { DISPLAY_NAME, PROFILE_ENTRY_ID } from '../config-contract.ts'
import type { OpenDesignConfig } from '../config-contract.ts'
import { OpenDesignSection } from './Section.tsx'
import type { OpenDesignSectionInjected } from './Section.tsx'

/**
 * Required services. `configForms` owns the entry's config transport; `slots`
 * owns the settings panel. The section declaration is contributed by the
 * settings shell, whose activation order is not constrained, so registration
 * waits through `slots.inject`.
 */
export const inject = ['slots', 'configForms']

/**
 * Register the settings page for one client mount.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const form = ctx.configForms.get<OpenDesignConfig>(PROFILE_ENTRY_ID)
  const injected = (): OpenDesignSectionInjected => ({ form })
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: PROFILE_ENTRY_ID,
    order: 20,
    label: () => DISPLAY_NAME,
    inject: injected,
  }, OpenDesignSection)))
}
