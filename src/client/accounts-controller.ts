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

/** Namespace reference the client must inject before it can be read. */
export const ACCOUNTS_REMOTE = `remote.${ACCOUNTS_NAMESPACE}`

/** Executes one command on the host. */
export type ExecuteAccountCommand = (command: AccountCommand) => Promise<AccountCommandResult>

/** Reads which step the command channel reached, for diagnostics. */
export type ChannelState = () => string

/**
 * Mount the Remote namespace once and return a command executor.
 *
 * Until the mount resolves, every command answers `unknown`: the page can be
 * used immediately, and a submission attempted before the channel is live is
 * reported honestly rather than dropped.
 * @param ctx - client root context.
 * @returns the executor, plus a promise that settles when the mount is ready.
 */
export function accountCommands(ctx: ClientContext): { execute: ExecuteAccountCommand, ready: Promise<unknown>, state: () => string } {
  let execute: ExecuteAccountCommand = async () => 'unknown'
  /** Which step the channel reached; surfaced so a failure names itself. */
  let stage = 'mounting'

  // Mount and inject both happen **synchronously inside apply**, which is what
  // Cordis requires: `ctx.inject` registers a child fiber against the calling
  // fiber, and a registration made later from a promise callback belongs to no
  // fiber and is never armed. Waiting for the mount first is therefore wrong
  // even though it reads more carefully — the injection must be in place, and
  // the child fiber simply waits until the namespace appears.
  const ready = ctx.remote.$mount(accountsRemote)
  ctx.effect(() => {
    void ready.then((dispose: () => unknown) => {
      stage = 'mounted, waiting for namespace'
      ctx.effect(() => () => { void dispose() })
    }).catch((error: unknown) => {
      stage = `mount failed: ${String(error)}`
      ctx.logger.warn?.(`llm-opendesign-go: ${stage}`)
    })
    return () => undefined
  })
  ctx.inject([ACCOUNTS_REMOTE], (readyCtx) => {
    stage = 'ready'
    execute = async (command) => {
      const result = await readyCtx.remote[ACCOUNTS_NAMESPACE].execute(command)
      if (!result.ok) return 'unknown'
      return result.value as AccountCommandResult
    }
  })
  return { execute: (command) => execute(command), ready, state: () => stage }
}
