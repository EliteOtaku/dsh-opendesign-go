/**
 * Per-model request parameters: vendor defaults with user overrides.
 *
 * Users may override any field. Overrides live in the config document, so the
 * page can show and edit them; an override that is absent falls back to the
 * documented default rather than to zero.
 *
 * @module dsh-opendesign-go/model-params
 */
import type { ModelModality } from '@deepseek-ai/dsh-llm'

/** One model's request parameters, after merging defaults with overrides. */
export interface ModelParams {
  /** Maximum combined prompt and response tokens. */
  readonly contextWindow: number
  /** Output cap applied when a caller omits `maxTokens`. */
  readonly maxTokens: number
  /** Accepted request modalities. */
  readonly inputModalities: readonly ModelModality[]
}

/**
 * A user override. Every field is optional: an omitted field keeps the default,
 * which is what lets the page show one editable box per field without forcing a
 * value into all of them.
 */
export interface ModelParamOverride {
  readonly contextWindow?: number
  readonly maxTokens?: number
}

/**
 * Model limits, taken from each vendor's own documentation.
 *
 * These are pass-through models, not a re-implementation: the gateway serves
 * `deepseek-v4.1-flash` as `deepseek-flash`, and both return the same
 * `system_fingerprint` (`e72d3c7f663d3e1383b00b3884cb4501`) as
 * `api.deepseek.com`. A request with `max_tokens: 384000` is accepted, so the
 * 128000 in the gateway's `metadata.output_budget` is broadcast metadata rather
 * than an enforced limit — using it would under-report what the model can do.
 *
 * Where a vendor publishes 384K output and 1M context, those are the numbers
 * here. DeepSeek's docs also note that `deepseek-v4-flash` and
 * `deepseek-v4-flash-vision-exp` are retired ids still routed to V4.1-Flash, so
 * they keep V4.1-Flash's limits.
 */
export const MODEL_DEFAULTS: Readonly<Record<string, ModelParams>> = {
  // platform.claude.com/docs/en/models/haiku-5-5/overview (redirects to
  // anthropic.com). The endpoint itself reports "maximum context length is
  // 1000000 tokens" when overflowed, which confirms it independently.
  'claude-haiku-5.5': { contextWindow: 1_000_000, maxTokens: 64_000, inputModalities: ['text', 'image'] },
  // api-docs.deepseek.com/zh-cn/quick_start/pricing: 1M context, 384K output.
  // The two retired ids route to V4.1-Flash per that page's footnote 1.
  'deepseek-v4-flash': { contextWindow: 1_000_000, maxTokens: 384_000, inputModalities: ['text'] },
  'deepseek-v4-flash-vision-exp': { contextWindow: 1_000_000, maxTokens: 384_000, inputModalities: ['text', 'image'] },
  'deepseek-v4-pro': { contextWindow: 1_000_000, maxTokens: 384_000, inputModalities: ['text'] },
  'deepseek-v4.1-flash': { contextWindow: 1_000_000, maxTokens: 384_000, inputModalities: ['text', 'image'] },
  // docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash and its English mirror
  // docs.z.ai/guides/vlm/glm-5.3-flash both state 1M context, 128K max output.
  'glm-5.3-flash': { contextWindow: 1_000_000, maxTokens: 128_000, inputModalities: ['text', 'image'] },
  'glm-5.3-flashx': { contextWindow: 1_000_000, maxTokens: 128_000, inputModalities: ['text', 'image'] },
  // No published spec reached; the endpoint accepted a 1.5M-token prompt, so
  // the window is at least that. Kept at the largest verified-advertised value
  // rather than inventing a bigger one.
  'gpt-6-luna': { contextWindow: 1_050_000, maxTokens: 128_000, inputModalities: ['text', 'image'] },
  // tencentcloud.com/techpedia/148044: 1M context, 960K max input, 64K output.
  'hy4-preview': { contextWindow: 1_000_000, maxTokens: 64_000, inputModalities: ['text'] },
  // platform.kimi.com/docs/guide/kimi-k2-7-code-quickstart: 256K context, and
  // the endpoint reports "Range of max_tokens should be [1, 262144]".
  'kimi-k2.7-code': { contextWindow: 262_144, maxTokens: 262_144, inputModalities: ['text', 'image'] },
  // mimo.mi.com/docs/zh-CN/quick-start/summary/model: 1M context, 128K output.
  'mimo-v2.6-flash': { contextWindow: 1_000_000, maxTokens: 128_000, inputModalities: ['text', 'image'] },
  'mimo-v2.6-pro': { contextWindow: 1_000_000, maxTokens: 128_000, inputModalities: ['text', 'image'] },
}

