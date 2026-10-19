/**
 * Model catalog for the OpenDesign Go plan.
 *
 * M2 ships a static seed so the adapter has models to resolve before the live
 * catalog exists. M3 replaces the seed with `/v1/models` (entitlement-aware)
 * merged with the public `model-prices` endpoint, keeping this module as the
 * merge point so callers never depend on where a row came from.
 *
 * The twelve ids below are the Design Plan models the Go plan grants. Go does
 * not include the package-model allowance, so nothing else is advertised.
 *
 * @module dsh-opendesign-go/catalog
 */
import type { ModelModality } from '@deepseek-ai/dsh-llm'
import { PROVIDER_ID } from './config-contract.ts'

/** One advertised model row. */
export interface CatalogModel {
  /** Exact model id accepted by `GenerateOptions.model`. */
  readonly id: string
  /** Human-readable name for selectors. */
  readonly name: string
  /** Accepted request modalities; absent means unknown. */
  readonly inputModalities?: readonly ModelModality[]
}

/**
 * The Design Plan models a Go subscription grants, in display order.
 *
 * Names mirror the OpenDesign pricing table. Modalities are declared only where
 * the model id states them; everything else stays unknown rather than guessed.
 */
export const GO_DESIGN_PLAN_MODELS: readonly CatalogModel[] = [
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision Exp', inputModalities: ['text', 'image'] },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  { id: 'claude-haiku-5.5', name: 'Claude Haiku 5.5' },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna' },
  { id: 'glm-5.3-flash', name: 'GLM-5.3 Flash' },
  { id: 'glm-5.3-flashx', name: 'GLM-5.3 Flash-X' },
  { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code' },
  { id: 'mimo-v2.6-flash', name: 'MiMo V2.6 Flash' },
  { id: 'mimo-v2.6-pro', name: 'MiMo V2.6 Pro' },
  { id: 'hy4-preview', name: 'Hunyuan H4 Preview' },
]

/**
 * Read one seed row by exact id.
 * @param id - model id from the request.
 * @returns the row, or undefined when the seed does not carry it.
 */
export function seedModel(id: string): CatalogModel | undefined {
  return GO_DESIGN_PLAN_MODELS.find((model) => model.id === id)
}

/**
 * Project the seed into the harness model vocabulary for one route.
 * @param provider - route that owns these models.
 * @returns discoverable models in display order.
 */
export function listSeedModels(provider: string): readonly {
  provider: string
  id: string
  name: string
  inputModalities?: readonly ModelModality[]
}[] {
  return GO_DESIGN_PLAN_MODELS.map((model) => ({
    provider,
    id: model.id,
    name: model.name,
    ...(model.inputModalities === undefined ? {} : { inputModalities: model.inputModalities }),
  }))
}

/** Route this catalog belongs to. */
export { PROVIDER_ID }
