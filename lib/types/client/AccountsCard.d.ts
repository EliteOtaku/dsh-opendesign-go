import type { ReactElement } from 'react';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { OpenDesignConfig } from '../config-contract.ts';
import type { ExecuteAccountCommand } from './accounts-controller.ts';
/**
 * Render the account card.
 * @param props - config form, current accounts, and the command executor.
 * @returns the card.
 */
export declare function AccountsCard({ form, config, editable, execute }: {
    readonly form: ConfigForm<OpenDesignConfig>;
    readonly config: OpenDesignConfig | undefined;
    readonly editable: boolean;
    /** Sends an account command to the host, which owns credential storage. */
    readonly execute: ExecuteAccountCommand;
}): ReactElement;
