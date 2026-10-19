/**
 * Host side of account commands: the one place credentials are written.
 *
 * A command is applied in a fixed order — credential first, then config — so a
 * failure between the two leaves the key stored under an account that does not
 * exist yet, which is recoverable (the next add reuses it) rather than the
 * reverse, where config would name a key nobody stored.
 *
 * `result` distinguishes refusal from uncertainty. A transport failure is
 * `unknown`, never `rejected`: telling a user their write failed when it landed
 * leads them to retry and create a duplicate.
 *
 * @module dsh-opendesign-go/account-service
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AccountCommand, AccountCommandResult } from './account-command.ts';
import type { OpenDesignAccount } from './config-contract.ts';
/**
 * Apply account commands against one plugin entry.
 */
export declare class AccountService {
    #private;
    /**
     * @param ctx - host context carrying `credentials` and `settings`.
     * @param config - reads the current resolved configuration.
     */
    constructor(ctx: Context, config: () => {
        readonly apiKeyEnv: string;
        readonly accounts: readonly OpenDesignAccount[] | null;
    });
    /**
     * Execute one validated command.
     * @param command - the command from the page.
     * @returns the outcome the page displays.
     */
    execute(command: AccountCommand): Promise<AccountCommandResult>;
    /**
     * Report whether each account's key is stored, without reading any value.
     * @param refs - references to check.
     * @returns configured state per reference.
     */
    describeKeys(refs: readonly string[]): Promise<Record<string, boolean>>;
}
