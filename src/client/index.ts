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
import { accountCommands } from './accounts-controller.ts'
import { OpenDesignSection } from './Section.tsx'
import type { OpenDesignSectionInjected } from './Section.tsx'

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
export const inject = ['slots', 'remote']

/**
 * Register the settings page for one client mount.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // Account mutations reach the host through one mounted Remote namespace; the
  // page never touches a credential itself.
  const commands = accountCommands(ctx)
  // The settings transport is mounted by the shell's settings plugin, whose
  // activation order relative to this one is not constrained. Reading
  // `configForms` eagerly can bind the form to a fiber that never receives the
  // describe mirror, leaving the page on "loading" forever, so the page is
  // registered only once the transport exists.
  ctx.inject(['configForms'], (ready) => {
    const form = ready.configForms.get<OpenDesignConfig>(PROFILE_ENTRY_ID)
    const injected = (): OpenDesignSectionInjected => ({
      form,
      execute: commands.execute,
      channelState: commands.state,
    })
    ready.effect(() => ready.slots.inject('settings.section', () => ready.slots.register({
      name: 'settings.section',
      id: PROFILE_ENTRY_ID,
      order: 20,
      label: () => DISPLAY_NAME,
      inject: injected,
    }, OpenDesignSection)))
  })
}
