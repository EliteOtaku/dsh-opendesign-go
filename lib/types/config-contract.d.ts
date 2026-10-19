/**
 * Browser-safe configuration vocabulary shared by the host and (from M4) the
 * Web client. Both faces import these declarations instead of keeping
 * separate interfaces, so a field cannot mean two things.
 *
 * @module dsh-opendesign-go/config-contract
 */
/** Registered provider route. Stable: sessions and presets persist it. */
export declare const PROVIDER_ID = "dsh-opendesign-go";
/** Human-readable provider name shown in selectors and diagnostics. */
export declare const DISPLAY_NAME = "DSH OpenDesign Go";
/** Settings namespace this plugin installs and the Web page edits. */
export declare const SETTINGS_NAMESPACE = "llm-opendesign-go";
/**
 * Loader row id in `cordis.patch.yml`, and the profile entry the modern
 * settings surface edits. The client reads this same id through `configForms`.
 */
export declare const PROFILE_ENTRY_ID = "opendesign-go";
/**
 * OpenAI-compatible inference base. Anthropic Messages uses the same host
 * without the `/v1` suffix; the SDK appends `/v1/messages` itself.
 */
export declare const DEFAULT_BASE_URL = "https://amr-link.open-design.ai/v1";
/** Environment variable resolving the OpenDesign API key by default. */
export declare const DEFAULT_API_KEY_ENV = "OPENDESIGN_API_KEY";
/**
 * Credential reference holding the **console session token**, used only to read
 * quota. It is deliberately separate from the API key: the key bills inference,
 * the session reads the console, and a user may configure one without the other.
 */
export declare const DEFAULT_SESSION_REF = "OPENDESIGN_SESSION";
/** One OpenDesign account: a distinct subscription, not a second key. */
export interface OpenDesignAccount {
    /** Stable local id; never sent upstream. */
    readonly id: string;
    /** User-visible label. */
    readonly name: string;
    /** Credential reference resolving this account's API key. */
    readonly apiKeyEnv: string;
    /**
     * Console workspace id, needed only to read quota for this account. Omitted
     * means "inference works, quota display is unavailable" — never guessed.
     */
    readonly workspaceId?: string;
}
/**
 * Resolved plugin configuration. Fields are data-only so the settings service
 * can serialize them to the client.
 */
export interface OpenDesignConfig {
    /** `false` withdraws the route; the plugin stays mounted. */
    readonly enabled: boolean;
    /** Credential reference of the selected account. */
    readonly apiKeyEnv: string;
    /** Accounts; `null` means "only {@link apiKeyEnv}". */
    readonly accounts: readonly OpenDesignAccount[] | null;
    /** Try the next account after a credential rejection. */
    readonly autoSwitch: boolean;
    /**
     * Credential reference holding the console session token. Empty string means
     * the quota channel is off, which is the default: reading the console grants
     * account access far beyond inference.
     */
    readonly sessionRef: string;
    /** Console workspace id used when the selected account declares none. */
    readonly workspaceId: string;
    /**
     * Serialized last quota reading, written by the host after a successful
     * console read and rendered by the page.
     *
     * This is a cache, not configuration the user edits: it travels through the
     * config document because that is the one channel both faces already share,
     * and it lets the page show the last known numbers before a fresh read lands.
     * An empty string means nothing has been read yet.
     */
    readonly usageJson: string;
    /**
     * Serialized local usage report, written by the host after each request.
     *
     * Separate from {@link usageJson}: this one comes from the plugin's own token
     * accounting and needs no credential, so it is always present once a request
     * has been served.
     */
    readonly reportJson: string;
    /**
     * Read quota through the OpenDesign desktop app's own `vela` CLI.
     *
     * Off by default: a user who only wants an API key never installs the app,
     * and this plugin must work without it. When on, the app's existing login is
     * reused, so no credential is typed or stored here.
     */
    readonly useVelaCredential: boolean;
    /** Serialized route diagnostics, written by the host for the page. */
    readonly diagnosticsJson: string;
    /**
     * Per-model parameter overrides, serialized as JSON.
     *
     * A JSON string rather than a `dict` field: the settings form walker only
     * descends `object` and `dict` nodes that survive `volatile()`, and a dict of
     * objects silently drops out of the projection — the same failure that once
     * hid this plugin's whole page.
     */
    readonly modelParamsJson: string;
    /** Parsed override table, filled by `readConfig`. */
    readonly modelParams?: Readonly<Record<string, {
        contextWindow?: number;
        maxTokens?: number;
    }>>;
    /** Inference base URL without a trailing slash. */
    readonly baseURL: string;
    /** Deadline for one dispatch, spanning discovery through streaming. */
    readonly requestTimeoutMs: number;
    /** Maximum idle interval while a stream read is outstanding. */
    readonly streamIdleTimeoutMs: number;
}
