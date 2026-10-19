/**
 * Browser-safe configuration vocabulary shared by the host and (from M4) the
 * Web client. Both faces import these declarations instead of keeping
 * separate interfaces, so a field cannot mean two things.
 *
 * @module dsh-opendesign-go/config-contract
 */

/** Registered provider route. Stable: sessions and presets persist it. */
export const PROVIDER_ID = 'dsh-opendesign-go'

/** Human-readable provider name shown in selectors and diagnostics. */
export const DISPLAY_NAME = 'DSH OpenDesign Go'

/** Settings namespace this plugin installs and the Web page edits. */
export const SETTINGS_NAMESPACE = 'llm-opendesign-go'

/**
 * Loader row id in `cordis.patch.yml`, and the profile entry the modern
 * settings surface edits. The client reads this same id through `configForms`.
 */
export const PROFILE_ENTRY_ID = 'opendesign-go'

/**
 * OpenAI-compatible inference base. Anthropic Messages uses the same host
 * without the `/v1` suffix; the SDK appends `/v1/messages` itself.
 */
export const DEFAULT_BASE_URL = 'https://amr-link.open-design.ai/v1'

/** Environment variable resolving the OpenDesign API key by default. */
export const DEFAULT_API_KEY_ENV = 'OPENDESIGN_API_KEY'

/** One OpenDesign account: a distinct subscription, not a second key. */
export interface OpenDesignAccount {
  /** Stable local id; never sent upstream. */
  readonly id: string
  /** User-visible label. */
  readonly name: string
  /** Credential reference resolving this account's API key. */
  readonly apiKeyEnv: string
}

/**
 * Resolved plugin configuration. Fields are data-only so the settings service
 * can serialize them to the client.
 */
export interface OpenDesignConfig {
  /** `false` withdraws the route; the plugin stays mounted. */
  readonly enabled: boolean
  /** Credential reference of the selected account. */
  readonly apiKeyEnv: string
  /** Accounts; `null` means "only {@link apiKeyEnv}". */
  readonly accounts: readonly OpenDesignAccount[] | null
  /** Try the next account after a credential rejection. */
  readonly autoSwitch: boolean
  /** Inference base URL without a trailing slash. */
  readonly baseURL: string
  /** Deadline for one dispatch, spanning discovery through streaming. */
  readonly requestTimeoutMs: number
  /** Maximum idle interval while a stream read is outstanding. */
  readonly streamIdleTimeoutMs: number
}
