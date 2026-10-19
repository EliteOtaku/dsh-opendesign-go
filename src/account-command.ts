/**
 * Account command contract shared by the page and the host.
 *
 * The page cannot write credentials itself: the value must reach the host's
 * credentials service, which owns storage and never returns the secret. So a
 * command is sent as data, and the host performs the write and answers with one
 * of three outcomes.
 *
 * The key travels **only** inside an `add`/`replace-key` command. It is never
 * read back, never echoed in a result, and never stored in the config document —
 * a reference plus a display name is all the config keeps.
 *
 * @module dsh-opendesign-go/account-command
 */

/** Add an account and store its key under a derived reference. */
export interface AddAccountCommand {
  readonly kind: 'add'
  /** Client-generated id, so a retried submission cannot create two rows. */
  readonly id: string
  readonly name: string
  /** The secret. Sent once, stored by the host, never returned. */
  readonly key: string
  /** Console workspace id, when the user knows it. */
  readonly workspaceId?: string
}

/** Remove one account and its stored key. */
export interface RemoveAccountCommand {
  readonly kind: 'remove'
  readonly ref: string
}

/** Make one account the active one. */
export interface SelectAccountCommand {
  readonly kind: 'select'
  readonly ref: string
}

/** Rename one account. */
export interface RenameAccountCommand {
  readonly kind: 'rename'
  readonly ref: string
  readonly name: string
}

/** Replace one account's stored key. */
export interface ReplaceKeyCommand {
  readonly kind: 'replace-key'
  readonly ref: string
  /** The new secret; same handling as {@link AddAccountCommand.key}. */
  readonly key: string
}

/** Turn automatic failover on or off. */
export interface AutoSwitchCommand {
  readonly kind: 'auto-switch'
  readonly value: boolean
}

/** Every command the page may send. */
export type AccountCommand =
  | AddAccountCommand
  | RemoveAccountCommand
  | SelectAccountCommand
  | RenameAccountCommand
  | ReplaceKeyCommand
  | AutoSwitchCommand

/**
 * Outcome of one command.
 *
 * `unknown` exists for the same reason the reference implementation has it: a
 * transport failure must not be reported as either acceptance or refusal, since
 * the write may or may not have landed.
 */
export type AccountCommandResult = 'applied' | 'rejected' | 'unknown'

/** Credential references are bare environment-variable names. */
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Validate one command arriving from the page.
 *
 * Everything crossing the wire is validated field by field: the command carries
 * a secret, so a shape error must be refused before anything is written.
 * @param value - decoded command.
 * @returns the validated command.
 * @throws {Error} when the command is not acceptable.
 */
export function parseAccountCommand(value: unknown): AccountCommand {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('账号命令格式无效')
  }
  const row = value as Record<string, unknown>
  const kind = row.kind
  if (kind === 'add') {
    if (typeof row.id !== 'string' || row.id.length === 0 || row.id.length > 128) {
      throw new Error('账号 id 无效')
    }
    if (typeof row.name !== 'string' || row.name.trim().length === 0 || row.name.length > 80) {
      throw new Error('账号名称无效')
    }
    if (typeof row.key !== 'string' || row.key.trim().length === 0) {
      throw new Error('缺少 API Key')
    }
    if (row.workspaceId !== undefined && (typeof row.workspaceId !== 'string' || row.workspaceId.trim().length === 0)) {
      throw new Error('工作空间 ID 无效')
    }
    return {
      kind,
      id: row.id,
      name: row.name.trim(),
      key: row.key.trim(),
      ...(row.workspaceId === undefined ? {} : { workspaceId: row.workspaceId as string }),
    }
  }
  if (kind === 'remove' || kind === 'select') {
    if (typeof row.ref !== 'string' || !REF_PATTERN.test(row.ref)) throw new Error('账号引用无效')
    return { kind, ref: row.ref }
  }
  if (kind === 'rename') {
    if (typeof row.ref !== 'string' || !REF_PATTERN.test(row.ref)) throw new Error('账号引用无效')
    if (typeof row.name !== 'string' || row.name.trim().length === 0 || row.name.length > 80) {
      throw new Error('账号名称无效')
    }
    return { kind, ref: row.ref, name: row.name.trim() }
  }
  if (kind === 'replace-key') {
    if (typeof row.ref !== 'string' || !REF_PATTERN.test(row.ref)) throw new Error('账号引用无效')
    if (typeof row.key !== 'string' || row.key.trim().length === 0) throw new Error('缺少 API Key')
    return { kind, ref: row.ref, key: row.key.trim() }
  }
  if (kind === 'auto-switch') {
    if (typeof row.value !== 'boolean') throw new Error('自动切换取值无效')
    return { kind, value: row.value }
  }
  throw new Error('未知的账号命令')
}

/**
 * Validate one command result.
 * @param value - decoded result.
 * @returns the result.
 * @throws {Error} when the value is not one of the three outcomes.
 */
export function parseCommandResult(value: unknown): AccountCommandResult {
  if (value === 'applied' || value === 'rejected' || value === 'unknown') return value
  throw new Error('账号命令结果无效')
}
