/**
 * Public OpenDesign price list, embedded as a snapshot.
 *
 * `GET https://amr-api.open-design.ai/api/v1/public/model-prices` is public and
 * needs no credential. Nothing fetches it at run time: `PRICES_URL` is recorded
 * so a reader can re-derive this table, and every value below was copied from
 * that endpoint. Filling the gap would mean another network call on the request
 * path, for a list that changes a few times a month at most.
 *
 * Only the **base tier** is represented. Nine rows on the endpoint carry a
 * `longContext` block that raises the price above an input-token threshold (for
 * example `gpt-6.1-terra` above 272,000 input tokens); `ModelPrice` has no field
 * for a second tier, so those models are recorded at their base price and every
 * report that involves them is labelled `base-tier` rather than presented as a
 * bill.
 *
 * @module dsh-opendesign-go/pricing
 */
import type { ModelPrice } from './usage-ledger.ts';
/** When this snapshot was read from the public endpoint. */
export declare const PRICES_AS_OF = "2026-11-07";
/** Endpoint that serves the live list. */
export declare const PRICES_URL = "https://amr-api.open-design.ai/api/v1/public/model-prices";
/** Price per million tokens in USD, keyed by exact model id. */
export declare const BASE_PRICES: readonly ModelPrice[];
/**
 * Read one model's price.
 * @param model - exact model id.
 * @returns the price, or undefined when the model is not in the list.
 */
export declare function priceOf(model: string): ModelPrice | undefined;
