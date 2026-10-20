/**
 * Reconciliation surface: advertised plan allowance, window spend, alignment,
 * and the vendor-priced cost kept visibly apart from the plan's own metering.
 *
 * The card exists because two numbers that look alike are not alike. Plan
 * credits are what OpenDesign deducted; the measured figure is what the same
 * traffic would cost at vendor list prices. Printing a single number would hide
 * the gap, and the gap is the only evidence a user has that the plan's
 * accounting changed.
 *
 * @module dsh-opendesign-go/client/BillingCard
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { PlanSpec } from '../plans.ts'
import { creditsToNumber } from '../usage-contract.ts'
import type { QuotaWindow, UsageSnapshot } from '../usage-contract.ts'
import { resetCountdown, windowLabel } from './usage-format.ts'

/**
 * Length of the allowance window a monthly figure is comparable to.
 *
 * Anything shorter cannot stand in for a month: the 5-hour window is a subset
 * of this one, so pricing a monthly cap from it would understate the month.
 */
const MONTHLY_WINDOW_SECONDS = 7 * 86400

/** Props of the reconciliation card. */
export interface BillingCardProps {
  readonly snapshot: UsageSnapshot | undefined
  /** 套餐档位，来自 snapshot.tier */
  readonly plan: PlanSpec | undefined
  /** 插件实测累计成本，美元；undefined 表示尚无数据 */
  readonly measuredUsd: number | undefined
  /** 对齐基准，undefined 表示未对齐 */
  readonly baseline: { at: number, credits: number, measuredUsd: number } | undefined
  /** 点击「对齐当前周期」 */
  readonly onAlign: (() => void) | undefined
  /** 是否可操作 */
  readonly editable: boolean
}

/**
 * Convert a credits string into dollars at the rate the service reports.
 *
 * Credits are the service's unit and mean nothing to a user; a missing or
 * nonsensical rate must yield "unknown" rather than a number, because printing
 * `$0.00` would claim the plan spent nothing when in fact nothing was priced.
 * @param credits - decimal credits string as the console reports it.
 * @param creditsPerUsd - credits per US dollar, or undefined when unreported.
 * @returns the dollar amount, or undefined when it cannot be priced.
 */
export function spentFromCredits(credits: string, creditsPerUsd: number | undefined): number | undefined {
  if (creditsPerUsd === undefined || !Number.isFinite(creditsPerUsd) || creditsPerUsd <= 0) return undefined
  const value = creditsToNumber(credits)
  if (value === null) return undefined
  return value / creditsPerUsd
}

/** Money with two decimals, or a dash when the figure could not be priced. */
function usd(value: number | undefined): string {
  return value === undefined ? '—' : `$${value.toFixed(2)}`
}

/** Widest window: the only one whose usage is not a subset of another's. */
function widestWindow(windows: readonly QuotaWindow[]): QuotaWindow | undefined {
  return windows.reduce<QuotaWindow | undefined>(
    (best, window) => (best === undefined || window.durationSeconds > best.durationSeconds ? window : best),
    undefined,
  )
}

