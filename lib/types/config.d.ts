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
import z from '@deepseek-ai/schemastery';
import type { OpenDesignAccount, OpenDesignConfig } from './config-contract.ts';
/** Deadline for one dispatch, spanning discovery through streaming. */
export declare const DEFAULT_REQUEST_TIMEOUT_MS = 1800000;
/** Maximum idle interval while a stream read is outstanding. */
export declare const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000;
/**
 * Normalize the configured account list.
 * @param accounts - the stored list, possibly empty.
 * @returns the list, or `null` when it carries no account.
 */
export declare function accountsOfConfig(accounts: readonly OpenDesignAccount[] | null | undefined): readonly OpenDesignAccount[] | null;
/** Validated configuration data, as exchanged with the settings surface. */
export declare const PlainConfig: z<OpenDesignConfig>;
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
export declare const Config: z<Partial<OpenDesignConfig>, LiveConfig>;
/**
 * One live configuration reference.
 *
 * The reference itself is stable for the lifetime of the plugin; its value is
 * replaced when the Loader commits an edit. Callers read it per operation and
 * never cache the snapshot across awaits.
 */
export interface LiveConfig {
    /** Whether the route is offered. */
    readonly enabled: {
        get(): boolean;
    };
    /** Credential reference of the selected account. */
    readonly apiKeyEnv: {
        get(): string;
    };
    /** Accounts, or `null` for "only {@link apiKeyEnv}". */
    readonly accounts: {
        get(): readonly OpenDesignAccount[];
    };
    /** Try the next account after a credential rejection. */
    readonly autoSwitch: {
        get(): boolean;
    };
    /** Credential reference of the console session; empty when the channel is off. */
    readonly sessionRef: {
        get(): string;
    };
    /** Console workspace id used when the selected account declares none. */
    readonly workspaceId: {
        get(): string;
    };
    /** Serialized last quota reading; empty when nothing has been read. */
    readonly usageJson: {
        get(): string;
    };
    /** Serialized local usage report; empty until a request is served. */
    readonly reportJson: {
        get(): string;
    };
    /** Whether quota is read through the OpenDesign app's own login. */
    readonly useVelaCredential: {
        get(): boolean;
    };
    /** Inference base URL, stored as configured. */
    readonly baseURL: {
        get(): string;
    };
    /** Deadline for one dispatch. */
    readonly requestTimeoutMs: {
        get(): number;
    };
    /** Maximum idle interval while a stream read is outstanding. */
    readonly streamIdleTimeoutMs: {
        get(): number;
    };
}
/**
 * Read the live configuration into one plain snapshot.
 * @param config - live references handed to the plugin by the Loader.
 * @returns the resolved values; `baseURL` passes through {@link migrateGatewayBaseURL}.
 */
export declare function readConfig(config: LiveConfig): OpenDesignConfig;
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
export declare function assertBaseURL(raw: string): string;
/**
 * Reject a credential reference that is not a usable environment-variable name.
 * @param raw - candidate credential reference.
 * @throws {Error} when the name contains characters a shell would not accept.
 */
export declare function assertApiKeyEnv(raw: string): void;
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
export declare function migrateGatewayBaseURL(baseURL: string): string;
