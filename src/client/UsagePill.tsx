/**
 * The composer quota pill: `● 5h 62% · 7d 88%`, expanded into a panel.
 *
 * Why it exists: the settings page already answers "how much is left", but only
 * once the user opens it. Quota is consumed by the same composer this pill sits
 * in, so the number that explains a stopped request has to be visible from
 * there — one glance, no navigation.
 *
 * Data path: the host publishes each quota reading into the config document
 * (`usageJson`) and the form this pill already subscribes to, so there is no
 * second transport, no `remote` call, and no polling here. A reading arrives
 * when the host's own watcher produces one.
 *
 * Polarity: remaining, not consumed. The settings card and the OpenDesign
 * dashboard both report `剩余 88%`; quoting the consumed share here would show
 * the same reading as the opposite number.
 *
 * @module dsh-opendesign-go/client/UsagePill
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DISPLAY_NAME, PROVIDER_ID } from '../config-contract.ts'
import type { OpenDesignConfig } from '../config-contract.ts'
import { creditsToNumber, parseUsage } from '../usage-contract.ts'
import type { QuotaWindow, UsageSnapshot } from '../usage-contract.ts'
import { barColor, compactWindowLabel, resetCountdown, windowLabel } from './usage-format.ts'
import { Bar, Button, cx } from './ui/primitives.tsx'
import tokens from './ui/tokens.module.css'
import styles from './UsagePill.module.css'

/** Props injected into the pill by the registering plugin. */
export interface ComposerUsageInjected {
  /** Live config form; its `usageJson` is where the reading arrives. */
  readonly form: ConfigForm<OpenDesignConfig>
  /**
   * The session's shared model directory. The pill is the quota of *this*
   * provider, so it belongs to a session only while this provider's model is
   * the one selected — every other model's request spends someone else's quota.
   */
  readonly directory: ObservableSnapshot<ModelDirectoryState>
}

/**
 * Whether the pill speaks for the session's current selection.
 *
 * A session that has not selected anything yet shows no pill rather than a
 * number that may describe a different provider's quota; the seat then still
 * carries the default, and the pill appears as soon as this provider's model
 * is selected.
 * @param directory - the session's shared model directory state.
 * @returns true when the selected provider is this plugin's.
 */
export function ownedByThisProvider(directory: ModelDirectoryState): boolean {
  return directory.current?.provider === PROVIDER_ID
}

/** One quota window as the pill presents it. */
export interface PillWindow {
  /** Window length from the console, used for both labels. */
  readonly durationSeconds: number
  /** Percent still available, clamped to 0..100 and rounded. */
  readonly remaining: number
  /** The console window this row came from, for credits and reset time. */
  readonly window: QuotaWindow
}

/**
 * Select the windows the pill can describe.
 *
 * A window whose console reading carried no percentage is dropped rather than
 * rendered as 0%: "no limit reported" and "nothing left" are different facts,
 * and the pill is too small to explain the difference.
 * @param usage - parsed quota snapshot, or `undefined` when nothing is cached.
 * @returns one entry per describable window, in console order.
 */
export function pillWindows(usage: UsageSnapshot | undefined): PillWindow[] {
  if (usage === undefined) return []
  const windows: PillWindow[] = []
  for (const window of usage.windows) {
    if (window.status !== 'ok' || window.percentUsed === null) continue
    const remaining = Math.max(0, Math.min(100, Math.round(100 - window.percentUsed)))
    windows.push({ durationSeconds: window.durationSeconds, remaining, window })
  }
  return windows
}

/**
 * One-line label for the collapsed pill.
 * @param windows - rows from {@link pillWindows}.
 * @returns text such as `5h 62% · 7d 88%`, or an empty string with no rows.
 */
export function pillLabel(windows: readonly PillWindow[]): string {
  return windows
    .map((row) => `${compactWindowLabel(row.durationSeconds)} ${row.remaining}%`)
    .join(' · ')
}

/**
 * The worst remaining percentage among the windows.
 *
 * The dot takes this colour because a user with 90% short-window quota and 4%
 * weekly quota is nearly out, and averaging would hide that.
 * @param windows - rows from {@link pillWindows}.
 * @returns the smallest `remaining`, or 100 with no rows.
 */
export function worstRemaining(windows: readonly PillWindow[]): number {
  if (windows.length === 0) return 100
  return windows.reduce((worst, row) => (row.remaining < worst ? row.remaining : worst), 100)
}

/**
 * Money for a credits figure, when the snapshot knows the exchange rate.
 *
 * Credits are the service's unit and mean nothing to a user, so a figure that
 * cannot be converted is omitted rather than shown raw.
 * @param credits - credits string from the console.
 * @param creditsPerUsd - conversion rate, when the snapshot carries one.
 * @returns a dollar string such as `$12.34`, or `undefined`.
 */
function money(credits: string, creditsPerUsd: number | undefined): string | undefined {
  if (creditsPerUsd === undefined || creditsPerUsd <= 0) return undefined
  const count = creditsToNumber(credits)
  if (count === null) return undefined
  return `$${(count / creditsPerUsd).toFixed(2)}`
}

