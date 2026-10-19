/**
 * Page → host channel for account mutations.
 *
 * The page never touches credentials: it sends a command, and the host performs
 * the write. This module owns the one mount and translates outcomes into
 * something the card can render.
 *
 * `unknown` is preserved as its own outcome. A failed round trip does not prove
 * the write was refused, and telling the user it was would make them retry and
 * create a duplicate account.
 *
 * @module dsh-opendesign-go/client/accounts-controller
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { AccountCommand, AccountCommandResult } from '../account-command.ts';
/** Executes one command on the host. */
export type ExecuteAccountCommand = (command: AccountCommand) => Promise<AccountCommandResult>;
/**
 * Mount the Remote namespace once and return a command executor.
 *
 * Until the mount resolves, every command answers `unknown`: the page can be
 * used immediately, and a submission attempted before the channel is live is
 * reported honestly rather than dropped.
 * @param ctx - client root context.
 * @returns the executor, plus a promise that settles when the mount is ready.
 */
export declare function accountCommands(ctx: ClientContext): {
    execute: ExecuteAccountCommand;
    ready: Promise<unknown>;
};