export const MIN_CONTEXT_WINDOW = 1_000
export const MAX_CONTEXT_WINDOW = 10_000_000
export const MIN_MAX_TOKENS = 1
export const MAX_MAX_TOKENS = 1_000_000

/**
 * Read the override table from its serialized config field.
 *
 * A malformed value yields an empty table rather than throwing: the field is
 * editable text, and losing every default because one character is wrong would
 * disable the model list for a reason the user cannot see.
 * @param raw - serialized overrides, or empty string.
 * @returns the override table, possibly empty.
 */
export function parseModelParams(raw: string | undefined): Record<string, ModelParamOverride> {
  if (raw === undefined || raw.length === 0) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out: Record<string, ModelParamOverride> = {}
  for (const [model, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object') continue
    const row = value as Record<string, unknown>
    const entry: ModelParamOverride = {
      ...(typeof row.contextWindow === 'number' ? { contextWindow: row.contextWindow } : {}),
      ...(typeof row.maxTokens === 'number' ? { maxTokens: row.maxTokens } : {}),
    }
    if (entry.contextWindow !== undefined || entry.maxTokens !== undefined) out[model] = entry
  }
  return out
}

/**
 * Fill one override over its default.
 *
 * An override is only applied when it is a usable number: a zero or negative
 * value would otherwise turn a working default into a request that cannot
 * succeed, and the page has no way to tell "disabled" from "mistyped".
 * @param model - exact model id.
 * @param overrides - per-model overrides from configuration.
 * @returns the effective parameters, or undefined for an unknown model.
 */
export function paramsOf(
  model: string,
  overrides: Readonly<Record<string, ModelParamOverride>> | undefined,
): ModelParams | undefined {
  const base = MODEL_DEFAULTS[model]
  if (base === undefined) return undefined
  const override = overrides?.[model]
  if (override === undefined) return base
  return {
    contextWindow: clamp(override.contextWindow, base.contextWindow, MIN_CONTEXT_WINDOW, MAX_CONTEXT_WINDOW),
    maxTokens: clamp(override.maxTokens, base.maxTokens, MIN_MAX_TOKENS, MAX_MAX_TOKENS),
    inputModalities: base.inputModalities,
  }
}

/**
 * Apply one override when it is in range, else keep the default.
 * @param value - candidate override.
 * @param fallback - default to keep.
 * @param min - inclusive lower bound.
 * @param max - inclusive upper bound.
 * @returns the value to use.
 */
function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  if (value < min || value > max) return fallback
  return Math.round(value)
}

/**
 * The reasoning efforts this plugin offers for every model.
 *
 * The gateway accepts `reasoning_effort` on Chat Completions and honours it —
 * verified by comparing `usage.completion_tokens_details.reasoning_tokens`
 * across the four values, which change with the setting rather than being
 * ignored. It publishes no per-model list, so the four OpenAI-compatible names
 * are offered uniformly rather than invented per model.
 */
export const REASONING_EFFORTS = [
  { id: 'minimal', name: '最低' },
  { id: 'low', name: '低' },
  { id: 'medium', name: '中' },
  { id: 'high', name: '高' },
] as const

/** Reasoning effort used when a caller omits one. */
export const DEFAULT_REASONING_EFFORT = 'medium'

/**
 * Read the enabled-model list from its serialized config field.
 *
 * An empty list means "all models". That default matters: a fresh install has
 * an empty field, and treating it as "none enabled" would leave the picker
 * blank with no explanation.
 * @param raw - serialized array, or empty string.
 * @returns enabled ids, or an empty array meaning "all".
 */
export function parseEnabledModels(raw: string | undefined): string[] {
  if (raw === undefined || raw.length === 0) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/**
 * Whether one model should appear in the picker.
 * @param model - exact model id.
 * @param enabled - enabled ids; empty means all.
 * @returns true when the model is offered.
 */
export function isModelEnabled(model: string, enabled: readonly string[]): boolean {
  return enabled.length === 0 || enabled.includes(model)
}
