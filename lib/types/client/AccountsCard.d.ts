import type { ReactElement } from 'react';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { OpenDesignConfig } from '../config-contract.ts';
import type { ChannelState, ExecuteAccountCommand } from './accounts-controller.ts';
/**
 * Render the account card.
 * @param props - config form, current accounts, and the command executor.
 * @returns the card.
 */
export declare function AccountsCard({ form, config, editable, execute, channelState }: {
    readonly form: ConfigForm<OpenDesignConfig>;
    readonly config: OpenDesignConfig | undefined;
    readonly editable: boolean;
    /** Sends an account command to the host, which owns credential storage. */
    readonly execute: ExecuteAccountCommand;
    /** Reads which step the command channel reached, for diagnostics. */
    readonly channelState: ChannelState;
}): ReactElement;