/** Render the collapsed pill and, when open, its panel. */
export function ComposerUsagePill({ form, directory }: ComposerUsageInjected): ReactElement | null {
  const selection = useSyncExternalStore(
    (listener) => directory.subscribe(listener),
    () => directory.getSnapshot(),
    () => directory.getSnapshot(),
  )
  const snapshot = useSyncExternalStore(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot(),
    // Same reader for the server snapshot: the pill only needs the current
    // value, and supplying it keeps the component renderable outside a browser
    // (tests, and any future server-side shell).
    () => form.getSnapshot(),
  )
  const value = snapshot.value
  const usage = useMemo(() => parseUsage(value?.usageJson), [value?.usageJson])
  const windows = useMemo(() => pillWindows(usage), [usage])
  const visible = ownedByThisProvider(selection)
    && (value?.enabled ?? true)
    && (value?.composerUsage ?? true)
    && windows.length > 0

  const [open, setOpen] = useState(false)
  const [refreshingSince, setRefreshingSince] = useState<number | undefined>(undefined)
  const root = useRef<HTMLDivElement | null>(null)
  const pill = useRef<HTMLButtonElement | null>(null)

  /** Ask the host for a reading now: writing the nonce is both request and transport. */
  const refresh = (): void => {
    const at = Date.now()
    setRefreshingSince(at)
    void form.mutate([{ op: 'set', path: ['refreshNonce'], value: String(at) }]).catch((error: unknown) => {
      setRefreshingSince(undefined)
      console.error('llm-opendesign-go: could not request a quota refresh', error)
    })
  }

  const usageAt = usage === undefined ? undefined : Date.parse(usage.asOf)
  const refreshing = refreshingSince !== undefined && (usageAt === undefined || usageAt < refreshingSince)

  useEffect(() => {
    // A read that never lands would leave the button stuck; the wait is bounded
    // because the request is one CLI call, not a state to hold indefinitely.
    if (!refreshing) return undefined
    const timer = setTimeout(() => { setRefreshingSince(undefined) }, 15_000)
    return () => { clearTimeout(timer) }
  }, [refreshing])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (root.current?.contains(target) === true) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setOpen(false)
      pill.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Hidden after the hooks so the hook order stays stable across renders: the
  // pill appears and disappears as readings and settings change.
  if (!visible) return null

  const worst = worstRemaining(windows)
  const stale = usage?.error !== undefined
  // The console quotes the wallet as a string; a non-numeric one is dropped
  // rather than rendered as `NaN`.
  const balance = usage?.wallet?.balanceUsd
  const walletBalance = balance !== undefined && Number.isFinite(Number(balance))
    ? Number(balance).toFixed(2)
    : undefined

  return (
    <div className={cx(tokens.scope, styles.root)} ref={root}>
      <button
        type="button"
        ref={pill}
        className={styles.pill}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`${DISPLAY_NAME} 额度`}
        onClick={() => { setOpen((was) => !was) }}
      >
        <span className={styles.dot} style={{ background: barColor(worst) }} aria-hidden="true" />
        <span className={styles.text}>{pillLabel(windows)}</span>
      </button>
      {open && usage !== undefined && (
        <div className={styles.panel} role="dialog" aria-label={`${DISPLAY_NAME} 额度`}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>{DISPLAY_NAME} 额度</span>
            <span className={styles.panelStamp}>更新于 {new Date(usage.asOf).toLocaleTimeString()}</span>
          </div>
          <div className={styles.rows}>
            {windows.map((row) => {
              const left = money(row.window.remainingCredits, usage.creditsPerUsd)
              const limit = money(row.window.limitCredits, usage.creditsPerUsd)
              const name = windowLabel(row.durationSeconds)
              return (
                <div key={row.durationSeconds}>
                  <div className={styles.rowHead}>
                    <span className={styles.rowName}>{name}</span>
                    <span className={styles.rowValue}>剩余 {row.remaining}%</span>
                  </div>
                  <div className={styles.rowBar}>
                    <Bar percent={row.remaining} color={barColor(row.remaining)} label={`${name}额度剩余百分比`} />
                  </div>
                  <div className={styles.rowMeta}>
                    <span>{left !== undefined && limit !== undefined ? `剩余 ${left} / ${limit}` : ''}</span>
                    <span>{resetCountdown(row.window.resetsAt)}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {walletBalance !== undefined && (
            <div className={styles.rowMeta}>
              <span>钱包余额</span>
              <span>${walletBalance}</span>
            </div>
          )}
          {stale && <div className={styles.notice}>上次读取失败，显示的是更早的读数</div>}
          <div className={styles.panelFoot}>
            <span className={styles.panelStamp}>每 5 分钟自动读取</span>
            <Button onClick={refresh} disabled={refreshing}>
              {refreshing ? '读取中…' : '刷新额度'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
