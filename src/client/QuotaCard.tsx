/**
 * Quota surfaces: the two dual bars, the wallet line, and their degraded states.
 *
 * The bars render the host's reading verbatim. Nothing here recomputes a
 * percentage: the host derives it from the console's exact credit strings, so a
 * bar can never disagree with the console the user checks. A window the host
 * could not read is labelled, never drawn as 0 %.
 *
 * @module dsh-opendesign-go/client/QuotaCard
 */
import type { ReactElement } from 'react'
import { creditsToNumber, windowLabel } from '../usage-contract.ts'
import type { QuotaWindow, UsageSnapshot } from '../usage-contract.ts'

// Remaining-percentage thresholds. 25% left is the point a user should start
// caring; 5% is the point it will run out mid-task.
const WARN_AT = 25
const STOP_AT = 5

/**
 * Colour for one remaining percentage.
 *
 * Expressed in remaining terms so it matches the bar it paints: a bar that is
 * nearly empty is the alarming state, and colouring by consumed share would
 * turn a 95%-used window into full-length red — visually loud while the number
 * beside it said 5%.
 * @param remaining - 0–100.
 * @returns the fill colour.
 */
export function barColor(remaining: number): string {
  if (remaining <= STOP_AT) return '#e5484d'
  if (remaining <= WARN_AT) return '#e5a00d'
  return '#3b82f6'
}

/**
 * Format a reset time as a coarse countdown, which is what a quota bar needs.
 * @param resetsAt - ISO timestamp from the console.
 * @param now - reference instant.
 * @returns text such as `4 小时 49 分后重置`.
 */
