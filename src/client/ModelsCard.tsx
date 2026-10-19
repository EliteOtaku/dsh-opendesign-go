/**
 * Model list with editable request parameters.
 *
 * Every row shows the parameters the gateway reports and lets a user replace
 * them. Defaults are shown as placeholders rather than forced into the config,
 * so an untouched model keeps tracking the gateway: if the published window
 * changes, the page follows it without anyone re-saving.
 *
 * The parameters are not cosmetic. `contextWindow` drives truncation warnings
 * and `maxTokens` becomes the request's `max_tokens`, so a wrong number changes
 * behaviour — which is why an out-of-range edit is refused instead of clamped
 * silently.
 *
 * @module dsh-opendesign-go/client/ModelsCard
 */
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { GO_DESIGN_PLAN_MODELS } from '../catalog.ts'
import type { OpenDesignConfig } from '../config-contract.ts'
import {
  MAX_CONTEXT_WINDOW,
  MAX_MAX_TOKENS,
  MIN_CONTEXT_WINDOW,
  MIN_MAX_TOKENS,
  MODEL_DEFAULTS,
  isModelEnabled,
  parseEnabledModels,
  parseModelParams,
} from '../model-params.ts'

const card = {
  border: '1px solid rgba(128, 128, 128, 0.25)',
  borderRadius: '10px',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
} as const

const hint = { fontSize: '13px', opacity: 0.65, margin: 0 } as const

const input = {
  width: '100%',
  padding: '3px 6px',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums' as const,
  borderRadius: '5px',
  border: '1px solid rgba(128, 128, 128, 0.3)',
  background: 'transparent',
  color: 'inherit',
  boxSizing: 'border-box' as const,
}

/** Compact token count, e.g. 1048000 → 1.05M. */
function tokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}

/**
 * Render the model list with editable parameters.
 * @param props - config form and current configuration.
 * @returns the card.
 */
