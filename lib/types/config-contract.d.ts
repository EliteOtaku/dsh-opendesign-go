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
export declare const DISPLAY_NAME = "OpenDesign Go";
/**
 * This build's version, mirrored from package.json by the build step.
 *
 * Read from a constant rather than package.json at runtime: the built bundle is
 * a single file with no reliable path back to its own package, and the update
 * check needs a value it can compare without filesystem access.
 */
export declare const PLUGIN_VERSION = "0.1.11";
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
     * Show the quota pill in the composer.
     *
     * A display toggle only: the pill reads the same cached {@link usageJson} the
     * page shows, and whether that cache refreshes still follows the account and
     * refresh settings. On by default, because a quota the user cannot see
     * between requests is the problem the pill exists to solve.
     */
    readonly composerUsage: boolean;
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
    /**
     * Which models appear in the session model picker, serialized as a JSON array.
     *
     * Empty means "all of them", which keeps a fresh install usable without the
     * user having to opt in to anything. A model the user never uses is noise in
     * the picker, so hiding one must not require editing the composition.
     */
    readonly enabledModelsJson: string;
    /**
     * Per-tier monthly allowance overrides, format `go:150,plus:200`.
     *
     * A reseller or a promotion can give a cap the pricing page never states, so
     * the advertised table is a default rather than the truth.
     */
    readonly planOverrides: string;
    /**
     * Alignment baseline, serialized as JSON.
     *
     * Plan credits are cumulative for the window, while this plugin only sees the
     * traffic it served. Subtracting a baseline taken at a chosen moment is the
     * only way to compare increments, which are the one quantity both sources
     * measure over the same interval.
     */
    readonly alignBaselineJson: string;
    /**
     * Whether to recover spend from session logs this adapter never served.
     *
     * Off by default. The recovery reads every session on the machine, so it
     * includes traffic from other agents sharing the key (undercounting the true
     * total) and other workspaces (overcounting this one) — the direction of the
     * error is unknown, which makes an opt-in the honest default.
     */
    readonly recoveredEnabled: boolean;
    /** Provider ids counted by the recovery, comma-separated; empty means default. */
    readonly recoveredProviders: string;
    /**
     * Timestamp of the last manual refresh request, epoch milliseconds.
     *
     * The page has no direct line to the host's quota reader, and the host already
     * watches this configuration for changes. Writing a fresh value here is
     * therefore both the button and its transport: the watcher sees a new value
     * and reads immediately.
     */
    readonly refreshNonce: string;
    /**
     * Newest published version, when it is newer than this build.
     *
     * Empty means either "up to date" or "the registry could not be reached". The
     * two are not distinguished because neither is actionable, and surfacing an
     * error for a failed background check would be noise in a settings page.
     */
    readonly updateJson: string;
    /** Parsed enabled-model list, filled by `readConfig`; empty means all. */
    readonly enabledModels?: readonly string[];
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
