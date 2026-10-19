import type { ReactElement } from 'react';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { OpenDesignConfig } from '../config-contract.ts';
/**
 * Render the account card.
 * @param props - config form, current accounts, and the write helper.
 * @returns the card.
 */
export declare function AccountsCard({ form, config, editable }: {
    readonly form: ConfigForm<OpenDesignConfig>;
    readonly config: OpenDesignConfig | undefined;
    readonly editable: boolean;
}): ReactElement;
