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
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { AccountCommand, AccountCommandResult } from './account-command.ts'
import { deriveAccountRef, MAX_ACCOUNTS, accountsOf } from './accounts.ts'
import type { OpenDesignAccount } from './config-contract.ts'
import { PROFILE_ENTRY_ID } from './config-contract.ts'

/** The credentials seam, restricted to what this service uses. */
interface CredentialSeam {
  set(ref: ReturnType<typeof credentialRef>, value: string): Promise<void>
  unset(ref: ReturnType<typeof credentialRef>): Promise<void>
  describe(ref: ReturnType<typeof credentialRef>): Promise<{ configured: boolean, writable: boolean }>
}

/** The settings seam, restricted to what this service uses. */
interface SettingsSeam {
  describe(options?: unknown): { ns: string, revision: number, value?: unknown }[]
  update(ns: string, patch: object, expectedRevision?: number): Promise<void>
  readonly writable?: boolean
}

/**
 * Apply account commands against one plugin entry.
 */
export class AccountService {
  readonly #ctx: Context
  readonly #config: () => { readonly apiKeyEnv: string, readonly accounts: readonly OpenDesignAccount[] | null }

  /**
   * @param ctx - host context carrying `credentials` and `settings`.
   * @param config - reads the current resolved configuration.
   */
  constructor(ctx: Context, config: () => { readonly apiKeyEnv: string, readonly accounts: readonly OpenDesignAccount[] | null }) {
    this.#ctx = ctx
    this.#config = config
  }

  /**
   * Execute one validated command.
   * @param command - the command from the page.
   * @returns the outcome the page displays.
   */
  async execute(command: AccountCommand): Promise<AccountCommandResult> {
    const credentials = this.#ctx.get('credentials') as CredentialSeam | undefined
    const settings = this.#ctx.get('settings') as SettingsSeam | undefined
    if (credentials === undefined || settings === undefined || settings.writable !== true) return 'rejected'

    const current = this.#config()
    const accounts = accountsOf(current)

    try {
      if (command.kind === 'add') return await this.#add(credentials, command, accounts)
      if (command.kind === 'remove') return await this.#remove(credentials, command.ref, accounts)
      if (command.kind === 'select') return await this.#select(command.ref, accounts)
      if (command.kind === 'rename') return await this.#rename(command.ref, command.name, accounts)
      if (command.kind === 'replace-key') {
        await credentials.set(credentialRef(command.ref), command.key)
        return 'applied'
      }
      // auto-switch carries no credential change.
      return await this.#writeAccounts(accounts, current.apiKeyEnv, { autoSwitch: command.value })
    } catch (error) {
      this.#ctx.logger.warn(`llm-opendesign-go: account command failed (${String(error)})`)
      // The write may or may not have landed; say so instead of guessing.
      return 'unknown'
    }
  }

  /**
   * Store a key and add the account row.
   * @param credentials - credential seam.
   * @param command - the add command.
   * @param accounts - current accounts.
   * @returns the outcome.
   */
  async #add(credentials: CredentialSeam, command: Extract<AccountCommand, { kind: 'add' }>, accounts: readonly OpenDesignAccount[]): Promise<AccountCommandResult> {
    if (accounts.some((account) => account.id === command.id)) return 'applied'
    if (accounts.length >= MAX_ACCOUNTS) return 'rejected'
    const used = new Set(accounts.map((account) => account.apiKeyEnv))
    let index = 0
    while (used.has(deriveAccountRef(index))) index += 1
    const ref = deriveAccountRef(index)
    // Credential first: a stored key without a row is recoverable, the reverse
    // is a config naming a key nobody stored.
    await credentials.set(credentialRef(ref), command.key)
    const account: OpenDesignAccount = {
      id: command.id,
      name: command.name,
      apiKeyEnv: ref,
      ...(command.workspaceId === undefined ? {} : { workspaceId: command.workspaceId }),
    }
    return await this.#writeAccounts([...accounts, account], this.#config().apiKeyEnv || ref)
  }

  /**
   * Remove an account row and its key.
   * @param credentials - credential seam.
   * @param ref - credential reference to drop.
   * @param accounts - current accounts.
   * @returns the outcome.
   */
  async #remove(credentials: CredentialSeam, ref: string, accounts: readonly OpenDesignAccount[]): Promise<AccountCommandResult> {
    const next = accounts.filter((account) => account.apiKeyEnv !== ref)
    // The last account stays: with none, no request can resolve a key at all.
    if (next.length === 0) return 'rejected'
    const selected = next[0]
    if (selected === undefined) return 'rejected'
    const result = await this.#writeAccounts(next, selected.apiKeyEnv)
    if (result !== 'applied') return result
    // Drop the secret only after the row is gone, so a failure here leaves an
    // orphaned key rather than an account pointing at nothing.
    const info = await credentials.describe(credentialRef(ref))
    if (info.writable) await credentials.unset(credentialRef(ref))
    return 'applied'
  }

  /**
   * Promote one account by reordering, which is what selection means here.
   * @param ref - reference to promote.
   * @param accounts - current accounts.
   * @returns the outcome.
   */
  async #select(ref: string, accounts: readonly OpenDesignAccount[]): Promise<AccountCommandResult> {
    if (!accounts.some((account) => account.apiKeyEnv === ref)) return 'rejected'
    return await this.#writeAccounts(accounts, ref)
  }

  /**
   * Rename one account.
   * @param ref - reference to rename.
   * @param name - new display name.
   * @param accounts - current accounts.
   * @returns the outcome.
   */
  async #rename(ref: string, name: string, accounts: readonly OpenDesignAccount[]): Promise<AccountCommandResult> {
    if (!accounts.some((account) => account.apiKeyEnv === ref)) return 'rejected'
    return await this.#writeAccounts(
      accounts.map((account) => (account.apiKeyEnv === ref ? { ...account, name } : account)),
      this.#config().apiKeyEnv || ref,
    )
  }

  /**
   * Persist the account list and selection.
   * @param accounts - next list.
   * @param selectedRef - reference that becomes active.
   * @param extra - additional fields to write in the same mutation.
   * @returns the outcome.
   */
  async #writeAccounts(
    accounts: readonly OpenDesignAccount[],
    selectedRef: string,
    extra: Record<string, unknown> = {},
  ): Promise<AccountCommandResult> {
    const settings = this.#ctx.get('settings') as SettingsSeam | undefined
    if (settings === undefined) return 'rejected'
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = settings.describe().find((candidate) => candidate.ns === PROFILE_ENTRY_ID)
      if (row === undefined) return 'rejected'
      try {
        await settings.update(PROFILE_ENTRY_ID, {
          accounts: accounts.map((account) => ({ ...account })),
          apiKeyEnv: selectedRef,
          ...extra,
        }, row.revision)
        return 'applied'
      } catch (error) {
        // A revision conflict means the document moved; re-read and retry.
        if (attempt === 2) {
          this.#ctx.logger.warn(`llm-opendesign-go: could not persist accounts (${String(error)})`)
          return 'unknown'
        }
      }
    }
    return 'unknown'
  }

  /**
   * Report whether each account's key is stored, without reading any value.
   * @param refs - references to check.
   * @returns configured state per reference.
   */
  async describeKeys(refs: readonly string[]): Promise<Record<string, boolean>> {
    const credentials = this.#ctx.get('credentials') as CredentialSeam | undefined
    if (credentials === undefined) return {}
    const out: Record<string, boolean> = {}
    for (const ref of refs) {
      try {
        out[ref] = (await credentials.describe(credentialRef(ref))).configured
      } catch {
        out[ref] = false
      }
    }
    return out
  }
}
