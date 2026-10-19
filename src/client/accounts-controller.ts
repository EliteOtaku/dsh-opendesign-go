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
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the client Remote Context merge (ctx.remote).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { AccountCommand, AccountCommandResult } from '../account-command.ts'
import { PROFILE_ENTRY_ID } from '../config-contract.ts'

/** Executes one command on the host. */
export type ExecuteAccountCommand = (command: AccountCommand) => Promise<AccountCommandResult>

/** Reads which step the command channel reached, for diagnostics. */
export type ChannelState = () => string

/** Remote namespaces this page needs before any command can run. */
const REQUIRED_REMOTES = ['remote.credentials', 'remote.settings']

/** The subset of the credentials namespace this page uses. */
interface CredentialsRemote {
  set(ref: string, value: string): Promise<unknown>
  unset(ref: string): Promise<unknown>
}

/** One stored account row, as the config document holds it. */
interface AccountRow {
  id: string
  name: string
  apiKeyEnv: string
  workspaceId?: string
}

/** The subset of the settings namespace this page uses. */
interface SettingsRemote {
  update(ns: string, patch: object, expectedRevision?: number): Promise<unknown>
  get(ns: string): Promise<{ readonly revision: number, readonly value?: { accounts?: AccountRow[], apiKeyEnv?: string } }>
}

/**
 * Build the executor over the two Host namespaces.
 * @param ctx - client root context that has already been granted `remote`.
 * @returns the executor, a stage reader, and a promise settling when injected.
 */
export function accountCommands(ctx: ClientContext): {
  execute: ExecuteAccountCommand
  state: ChannelState
  ready: PromiseLike<unknown>
} {
  let stage = 'mounting'
  let credentials: CredentialsRemote | undefined
  let settings: SettingsRemote | undefined

  const ready = ctx.inject(REQUIRED_REMOTES, (remoteCtx) => {
    const remote = remoteCtx.remote as unknown as {
      credentials?: CredentialsRemote
      settings?: SettingsRemote
    }
    credentials = remote.credentials
    settings = remote.settings
    stage = credentials === undefined || settings === undefined
      ? 'namespaces present but methods missing'
      : 'ready'
  })

  /**
   * Merge fields into the plugin's entry, fencing on the revision just read.
   * @param patch - fields to merge.
   * @returns the outcome.
   */
  const writeEntry = async (patch: object): Promise<AccountCommandResult> => {
    if (settings === undefined) return 'unknown'
    try {
      const current = await settings.get(PROFILE_ENTRY_ID)
      await settings.update(PROFILE_ENTRY_ID, patch, current.revision)
      return 'applied'
    } catch (error) {
      ctx.logger.warn?.(`llm-opendesign-go: settings write failed (${String(error)})`)
      return 'unknown'
    }
  }

  const execute: ExecuteAccountCommand = async (command) => {
    if (credentials === undefined || settings === undefined) return 'unknown'

    // Read the list fresh from the document rather than from a cached copy, so
    // a concurrent edit from another surface is never clobbered.
    let accounts: AccountRow[] = []
    let selected = ''
    try {
      const row = await settings.get(PROFILE_ENTRY_ID)
      accounts = row.value?.accounts ?? []
      selected = row.value?.apiKeyEnv ?? ''
    } catch (error) {
      ctx.logger.warn?.(`llm-opendesign-go: could not read settings (${String(error)})`)
      return 'unknown'
    }

    try {
      if (command.kind === 'add') {
        if (accounts.some((account) => account.id === command.id)) return 'applied'
        const used = new Set(accounts.map((account) => account.apiKeyEnv))
        let index = 0
        while (used.has(`OPENDESIGN_ACCOUNT_${index + 1}`)) index += 1
        const ref = `OPENDESIGN_ACCOUNT_${index + 1}`
        // Credential first: a stored key without a row is recoverable, the
        // reverse is a config naming a key nobody stored.
        await credentials.set(ref, command.key)
        const account: AccountRow = {
          id: command.id,
          name: command.name,
          apiKeyEnv: ref,
          ...(command.workspaceId === undefined ? {} : { workspaceId: command.workspaceId }),
        }
        return await writeEntry({
          accounts: [...accounts, account],
          apiKeyEnv: selected.length === 0 ? ref : selected,
        })
      }

      if (command.kind === 'remove') {
        const next = accounts.filter((account) => account.apiKeyEnv !== command.ref)
        // The last account stays: with none, no request can resolve a key.
        if (next.length === 0) return 'rejected'
        const first = next[0]
        if (first === undefined) return 'rejected'
        const result = await writeEntry({ accounts: next, apiKeyEnv: first.apiKeyEnv })
        if (result === 'applied') {
          try {
            await credentials.unset(command.ref)
          } catch {
            // The row is already gone; an orphan key is harmless because the
            // next add reuses the reference.
          }
        }
        return result
      }

      if (command.kind === 'select') {
        if (!accounts.some((account) => account.apiKeyEnv === command.ref)) return 'rejected'
        return await writeEntry({ apiKeyEnv: command.ref })
      }

      if (command.kind === 'rename') {
        if (!accounts.some((account) => account.apiKeyEnv === command.ref)) return 'rejected'
        return await writeEntry({
          accounts: accounts.map((account) => (account.apiKeyEnv === command.ref
            ? { ...account, name: command.name }
            : account)),
        })
      }

      if (command.kind === 'replace-key') {
        await credentials.set(command.ref, command.key)
        return 'applied'
      }

      return await writeEntry({ autoSwitch: command.value })
    } catch (error) {
      ctx.logger.warn?.(`llm-opendesign-go: account command failed (${String(error)})`)
      return 'unknown'
    }
  }

  return { execute, state: () => stage, ready }
}
