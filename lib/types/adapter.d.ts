/**
 * OpenDesign Chat Completions inference adapter (M2).
 *
 * One streaming call per request: the harness vocabulary is projected by
 * `conversion.ts`, the wire call is a single `POST {baseURL}/chat/completions`
 * with `stream: true`, and the SSE response is translated back into
 * {@link StreamChunk}s. Provider failures are named by `gateway-error.ts` so the
 * harness keeps owning retry and recovery.
 *
 * Deliberately out of scope here: request/idle deadlines from the plugin
 * configuration, protocol selection (Responses/Anthropic) and replay state.
 * Those arrive with M6 and the later milestones; this adapter sends the M2
 * protocol only.
 *
 * @module dsh-opendesign-go/adapter
 */
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import { type OpenDesignConfig } from './config-contract.ts';
/** What one adapter instance reads from the plugin. */
export interface OpenDesignAdapterOptions {
    /** Current plugin configuration; read per request so settings changes apply. */
    config: () => OpenDesignConfig;
    /**
     * Resolve one account's API key by credential reference.
     * @param ref - reference of the account to resolve.
     * @returns the usable key, or undefined when that account has none stored.
     */
    resolveApiKey: (ref: string) => Promise<string | undefined>;
    /**
     * Pin one account as the one subsequent requests should use.
     *
     * Called only after an account has actually produced output, so a failing
     * account is never promoted just by being tried.
     * @param ref - the account that succeeded.
     */
    onAccountSettled?: (ref: string) => void;
    /**
     * Report the token usage of one finished call so it can be priced and
     * recorded.
     *
     * Called once per call that produced a usage chunk. A call that failed before
     * reporting usage costs nothing measurable and is not recorded: counting it
     * would make the ledger claim spend that never happened.
     * @param call - the model, the account that served it, and its usage.
     */
    onUsage?: (call: {
        model: string;
        accountRef: string;
        usage: TokenUsage;
    }) => void;
    /**
     * Turn one durable image reference into an inline data URL.
     *
     * Absent means this host has no attachment service, so image content projects
     * to the harness placeholder text instead of bytes. The resolver is asked only
     * for models whose catalog entry declares the image modality, so a text-only
     * model never receives image bytes.
     * @param attachment - the durable reference carried by an image block.
     * @returns a `data:` URL, or undefined when the bytes are not readable.
     */
    imageDataUrl?: (attachment: unknown) => string | undefined;
}
/**
 * Stream one model call.
 *
 * The chunk contract is owned by {@link StreamChunk}: every open block is
 * started before its deltas and closed with its assembled block, usage is
 * emitted before the terminal finish, and nothing follows the finish.
 */
export declare class OpenDesignAdapter extends LlmAdapter {
    #private;
    /**
     * @param options - configuration and credential accessors supplied by the plugin.
     */
    constructor(options: OpenDesignAdapterOptions);
    /**
     * Describe the single route this adapter serves.
     * @param provider - registered provider route.
     * @returns display metadata whose id equals the route.
     */
    providerInfo(provider: string): LlmProviderInfo;
    /**
     * Advertise the models the user left enabled.
     *
     * An empty enabled list means "all", so a fresh install shows the full
     * catalog; hiding a model is opt-in. Filtering here rather than in the picker
     * means a disabled model is absent from every consumer, including the
     * composer, not merely hidden from one list.
     * @param provider - registered provider route.
     * @returns the enabled rows, in display order.
     */
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    /**
     * Resolve metadata for one exact model.
     *
     * Routing accepts ids outside the seed catalog, so an unknown id resolves to
     * itself instead of failing; the catalog stays advisory.
     *
     * The returned metadata is what the picker renders: `context` drives the
     * context-window display and truncation warnings, `defaultMaxTokens` caps
     * output, and `reasoning` is what makes a reasoning-effort selector appear at
     * all. Omitting any of them is why the selector was missing.
     * @param provider - registered provider route.
     * @param model - exact model id from the request.
     * @param _signal - cancellation for this lookup; the seed needs none.
     * @returns provider/model identity plus resolved parameters.
     */
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/**
 * Whether a failure justifies trying the next account.
 * @param failure - classified failure from one attempt.
 * @returns true only for a rejected credential or exhausted quota.
 */
export declare function isRetryableAccountFailure(failure: unknown): boolean;
