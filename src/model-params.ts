/**
 * Per-model request parameters: gateway defaults with user overrides.
 *
 * The defaults below were read from the live gateway (`GET /v1/models`), whose
 * `metadata` carries `context_limit`, `context_budget` and `output_budget`, and
 * whose `architecture.input_modalities` names the accepted modalities. Reading
 * them rather than hardcoding guesses matters because the numbers are not
 * round: `deepseek-v4.1-flash` declares 1048000 tokens, and a guessed 128000
 * would truncate conversations the model can actually hold.
 *
 * Users may override any field. Overrides live in the config document, so the
 * page can show and edit them; an override that is absent falls back to the
 * gateway default rather than to zero.
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
 * Gateway defaults, read from `GET /v1/models` on 2026-10-19.
 *
 * These are the *gateway's* limits, which is what a request is actually checked
 * against, and they are not the same as the vendor's published model spec:
 *
 * - DeepSeek's own docs list 1M context and a 384K output maximum for
 *   `deepseek-flash`, while the gateway reports `output_budget: 128000`. The
 *   narrower number wins here because it is the one the endpoint enforces.
 * - The same docs state that `deepseek-v4-flash` and
 *   `deepseek-v4-flash-vision-exp` are retired ids now served by
 *   DeepSeek-V4.1-Flash-1017 at Flash pricing. They stay in the list because
 *   the gateway still advertises and accepts them.
 *
 * `context_limit` is the window; `output_budget` is the per-request cap. The
 * gateway also reports `context_budget`, smaller than the window — it is the
 * practical prompt allowance, and using it as the window would hide usable
 * capacity, so the window is taken from `context_limit`.
 */
export const MODEL_DEFAULTS: Readonly<Record<string, ModelParams>> = {
  'claude-haiku-5.5': { contextWindow: 1_000_000, maxTokens: 128_000, inputModalities: ['text', 'image'] },
  'deepseek-v4-flash': { contextWindow: 1_048_000, maxTokens: 32_000, inputModalities: ['text'] },
  'deepseek-v4-flash-vision-exp': { contextWindow: 1_048_000, maxTokens: 32_000, inputModalities: ['text', 'image'] },
  'deepseek-v4-pro': { contextWindow: 1_048_000, maxTokens: 128_000, inputModalities: ['text'] },
  'deepseek-v4.1-flash': { contextWindow: 1_048_000, maxTokens: 128_000, inputModalities: ['text', 'image'] },
  'glm-5.3-flash': { contextWindow: 1_048_000, maxTokens: 32_000, inputModalities: ['text', 'image'] },
  'glm-5.3-flashx': { contextWindow: 1_000_000, maxTokens: 32_000, inputModalities: ['text', 'image'] },
  'gpt-6-luna': { contextWindow: 1_050_000, maxTokens: 128_000, inputModalities: ['text', 'image'] },
  'hy4-preview': { contextWindow: 1_048_000, maxTokens: 32_000, inputModalities: ['text'] },
  'kimi-k2.7-code': { contextWindow: 262_000, maxTokens: 32_000, inputModalities: ['text', 'image'] },
  'mimo-v2.6-flash': { contextWindow: 1_048_000, maxTokens: 32_000, inputModalities: ['text', 'image'] },
  'mimo-v2.6-pro': { contextWindow: 1_048_000, maxTokens: 32_000, inputModalities: ['text', 'image'] },
}

/** Sanity bounds, so a hand-edited config cannot produce a nonsensical request. */
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
