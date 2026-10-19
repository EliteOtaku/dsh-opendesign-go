import type { UsageSnapshot } from './usage-contract.ts';
/**
 * Read the signed-in user's email, which also proves the login is usable.
 * @param binary - absolute path to the executable.
 * @returns the email, or undefined when not signed in.
 */
export declare function velaWhoami(binary: string): Promise<string | undefined>;
/**
 * List the workspaces this login can read.
 *
 * `funding-check` needs a workspace id, so one is discovered rather than typed.
 * The CLI has no dedicated list command, so the id is taken from the wallet
 * snapshot of the workspace the app itself uses — reported by `vela billing
 * summary` indirectly, or from an explicit override.
 * @param binary - absolute path to the executable.
 * @param explicit - a workspace id from configuration, when present.
 * @returns the workspace id, or undefined when none could be determined.
 */
export declare function resolveWorkspaceId(binary: string, explicit: string | undefined): Promise<string | undefined>;
/**
 * Read one workspace's quota through `vela`.
 *
 * A failure is returned as a snapshot carrying `error` rather than thrown: the
 * page shows why it has no numbers, which is more useful than a silent empty
 * state and does not take the settings page down with it.
 * @param binary - absolute path to the executable.
 * @param workspaceId - workspace to read, when already known.
 * @returns the snapshot.
 */
export declare function readVelaUsage(binary: string, workspaceId: string | undefined): Promise<UsageSnapshot>;
