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
import type { ModelModality } from '@deepseek-ai/dsh-llm';
import { PROVIDER_ID } from './config-contract.ts';
/** One advertised model row. */
export interface CatalogModel {
    /** Exact model id accepted by `GenerateOptions.model`. */
    readonly id: string;
    /** Human-readable name for selectors. */
    readonly name: string;
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
export declare const GO_DESIGN_PLAN_MODELS: readonly CatalogModel[];
/**
 * Read one seed row by exact id.
 * @param id - model id from the request.
 * @returns the row, or undefined when the seed does not carry it.
 */
export declare function seedModel(id: string): CatalogModel | undefined;
/**
 * Project the seed into the harness model vocabulary for one route.
 * @param provider - route that owns these models.
 * @returns discoverable models in display order.
 */
export declare function listSeedModels(provider: string): readonly {
    provider: string;
    id: string;
    name: string;
    inputModalities?: readonly ModelModality[];
}[];
/** Where a catalog snapshot came from. */
export type CatalogSource = 'gateway' | 'fallback';
/** One reading of the models this account may use. */
export interface CatalogSnapshot {
    /** When the reading was taken, when the writer recorded it. */
    readonly asOf: string | undefined;
    /** Whether the ids came from the gateway or from the bundled list. */
    readonly source: CatalogSource;
    /** Model ids in display order. Empty is a real answer, not a missing one. */
    readonly ids: readonly string[];
    /** Why the bundled list was used, when it was. */
    readonly error: string | undefined;
}
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
export declare function displayNameOf(id: string): string;
/**
 * Read the catalog snapshot from its serialized settings field.
 *
 * A malformed value reads as "no snapshot" rather than throwing: the field is
 * written by a background read, and one bad character must not take the whole
 * settings page down.
 * @param raw - serialized snapshot, or undefined/empty when unset.
 * @returns the snapshot, or undefined when absent or unusable.
 */
export declare function parseCatalog(raw: string | undefined): CatalogSnapshot | undefined;
/**
 * Project a snapshot into the rows every consumer renders.
 *
 * A missing snapshot means the read has not landed, so the bundled list stands
 * in; an *empty* snapshot means the account grants nothing, and substituting the
 * bundled list there would advertise models the account cannot call.
 * @param snapshot - parsed snapshot, or undefined when none was ever written.
 * @returns rows in display order.
 */
export declare function catalogRowsOf(snapshot: CatalogSnapshot | undefined): readonly CatalogModel[];
/** Route this catalog belongs to. */
export { PROVIDER_ID };
