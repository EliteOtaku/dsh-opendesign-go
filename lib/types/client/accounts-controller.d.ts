/**
 * Page → host channel for account mutations.
 *
 * Both operations already exist as Host-generated Remote namespaces from
 * `@deepseek-ai/dsh-api-settings-controller`, so this plugin publishes none of
 * its own:
 *
 * - `remote.credentials.set(ref, value)` stores a secret and never reads one back.
 * - `remote.settings.update(ns, patch, revision)` merges the account list.
 *
 * Using them keeps one write path shared with every other configuration
 * surface, and removes a whole custom Remote contribution that would otherwise
 * have to be mounted and kept in step with the Host.
 *
 * A command sent before the namespaces exist answers `unknown` rather than being
 * dropped, and `state()` names the step it reached so a failure is diagnosable
 * from the page instead of reading as a generic "not ready".
 *
 * @module dsh-opendesign-go/client/accounts-controller
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { AccountCommand, AccountCommandResult } from '../account-command.ts';
/** Executes one command on the host. */
export type ExecuteAccountCommand = (command: AccountCommand) => Promise<AccountCommandResult>;
/** Reads which step the command channel reached, for diagnostics. */
export type ChannelState = () => string;
/**
 * Build the executor over the two Host namespaces.
 * @param ctx - client root context that has already been granted `remote`.
 * @returns the executor, a stage reader, and a promise settling when injected.
 */
export declare function accountCommands(ctx: ClientContext): {
    execute: ExecuteAccountCommand;
    state: ChannelState;
    ready: PromiseLike<unknown>;
};
