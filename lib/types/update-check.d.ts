/**
 * Tells the user when a newer release exists on the registry.
 *
 * DSH has no plugin-wide "update all" action, and the desktop profile is managed
 * by the Electron app with no command-line access, so an installed copy has no
 * way to learn that its author published a fix. Checking the registry once per
 * start closes that gap: the settings page can say "a newer version exists"
 * instead of the user finding out from a chat message.
 *
 * The check is deliberately quiet. A failure — offline, registry down, proxy
 * missing — is not an error the user should see, because it says nothing about
 * whether the plugin works.
 *
 * @module dsh-opendesign-go/update-check
 */
/** Registry document this plugin reads its own latest version from. */
export declare const REGISTRY_LATEST_URL = "https://registry.npmjs.org/dsh-opendesign-go/latest";
/** One release found on the registry. */
export interface LatestRelease {
    /** Version string as published. */
    readonly version: string;
    /** Project page, when the registry carries one. */
    readonly homepage: string | undefined;
}
/**
 * Compare two dotted version strings numerically.
 *
 * Prerelease suffixes are ignored: this decides whether the user is behind, and a
 * `-rc.1` on either side would otherwise need prerelease-aware ordering that
 * changes nothing a reader cares about here.
 * @param left - first version, such as `0.1.2`.
 * @param right - second version.
 * @returns negative when `left` is older, positive when newer, 0 when equal.
 */
export declare function compareVersions(left: string, right: string): number;
/**
 * Read the registry response body into a release record.
 *
 * Kept separate from the request so the parsing is testable without network
 * access, and so a malformed or unexpected body is rejected explicitly rather
 * than silently producing `undefined`.
 * @param body - parsed JSON from the registry.
 * @returns the release, or undefined when the body is not usable.
 */
export declare function parseLatestRelease(body: unknown): LatestRelease | undefined;
/**
 * Ask the registry for the newest published version.
 *
 * Never throws: an unreachable registry must not affect plugin startup, so every
 * failure path returns undefined and the caller simply shows nothing.
 * @param fetchImpl - fetch implementation, injected for tests.
 * @param timeoutMs - request deadline; the registry answers in well under this.
 * @returns the release, or undefined when it could not be read.
 */
export declare function fetchLatestRelease(fetchImpl?: typeof fetch, timeoutMs?: number): Promise<LatestRelease | undefined>;
/**
 * Decide whether a discovered version is an upgrade worth reporting.
 * @param current - this build's version.
 * @param latest - version found on the registry, if any.
 * @returns the newer version string, or undefined when there is nothing to say.
 */
export declare function pendingUpdate(current: string, latest: LatestRelease | undefined): string | undefined;
/** What the settings page shows when a newer release exists. */
export interface UpdateNotice {
    /** Version this build reports. */
    readonly current: string;
    /** Version the registry reports as newest. */
    readonly latest: string;
    /** Project page, when the registry carried one. */
    readonly homepage: string | undefined;
}
/**
 * Read the update notice from its serialized settings field.
 *
 * A malformed value reads as "no notice" rather than throwing: the field is
 * written by a background check, and one bad character must not take the whole
 * settings page down.
 * @param raw - serialized notice, or undefined/empty when unset.
 * @returns the notice, or undefined when there is nothing to show.
 */
export declare function parseUpdate(raw: string | undefined): UpdateNotice | undefined;
