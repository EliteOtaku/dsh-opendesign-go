/**
 * The "OpenDesign Go" settings page body.
 *
 * M4a renders three things: the enable switch, the read-only model list the Go
 * plan grants, and the state of the settings document itself. Nothing here
 * guesses at quota or accounts — those need the console session channel and
 * land in M4b.
 *
 * Styling is inline on purpose: M4a avoids a CSS build pipeline so the client
 * bundle stays a single file. The page adopts the host's tokens when M4b adds
 * the quota surfaces.
 *
 * @module dsh-opendesign-go/client/Section
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { PROFILE_ENTRY_ID } from '../config-contract.ts'
import type { OpenDesignConfig } from '../config-contract.ts'
import type { UsageSnapshot } from '../usage-contract.ts'
import { parseReport, parseUsage } from '../usage-contract.ts'
import { parseRouteDiagnostics } from '../diagnostics.ts'
import { QuotaCard } from './QuotaCard.tsx'
import { BillingCard } from './BillingCard.tsx'
import { parseBaseline, parsePlanOverrides, planOf } from '../plans.ts'
import { parseUpdate } from '../update-check.ts'
import { UsageCard } from './UsageCard.tsx'
import { AccountsCard } from './AccountsCard.tsx'
import { ModelsCard } from './ModelsCard.tsx'
import type { ChannelState, ExecuteAccountCommand } from './accounts-controller.ts'

/** Props injected into the section by the registering plugin. */
export interface OpenDesignSectionInjected {
  /** Live config form bound to this plugin's profile entry. */
  readonly form: ConfigForm<OpenDesignConfig>
  /** Sends account mutations to the host, which owns credential storage. */
  readonly execute: ExecuteAccountCommand
  /** Reads which step the command channel reached, for diagnostics. */
  readonly channelState: ChannelState
}

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  padding: '4px 0 24px',
} as const

const titleStyle = { fontSize: '20px', fontWeight: 600, margin: 0 } as const

const hintStyle = { fontSize: '13px', opacity: 0.65, margin: 0 } as const

const cardStyle = {
  border: '1px solid rgba(128, 128, 128, 0.25)',
  borderRadius: '10px',
  padding: '14px 16px',
} as const

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
} as const

const listStyle = {
  listStyle: 'none',
  margin: '10px 0 0',
  padding: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '6px 18px',
  fontSize: '13px',
} as const

const buttonStyle = {
  fontSize: '12px',
  padding: '3px 10px',
  borderRadius: '6px',
  border: '1px solid rgba(128, 128, 128, 0.35)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
} as const

const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: '4px',
  padding: '6px 8px',
  fontSize: '12px',
  borderRadius: '6px',
  border: '1px solid rgba(128, 128, 128, 0.3)',
  background: 'transparent',
  color: 'inherit',
  boxSizing: 'border-box',
} as const

/**
 * Render the settings page.
 * @param props - injected config form and optional quota reader.
 * @returns the page body.
 */
