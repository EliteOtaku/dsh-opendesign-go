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

/** A reasoning effort id the gateway accepts for at least one model. */
export type ReasoningEffortName =
  | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'ultra' | 'max'

/** One model's request parameters, after merging defaults with overrides. */
export interface ModelParams {
  /** Maximum combined prompt and response tokens. */
  readonly contextWindow: number
  /** Output cap applied when a caller omits `maxTokens`. */
  readonly maxTokens: number
  /** Accepted request modalities. */
  readonly inputModalities: readonly ModelModality[]
  /**
   * Reasoning efforts this model accepts, weakest first.
   *
   * Per model because the gateway rejects values a neighbouring model takes:
   * GLM accepts three, Kimi stops at `xhigh`, and only the DeepSeek family and
   * Luna take `ultra`. Offering one shared list produced 400s on some models and
   * hid the top level on others.
   */
  readonly reasoningEfforts: readonly ReasoningEffortName[]
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
 * `deepseek-v4.1-flash` as `deepseek-flash`. It also used to return DeepSeek's
 * own `system_fingerprint`, which is what pinned the pass-through; that field is
 * now an empty string on both ids, so the standing evidence is behavioural — a
 * request with `max_tokens: 384000` is accepted, which makes the 128000 in the
 * gateway's `metadata.output_budget` broadcast metadata rather than an enforced
 * limit. Using it would under-report what the model can do.
 *
 * Where a vendor publishes 384K output and 1M context, those are the numbers
 * here. DeepSeek's docs also note that `deepseek-v4-flash` and
 * `deepseek-v4-flash-vision-exp` are retired ids still routed to V4.1-Flash, so
 * they keep V4.1-Flash's limits.
 */
export const MODEL_DEFAULTS: Readonly<Record<string, ModelParams>> = {
  // Anthropic: 1M context (widened from the earlier 200K) and 128K max output.
  // The context figure is independently confirmed: overflowing the endpoint
  // reports "maximum context length is 1000000 tokens".
  'claude-haiku-5.5': { contextWindow: 1_000_000, maxTokens: 128_000, inputModalities: ['text', 'image'], reasoningEfforts: ['none','minimal','low','medium','high','xhigh','max'] },
  // api-docs.deepseek.com/zh-cn/quick_start/pricing: 1M context, 384K output.
  // Its footnote 1 says both retired ids (`deepseek-v4-flash` and
  // `deepseek-v4-flash-vision-exp`) are still callable but now served by
  // DeepSeek-V4.1-Flash-1017 — so both inherit V4.1-Flash's limits *and* its
  // image support. Declaring only one of them image-capable described the same
  // backend two different ways and hid the capability behind the other id.
  'deepseek-v4-flash': { contextWindow: 1_000_000, maxTokens: 384_000, inputModalities: ['text', 'image'], reasoningEfforts: ['none','minimal','low','medium','high','xhigh','ultra','max'] },
  'deepseek-v4-flash-vision-exp': { contextWindow: 1_000_000, maxTokens: 384_000, inputModalities: ['text', 'image'], reasoningEfforts: ['none','minimal','low','medium','high','xhigh','ultra','max'] },
  // The same pricing table's 功能 row marks 图像理解 as 不支持 for V4-Pro.
  'deepseek-v4-pro': { contextWindow: 1_000_000, maxTokens: 384_000, inputModalities: ['text'], reasoningEfforts: ['none','minimal','low','medium','high','xhigh','ultra','max'] },
  'deepseek-v4.1-flash': { contextWindow: 1_000_000, maxTokens: 384_000, inputModalities: ['text', 'image'], reasoningEfforts: ['none','minimal','low','medium','high','xhigh','ultra','max'] },
  // The slow tier of the model above, so everything it inherits comes from the
  // same vendor table. DeepSeek documents neither the id nor its limits: the
  // name and the tier itself are OpenDesign's (https://open-design.ai/pricing/
  // lists "DeepSeek V4.1 Flash Eco" and https://open-design.ai/model-credits/
  // warns it "may respond more slowly at times", recommending it for batch
  // work). Everything else here was probed against the same gateway: every
  // effort base takes is accepted except `ultra`, which fails deterministically
  // with `[code=upstream_error]` in under a second across five rounds, so the
  // list stops at `max` without `ultra`; `max_tokens: 384000` is accepted; and
  // images are read correctly (a purple/yellow split answers "purple and
  // yellow"), making the gateway's `input_modalities: ["text"]` for this id
  // wrong in the same way its output_budget was.
  'deepseek-v4.1-flash-eco': { contextWindow: 1_000_000, maxTokens: 384_000, inputModalities: ['text', 'image'], reasoningEfforts: ['none','minimal','low','medium','high','xhigh','max'] },
  // docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash and its English mirror
  // docs.z.ai/guides/vlm/glm-5.3-flash both state 1M context, 128K max output.
  'glm-5.3-flash': { contextWindow: 1_000_000, maxTokens: 128_000, inputModalities: ['text', 'image'], reasoningEfforts: ['low','high','max'] },
  'glm-5.3-flashx': { contextWindow: 1_000_000, maxTokens: 128_000, inputModalities: ['text', 'image'], reasoningEfforts: ['low','high','max'] },
  // OpenAI: 1,050,000 total context, 922,000 max input, 128,000 max output.
  // The three figures are consistent — 922000 + 128000 = 1050000 — which is the
  // same shape as Hy4 Preview's 960000 + 64000. Note that a 1.5M-token prompt
  // was accepted without an error, so the endpoint does not enforce this bound
  // itself; the documented limit is the one used here.
  'gpt-6-luna': { contextWindow: 1_050_000, maxTokens: 128_000, inputModalities: ['text', 'image'], reasoningEfforts: ['none','minimal','low','medium','high','xhigh','ultra','max'] },
  // tencentcloud.com/techpedia/148044: 1M context, 960K max input, 64K output.
  'hy4-preview': { contextWindow: 1_000_000, maxTokens: 64_000, inputModalities: ['text'], reasoningEfforts: ['none','minimal','low','medium','high','xhigh','max'] },
  // platform.kimi.com/docs/guide/kimi-k2-7-code-quickstart: 256K context, and
  // the endpoint reports "Range of max_tokens should be [1, 262144]".
  'kimi-k2.7-code': { contextWindow: 262_144, maxTokens: 262_144, inputModalities: ['text', 'image'], reasoningEfforts: ['none','minimal','low','medium','high','xhigh','max'] },
  // mimo.mi.com/docs/zh-CN/quick-start/summary/model: 1M context, 128K output.
  'mimo-v2.6-flash': { contextWindow: 1_000_000, maxTokens: 128_000, inputModalities: ['text', 'image'], reasoningEfforts: ['none','minimal','low','medium','high','xhigh','max'] },
  'mimo-v2.6-pro': { contextWindow: 1_000_000, maxTokens: 128_000, inputModalities: ['text', 'image'], reasoningEfforts: ['none','minimal','low','medium','high','xhigh','max'] },
  // platform.minimax.io/docs/guides/text-generation: 1M context. The model always
  // thinks, so `none` is not an option — the gateway answers 400 every time it is
  // sent, which matches the vendor note that this id "requires adaptive thinking".
  // Its effort list is the only one in this table that starts at `minimal` while
  // still reaching `max`; `ultra` is rejected the same way. The 524,288 output
  // ceiling is measured, not documented: 524,288 is accepted and 524,289 is not.
  'minimax-m3.1-flash': { contextWindow: 1_000_000, maxTokens: 524_288, inputModalities: ['text', 'image'], reasoningEfforts: ['minimal','low','medium','high','xhigh','max'] },
}

/**
 * Parameters for a model this build has no documented numbers for.
 *
 * The gateway already grants the model, so it is callable; withholding the
 * metadata hid it from the picker and dropped the reasoning selector. These are
 * deliberately conservative and deliberately visible: the model row says the
 * numbers are generic, because a wrong context window changes truncation
 * behaviour and a wrong output cap changes `max_tokens`.
 *
 * The reasoning list is the full range for the same reason as an unknown id in
 * `resolveModel`: this build cannot know which values the model refuses, and
 * hiding levels is the worse error.
 */
export const GENERIC_DEFAULTS: ModelParams = Object.freeze({
  contextWindow: 1_000_000,
  maxTokens: 128_000,
  inputModalities: Object.freeze(['text', 'image'] as const) as readonly ModelModality[],
  reasoningEfforts: Object.freeze([
    'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'ultra', 'max',
  ] as const) as readonly ReasoningEffortName[],
})

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
 * @returns the effective parameters; an id the table does not carry gets
 * {@link GENERIC_DEFAULTS}, because the gateway granted it and it is callable.
 */
export function paramsOf(
  model: string,
  overrides: Readonly<Record<string, ModelParamOverride>> | undefined,
): ModelParams {
  // An id the table does not carry still gets numbers: the gateway granted it,
  // so it is callable, and returning undefined here hid every parameter from the
  // picker instead of flagging them as estimates.
  const base = MODEL_DEFAULTS[model] ?? GENERIC_DEFAULTS
  const override = overrides?.[model]
  if (override === undefined) return base
  return {
    contextWindow: clamp(override.contextWindow, base.contextWindow, MIN_CONTEXT_WINDOW, MAX_CONTEXT_WINDOW),
    maxTokens: clamp(override.maxTokens, base.maxTokens, MIN_MAX_TOKENS, MAX_MAX_TOKENS),
    inputModalities: base.inputModalities,
    reasoningEfforts: base.reasoningEfforts,
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
 * Every reasoning effort any model on this plan accepts, ordered weakest first.
 *
 * Established one value at a time against the gateway: an accepted value answers
 * 200 and a rejected one answers 400. The rejection body does **not** enumerate
 * the legal set — it is the bare `[code=invalid_request_error] The request is
 * invalid. Please check the request parameters.` — so each entry in
 * {@link MODEL_DEFAULTS} is a probe result, not a value read out of an error. The
 * order is what a picker renders, so it runs none → max.
 *
 * Accepted is not the same as distinct. DeepSeek's own thinking-mode guide maps
 * seven of these onto three strengths (`minimal`/`low` → low, `medium`/`high`/
 * `xhigh` → high, `max`/`ultra` → max), and measuring `reasoning_tokens` on this
 * gateway reproduces exactly those three groups. The full list is kept anyway:
 * every value is legal, and dropping the aliases would silently move anyone on
 * the default `medium` down to `low`.
 */
export const REASONING_EFFORTS = [
  { id: 'none', name: '关闭' },
  { id: 'minimal', name: '最低' },
  { id: 'low', name: '低' },
  { id: 'medium', name: '中' },
  { id: 'high', name: '高' },
  { id: 'xhigh', name: '较高' },
  { id: 'ultra', name: '极高' },
  { id: 'max', name: '最高' },
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
