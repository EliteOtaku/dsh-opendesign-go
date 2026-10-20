/**
 * Per-model request parameters: vendor defaults with user overrides.
 *
 * Users may override any field. Overrides live in the config document, so the
 * page can show and edit them; an override that is absent falls back to the
 * documented default rather than to zero.
 *
 * @module dsh-opendesign-go/model-params
 */
import type { ModelModality } from '@deepseek-ai/dsh-llm';
/** A reasoning effort id the gateway accepts for at least one model. */
export type ReasoningEffortName = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'ultra' | 'max';
/** One model's request parameters, after merging defaults with overrides. */
export interface ModelParams {
    /** Maximum combined prompt and response tokens. */
    readonly contextWindow: number;
    /** Output cap applied when a caller omits `maxTokens`. */
    readonly maxTokens: number;
    /** Accepted request modalities. */
    readonly inputModalities: readonly ModelModality[];
    /**
     * Reasoning efforts this model accepts, weakest first.
     *
     * Per model because the gateway rejects values a neighbouring model takes:
     * GLM accepts three, Kimi stops at `xhigh`, and only the DeepSeek family and
     * Luna take `ultra`. Offering one shared list produced 400s on some models and
     * hid the top level on others.
     */
    readonly reasoningEfforts: readonly ReasoningEffortName[];
}
/**
 * A user override. Every field is optional: an omitted field keeps the default,
 * which is what lets the page show one editable box per field without forcing a
 * value into all of them.
 */
export interface ModelParamOverride {
    readonly contextWindow?: number;
    readonly maxTokens?: number;
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
export declare const MODEL_DEFAULTS: Readonly<Record<string, ModelParams>>;
export declare const MIN_CONTEXT_WINDOW = 1000;
export declare const MAX_CONTEXT_WINDOW = 10000000;
export declare const MIN_MAX_TOKENS = 1;
export declare const MAX_MAX_TOKENS = 1000000;
/**
 * Read the override table from its serialized config field.
 *
 * A malformed value yields an empty table rather than throwing: the field is
 * editable text, and losing every default because one character is wrong would
 * disable the model list for a reason the user cannot see.
 * @param raw - serialized overrides, or empty string.
 * @returns the override table, possibly empty.
 */
export declare function parseModelParams(raw: string | undefined): Record<string, ModelParamOverride>;
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
export declare function paramsOf(model: string, overrides: Readonly<Record<string, ModelParamOverride>> | undefined): ModelParams | undefined;
/**
 * Every reasoning effort any model on this plan accepts, ordered weakest first.
 *
 * Discovered by sending an invalid value and reading the gateway's own rejection,
 * which lists the accepted set per model — the gateway publishes no documentation
 * for this field. The order is what a picker renders, so it runs none → max.
 *
 * `none` is absent from the old four-value list this file used to carry, and
 * `ultra`/`max` were both missing, which is why the highest selectable effort for
 * DeepSeek sat two steps below what the model actually accepts.
 */
export declare const REASONING_EFFORTS: readonly [{
    readonly id: "none";
    readonly name: "关闭";
}, {
    readonly id: "minimal";
    readonly name: "最低";
}, {
    readonly id: "low";
    readonly name: "低";
}, {
    readonly id: "medium";
    readonly name: "中";
}, {
    readonly id: "high";
    readonly name: "高";
}, {
    readonly id: "xhigh";
    readonly name: "较高";
}, {
    readonly id: "ultra";
    readonly name: "极高";
}, {
    readonly id: "max";
    readonly name: "最高";
}];
/** Reasoning effort used when a caller omits one. */
export declare const DEFAULT_REASONING_EFFORT = "medium";
/**
 * Read the enabled-model list from its serialized config field.
 *
 * An empty list means "all models". That default matters: a fresh install has
 * an empty field, and treating it as "none enabled" would leave the picker
 * blank with no explanation.
 * @param raw - serialized array, or empty string.
 * @returns enabled ids, or an empty array meaning "all".
 */
export declare function parseEnabledModels(raw: string | undefined): string[];
/**
 * Whether one model should appear in the picker.
 * @param model - exact model id.
 * @param enabled - enabled ids; empty means all.
 * @returns true when the model is offered.
 */
export declare function isModelEnabled(model: string, enabled: readonly string[]): boolean;
