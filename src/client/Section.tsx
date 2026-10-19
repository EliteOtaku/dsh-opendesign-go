/**
 * The "DSH OpenDesign Go" settings page body.
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
import { useMemo, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { PROFILE_ENTRY_ID } from '../config-contract.ts'
import type { OpenDesignConfig } from '../config-contract.ts'
import type { UsageSnapshot } from '../usage-contract.ts'
import { parseReport, parseUsage } from '../usage-contract.ts'
import { parseRouteDiagnostics } from '../diagnostics.ts'
import { QuotaCard } from './QuotaCard.tsx'
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

      <QuotaCard snapshot={usage} loading={false} />

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
    </div>
  )
}