export function ModelsCard({ form, config, editable }: {
  readonly form: ConfigForm<OpenDesignConfig>
  readonly config: OpenDesignConfig | undefined
  readonly editable: boolean
}): ReactElement {
  const overrides = useMemo(
    () => parseModelParams(config?.modelParamsJson),
    [config?.modelParamsJson],
  )
  const enabled = useMemo(() => parseEnabledModels(config?.enabledModelsJson), [config?.enabledModelsJson])
  const [editing, setEditing] = useState<string | undefined>(undefined)
  const [draftContext, setDraftContext] = useState('')
  const [draftMax, setDraftMax] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)

  /**
   * Turn one model on or off in the picker.
   *
   * The stored list is materialized on first toggle: an empty field means "all",
   * so flipping one model off has to write every other id explicitly, or the
   * empty-means-all rule would turn the change into a no-op.
   */
  const toggle = (model: string): void => {
    setError(undefined)
    setNotice(undefined)
    const current = enabled.length === 0
      ? GO_DESIGN_PLAN_MODELS.map((row) => row.id)
      : [...enabled]
    const next = current.includes(model)
      ? current.filter((id) => id !== model)
      : [...current, model]
    // Writing the full catalog back means "all enabled" again; store empty so a
    // future model added to the seed is picked up without re-saving.
    const allOn = next.length === GO_DESIGN_PLAN_MODELS.length
    void form.mutate([{ op: 'set', path: ['enabledModelsJson'], value: allOn ? '' : JSON.stringify(next) }])
      .then((accepted) => {
        if (accepted === false) {
          setError('宿主拒绝了这次修改')
          return
        }
        setNotice(next.includes(model) ? `已启用 ${model}` : `已停用 ${model}`)
      })
      .catch((reason: unknown) => { setError(String(reason)) })
  }

  /** Persist one model's overrides, or clear them when both are blank. */
  const save = (model: string): void => {
    setError(undefined)
    setNotice(undefined)
    const context = draftContext.trim()
    const max = draftMax.trim()
    const entry: { contextWindow?: number, maxTokens?: number } = {}
    if (context.length > 0) {
      const parsed = Number(context)
      if (!Number.isInteger(parsed) || parsed < MIN_CONTEXT_WINDOW || parsed > MAX_CONTEXT_WINDOW) {
        setError(`上下文窗口需为 ${MIN_CONTEXT_WINDOW}–${MAX_CONTEXT_WINDOW} 之间的整数`)
        return
      }
      entry.contextWindow = parsed
    }
    if (max.length > 0) {
      const parsed = Number(max)
      if (!Number.isInteger(parsed) || parsed < MIN_MAX_TOKENS || parsed > MAX_MAX_TOKENS) {
        setError(`输出上限需为 ${MIN_MAX_TOKENS}–${MAX_MAX_TOKENS} 之间的整数`)
        return
      }
      entry.maxTokens = parsed
    }
    const next = { ...overrides }
    if (entry.contextWindow === undefined && entry.maxTokens === undefined) delete next[model]
    else next[model] = entry
    void form.mutate([{ op: 'set', path: ['modelParamsJson'], value: JSON.stringify(next) }])
      .then((accepted) => {
        if (accepted === false) {
          setError('宿主拒绝了这次修改')
          return
        }
        setEditing(undefined)
        setNotice(entry.contextWindow === undefined && entry.maxTokens === undefined
          ? `已恢复 ${model} 的官方参数`
          : `已保存 ${model} 的参数`)
      })
      .catch((reason: unknown) => { setError(String(reason)) })
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>可用模型</div>
        <span style={{ fontSize: '12px', opacity: 0.6 }}>{GO_DESIGN_PLAN_MODELS.length} 个</span>
      </div>
      <p style={hint}>
        取消勾选后该模型不再出现在会话的模型选择器里，但仍可用 API 直接调用。
        参数默认值取自 OpenDesign 的 <code style={{ margin: '0 3px' }}>/v1/models</code>，
        与厂商公布的模型规格可能不同（网关会再限一层），留空即沿用网关值。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {GO_DESIGN_PLAN_MODELS.map((model) => {
          const base = MODEL_DEFAULTS[model.id]
          const override = overrides[model.id]
          const context = override?.contextWindow ?? base?.contextWindow
          const max = override?.maxTokens ?? base?.maxTokens
          const isEditing = editing === model.id
          return (
            <div
              key={model.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '7px 0',
                borderTop: '1px solid rgba(128, 128, 128, 0.14)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={isModelEnabled(model.id, enabled)}
                    disabled={!editable}
                    onChange={() => { toggle(model.id) }}
                    aria-label={`在模型列表中${isModelEnabled(model.id, enabled) ? '停用' : '启用'} ${model.name}`}
                    style={{ marginTop: '3px', cursor: editable ? 'pointer' : 'default' }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', opacity: isModelEnabled(model.id, enabled) ? 1 : 0.5 }}>{model.name}</div>
                    <div style={{ fontSize: '11px', opacity: 0.55 }}>{model.id}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                    上下文 {context === undefined ? '未知' : tokens(context)}
                    {' · '}输出 {max === undefined ? '未知' : tokens(max)}
                    {override !== undefined && <span style={{ marginLeft: '4px', opacity: 0.8 }}>（已改）</span>}
                  </span>
                  <button
                    type="button"
                    disabled={!editable}
                    style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '5px', border: '1px solid rgba(128,128,128,0.35)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
                    onClick={() => {
                      if (isEditing) {
                        setEditing(undefined)
                        return
                      }
                      // Prefill the effective value so the box shows what is
                      // actually in use; leaving the fallback in the
                      // placeholder made an empty box look like "unset" even
                      // when a default applied.
                      setDraftContext(String(override?.contextWindow ?? base?.contextWindow ?? ''))
                      setDraftMax(String(override?.maxTokens ?? base?.maxTokens ?? ''))
                      setError(undefined)
                      setNotice(undefined)
                      setEditing(model.id)
                    }}
                  >
                    {isEditing ? '取消' : '改参数'}
                  </button>
                </div>
              </div>

              {isEditing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '11px', opacity: 0.75, flex: '1 1 150px' }}>
                      上下文窗口
                      <input
                        type="number"
                        value={draftContext}
                        placeholder={base?.contextWindow === undefined ? '' : String(base.contextWindow)}
                        onChange={(event) => { setDraftContext(event.target.value) }}
                        style={input}
                      />
                    </label>
                    <label style={{ fontSize: '11px', opacity: 0.75, flex: '1 1 150px' }}>
                      输出上限 max_tokens
                      <input
                        type="number"
                        value={draftMax}
                        placeholder={base?.maxTokens === undefined ? '' : String(base.maxTokens)}
                        onChange={(event) => { setDraftMax(event.target.value) }}
                        style={input}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '5px', border: '1px solid rgba(128,128,128,0.35)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
                      onClick={() => { save(model.id) }}
                    >
                      保存
                    </button>
                    <span style={{ fontSize: '11px', opacity: 0.55, alignSelf: 'center' }}>
                      两项都留空 = 恢复官方值
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error !== undefined && <p style={{ ...hint, color: '#e5484d' }}>{error}</p>}
      {notice !== undefined && <p style={hint}>{notice}</p>}
    </div>
  )
}
