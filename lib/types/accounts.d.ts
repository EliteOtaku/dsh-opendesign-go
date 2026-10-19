/**
 * Account rules shared by the host, the page and the tests.
 *
 * An account is **one OpenDesign subscription**, not a second key for the same
 * one: quota is counted per workspace, so two keys in one workspace share a
 * single allowance and switching between them changes nothing. That is why the
 * account list is ordered — the first entry is the account every request uses,
 * and the order is the fallback sequence.
 *
 * The key itself never travels through this module: an account holds only a
 * **credential reference**, and the value lives in the credentials service.
 *
 * @module dsh-opendesign-go/accounts
 */
import type { OpenDesignAccount } from './config-contract.ts';
/** Upper bound on accounts; each one needs its own key and workspace. */
export declare const MAX_ACCOUNTS = 20;
/** Credential references are bare environment-variable names. */
export declare const ACCOUNT_REF_PATTERN: RegExp;
/** Longest accepted display name, matching the settings input. */
export declare const MAX_ACCOUNT_NAME = 80;
/**
 * The reference every operation resolves through.
 * @param config - resolved configuration.
 * @returns the selected account's credential reference.
 */
export declare function accountRefOf(config: {
    readonly apiKeyEnv: string;
}): string;
/**
 * Move one account to the front, preserving the rest of the order.
 *
 * Selecting an account *is* reordering: the first entry is what the adapter
 * resolves, so there is no separate "selected" field to drift out of sync with
 * the list.
 * @param accounts - current order.
 * @param ref - reference to promote.
 * @returns the new order, or the same list when already first or absent.
 */
export declare function moveAccountFirst(accounts: readonly OpenDesignAccount[], ref: string): readonly OpenDesignAccount[];
/**
 * The accounts in effective order, tolerating a legacy configuration that only
 * names a reference.
 * @param config - resolved configuration.
 * @returns a non-empty list whose first entry is the selected account.
 */
export declare function accountsOf(config: {
    readonly apiKeyEnv: string;
    readonly accounts: readonly OpenDesignAccount[] | null;
}): readonly OpenDesignAccount[];
/**
 * Validate the whole list.
 * @param accounts - candidate list.
 * @param selectedRef - reference that must be present when the list is at its cap.
 * @throws {Error} when the list is unusable.
 */
export declare function assertAccounts(accounts: readonly OpenDesignAccount[] | null, selectedRef: string): void;
/**
 * Derive a credential reference for a new account.
 *
 * References are derived, not typed by the user: a typo in an environment
 * variable name would otherwise fail at request time with a confusing message.
 * @param index - position used to keep references distinct.
 * @returns a reference such as `OPENDESIGN_ACCOUNT_2`.
 */
export declare function deriveAccountRef(index: number): string;
