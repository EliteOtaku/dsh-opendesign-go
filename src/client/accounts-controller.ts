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
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the client Remote Context merge (ctx.remote).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { AccountCommand, AccountCommandResult } from '../account-command.ts'
import { ACCOUNTS_NAMESPACE, accountsRemote } from '../remote-contract.ts'

/** Executes one command on the host. */
export type ExecuteAccountCommand = (command: AccountCommand) => Promise<AccountCommandResult>

/**
 * Mount the Remote namespace once and return a command executor.
 *
 * Until the mount resolves, every command answers `unknown`: the page can be
 * used immediately, and a submission attempted before the channel is live is
 * reported honestly rather than dropped.
 * @param ctx - client root context.
 * @returns the executor, plus a promise that settles when the mount is ready.
 */
export function accountCommands(ctx: ClientContext): { execute: ExecuteAccountCommand, ready: Promise<unknown> } {
  let execute: ExecuteAccountCommand = async () => 'unknown'
  const ready = ctx.remote.$mount(accountsRemote).then((dispose: () => unknown) => {
    ctx.effect(() => () => { void dispose() })
    execute = async (command) => {
      const result = await ctx.remote[ACCOUNTS_NAMESPACE].execute(command)
      if (!result.ok) return 'unknown'
      return result.value as AccountCommandResult
    }
    return undefined
  }).catch(() => undefined)
  return { execute: (command) => execute(command), ready }
}