export function resetCountdown(resetsAt: string, now: number = Date.now()): string {
  const target = Date.parse(resetsAt)
  if (!Number.isFinite(target)) return '重置时间未知'
  const delta = target - now
  if (delta <= 0) return '即将重置'
  const minutes = Math.floor(delta / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (days > 0) return `${days}天 ${hours}小时后重置`
  if (hours > 0) return `${hours}小时 ${rest}分后重置`
  return `${rest}分钟后重置`
}

/** One dual-bar row: label, countdown, bar, percentage, dollar value. */
function WindowRow({ window, creditsPerUsd }: {
  readonly window: QuotaWindow
  readonly creditsPerUsd?: number | undefined
}): ReactElement {
  const used = window.percentUsed
  // Remaining, not consumed: the OpenDesign dashboard reports "剩余 88%" and a
  // bar that fills as quota is left, so showing consumed share here would mean
  // two surfaces quoting the same data as opposite numbers.
  const remaining = used === null ? null : Math.max(0, 100 - used)
  const label = windowLabel(window.durationSeconds)
  // Credits are the service's unit and mean nothing to a user; the dollar
  // figure is what makes the bar legible, so it is shown beside it.
  const dollars = (credits: string): string | undefined => {
    if (creditsPerUsd === undefined || creditsPerUsd <= 0) return undefined
    const used = creditsToNumber(credits)
    if (used === null) return undefined
    return `$${(used / creditsPerUsd).toFixed(2)}`
  }
  const usedUsd = dollars(window.usedCredits)
  const limitUsd = dollars(window.limitCredits)
  // Remaining money, to match the percentage and the bar above it.
  const remainingUsd = ((): string | undefined => {
    if (creditsPerUsd === undefined || creditsPerUsd <= 0) return undefined
    const left = creditsToNumber(window.remainingCredits)
    if (left === null) return undefined
    return `$${(left / creditsPerUsd).toFixed(2)}`
  })()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{label}额度</span>
        <span style={{ fontSize: '12px', opacity: 0.6 }}>{resetCountdown(window.resetsAt)}</span>
      </div>
      {remaining === null ? (
        <div style={{ fontSize: '12px', opacity: 0.6 }}>
          此窗口未返回可用限额（已用 {window.usedCredits} / 限额 {window.limitCredits}）
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            role="progressbar"
            aria-valuenow={remaining}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}额度剩余百分比`}
            style={{
              flex: 1,
              height: '8px',
              borderRadius: '999px',
              background: 'rgba(128, 128, 128, 0.22)',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: `${remaining}%`, height: '100%', borderRadius: '999px', background: barColor(remaining) }} />
          </div>
          <span style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums', minWidth: '36px', textAlign: 'right' }}>
            剩余 {remaining}%
          </span>
        </div>
      )}
      {remainingUsd !== undefined && limitUsd !== undefined && (
        <div style={{ fontSize: '11px', opacity: 0.55, fontVariantNumeric: 'tabular-nums' }}>
          剩余 {remainingUsd} / {limitUsd}
          {usedUsd !== undefined && <span style={{ opacity: 0.75 }}>{`（已用 ${usedUsd}）`}</span>}
        </div>
      )}
    </div>
  )
}

/**
 * Render the quota block.
 *
 * Three states are distinguishable on purpose: not configured (the user has to
 * store a session), failed (the console refused this read), and a real reading.
 * Collapsing them would make "no data" look like "no usage".
 * @param props - the host reading, or undefined while it is being fetched.
 * @returns the quota card.
 */
export function QuotaCard({ snapshot, loading, ledgerCostUsd }: {
  readonly snapshot: UsageSnapshot | undefined
  readonly loading: boolean
  /** What this plugin measured for the same traffic, priced at vendor rates. */
  readonly ledgerCostUsd?: number | undefined
}): ReactElement {
  const card = {
    border: '1px solid rgba(128, 128, 128, 0.25)',
    borderRadius: '10px',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  } as const
  const hint = { fontSize: '13px', opacity: 0.65, margin: 0 } as const

  if (loading && snapshot === undefined) {
    return <div style={card}><p style={hint}>正在读取额度…</p></div>
  }

  if (snapshot === undefined) {
    return (
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>订阅额度</div>
        <p style={hint}>
          尚未读取。勾选下方「使用本机 OpenDesign 的登录凭证」后即可显示真实的 5 小时 / 7 天额度。
        </p>
      </div>
    )
  }

  if (snapshot.error !== undefined && snapshot.windows.length === 0) {
    return (
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>订阅额度</div>
        <p style={hint}>读取失败：{snapshot.error}</p>
      </div>
    )
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>订阅额度</div>
        <span style={{ fontSize: '11px', opacity: 0.5 }}>读取于 {new Date(snapshot.asOf).toLocaleTimeString()}</span>
      </div>
      {snapshot.windows.map((window) => (
        <WindowRow key={window.durationSeconds} window={window} creditsPerUsd={snapshot.creditsPerUsd} />
      ))}
      {snapshot.wallet !== undefined && (
        <div style={{ fontSize: '12px', opacity: 0.65, borderTop: '1px solid rgba(128,128,128,0.18)', paddingTop: '10px' }}>
          钱包余额 ${snapshot.wallet.balanceUsd}
          {snapshot.wallet.subscriptionPeriodEnd === undefined
            ? ' · 额度用尽后按量付费'
            : ` · 周期至 ${new Date(snapshot.wallet.subscriptionPeriodEnd).toLocaleDateString()}`}
          {' · 并发 10（按 2026-10-19 官方口径）'}
        </div>
      )}
      <PlanSpendComparison snapshot={snapshot} ledgerCostUsd={ledgerCostUsd} />
      {snapshot.error !== undefined && (
        <p style={{ ...hint, fontSize: '12px' }}>部分数据缺失：{snapshot.error}</p>
      )}
    </div>
  )
}

/**
 * Reconcile plan credits against this plugin's own measurement.
 *
 * The two numbers answer different questions and are expected to differ:
 *
 * - Plan credits are what OpenDesign deducted, converted at the published
 *   10000-credits-per-dollar rate. That is the authoritative figure.
 * - The ledger is what the same tokens would cost at each vendor's list price,
 *   computed from `usage` fields on the responses this plugin actually served.
 *
 * They diverge for real reasons — the plan meters cached input differently from
 * vendor list prices, and it only counts traffic that went through this plugin,
 * not the official client. Printing them side by side with the ratio is the
 * point: if the ratio drifts far from 1, the plan's accounting is not what the
 * vendor prices imply, and the user can see that rather than trusting a single
 * silent number.
 * @param props - the quota snapshot and the measured cost.
 * @returns the comparison block, or nothing when either side is unavailable.
 */
function PlanSpendComparison({ snapshot, ledgerCostUsd }: {
  readonly snapshot: UsageSnapshot
  readonly ledgerCostUsd?: number | undefined
}): ReactElement | undefined {
  const rate = snapshot.creditsPerUsd
  if (rate === undefined || rate <= 0) return undefined
  // The 7-day window is the widest and matches the 30-day report closely enough
  // to compare; the 5-hour window would be a subset and understate the plan side.
  const weekly = snapshot.windows.reduce<QuotaWindow | undefined>(
    (widest, window) => (widest === undefined || window.durationSeconds > widest.durationSeconds ? window : widest),
    undefined,
  )
  if (weekly === undefined) return undefined
  const planUsd = creditsToNumber(weekly.usedCredits)
  if (planUsd === null) return undefined
  const planSpent = planUsd / rate
  const measured = ledgerCostUsd
  const ratio = measured === undefined || measured <= 0 ? undefined : planSpent / measured

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
      fontSize: '11px',
      opacity: 0.6,
      fontVariantNumeric: 'tabular-nums',
      borderTop: '1px solid rgba(128,128,128,0.18)',
      paddingTop: '10px',
    }}>
      <div>
        本周期已扣 {planSpent.toFixed(2)} 美元（按 {rate} credits = $1 折算）
      </div>
      {measured !== undefined && (
        <div>
          其中经本插件 {measured.toFixed(4)} 美元（按厂商单价估算
          {ratio !== undefined && <span>{`，相差 ${ratio.toFixed(1)} 倍`}</span>}）
        </div>
      )}
      {measured !== undefined && ratio !== undefined && ratio >= 10 && (
        <div style={{ opacity: 0.85 }}>
          差额通常来自套餐对缓存输入与官方客户端的计量口径，不代表单价错误。
        </div>
      )}
    </div>
  )
}
