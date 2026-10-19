/**
 * Quota channel: reads the OpenDesign console on behalf of the page.
 *
 * The inference gateway has no quota endpoint, so this service is the only way
 * to show real numbers. It is deliberately narrow and safe by construction:
 *
 * - it is **off** unless the user stored a console session reference;
 * - it issues **two GETs** (`coding-plan-usage`, `billing/summary`) and never
 *   writes anything upstream;
 * - it never blocks inference: every failure becomes a snapshot with `error`
 *   set, and the page renders a degraded state instead of failing;
 * - it reports credits exactly as received and derives percentages from them,
 *   so the bars cannot drift from the console the user trusts.
 *
 * The console identifies the tenant by workspace id, which is per account, so a
 * read is keyed by the account it was requested for.
 *
 * @module dsh-opendesign-go/usage
 */
import type { Context } from '@deepseek-ai/cordis';
import type { UsageSnapshot } from './usage-contract.ts';
/** Console host; the page and the inference gateway are different origins. */
export declare const CONSOLE_BASE_URL = "https://amr-api.open-design.ai/api/v1";
/** Credential reference holding the console session token, when configured. */
export declare const DEFAULT_SESSION_REF = "OPENDESIGN_SESSION";
/** Options the host passes to the usage service. */
export interface OpenDesignUsageServiceOptions {
    /** Resolve the stored console session token, if the user configured one. */
    readonly resolveSession: () => Promise<string | undefined>;
    /** Workspace id for the account being read, when known. */
    readonly workspaceOf: (accountRef: string) => string | undefined;
    /** Inference API-key reference the read is for. */
    readonly activeRef: () => string;
}
/**
 * Read the console on demand. One instance per plugin mount.
 */
export declare class OpenDesignUsageService {
    #private;
    private readonly options;
    /**
     * @param options - resolution hooks supplied by the plugin entry.
     */
    constructor(options: OpenDesignUsageServiceOptions);
    /**
     * Read quota for one account.
     *
     * A missing session or workspace yields `error` with no windows rather than
     * throwing: the page shows "not configured" and the user can fix it in the
     * settings page.
     * @param accountRef - credential reference of the account to read.
     * @returns the snapshot, always populated.
     */
    read(accountRef?: string): Promise<UsageSnapshot>;
    /**
     * Describe the windows for logging without leaking quota values.
     * @param snapshot - one reading.
     * @returns a one-line summary.
     */
    describe(snapshot: UsageSnapshot): string;
}
/**
 * Build the session resolver used by the plugin entry.
 *
 * Prefers the credentials seam and falls back to the launch environment, the
 * same reference semantics the API key uses.
 * @param ctx - host context.
 * @returns a resolver returning the session token, or undefined when unset.
 */
export declare function sessionResolverOf(ctx: Context): () => Promise<string | undefined>;
