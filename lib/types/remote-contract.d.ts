/**
 * The one Remote contribution this plugin publishes, shared by both faces.
 *
 * One method only: `execute(command)`. Everything the page needs to change an
 * account — including storing a key — goes through it, so there is a single
 * validated write path and no second way for a secret to travel.
 *
 * @module dsh-opendesign-go/remote-contract
 */
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
/** Namespace the page calls: `ctx.remote.openDesignGoAccounts.execute(...)`. */
export declare const ACCOUNTS_NAMESPACE = "openDesignGoAccounts";
/** Stable package identity owning these methods. */
export declare const REMOTE_PACKAGE = "dsh-opendesign-go";
/**
 * Declare the Remote method both faces agree on.
 *
 * `invocation.kind: 'direct'` means the Host resolves the owning service by the
 * key below; the page never names an implementation.
 */
export declare const accountsRemote: TypertRemoteContribution;
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteNamespaceMap {
        /** Account mutations, including the one write that carries a secret. */
        openDesignGoAccounts: {
            execute(command: unknown): Promise<{
                readonly ok: true;
                readonly value: string;
            } | {
                readonly ok: false;
                readonly error: unknown;
            }>;
        };
    }
}
