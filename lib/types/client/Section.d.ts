import type { ReactElement } from 'react';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { OpenDesignConfig } from '../config-contract.ts';
import type { ExecuteAccountCommand } from './accounts-controller.ts';
/** Props injected into the section by the registering plugin. */
export interface OpenDesignSectionInjected {
    /** Live config form bound to this plugin's profile entry. */
    readonly form: ConfigForm<OpenDesignConfig>;
    /** Sends account mutations to the host, which owns credential storage. */
    readonly execute: ExecuteAccountCommand;
}
/**
 * Render the settings page.
 * @param props - injected config form and optional quota reader.
 * @returns the page body.
 */
export declare function OpenDesignSection({ form, execute }: OpenDesignSectionInjected): ReactElement;
