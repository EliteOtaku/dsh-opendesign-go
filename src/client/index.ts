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
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the conversation's SlotMap merge ('conversation.input.right').
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the slot registry Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the model-selection Context merge (ctx.modelDirectories) and
// the session model directory state the pill gates on.
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { DISPLAY_NAME, PROFILE_ENTRY_ID } from '../config-contract.ts'
import type { OpenDesignConfig } from '../config-contract.ts'
import { accountCommands } from './accounts-controller.ts'
import { OpenDesignSection } from './Section.tsx'
import type { OpenDesignSectionInjected } from './Section.tsx'
import { ComposerUsagePill } from './UsagePill.tsx'
import type { ComposerUsageInjected } from './UsagePill.tsx'

/**
 * Session identity as the model directory resolver expects it.
 *
 * The slot hands the registrant a plain string; the resolver takes its own
 * branded id. The value is the same session id the shell just passed in, so the
 * cast is a type-level fact rather than a conversion.
 */
type DirectorySession = Parameters<ClientContext['modelDirectories']['directoryFor']>[0]

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
    // Quota where it is spent: the composer's own tool row, before the submit
    // action. Same `form`, so the pill reads the reading the page already has
    // and needs no transport of its own. `order` leaves room for other plugins
    // to sit closer to the submit button.
    //
    // Two conditions gate the pill, and both are correctness, not taste:
    // it only speaks for this provider's quota, so it appears only while this
    // provider's model is the session's selection (the reference plugin shares
    // the same tool row, and two quota pills side by side would be a lie about
    // whose credits are being spent); and it needs the session's model
    // directory to know that, which is a separate service that must not be a
    // requirement for the settings page.
    //
    // The slot name belongs to another plugin (the conversation shell), so a
    // failure here must not take the settings page down with it: the page is
    // the only way to fix a broken configuration, and losing it because an
    // optional surface is absent would be the wrong trade.
    ready.inject(['modelDirectories'], (models) => {
      const pillInjected = (sessionId: string): ComposerUsageInjected => ({
        form,
        directory: models.modelDirectories.directoryFor(sessionId as DirectorySession).store,
      })
      models.effect(() => {
        try {
          return models.slots.inject('conversation.input.right', () => models.slots.register({
            name: 'conversation.input.right',
            id: `${PROFILE_ENTRY_ID}-usage`,
            order: 100,
            label: () => DISPLAY_NAME,
            inject: pillInjected,
          }, ComposerUsagePill))
        } catch (error: unknown) {
          console.error('llm-opendesign-go: could not register the composer usage pill', error)
          return () => {}
        }
      })
    })
  })
}
