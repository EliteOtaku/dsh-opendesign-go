/**
 * Read the model catalog the gateway grants this account.
 *
 * `GET {baseURL}/models` answers per entitlement: a Go key returns the fourteen
 * Design Plan models, and a Plus or Pro key returns those plus the models that
 * tier pays for. That makes it the only source that cannot disagree with what
 * the account may actually call — a hard-coded table either omits a tier's
 * models or advertises models the account cannot use, and the second failure is
 * a 403 the user sees as "the plugin is broken".
 *
 * The shape is the gateway's own, so several plausible envelopes are accepted
 * and anything unrecognised reads as "no catalog this start" rather than an
 * error. The caller falls back to the bundled list.
 *
 * One field matters beyond the id: whether the entry produces text. The catalog
 * mixes chat models and image-generation models, and the two need different
 * endpoints, so an id list alone cannot say which request to send.
 *
 * @module dsh-opendesign-go/catalog-fetch
 */
/** One catalog entry as the gateway described it. */
export interface GatewayModelEntry {
    /** Exact model id. */
    readonly id: string;
    /**
     * Output modalities the entry declared, or undefined when it declared none.
     *
     * Forwarded rather than interpreted here: the catalog module owns the rule
     * that decides what counts as an image model, so the fetch stays a parser.
     */
    readonly outputModalities?: readonly string[];
}
/**
 * Ask the gateway which models this account may use.
 *
 * Never throws: this runs while the plugin is activating, and an unreachable or
 * unhappy gateway must degrade to the bundled list rather than fail the start.
 * @param baseURL - inference base URL, with or without a trailing slash.
 * @param apiKey - the selected account's key.
 * @param fetchImpl - fetch implementation, injected for tests.
 * @param timeoutMs - request deadline.
 * @returns the entries, or undefined when the catalog could not be read.
 */
export declare function fetchGatewayModels(baseURL: string, apiKey: string, fetchImpl?: typeof fetch, timeoutMs?: number): Promise<GatewayModelEntry[] | undefined>;
