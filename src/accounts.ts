/**
 * Account rules shared by the host, the page and the tests.
 *
 * An account is **one OpenDesign subscription**, not a second key for the same
 * one: quota is counted per workspace, so two keys in one workspace share a
 * single allowance and switching between them changes nothing. That is why the
 * account list is ordered — the first entry is the account every request uses,
 * and the order is the fallback sequence.
 *
 * The key itself never travels through this module: an account holds only a
 * **credential reference**, and the value lives in the credentials service.
 *
 * @module dsh-opendesign-go/accounts
 */
import type { OpenDesignAccount } from './config-contract.ts'
import { DEFAULT_API_KEY_ENV } from './config-contract.ts'

/** Upper bound on accounts; each one needs its own key and workspace. */
export const MAX_ACCOUNTS = 20

/** Credential references are bare environment-variable names. */
export const ACCOUNT_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Longest accepted display name, matching the settings input. */
export const MAX_ACCOUNT_NAME = 80

/**
 * The reference every operation resolves through.
 * @param config - resolved configuration.
 * @returns the selected account's credential reference.
 */
export function accountRefOf(config: { readonly apiKeyEnv: string }): string {
  const ref = config.apiKeyEnv.trim()
  return ref.length === 0 ? DEFAULT_API_KEY_ENV : ref
}

/**
 * Move one account to the front, preserving the rest of the order.
 *
 * Selecting an account *is* reordering: the first entry is what the adapter
 * resolves, so there is no separate "selected" field to drift out of sync with
 * the list.
 * @param accounts - current order.
 * @param ref - reference to promote.
 * @returns the new order, or the same list when already first or absent.
 */
export function moveAccountFirst(accounts: readonly OpenDesignAccount[], ref: string): readonly OpenDesignAccount[] {
  const index = accounts.findIndex((account) => account.apiKeyEnv === ref)
  if (index <= 0) return accounts
  const head = accounts[index]
  if (head === undefined) return accounts
  return [head, ...accounts.slice(0, index), ...accounts.slice(index + 1)]
}

/**
 * The accounts in effective order, tolerating a legacy configuration that only
 * names a reference.
 * @param config - resolved configuration.
 * @returns a non-empty list whose first entry is the selected account.
 */
export function accountsOf(config: {
  readonly apiKeyEnv: string
  readonly accounts: readonly OpenDesignAccount[] | null
}): readonly OpenDesignAccount[] {
  const ref = accountRefOf(config)
  const accounts = config.accounts ?? []
  if (accounts.some((account) => account.apiKeyEnv === ref)) return moveAccountFirst(accounts, ref)
  // A configuration that predates the list still has to resolve: represent it
  // as one synthetic account instead of failing every request.
  return [{ id: `legacy:${ref}`, name: '', apiKeyEnv: ref }, ...accounts]
}

/**
 * Validate one account, rejecting anything that would break credential
 * resolution or produce two indistinguishable rows.
 * @param account - candidate account.
 * @throws {Error} when the account is unusable.
 */
function assertAccount(account: OpenDesignAccount): void {
  if (typeof account.id !== 'string' || account.id.length === 0 || account.id.length > 128) {
    throw new Error('账号 id 无效')
  }
  // The synthetic legacy entry is the only one allowed to carry an empty name;
  // its identity is derived from the reference it stands for.
  const isLegacy = account.id.startsWith('legacy:')
  if (isLegacy && account.id !== `legacy:${account.apiKeyEnv}`) {
    throw new Error('账号 id 与 legacy 标记不一致')
  }
  if (typeof account.name !== 'string' || account.name.length > MAX_ACCOUNT_NAME) {
    throw new Error('账号名称过长')
  }
  if (!isLegacy && account.name.trim().length === 0) {
    throw new Error('账号名称不能为空')
  }
  if (!ACCOUNT_REF_PATTERN.test(account.apiKeyEnv)) {
    throw new Error(`账号凭据引用名无效：${account.apiKeyEnv}`)
  }
  if (account.workspaceId !== undefined && account.workspaceId.trim().length === 0) {
    throw new Error('工作空间 ID 不能为空字符串')
  }
}

/**
 * Validate the whole list.
 * @param accounts - candidate list.
 * @param selectedRef - reference that must be present when the list is at its cap.
 * @throws {Error} when the list is unusable.
 */
export function assertAccounts(accounts: readonly OpenDesignAccount[] | null, selectedRef: string): void {
  if (accounts === null) return
  if (!Array.isArray(accounts)) throw new Error('账号列表格式无效')
  if (accounts.length > MAX_ACCOUNTS) throw new Error(`最多支持 ${MAX_ACCOUNTS} 个账号`)
  const ids = new Set<string>()
  const refs = new Set<string>()
  for (const account of accounts) {
    assertAccount(account)
    if (ids.has(account.id)) throw new Error(`账号 id 重复：${account.id}`)
    if (refs.has(account.apiKeyEnv)) throw new Error(`凭据引用名重复：${account.apiKeyEnv}`)
    ids.add(account.id)
    refs.add(account.apiKeyEnv)
  }
  if (accounts.length === MAX_ACCOUNTS && !refs.has(selectedRef)) {
    throw new Error(`已达 ${MAX_ACCOUNTS} 个账号上限，当前选中的账号必须在列表中`)
  }
}

/**
 * Derive a credential reference for a new account.
 *
 * References are derived, not typed by the user: a typo in an environment
 * variable name would otherwise fail at request time with a confusing message.
 * @param index - position used to keep references distinct.
 * @returns a reference such as `OPENDESIGN_ACCOUNT_2`.
 */
export function deriveAccountRef(index: number): string {
  return `OPENDESIGN_ACCOUNT_${index + 1}`
}
