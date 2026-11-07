import type { ReactElement } from 'react';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { OpenDesignConfig } from '../config-contract.ts';
import type { ChannelState, ExecuteAccountCommand } from './accounts-controller.ts';
import type { RunUpdate, UpdateChannelState } from './update-controller.ts';
/** Props injected into the section by the registering plugin. */
export interface OpenDesignSectionInjected {
    /** Live config form bound to this plugin's profile entry. */
    readonly form: ConfigForm<OpenDesignConfig>;
    /** Sends account mutations to the host, which owns credential storage. */
    readonly execute: ExecuteAccountCommand;
    /** Reads which step the command channel reached, for diagnostics. */
    readonly channelState: ChannelState;
    /** Updates this plugin through the npm registry. */
    readonly updateFromNpm: RunUpdate;
    /** Reinstalls this plugin from its repository tag, as the fallback route. */
    readonly installFromGithub: RunUpdate;
    /** Reads which step the update channel reached, for diagnostics. */
    readonly updateState: UpdateChannelState;
}
/**
 * Render the settings page.
 * @param props - injected config form and optional quota reader.
 * @returns the page body.
 */
export declare function OpenDesignSection({ form, execute, channelState, updateFromNpm, installFromGithub, updateState, }: OpenDesignSectionInjected): ReactElement;