/** `M月D日 HH:mm` in the reader's local zone, the shape the contract asks for. */
function alignedAtText(at: number): string {
  const date = new Date(at)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}月${day}日 ${hour}:${minute}`
}

/**
 * One window as a single row: remaining percentage plus remaining money.
 *
 * Remaining, not consumed, to match the console's own wording: a user reading
 * "剩余 88%" beside this row must not see a different pair of numbers.
 * @param props - the window and the credits-per-dollar rate in effect.
 * @returns the row.
 */
function WindowRow({ window, creditsPerUsd }: {
  readonly window: QuotaWindow
  readonly creditsPerUsd: number | undefined
}): ReactElement {
  const remaining = window.percentUsed === null ? null : Math.max(0, 100 - window.percentUsed)
  const remainingUsd = spentFromCredits(window.remainingCredits, creditsPerUsd)
  const limitUsd = spentFromCredits(window.limitCredits, creditsPerUsd)
  const label = windowLabel(window.durationSeconds)
  // The credits themselves are the fallback: they are what the console said,
  // so a window without a rate still shows something authoritative.
  const money = remainingUsd !== undefined && limitUsd !== undefined
    ? `剩余 ${usd(remainingUsd)} / ${usd(limitUsd)}`
    : `剩余 ${window.remainingCredits} / ${window.limitCredits} credits`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{label}额度</span>
        <span style={{ fontSize: '11px', opacity: 0.55 }}>{resetCountdown(window.resetsAt)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
        <span>{remaining === null ? '剩余 —' : `剩余 ${remaining}%`}</span>
        <span style={{ opacity: 0.7 }}>{money}</span>
      </div>
    </div>
  )
}

/**
 * Render the reconciliation card.
 *
 * Block order is fixed — monthly allowance, windows, alignment, equivalent API
 * cost — because the first three narrow from "what was sold" to "what this
 * plugin spent", and the last one is a caveated aside that must stay below the
 * numbers it qualifies.
 * @param props - snapshot, plan, measured cost, alignment baseline and controls.
 * @returns the billing card.
 */
export function BillingCard({ snapshot, plan, measuredUsd, baseline, onAlign, editable }: BillingCardProps): ReactElement {
  // Collapsed by default: the vendor-priced figure is a reference, and leading
  // with it would invite reading it as the bill.
  const [costOpen, setCostOpen] = useState(false)

  const card = {
    border: '1px solid rgba(128, 128, 128, 0.25)',
    borderRadius: '10px',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as const
  const hint = { fontSize: '12px', opacity: 0.6, margin: 0 } as const
  const divider = { borderTop: '1px solid rgba(128,128,128,0.18)', paddingTop: '10px' } as const

  if (snapshot === undefined) {
    return (
      <div style={card}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>套餐对账</div>
        <p style={hint}>尚未读取额度，无法对账。</p>
      </div>
    )
  }

  const widest = widestWindow(snapshot.windows)
  const monthly = widest !== undefined && widest.durationSeconds >= MONTHLY_WINDOW_SECONDS ? widest : undefined
  // Only the widest window is priced: summing windows would charge the same
  // tokens twice, since the short window's usage is contained in the long one.
  const monthlySpent = monthly === undefined ? undefined : spentFromCredits(monthly.usedCredits, snapshot.creditsPerUsd)
  const percent = monthlySpent === undefined || plan === undefined || plan.monthlyCapUsd <= 0
    ? undefined
    : Math.round((monthlySpent / plan.monthlyCapUsd) * 100)

  return (
    <div style={card}>
      {plan !== undefined && monthly !== undefined && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            月总额度 {usd(monthlySpent)} / {usd(plan.monthlyCapUsd)}
            {percent !== undefined && `（${percent}%）`}
          </div>
          <div style={{ fontSize: '11px', opacity: 0.55 }}>
            月总额度是官方宣传值，实际约束是下方窗口
          </div>
        </div>
      )}

      {snapshot.windows.map((window) => (
        <WindowRow key={window.durationSeconds} window={window} creditsPerUsd={snapshot.creditsPerUsd} />
      ))}

      <div style={{ ...divider, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {baseline === undefined ? (
          <button
            type="button"
            // Disabled rather than hidden: an unavailable control still tells the
            // user the feature exists and is gated, which a missing button cannot.
            disabled={onAlign === undefined || !editable}
            onClick={onAlign === undefined ? undefined : () => onAlign()}
            style={{
              alignSelf: 'flex-start',
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(128, 128, 128, 0.35)',
              background: 'transparent',
              color: 'inherit',
              fontSize: '12px',
              cursor: onAlign === undefined || !editable ? 'not-allowed' : 'pointer',
              opacity: onAlign === undefined || !editable ? 0.5 : 1,
            }}
          >
            对齐当前周期
          </button>
        ) : (
          <AlignmentSummary baseline={baseline} monthly={monthly} snapshot={snapshot} measuredUsd={measuredUsd} />
        )}
      </div>

      <div style={divider}>
        <button
          type="button"
          onClick={() => setCostOpen((open) => !open)}
          aria-expanded={costOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            width: '100%',
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            fontSize: '12px',
            opacity: 0.75,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span>{costOpen ? '▾' : '▸'}</span>
          <span>等价 API 成本（仅供参考）</span>
        </button>
        {costOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
            <div style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
              实测 {measuredUsd === undefined ? '暂无数据' : `$${measuredUsd.toFixed(4)}`}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.6, lineHeight: 1.5 }}>
              按各厂商公开单价估算；套餐按 credits 计费且缓存输入占比不同，此值仅供参考，不代表账单。
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * What changed since the baseline: plan credits and measured cost, both as
 * increments rather than totals, because a baseline that was not subtracted
 * would make "对齐" mean nothing.
 * @param props - baseline, the widest window, snapshot rate and measured total.
 * @returns the aligned summary rows.
 */
function AlignmentSummary({ baseline, monthly, snapshot, measuredUsd }: {
  readonly baseline: { at: number, credits: number, measuredUsd: number }
  readonly monthly: QuotaWindow | undefined
  readonly snapshot: UsageSnapshot
  readonly measuredUsd: number | undefined
}): ReactElement {
  const usedNow = monthly === undefined ? null : creditsToNumber(monthly.usedCredits)
  const rate = snapshot.creditsPerUsd
  const planUsd = usedNow === null || rate === undefined || rate <= 0
    ? undefined
    : Math.max(0, (usedNow - baseline.credits) / rate)
  const measuredDelta = measuredUsd === undefined ? undefined : Math.max(0, measuredUsd - baseline.measuredUsd)
  // A ratio needs two positive sides; anything else would render 0.0 or Infinity
  // and read as a finding when it is only missing data.
  const ratio = planUsd !== undefined && planUsd > 0 && measuredDelta !== undefined && measuredDelta > 0
    ? planUsd / measuredDelta
    : undefined
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ opacity: 0.7 }}>自 {alignedAtText(baseline.at)} 起的增量</div>
      <div>
        套餐 {usd(planUsd)} · 实测 {usd(measuredDelta)}
        {ratio !== undefined && <span style={{ opacity: 0.7 }}>{` · 比值 ${ratio.toFixed(1)}`}</span>}
      </div>
    </div>
  )
}
