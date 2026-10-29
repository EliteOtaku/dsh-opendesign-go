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
import { usableInputTokens } from '../output-budget.ts'
import { Button, Card, Field, Input, Switch, cx } from './ui/primitives.tsx'
import styles from './ModelsCard.module.css'

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
  const stored = useMemo(() => parseEnabledModels(config?.enabledModelsJson), [config?.enabledModelsJson])
  // Overlay shown while a write is in flight.
  //
  // It is released only when the Host reports the write settled, never on a
  // timer: a timeout fires while the round-trip is still open, which repaints the
  // old state and reads as the checkbox undoing itself. `pending === undefined`
  // means the stored value is the truth.
  const [pending, setPending] = useState<readonly string[] | undefined>(undefined)
  const enabled = pending ?? stored
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
    // Paint first: a checkbox that stays still while the write is in flight
    // reads as a broken control even when the write succeeds.
    setPending(next)
    void form.mutate([{ op: 'set', path: ['enabledModelsJson'], value: allOn ? '' : JSON.stringify(next) }])
      .then((accepted) => {
        // The overlay is dropped only here. On success the stored value already
        // says the same thing, so the swap is invisible; on refusal the stored
        // value is what the user must see, so it is released too.
        setPending(undefined)
        if (accepted === false) {
          setError('宿主拒绝了这次修改')
          return
        }
        setNotice(next.includes(model) ? `已启用 ${model}` : `已停用 ${model}`)
      })
      .catch((reason: unknown) => {
        setPending(undefined)
        setError(String(reason))
      })
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
    <Card
      title="可用模型"
      actions={<span className={styles.cap}>{GO_DESIGN_PLAN_MODELS.length} 个</span>}
      description={(
        <>
          <span>
            关闭后该模型不再出现在会话的模型选择器里，但仍可用 API 直接调用。参数默认值取自各厂商公布的模型规格，留空即沿用。
          </span>
          <span>
            可用输入 = 上下文 − max(输出上限, 上下文/4)。网关按「输入 + max_tokens ≤ 上下文」判超限，
            而会话界面只量输入，把这个差额算进去才不会在长对话里突然被拒。
          </span>
        </>
      )}
    >
      <div className={styles.list}>
        {GO_DESIGN_PLAN_MODELS.map((model) => {
          const base = MODEL_DEFAULTS[model.id]
          const override = overrides[model.id]
          const context = override?.contextWindow ?? base?.contextWindow
          const max = override?.maxTokens ?? base?.maxTokens
          const isEditing = editing === model.id
          const on = isModelEnabled(model.id, enabled)
          return (
            <div key={model.id} className={cx(styles.model, !on && styles.modelOff)}>
              <div className={styles.modelTop}>
                <div className={styles.modelMain}>
                  <Switch checked={on} disabled={!editable} onChange={() => { toggle(model.id) }} label={`在模型列表中${on ? '停用' : '启用'} ${model.name}`} />
                  <div className={styles.modelText}>
                    <span className={styles.modelName}>{model.name}</span>
                    <span className={styles.modelId}>{model.id}</span>
                  </div>
                </div>
                <div className={styles.modelSide}>
                  <span className={styles.modelMeta}>
                    上下文 {context === undefined ? '未知' : tokens(context)}
                    {context !== undefined && max !== undefined ? `（可用输入 ${tokens(usableInputTokens(context, max))}）` : ''}
                    {' · '}输出 {max === undefined ? '未知' : tokens(max)}
                    {override !== undefined && <span className={styles.edited}>（已改）</span>}
                  </span>
                  <Button
                    disabled={!editable}
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
                  </Button>
                </div>
              </div>

              {isEditing && (
                <div className={styles.editor}>
                  <div className={styles.editorRow}>
                    <Field label="上下文窗口">
                      <Input
                        type="number"
                        value={draftContext}
                        placeholder={base?.contextWindow === undefined ? '' : String(base.contextWindow)}
                        onChange={setDraftContext}
                      />
                    </Field>
                    <Field label="输出上限 max_tokens">
                      <Input
                        type="number"
                        value={draftMax}
                        placeholder={base?.maxTokens === undefined ? '' : String(base.maxTokens)}
                        onChange={setDraftMax}
                      />
                    </Field>
                  </div>
                  <div className={styles.editorFoot}>
                    <Button variant="primary" onClick={() => { save(model.id) }}>保存</Button>
                    <span className={styles.cap}>两项都留空 = 恢复官方值</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error !== undefined && <p className={styles.error}>{error}</p>}
      {notice !== undefined && <p className={styles.notice}>{notice}</p>}
    </Card>
  )
}
