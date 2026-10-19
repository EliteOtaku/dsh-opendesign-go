import type { ReactElement } from 'react';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { OpenDesignConfig } from '../config-contract.ts';
import type { UsageSnapshot } from '../usage-contract.ts';
/** Props injected into the section by the registering plugin. */
export interface OpenDesignSectionInjected {
    /** Live config form bound to this plugin's profile entry. */
    readonly form: ConfigForm<OpenDesignConfig>;
    /**
     * Reads the quota channel. Absent on a host that does not mount the remote,
     * in which case the page shows that quota is unavailable rather than failing.
     */
    readonly readUsage?: () => Promise<UsageSnapshot>;
}
/**
 * Render the settings page.
 * @param props - injected config form and optional quota reader.
 * @returns the page body.
 */
export declare function OpenDesignSection({ form, readUsage }: OpenDesignSectionInjected): ReactElement;
