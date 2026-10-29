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
import { creditsToNumber } from '../usage-contract.ts'
import type { QuotaWindow, UsageSnapshot } from '../usage-contract.ts'
import { barColor, daysToExhaust, resetCountdown, windowLabel } from './usage-format.ts'
import { Badge, Bar, Button, Card } from './ui/primitives.tsx'
import styles from './QuotaCard.module.css'

// Re-exported so the format helpers stay reachable from the card that first
// published them; existing importers must not need a path change for a move.
export { barColor, resetCountdown } from './usage-format.ts'

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
  const exhaust = daysToExhaust(window)
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
    <div className={styles.window}>
      <div className={styles.windowHead}>
        <span className={styles.windowName}>{label}额度</span>
        <span className={styles.windowMeta}>{resetCountdown(window.resetsAt)}</span>
      </div>
      {remaining === null ? (
        <p className={styles.missing}>
          此窗口未返回可用限额（已用 {window.usedCredits} / 限额 {window.limitCredits}）
        </p>
      ) : (
        <>
          <div className={styles.barLine}>
            <Bar percent={remaining} color={barColor(remaining)} label={`${label}额度剩余百分比`} />
            <span className={styles.windowPercent}>剩余 {remaining}%</span>
          </div>
          {remainingUsd !== undefined && limitUsd !== undefined && (
            <div className={styles.windowFoot}>
              <span>剩余 {remainingUsd} / {limitUsd}</span>
              {usedUsd !== undefined && <span>（已用 {usedUsd}）</span>}
              {exhaust !== undefined && (
                <span>· 照此速率约 {exhaust < 1 ? '不足 1' : exhaust.toFixed(1)} 天用完</span>
              )}
            </div>
          )}
        </>
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
export function QuotaCard({ snapshot, loading, ledgerCostUsd, onRefresh, refreshing }: {
  readonly snapshot: UsageSnapshot | undefined
  readonly loading: boolean
  /** What this plugin measured for the same traffic, priced at vendor rates. */
  readonly ledgerCostUsd?: number | undefined
  /** Request a reading now; omitted when the page cannot write configuration. */
  readonly onRefresh?: (() => void) | undefined
  /** True while a requested reading has not landed yet. */
  readonly refreshing?: boolean | undefined
}): ReactElement {
  if (loading && snapshot === undefined) {
    return (
      <Card title="订阅额度">
        <p className={styles.missing}>正在读取额度…</p>
      </Card>
    )
  }

  if (snapshot === undefined) {
    return (
      <Card title="订阅额度" description="勾选下方「使用本机 OpenDesign 的登录凭证」后即可显示真实的 5 小时 / 7 天额度。">
        <p className={styles.missing}>尚未读取。</p>
      </Card>
    )
  }

  if (snapshot.error !== undefined && snapshot.windows.length === 0) {
    return (
      <Card title="订阅额度" badge={<Badge tone="stop">读取失败</Badge>}>
        <p className={styles.missing}>{snapshot.error}</p>
      </Card>
    )
  }

  const period = snapshot.wallet === undefined
    ? ''
    : snapshot.wallet.subscriptionPeriodEnd === undefined
      ? ' · 额度用尽后按量付费'
      : ` · 周期至 ${new Date(snapshot.wallet.subscriptionPeriodEnd).toLocaleDateString()}`

  return (
    <Card
      title="订阅额度"
      description={snapshot.error === undefined ? undefined : `部分数据缺失：${snapshot.error}`}
      actions={(
        <span className={styles.actions}>
          <span className={styles.stamp}>读取于 {new Date(snapshot.asOf).toLocaleTimeString()}</span>
          {onRefresh !== undefined && (
            <Button
              onClick={onRefresh}
              disabled={refreshing === true}
              // A read spawns the CLI twice and takes about two seconds, so the
              // button reports the wait rather than looking unresponsive.
              title="立即读取一次额度（约需 2 秒）"
            >
              {refreshing === true ? '读取中…' : '刷新'}
            </Button>
          )}
        </span>
      )}
    >
      <div className={styles.body}>
        {snapshot.windows.map((window) => (
          <WindowRow key={window.durationSeconds} window={window} creditsPerUsd={snapshot.creditsPerUsd} />
        ))}
        {snapshot.wallet !== undefined && (
          <div className={styles.wallet}>
            <span>
              钱包余额 <span className={styles.walletValue}>${snapshot.wallet.balanceUsd}</span>
              {period}
            </span>
            <span className={styles.windowMeta}>并发 10（按 2026-10-19 官方口径）</span>
          </div>
        )}
        <PlanSpendComparison snapshot={snapshot} ledgerCostUsd={ledgerCostUsd} />
      </div>
    </Card>
  )
}

/**
 * State what the plan deducted, and how much of it this plugin observed.
 *
 * No ratio is printed. The two quantities are not comparable by division: the
 * plan figure covers the whole window across every client, while the measured
 * figure covers only the requests this plugin served. Dividing them reports how
 * little traffic went through the plugin, not any difference in accounting — on
 * a fresh install it read "141.9x", which says nothing true about pricing.
 *
 * Stated as two independent facts, a reader can see that the plugin has served a
 * small share of the total and draw the right conclusion themselves.
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

  return (
    <div className={styles.spend}>
      <span>本周期已扣 {planSpent.toFixed(2)} 美元（按 {rate} credits = $1 折算）</span>
      {measured !== undefined && (
        <span>经本插件 {measured.toFixed(4)} 美元（按厂商单价估算，不含官方客户端与其他工具）</span>
      )}
    </div>
  )
}
