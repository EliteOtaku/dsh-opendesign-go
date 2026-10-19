/**
 * Public OpenDesign price list, embedded as a snapshot.
 *
 * `GET https://amr-api.open-design.ai/api/v1/public/model-prices` is public and
 * needs no credential, so the host refreshes it at runtime; this snapshot is the
 * fallback for a cold or offline start, and the values the page uses before the
 * first refresh lands.
 *
 * Only the **base tier** is published. A request past a model's tier threshold
 * costs more than this table says, which is why every report is labelled
 * `base-tier` rather than presented as a bill.
 *
 * @module dsh-opendesign-go/pricing
 */
import type { ModelPrice } from './usage-ledger.ts'

/** When this snapshot was read from the public endpoint. */
export const PRICES_AS_OF = '2026-10-19'

/** Endpoint that serves the live list. */
export const PRICES_URL = 'https://amr-api.open-design.ai/api/v1/public/model-prices'

/** Price per million tokens in USD, keyed by exact model id. */
export const BASE_PRICES: readonly ModelPrice[] = [
  { model: 'claude-fable-5', input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  { model: 'claude-fable-5.1', input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  { model: 'claude-haiku-5.5', input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  { model: 'claude-opus-4.8', input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  { model: 'claude-opus-5', input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  { model: 'claude-opus-5.5', input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  { model: 'claude-sonnet-5', input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  { model: 'claude-sonnet-5.5', input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  { model: 'deepseek-v4.1-flash', input: 0.3, output: 1.2, cacheRead: 0.006 },
  { model: 'deepseek-v4-flash', input: 0.44, output: 1.32, cacheRead: 0.014 },
  { model: 'deepseek-v4-flash-vision-exp', input: 0.44, output: 1.32, cacheRead: 0.014 },
  { model: 'deepseek-v4-pro', input: 1.32, output: 3.96, cacheRead: 0.044 },
  { model: 'gemini-3.7-flash', input: 0.75, output: 3.75, cacheRead: 0.075 },
  { model: 'gemini-3.8-flash', input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0.08333 },
  { model: 'glm-5.2', input: 1.4, output: 4.4, cacheRead: 0.26 },
  { model: 'glm-5.3-flash', input: 0.075, output: 0.25, cacheRead: 0.015 },
  { model: 'glm-5.3-flashx', input: 0.37, output: 1.25, cacheRead: 0.075 },
  { model: 'gpt-5.6-luna', input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
  { model: 'gpt-5.6-sol', input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 },
  { model: 'gpt-5.6-terra', input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2.5 },
  { model: 'gpt-6.1-sol', input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  { model: 'gpt-6-astra', input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  { model: 'gpt-6-luna', input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  { model: 'gpt-6-sol', input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  { model: 'grok-4.5', input: 2, output: 6, cacheRead: 0.5 },
  { model: 'grok-4.6', input: 2, output: 6, cacheRead: 0.5 },
  { model: 'grok-4.7', input: 2, output: 6, cacheRead: 0.5 },
  { model: 'hy4-preview', input: 0.834, output: 2.501, cacheRead: 0.042 },
  { model: 'kimi-k2.7-code', input: 0.95, output: 4, cacheRead: 0.19 },
  { model: 'kimi-k3', input: 3, output: 15, cacheRead: 0.3 },
  { model: 'mimo-v2.6-flash', input: 0.14, output: 0.28, cacheRead: 0.0028 },
  { model: 'mimo-v2.6-pro', input: 0.435, output: 0.87, cacheRead: 0.0036 },
  { model: 'muse-spark-1.3', input: 1.25, output: 4.25, cacheRead: 0.15 },
  { model: 'muse-wonder', input: 4, output: 20, cacheRead: 0.2 },
  { model: 'qwen3.7-max', input: 2.5, output: 7.5, cacheRead: 0.5, cacheWrite: 3.125 },
]

/** Lookup by model id. */
const BY_MODEL = new Map(BASE_PRICES.map((price) => [price.model, price]))

/**
 * Read one model's price.
 * @param model - exact model id.
 * @returns the price, or undefined when the model is not in the list.
 */
export function priceOf(model: string): ModelPrice | undefined {
  return BY_MODEL.get(model)
}
