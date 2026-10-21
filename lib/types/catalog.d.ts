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
/** Route this catalog belongs to. */
export { PROVIDER_ID };
