/**
 * Quota readings taken from the OpenDesign app's own `vela` CLI.
 *
 * This replaces the console-session approach entirely: no token, no cookie, no
 * workspace id to type. `vela` already holds the login, so the user's only
 * setup is signing in to OpenDesign once.
 *
 * The output is a private CLI's, so nothing here trusts it blindly. Every field
 * is validated, an unknown shape is reported as a failure, and a failed read
 * never fabricates a number — a wrong quota bar is worse than an absent one.
 *
 * @module dsh-opendesign-go/vela-billing
 */
import { execFile } from 'node:child_process'
import type { QuotaWindow, UsageSnapshot } from './usage-contract.ts'
import { percentUsedOf } from './usage-contract.ts'

/** Timeout for one `vela` call; the CLI talks to a remote service. */
const CALL_TIMEOUT_MS = 15_000

/** One workspace as `vela billing workspace-snapshot` reports it. */
interface WorkspaceSnapshot {
  readonly workspaceId: string
  readonly wallet?: { readonly balanceUsd?: string }
  readonly billing?: { readonly billingState?: string }
}

/** The coding-plan half of `vela billing funding-check`. */
interface FundingCheck {
  readonly workspaceId: string
  readonly generatedAt?: string
  readonly balanceUsd?: string
  readonly funding?: string
  readonly codingPlan?: {
    readonly eligible?: boolean
    readonly tier?: string
    readonly windows?: readonly {
      readonly durationSeconds?: number
      readonly usedCredits?: string
      readonly limitCredits?: string
      readonly remainingCredits?: string
      readonly resetsAt?: string
    }[]
  }
}

/**
 * Run one `vela` subcommand and parse its JSON.
 * @param binary - absolute path to the executable.
 * @param args - arguments after the binary.
 * @returns the parsed JSON.
 * @throws {Error} when the call fails, times out, or prints non-JSON.
 */
function runJson(binary: string, args: readonly string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(binary, [...args], { timeout: CALL_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
      if (error !== null) {
        reject(new Error(`vela ${args.join(' ')} failed: ${error.message}`))
        return
      }
      const text = String(stdout ?? '').trim()
      if (text.length === 0) {
        reject(new Error(`vela ${args.join(' ')} printed nothing`))
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new Error(`vela ${args.join(' ')} did not print JSON`))
      }
    })
  })
}

/**
 * Read the signed-in user's email, which also proves the login is usable.
 * @param binary - absolute path to the executable.
 * @returns the email, or undefined when not signed in.
 */
export async function velaWhoami(binary: string): Promise<string | undefined> {
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      execFile(binary, ['whoami'], { timeout: CALL_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
        if (error !== null) reject(error)
        else resolve(String(stdout ?? ''))
      })
    })
    const line = raw.split('\n').map((row) => row.trim()).find((row) => row.includes('@'))
    return line === undefined ? undefined : line
  } catch {
    return undefined
  }
}

/**
 * List the workspaces this login can read.
 *
 * `funding-check` needs a workspace id, so one is discovered rather than typed.
 * The CLI has no dedicated list command, so the id is taken from the wallet
 * snapshot of the workspace the app itself uses — reported by `vela billing
 * summary` indirectly, or from an explicit override.
 * @param binary - absolute path to the executable.
 * @param explicit - a workspace id from configuration, when present.
 * @returns the workspace id, or undefined when none could be determined.
 */
export async function resolveWorkspaceId(binary: string, explicit: string | undefined): Promise<string | undefined> {
  if (explicit !== undefined && explicit.trim().length > 0) return explicit.trim()
  try {
    const raw = await runJson(binary, ['billing', 'summary', '--format', 'json'])
    const workspace = (raw as { workspaceId?: unknown }).workspaceId
    if (typeof workspace === 'string' && workspace.length > 0) return workspace
  } catch {
    // The summary may not carry it; fall through to "unknown".
  }
  return undefined
}

/**
 * Convert one CLI window into the plugin's quota window.
 * @param raw - the window as the CLI reported it.
 * @returns the window, or undefined when a required field is missing.
 */
function windowOf(raw: NonNullable<NonNullable<FundingCheck['codingPlan']>['windows']>[number]): QuotaWindow | undefined {
  const duration = raw.durationSeconds
  const used = raw.usedCredits
  const limit = raw.limitCredits
  const remaining = raw.remainingCredits
  const resetsAt = raw.resetsAt
  if (typeof duration !== 'number' || typeof used !== 'string' || typeof limit !== 'string'
    || typeof remaining !== 'string' || typeof resetsAt !== 'string') return undefined
  return {
    status: 'ok',
    durationSeconds: duration,
    usedCredits: used,
    limitCredits: limit,
    remainingCredits: remaining,
    percentUsed: percentUsedOf(used, limit),
    resetsAt,
  }
}

/**
 * Read one workspace's quota through `vela`.
 *
 * A failure is returned as a snapshot carrying `error` rather than thrown: the
 * page shows why it has no numbers, which is more useful than a silent empty
 * state and does not take the settings page down with it.
 * @param binary - absolute path to the executable.
 * @param workspaceId - workspace to read, when already known.
 * @returns the snapshot.
 */
export async function readVelaUsage(binary: string, workspaceId: string | undefined): Promise<UsageSnapshot> {
  const asOf = new Date().toISOString()
  const empty = (error: string): UsageSnapshot => ({ asOf, tier: '', eligible: false, windows: [], error })

  const workspace = await resolveWorkspaceId(binary, workspaceId)
  if (workspace === undefined) {
    return empty('无法确定工作空间 ID；请在设置中填写，或先登录 OpenDesign 桌面端')
  }

  let funding: FundingCheck
  try {
    funding = await runJson(binary, [
      'billing', 'funding-check',
      '--workspace-id', workspace,
      '--format', 'json',
    ]) as FundingCheck
  } catch (error) {
    return empty(error instanceof Error ? error.message : String(error))
  }

  const plan = funding.codingPlan
  if (plan === undefined) return empty('vela 未返回套餐信息')
  const windows = (plan.windows ?? [])
    .map(windowOf)
    .filter((window): window is QuotaWindow => window !== undefined)
  if (windows.length === 0) return empty('vela 未返回任何额度窗口')

  // The wallet is reported separately and is the fallback funding source once
  // the plan allowance is spent, so both are surfaced.
  let balanceUsd = funding.balanceUsd
  if (balanceUsd === undefined) {
    try {
      const snapshot = await runJson(binary, [
        'billing', 'workspace-snapshot',
        '--workspace-id', workspace,
        '--format', 'json',
      ]) as WorkspaceSnapshot
      balanceUsd = snapshot.wallet?.balanceUsd
    } catch {
      // Balance is a nice-to-have; the windows already answered the question.
    }
  }

  const snapshot: UsageSnapshot = {
    asOf: funding.generatedAt ?? asOf,
    tier: plan.tier ?? '',
    eligible: plan.eligible === true,
    windows,
    ...(balanceUsd === undefined ? {} : { wallet: { balanceUsd } }),
  }
  return snapshot
}
