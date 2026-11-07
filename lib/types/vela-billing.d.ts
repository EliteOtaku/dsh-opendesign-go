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
 * Two sources disagree, and the measured one wins. The public page
 * (https://open-design.ai/model-credits/, read 2026-11-07) prices the two Go
 * windows at $18 for 5 hours and $55 for 7 days, which against `vela`'s own
 * ceilings of 50,000 and 150,000 credits would imply 2,727–2,778 credits per
 * dollar. Metered calls says otherwise: dividing the credit delta of a run of
 * DeepSeek calls by their list-price cost and the published model multiplier
 * lands at 10,067–11,880 across five samples, and the local ledger's own 7-day
 * total reconciles to the same order of magnitude. The page's dollar figures are
 * therefore advisory, not the unit `vela` counts in.
 *
 * 10,000 was also what `billing summary` reported directly while it still
 * answered (2026-10-19), and it is what makes both windows agree with each
 * other. The command now returns 403 / 503 and nothing else exposes the rate,
 * so this stays a documented constant rather than a live read.
 */
export declare const FALLBACK_CREDITS_PER_USD = 10000;
export declare function readVelaUsage(binary: string, workspaceId: string | undefined): Promise<UsageSnapshot>;
