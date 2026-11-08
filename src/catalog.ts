/**
 * Model catalog for the OpenDesign Go plan.
 *
 * M2 ships a static seed so the adapter has models to resolve before the live
 * catalog exists. M3 replaces the seed with `/v1/models` (entitlement-aware)
 * merged with the public `model-prices` endpoint, keeping this module as the
 * merge point so callers never depend on where a row came from.
 *
 * The fourteen ids below are the Design Plan models the Go plan grants. Go does
 * not include the package-model allowance, so nothing else is advertised.
 *
 * @module dsh-opendesign-go/catalog
 */
import type { ModelModality } from '@deepseek-ai/dsh-llm'
import { PROVIDER_ID } from './config-contract.ts'
import { MODEL_DEFAULTS } from './model-params.ts'

/** One advertised model row. */
export interface CatalogModel {
  /** Exact model id accepted by `GenerateOptions.model`. */
  readonly id: string
  /** Human-readable name for selectors. */
  readonly name: string
}

/**
 * The Design Plan models a Go subscription grants, in display order.
 *
 * Names mirror the OpenDesign pricing table. A model's accepted modalities are
 * deliberately not declared here: `MODEL_DEFAULTS` in `model-params.ts` is the
 * single source for them, taken from each vendor's documentation. A second copy
 * in this table once made the picker and the request path disagree about which
 * models accept images.
 */
export const GO_DESIGN_PLAN_MODELS: readonly CatalogModel[] = [
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
  { id: 'deepseek-v4.1-flash-eco', name: 'DeepSeek V4.1 Flash Eco' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision Exp' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  { id: 'claude-haiku-5.5', name: 'Claude Haiku 5.5' },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna' },
  { id: 'glm-5.3-flash', name: 'GLM-5.3 Flash' },
  { id: 'glm-5.3-flashx', name: 'GLM-5.3 Flash-X' },
  { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code' },
  { id: 'mimo-v2.6-flash', name: 'MiMo V2.6 Flash' },
  { id: 'mimo-v2.6-pro', name: 'MiMo V2.6 Pro' },
  { id: 'minimax-m3.1-flash', name: 'MiniMax M3.1 Flash' },
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
  // Modalities come from MODEL_DEFAULTS, the one table with vendor-sourced
  // values, so this projection cannot disagree with the request gate.
  return GO_DESIGN_PLAN_MODELS.map((model) => {
    const modalities = MODEL_DEFAULTS[model.id]?.inputModalities
    return {
      provider,
      id: model.id,
      name: model.name,
      ...(modalities === undefined ? {} : { inputModalities: modalities }),
    }
  })
}

/** Where a catalog snapshot came from. */
export type CatalogSource = 'gateway' | 'fallback'

/** One reading of the models this account may use. */
export interface CatalogSnapshot {
  /** When the reading was taken, when the writer recorded it. */
  readonly asOf: string | undefined
  /** Whether the ids came from the gateway or from the bundled list. */
  readonly source: CatalogSource
  /** Model ids in display order. Empty is a real answer, not a missing one. */
  readonly ids: readonly string[]
  /** Why the bundled list was used, when it was. */
  readonly error: string | undefined
}

/** Capitalisation the derivation cannot guess from a hyphenated id. */
const NAME_FIXES: Readonly<Record<string, string>> = Object.freeze({
  deepseek: 'DeepSeek',
  gpt: 'GPT',
  glm: 'GLM',
  kimi: 'Kimi',
  mimo: 'MiMo',
  minimax: 'MiniMax',
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
  grok: 'Grok',
  qwen: 'Qwen',
  hy: 'Hunyuan',
  seed: 'Seedream',
})

/**
 * Human-readable name for a model id.
 *
 * The bundled table wins where it has an entry, because those names are spelled
 * the way the vendor spells them and no derivation reproduces that. Everything
 * else is derived, which is imprecise but legible and needs no maintenance when
 * the gateway adds a model.
 * @param id - model id from the catalog.
 * @returns a display name.
 */
export function displayNameOf(id: string): string {
  const known = GO_DESIGN_PLAN_MODELS.find((model) => model.id === id)
  if (known !== undefined) return known.name
  if (id.length === 0) return ''
  return id.split('-').map((part) => {
    const fix = NAME_FIXES[part.toLowerCase()]
    if (fix !== undefined) return fix
    // Version and size segments keep whatever casing the gateway used.
    if (/^\d/u.test(part)) return part
    return part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
  }).join(' ')
}

/**
 * Read the catalog snapshot from its serialized settings field.
 *
 * A malformed value reads as "no snapshot" rather than throwing: the field is
 * written by a background read, and one bad character must not take the whole
 * settings page down.
 * @param raw - serialized snapshot, or undefined/empty when unset.
 * @returns the snapshot, or undefined when absent or unusable.
 */
export function parseCatalog(raw: string | undefined): CatalogSnapshot | undefined {
  if (raw === undefined || raw.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const row = parsed as Record<string, unknown>
  const ids = row.ids
  if (!Array.isArray(ids)) return undefined
  const clean = ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
  const source: CatalogSource = row.source === 'fallback' ? 'fallback' : 'gateway'
  return {
    asOf: typeof row.asOf === 'string' && row.asOf.length > 0 ? row.asOf : undefined,
    source,
    ids: clean,
    error: typeof row.error === 'string' && row.error.length > 0 ? row.error : undefined,
  }
}

/**
 * Project a snapshot into the rows every consumer renders.
 *
 * A missing snapshot means the read has not landed, so the bundled list stands
 * in; an *empty* snapshot means the account grants nothing, and substituting the
 * bundled list there would advertise models the account cannot call.
 * @param snapshot - parsed snapshot, or undefined when none was ever written.
 * @returns rows in display order.
 */
export function catalogRowsOf(snapshot: CatalogSnapshot | undefined): readonly CatalogModel[] {
  if (snapshot === undefined) return GO_DESIGN_PLAN_MODELS
  return snapshot.ids.map((id) => ({ id, name: displayNameOf(id) }))
}

/** Route this catalog belongs to. */
export { PROVIDER_ID }
