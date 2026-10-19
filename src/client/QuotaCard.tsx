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

/** Bar colour thresholds: warn near the limit, stop at it. */
const WARN_AT = 75
const STOP_AT = 95

/**
 * Colour for one consumed percentage.
 * @param percent - 0–100.
 * @returns the fill colour.
 */
function barColor(percent: number): string {
  if (percent >= STOP_AT) return '#e5484d'
  if (percent >= WARN_AT) return '#e5a00d'
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
  const percent = window.percentUsed
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{label}额度</span>
        <span style={{ fontSize: '12px', opacity: 0.6 }}>{resetCountdown(window.resetsAt)}</span>
      </div>
      {percent === null ? (
        <div style={{ fontSize: '12px', opacity: 0.6 }}>
          此窗口未返回可用限额（已用 {window.usedCredits} / 限额 {window.limitCredits}）
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}额度已用百分比`}
            style={{
              flex: 1,
              height: '8px',
              borderRadius: '999px',
              background: 'rgba(128, 128, 128, 0.22)',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: `${percent}%`, height: '100%', borderRadius: '999px', background: barColor(percent) }} />
          </div>
          <span style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums', minWidth: '36px', textAlign: 'right' }}>
            {percent}%
          </span>
        </div>
      )}
      {usedUsd !== undefined && limitUsd !== undefined && (
        <div style={{ fontSize: '11px', opacity: 0.55, fontVariantNumeric: 'tabular-nums' }}>
          已用 {usedUsd} / {limitUsd}
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
export function QuotaCard({ snapshot, loading }: {
  readonly snapshot: UsageSnapshot | undefined
  readonly loading: boolean
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
          未配置控制台会话凭据，因此无法显示真实额度。额度接口不以 API Key 鉴权，需要一份控制台会话凭据才能读取。
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
      {snapshot.error !== undefined && (
        <p style={{ ...hint, fontSize: '12px' }}>部分数据缺失：{snapshot.error}</p>
      )}
    </div>
  )
}
