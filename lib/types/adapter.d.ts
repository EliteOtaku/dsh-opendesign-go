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
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
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
     * Advertise the Design Plan seed catalog.
     * @param provider - registered provider route.
     * @returns the seed rows projected for this route, in display order.
     */
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    /**
     * Resolve metadata for one exact model.
     *
     * Routing accepts ids outside the seed catalog, so an unknown id resolves to
     * itself instead of failing; the catalog stays advisory.
     * @param provider - registered provider route.
     * @param model - exact model id from the request.
     * @param _signal - cancellation for this lookup; the seed needs none.
     * @returns provider/model identity plus any seed-declared modalities.
     */
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    /**
     * Stream one Chat Completions call.
     * @param options - fully assembled request.
     * @returns the translated chunk stream.
     * @throws LlmError - classified gateway failure, missing credential, or an
     * empty response.
     */
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/**
 * Whether a failure justifies trying the next account.
 * @param failure - classified failure from one attempt.
 * @returns true only for a rejected credential or exhausted quota.
 */
export declare function isRetryableAccountFailure(failure: unknown): boolean;
