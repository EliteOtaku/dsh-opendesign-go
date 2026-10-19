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
import type { ModelPrice } from './usage-ledger.ts';
/** When this snapshot was read from the public endpoint. */
export declare const PRICES_AS_OF = "2026-10-19";
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
