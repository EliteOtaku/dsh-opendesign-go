import type { UsageSnapshot } from './usage-contract.ts';
/**
 * Read the signed-in user's email, which also proves the login is usable.
 * @param binary - absolute path to the executable.
 * @returns the email, or undefined when not signed in.
 */
export declare function velaWhoami(binary: string): Promise<string | undefined>;
/**
 * Resolve the workspace this login belongs to.
 *
 * `funding-check` requires a workspace id, and the user has no obvious place to
 * find one: the OpenDesign console presents no "workspace" concept in its
 * navigation at all. So it is discovered instead. `team-projects list` answers
 * the *current* workspace without being told which one, which makes it the only
 * command that exposes the id — `billing summary` does not carry it.
 * @param binary - absolute path to the executable.
 * @param explicit - a workspace id from configuration, when present.
 * @returns the id, or undefined when the CLI could not report one.
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
/**
 * Credits per US dollar, as the Go plan publishes them.
 *
 * Observed from `billing summary` while it answered (2026-10-19), and implied
 * independently by both quota windows: 50000 credits / $5 and 150000 / $15 are
 * both 10000. Kept as a documented constant because the command now returns 403
 * and no other one exposes the rate.
 */
export declare const FALLBACK_CREDITS_PER_USD = 10000;
export declare function readVelaUsage(binary: string, workspaceId: string | undefined): Promise<UsageSnapshot>;
