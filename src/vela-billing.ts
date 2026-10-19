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
 * Whether a configured value can be a workspace id.
 *
 * The field is free text and has held things like `test`, so an obviously wrong
 * value must not shadow discovery: passing it to the CLI guarantees a failure
 * that looks like a login problem. Real ids are 24 lowercase alphanumerics.
 * @param value - candidate from configuration.
 * @returns true when it is plausible enough to try.
 */
function looksLikeWorkspaceId(value: string | undefined): value is string {
  return value !== undefined && /^[a-z0-9]{16,32}$/.test(value.trim())
}

/**
 * Resolve the workspace this login belongs to.
 *
 * `funding-check` requires a workspace id, and the user has no obvious place to
 * find one: the OpenDesign console presents no "workspace" concept in its
 * navigation at all. So it is discovered instead. `team-projects list` answers
 * the *current* workspace without being told which one, which makes it the only
 * command that exposes the id — `billing summary` does not carry it.
 * @param binary - absolute path to the executable.
 * @param explicit - a workspace id from configuration, when present.
 * @returns the id, or undefined when the CLI could not report one.
 */
export async function resolveWorkspaceId(binary: string, explicit: string | undefined): Promise<string | undefined> {
  if (looksLikeWorkspaceId(explicit)) return explicit.trim()
  try {
    const raw = await runJson(binary, ['team-projects', 'list'])
    const workspace = (raw as { workspaceId?: unknown }).workspaceId
    if (typeof workspace === 'string' && workspace.length > 0) return workspace
  } catch {
    // Fall through: without an id there is nothing to read.
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
    // Say what was actually tried: "check your settings" sends the user looking
    // for a field the console does not even expose.
    return empty(
      '未能从 vela 取得工作空间 ID。请确认已在 OpenDesign 桌面端登录；'
      + '也可在下方手动填写工作空间 ID 覆盖自动探测。',
    )
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
  // the plan allowance is spent, so both are surfaced. The same call yields the
  // credits-to-dollar rate, which is what makes the window numbers legible.
  let balanceUsd = funding.balanceUsd
  let creditsPerUsd: number | undefined
  try {
    const summary = await runJson(binary, ['billing', 'summary', '--format', 'json']) as {
      creditsPerUsd?: unknown
      balanceUsd?: unknown
    }
    if (typeof summary.creditsPerUsd === 'number' && summary.creditsPerUsd > 0) {
      creditsPerUsd = summary.creditsPerUsd
    }
    if (balanceUsd === undefined && typeof summary.balanceUsd === 'string') {
      balanceUsd = summary.balanceUsd
    }
  } catch {
    // Both are nice-to-haves; the windows already answered the question.
  }
  if (balanceUsd === undefined) {
    try {
      const snapshot = await runJson(binary, [
        'billing', 'workspace-snapshot',
        '--workspace-id', workspace,
        '--format', 'json',
      ]) as WorkspaceSnapshot
      balanceUsd = snapshot.wallet?.balanceUsd
    } catch {
      // Same: the windows stand on their own.
    }
  }

  const snapshot: UsageSnapshot = {
    asOf: funding.generatedAt ?? asOf,
    tier: plan.tier ?? '',
    eligible: plan.eligible === true,
    windows,
    ...(balanceUsd === undefined ? {} : { wallet: { balanceUsd } }),
    ...(creditsPerUsd === undefined ? {} : { creditsPerUsd }),
  }
  return snapshot
}