export function OpenDesignSection({ form, execute, channelState }: OpenDesignSectionInjected): ReactElement {
  const snapshot = useSyncExternalStore(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot(),
  )
  const value = snapshot.value
  const enabled = value?.enabled ?? true
  const editable = snapshot.status === 'ready' && snapshot.writable
  const useVela = value?.useVelaCredential ?? false
  // The host publishes each quota reading into the config document, which this
  // page already receives; parsing it here needs no second transport and keeps
  // one source of truth.
  const usage = useMemo(() => parseUsage(value?.usageJson), [value?.usageJson])
  // Local accounting: produced by this plugin's own adapter, so it needs no
  // console session and is the primary usage surface.
  const report = useMemo(() => parseReport(value?.reportJson), [value?.reportJson])
  const routeState = useMemo(() => parseRouteDiagnostics(value?.diagnosticsJson), [value?.diagnosticsJson])
  // Plan row: the advertised allowance is a default, so an operator override
  // wins. `plan` stays undefined for a tier this build does not know, and the
  // billing card then omits that row rather than inventing a cap.
  const plan = useMemo(
    () => (usage === undefined ? undefined : planOf(usage.tier, parsePlanOverrides(value?.planOverrides))),
    [usage?.tier, value?.planOverrides],
  )
  const baseline = useMemo(() => parseBaseline(value?.alignBaselineJson), [value?.alignBaselineJson])
  // Published release newer than this build, filled by the startup check. Absent
  // means either up to date or the registry was unreachable; both read the same
  // way to a user, so no banner appears.
  const update = useMemo(() => parseUpdate(value?.updateJson), [value?.updateJson])

  /**
   * Ask the host for a reading now.
   *
   * The page has no direct line to the quota reader, but the host already watches
   * this configuration for changes, so writing a fresh nonce both expresses the
   * request and carries it. `refreshing` is cleared when the reading's timestamp
   * moves past the moment the button was pressed — not on the write resolving,
   * because the write succeeds long before the CLI answers.
   */
  const [refreshingSince, setRefreshingSince] = useState<number | undefined>(undefined)
  const refreshQuota = (): void => {
    const at = Date.now()
    setRefreshingSince(at)
    void form.mutate([{ op: 'set', path: ['refreshNonce'], value: String(at) }])
      .catch((error: unknown) => {
        setRefreshingSince(undefined)
        console.error('llm-opendesign-go: could not request a quota refresh', error)
      })
  }
  const usageAt = usage === undefined ? undefined : Date.parse(usage.asOf)
  const refreshing = refreshingSince !== undefined
    && (usageAt === undefined || usageAt < refreshingSince)
  useEffect(() => {
    // A read that never lands would leave the button stuck on "读取中…", so the
    // wait is bounded: the request is one CLI call, not a state to hold forever.
    if (!refreshing) return undefined
    const timer = setTimeout(() => { setRefreshingSince(undefined) }, 15_000)
    return () => { clearTimeout(timer) }
  }, [refreshing])

  /**
   * Record the current credits reading as the zero point.
   *
   * Plan credits accumulate over the window and include traffic this plugin
   * never saw, so only an increment measured from a shared instant is
   * comparable with the plugin's own total.
   */
  const align = (): void => {
    if (usage === undefined) return
    const widest = usage.windows.reduce<typeof usage.windows[number] | undefined>(
      (best, window) => (best === undefined || window.durationSeconds > best.durationSeconds ? window : best),
      undefined,
    )
    if (widest === undefined) return
    const credits = Number(widest.usedCredits)
    if (!Number.isFinite(credits)) return
    const payload = {
      at: Date.now(),
      credits,
      measuredUsd: report?.costUsd ?? 0,
    }
    void form.mutate([{ op: 'set', path: ['alignBaselineJson'], value: JSON.stringify(payload) }])
      .catch((error: unknown) => { console.error('llm-opendesign-go: could not save the baseline', error) })
  }

  /**
   * Flip the route switch. A refusal is surfaced instead of swallowed: the
   * Host validates the write, so silence would read as success.
   * @param next - the value the user selected.
   */
  const toggle = (next: boolean): void => {
    void form.set('enabled', next).catch((error: unknown) => {
      // The store owns the message; keep the page responsive and honest.
      console.error('llm-opendesign-go: could not save the enable switch', error)
    })
  }

  /**
   * Force the settings mirror to reload. The mirror is populated on its own
   * schedule; a page opened before the first describe lands would otherwise sit
   * on `loading` with no way out, so the user gets an explicit retry.
   */
  const retry = (): void => {
    form.getSnapshot()
    window.location.reload()
  }

  return (
    <div style={pageStyle}>
      <div>
        <h1 style={titleStyle}>OpenDesign Go</h1>
        <p style={{ ...hintStyle, marginTop: '6px' }}>
          选择会话中显示的 OpenDesign Go 模型，并调整其设置。
        </p>
      </div>

      {snapshot.status === 'loading' && (
        <div style={{ ...hintStyle, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>正在读取配置…</span>
          <button type="button" onClick={retry} style={buttonStyle}>重新加载</button>
        </div>
      )}
      {snapshot.status === 'unavailable' && (
        <div style={{ ...hintStyle, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span>宿主未暴露本插件的配置项（namespace: {PROFILE_ENTRY_ID}）。</span>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>
            诊断：{snapshot.status} / revision={String(snapshot.revision)} / writable={String(snapshot.writable)}
          </span>
          <button type="button" onClick={retry} style={buttonStyle}>重新加载</button>
        </div>
      )}

      <div style={cardStyle}>
        <div style={rowStyle}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>启用 OpenDesign Go</div>
            <p style={{ ...hintStyle, marginTop: '4px' }}>
              关闭后，本插件提供的模型会从会话选择器中移除。
            </p>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!editable}
            onChange={(event) => { toggle(event.target.checked) }}
            aria-label="启用 OpenDesign Go"
          />
        </div>
      </div>

      <AccountsCard form={form} config={value} editable={editable} execute={execute} channelState={channelState} />

      <UsageCard report={report} />

      <QuotaCard
        snapshot={usage}
        loading={false}
        ledgerCostUsd={report?.costUsd}
        onRefresh={editable ? refreshQuota : undefined}
        refreshing={refreshing}
      />

      <BillingCard
        snapshot={usage}
        plan={plan}
        measuredUsd={report?.costUsd}
        baseline={baseline}
        onAlign={usage === undefined ? undefined : align}
        editable={editable}
      />

      <div style={cardStyle}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>额度来源</div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '8px', cursor: editable ? 'pointer' : 'default' }}>
          <input
            type="checkbox"
            checked={useVela}
            disabled={!editable}
            onChange={(event) => { void form.set('useVelaCredential', event.target.checked) }}
            style={{ marginTop: '2px' }}
          />
          <span style={{ fontSize: '13px' }}>
            使用本机 OpenDesign 的登录凭证读取额度
            <span style={{ display: 'block', fontSize: '12px', opacity: 0.62, marginTop: '2px', lineHeight: 1.5 }}>
              如果你安装并登录过 OpenDesign 桌面端，勾选后即可直接读取真实的 5 小时 / 7 天额度，
              无需再填任何凭据。只想用 API Key 的话保持关闭即可。
            </span>
          </span>
        </label>
        {useVela && (
          <p style={{ ...hintStyle, marginTop: '8px', fontSize: '12px' }}>
            读取方式：调用 OpenDesign 桌面端自带的 vela 命令行。该命令属官方私有接口，
            若 OpenDesign 升级后格式变化，这里会显示失败原因而不是给出错误数字。
          </p>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>路由状态</div>
        {routeState === undefined ? (
          <p style={{ ...hintStyle, marginTop: '4px' }}>
            宿主尚未上报路由状态。重启后若仍为空，说明插件未完成激活。
          </p>
        ) : (
          <p style={{ ...hintStyle, marginTop: '4px', fontSize: '12px' }}>
            {routeState.registered ? '已注册' : '未注册'}
            {' · '}启用={String(routeState.enabled)}
            {' · '}凭据={routeState.credentialResolved ? '已解析' : '未解析'}（{routeState.triedRef || '无'}）
            {' · '}声明模型 {routeState.modelCount} 个
            {routeState.lastError !== undefined && ` · 失败：${routeState.lastError}`}
          </p>
        )}
      </div>

      <ModelsCard form={form} config={value} editable={editable} />

      {update !== undefined && (
        <div style={{
          // Deliberately not an error colour: a newer release is information, and
          // painting it red would suggest this build is broken.
          border: '1px solid rgba(77,107,254,0.45)',
          background: 'rgba(77,107,254,0.08)',
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
        }}>
          <div style={{ fontWeight: 500 }}>
            有新版本 {update.latest}（当前 {update.current}）
          </div>
          <div style={{ opacity: 0.7 }}>
            桌面端插件管理里卸载重装，或执行 dsh plugin --profile web add dsh-opendesign-go@latest
          </div>
        </div>
      )}

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        alignItems: 'center',
        fontSize: '12px',
        opacity: 0.7,
        borderTop: '1px solid rgba(128,128,128,0.18)',
        paddingTop: '12px',
      }}>
        <a
          href="https://github.com/EliteOtaku/dsh-opendesign-go"
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: 'inherit' }}
        >
          GitHub 仓库 · 欢迎 Star ★
        </a>
        <span style={{ opacity: 0.5 }}>|</span>
        <a
          href="https://github.com/EliteOtaku/dsh-opendesign-go#readme"
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: 'inherit' }}
        >
          文档
        </a>
        <span style={{ opacity: 0.5 }}>|</span>
        <a
          href="https://github.com/EliteOtaku/dsh-opendesign-go/issues"
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: 'inherit' }}
        >
          反馈问题
        </a>
      </div>
    </div>
  )
}
