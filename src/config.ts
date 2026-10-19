/**
 * Plugin configuration schema and the accessors the rest of the plugin reads.
 *
 * Two shapes describe the same fields on purpose. {@link PlainConfig} validates
 * ordinary data, which the settings surface and tests exchange. {@link Config}
 * marks every field volatile so the Loader can hand the running plugin stable
 * references and commit an edit without restarting it. Nothing outside this
 * module reads those references directly: {@link readConfig} is the single place
 * that turns them back into plain values, so a field cannot be interpreted two
 * different ways.
 *
 * @module dsh-opendesign-go/config
 */
import z from '@deepseek-ai/schemastery'
import { DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL } from './config-contract.ts'
import type { OpenDesignAccount, OpenDesignConfig } from './config-contract.ts'

/** Deadline for one dispatch, spanning discovery through streaming. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 1_800_000

/** Maximum idle interval while a stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000

/**
 * Credential references name environment variables; they never carry key
 * material themselves.
 */
const API_KEY_ENV_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** One account: a distinct subscription, not a second key for one account. */
const AccountSchema = z.object({
  /** Stable local id; never sent upstream. */
  id: z.string().required(),
  /** User-visible label. */
  name: z.string().required(),
  /** Credential reference resolving this account's API key. */
  apiKeyEnv: z.string().required().role('credential-ref'),
})

/**
 * The account list. `null` and an empty list both mean "only {@link apiKeyEnv}".
 *
 * Kept as a plain `array` schema with no `transform`: the settings service
 * projects an editable form only from a schema tree it can walk structurally
 * (`volatileForm` reads `type === 'object'` and recurses through `dict`), and a
 * `transform` node terminates that walk. Callers normalize `null`/`[]` through
 * {@link accountsOfConfig} instead, so the wire schema stays walkable.
 */
const AccountsSchema = z.array(AccountSchema).default([]) as unknown as z<readonly OpenDesignAccount[]>

/**
 * Normalize the configured account list.
 * @param accounts - the stored list, possibly empty.
 * @returns the list, or `null` when it carries no account.
 */
export function accountsOfConfig(accounts: readonly OpenDesignAccount[] | null | undefined): readonly OpenDesignAccount[] | null {
  return accounts === undefined || accounts === null || accounts.length === 0 ? null : accounts
}

/** Validated configuration data, as exchanged with the settings surface. */
export const PlainConfig: z<OpenDesignConfig> = z.object({
  enabled: z.boolean().default(true),
  apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV),
  accounts: AccountsSchema,
  autoSwitch: z.boolean().default(false),
  baseURL: z.string().default(DEFAULT_BASE_URL),
  requestTimeoutMs: z.number().default(DEFAULT_REQUEST_TIMEOUT_MS),
  streamIdleTimeoutMs: z.number().default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
})

/**
 * Loader schema: the same fields, each parsed into a live reference.
 *
 * Input stays partial because a composition entry or a settings draft may set
 * only some fields; the Loader fills the rest from the schema defaults. The
 * parsed value is {@link LiveConfig}, not {@link OpenDesignConfig}: every field
 * is a reference, and only {@link readConfig} reads through them.
 *
 * Schemastery types a volatile field as `Volatile<T | undefined>` even when a
 * default makes the value always present, so the declared shape is asserted
 * once here instead of leaking `undefined` into every consumer. Every field
 * below carries a default, which is what keeps that assertion true.
 */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV).volatile(),
  accounts: AccountsSchema.volatile(),
  autoSwitch: z.boolean().default(false).volatile(),
  baseURL: z.string().default(DEFAULT_BASE_URL).volatile(),
  requestTimeoutMs: z.number().default(DEFAULT_REQUEST_TIMEOUT_MS).volatile(),
  streamIdleTimeoutMs: z.number().default(DEFAULT_STREAM_IDLE_TIMEOUT_MS).volatile(),
}) as unknown as z<Partial<OpenDesignConfig>, LiveConfig>

/**
 * One live configuration reference.
 *
 * The reference itself is stable for the lifetime of the plugin; its value is
 * replaced when the Loader commits an edit. Callers read it per operation and
 * never cache the snapshot across awaits.
 */
export interface LiveConfig {
  /** Whether the route is offered. */
  readonly enabled: { get(): boolean }
  /** Credential reference of the selected account. */
  readonly apiKeyEnv: { get(): string }
  /** Accounts, or `null` for "only {@link apiKeyEnv}". */
  readonly accounts: { get(): readonly OpenDesignAccount[] | null }
  /** Try the next account after a credential rejection. */
  readonly autoSwitch: { get(): boolean }
  /** Inference base URL, stored as configured. */
  readonly baseURL: { get(): string }
  /** Deadline for one dispatch. */
  readonly requestTimeoutMs: { get(): number }
  /** Maximum idle interval while a stream read is outstanding. */
  readonly streamIdleTimeoutMs: { get(): number }
}

/**
 * Read the live configuration into one plain snapshot.
 * @param config - live references handed to the plugin by the Loader.
 * @returns the resolved values; `baseURL` passes through {@link migrateGatewayBaseURL}.
 */
export function readConfig(config: LiveConfig): OpenDesignConfig {
  return {
    enabled: config.enabled.get(),
    apiKeyEnv: config.apiKeyEnv.get(),
    accounts: accountsOfConfig(config.accounts.get()),
    autoSwitch: config.autoSwitch.get(),
    baseURL: migrateGatewayBaseURL(config.baseURL.get()),
    requestTimeoutMs: config.requestTimeoutMs.get(),
    streamIdleTimeoutMs: config.streamIdleTimeoutMs.get(),
  }
}

/**
 * Validate an inference base URL and return its canonical form.
 *
 * The adapter appends protocol paths itself, so a trailing slash is dropped; a
 * query or fragment is rejected outright because neither survives path joining
 * and silently changing the request target would be worse than failing here.
 * @param raw - candidate base URL from configuration.
 * @returns the URL without trailing slashes.
 * @throws {Error} when the value is not an absolute http(s) URL.
 */
export function assertBaseURL(raw: string): string {
  const candidate = raw.trim()
  if (candidate.length === 0) {
    throw new Error('baseURL must not be empty')
  }
  if (candidate.includes('?') || candidate.includes('#')) {
    throw new Error(`baseURL must not carry a query or fragment: ${raw}`)
  }
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error(`baseURL must be an absolute URL: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`baseURL must use http or https: ${raw}`)
  }
  return url.toString().replace(/\/+$/, '')
}

/**
 * Reject a credential reference that is not a usable environment-variable name.
 * @param raw - candidate credential reference.
 * @throws {Error} when the name contains characters a shell would not accept.
 */
export function assertApiKeyEnv(raw: string): void {
  if (!API_KEY_ENV_PATTERN.test(raw)) {
    throw new Error(`apiKeyEnv must match ${API_KEY_ENV_PATTERN.source}: ${raw}`)
  }
}

/**
 * Normalize a stored base URL onto the current gateway.
 *
 * Kept as an explicit extension point: if the gateway moves, a future revision
 * rewrites the legacy host here so persisted configurations keep working after
 * the default changes. Today every stored URL is already current, so the value
 * passes through unchanged.
 * @param baseURL - stored base URL.
 * @returns the base URL to call.
 */
export function migrateGatewayBaseURL(baseURL: string): string {
  return baseURL
}
