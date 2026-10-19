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
import { useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { GO_DESIGN_PLAN_MODELS } from '../catalog.ts'
import type { OpenDesignConfig } from '../config-contract.ts'

/** Props injected into the section by the registering plugin. */
export interface OpenDesignSectionInjected {
  /** Live config form bound to this plugin's profile entry. */
  readonly form: ConfigForm<OpenDesignConfig>
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

/**
 * Render the settings page.
 * @param props - injected config form.
 * @returns the page body.
 */
export function OpenDesignSection({ form }: OpenDesignSectionInjected): ReactElement {
  const snapshot = useSyncExternalStore(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot(),
  )
  const value = snapshot.value
  const enabled = value?.enabled ?? true
  const editable = snapshot.status === 'ready' && snapshot.writable

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

  return (
    <div style={pageStyle}>
      <div>
        <h1 style={titleStyle}>OpenDesign Go</h1>
        <p style={{ ...hintStyle, marginTop: '6px' }}>
          选择会话中显示的 OpenDesign Go 模型，并调整其设置。
        </p>
      </div>

      {snapshot.status === 'loading' && <p style={hintStyle}>正在读取配置…</p>}
      {snapshot.status === 'unavailable' && (
        <p style={hintStyle}>此宿主未暴露本插件的配置项，无法在此编辑。</p>
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

      <div style={cardStyle}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>可用模型</div>
        <p style={{ ...hintStyle, marginTop: '4px' }}>
          Go 套餐授予的 {GO_DESIGN_PLAN_MODELS.length} 个 Design Plan 模型（Go 不含套餐模型额度）。
        </p>
        <ul style={listStyle}>
          {GO_DESIGN_PLAN_MODELS.map((model) => (
            <li key={model.id}>
              <div>{model.name}</div>
              <div style={{ ...hintStyle, fontSize: '12px' }}>{model.id}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
