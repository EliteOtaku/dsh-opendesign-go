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
import {
  ACCOUNT_QUOTA_EXCEEDED_CODE,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  EMPTY_RESPONSE_CODE,
  INVALID_CREDENTIAL_CODE,
  LlmError,
  QUOTA_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
} from '@deepseek-ai/dsh-llm'

/** Provider-neutral codes this adapter may emit. */
export const GATEWAY_CODES = {
  auth: 'AUTH',
  rateLimit: 'RATE_LIMIT',
  server: 'SERVER',
  timeout: 'TIMEOUT',
  invalidRequest: 'INVALID_REQUEST',
  unsupported: 'UNSUPPORTED_OPTION',
} as const

/** Structured facts captured from one failed gateway response. */
export interface GatewayFailureDetail {
  /** HTTP status, when a response was received. */
  readonly status?: number
  /** Gateway `error.code`, when present. */
  readonly code?: string
  /** Gateway `error.type`, when present. */
  readonly type?: string
  /** Gateway `error.message` or a transport failure summary. */
  readonly message: string
}

/**
 * Join the provider-supplied identifying text for the host predicates.
 * @param detail - captured failure facts.
 * @returns one lowercase string carrying code, type and message.
 */
function detailText(detail: GatewayFailureDetail): string {
  return [detail.code, detail.type, detail.message].filter((part) => part !== undefined).join(' ').toLowerCase()
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
export function classifyGatewayFailure(detail: GatewayFailureDetail): LlmError {
  const text = detailText(detail)
  const options = { cause: undefined } as const

  if (isContextWindowExceededError(text)) {
    return new LlmError(`OpenDesign rejected the request: context window exceeded (${detail.message})`, CONTEXT_WINDOW_EXCEEDED_CODE)
  }
  if (isQuotaExceededError(text)) {
    // A subscription window that ran dry is an account quota; a wallet that ran
    // dry is plain credit. Both are terminal for this account.
    const code = text.includes('subscription') || text.includes('plan') ? ACCOUNT_QUOTA_EXCEEDED_CODE : QUOTA_EXCEEDED_CODE
    return new LlmError(`OpenDesign quota exhausted: ${detail.message}`, code)
  }
  if (detail.code === 'missing_api_key' || detail.code === 'invalid_api_key') {
    return new LlmError(`OpenDesign rejected the credential: ${detail.message}`, INVALID_CREDENTIAL_CODE)
  }
  if (detail.status === 429) {
    return new LlmError(`OpenDesign rate limit: ${detail.message}`, GATEWAY_CODES.rateLimit)
  }
  if (detail.status === 504) {
    return new LlmError(`OpenDesign gateway timeout: ${detail.message}`, GATEWAY_CODES.timeout)
  }
  if (detail.status !== undefined && detail.status >= 500) {
    return new LlmError(`OpenDesign gateway error (${detail.status}): ${detail.message}`, GATEWAY_CODES.server)
  }
  if (detail.status === 401 || detail.status === 403) {
    return new LlmError(`OpenDesign authentication failed (${detail.status}): ${detail.message}`, GATEWAY_CODES.auth)
  }
  return new LlmError(`OpenDesign request failed${detail.status === undefined ? '' : ` (${detail.status})`}: ${detail.message}`, GATEWAY_CODES.invalidRequest)
}

/**
 * Classify a response that finished normally but carried no content.
 * @returns the error the adapter throws instead of yielding an empty message.
 */
export function emptyResponseFailure(): LlmError {
  return new LlmError('OpenDesign returned no content blocks', EMPTY_RESPONSE_CODE)
}
