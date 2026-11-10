/**
 * Model catalog for the OpenDesign Go plan.
 *
 * `GET {baseURL}/models` answers per entitlement and mixes two kinds of model in
 * one list: chat models, which this route answers with `POST /chat/completions`,
 * and image-generation models, which that endpoint rejects and only
 * `POST /images/generations` serves. An id list alone therefore cannot say which
 * request to send, and treating every id as a chat model is what made a
 * generation model fail the moment it was selected.
 *
 * So a snapshot keeps both kinds apart — and keeps both. Dropping the image ids
 * would make an entitled model invisible, which reads as a missing feature
 * rather than a limit, and the account pays for them either way.
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
    /**
     * Whether this model answers with an image instead of text.
     *
     * The harness model vocabulary has no output-modality field, so this travels
     * on the catalog row instead. It decides the endpoint, not the visibility:
     * both kinds stay selectable.
     */
    readonly imageGeneration?: true;
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
    /**
     * Ids among {@link ids} that answer with an image.
     *
     * A snapshot written before this field existed reads as "none identified",
     * so an old cache keeps its previous behaviour instead of silently
     * reclassifying half the catalog.
     */
    readonly imageIds: readonly string[];
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
 * @returns rows in display order, image models marked.
 */
export declare function catalogRowsOf(snapshot: CatalogSnapshot | undefined): readonly CatalogModel[];
/**
 * Whether one catalog entry answers with an image rather than text.
 *
 * A declared output modality is authoritative in both directions; only when the
 * gateway declares nothing does the known-id table decide.
 * @param id - model id from the catalog.
 * @param outputModalities - modalities the catalog declared, or undefined.
 * @returns true when this entry must be sent to the image endpoint.
 */
export declare function isImageModel(id: string, outputModalities?: readonly string[]): boolean;
/** Route this catalog belongs to. */
export { PROVIDER_ID };
