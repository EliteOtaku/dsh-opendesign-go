/**
 * Classify a gateway failure into the harness's provider-neutral error codes.
 *
 * The OpenDesign gateway answers `{"error":{"code","message","type"}}` on
 * non-2xx responses, so classification reads structured fields first and only
 * then falls back to message wording through the host's own predicates. The
 * harness owns recovery and retry limits; this module only names the failure.
 *
 * @module dsh-opendesign-go/gateway-error
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
/** Provider-neutral codes this adapter may emit. */
export declare const GATEWAY_CODES: {
    readonly auth: "AUTH";
    readonly rateLimit: "RATE_LIMIT";
    readonly server: "SERVER";
    readonly timeout: "TIMEOUT";
    readonly invalidRequest: "INVALID_REQUEST";
    readonly unsupported: "UNSUPPORTED_OPTION";
};
/** Structured facts captured from one failed gateway response. */
export interface GatewayFailureDetail {
    /** HTTP status, when a response was received. */
    readonly status?: number;
    /** Gateway `error.code`, when present. */
    readonly code?: string;
    /** Gateway `error.type`, when present. */
    readonly type?: string;
    /** Gateway `error.message` or a transport failure summary. */
    readonly message: string;
}
/**
 * Map one gateway failure to a typed harness error.
 *
 * Order matters: an explicit quota signal outranks the generic 401 the gateway
 * also uses for authentication, because the fixes differ — add credit versus
 * correct a key. A generic 401/403 never proves a key is invalid on its own.
 * @param detail - captured failure facts.
 * @returns the error to throw from the adapter.
 */
export declare function classifyGatewayFailure(detail: GatewayFailureDetail): LlmError;
/**
 * Classify a response that finished normally but carried no content.
 * @returns the error the adapter throws instead of yielding an empty message.
 */
export declare function emptyResponseFailure(): LlmError;
