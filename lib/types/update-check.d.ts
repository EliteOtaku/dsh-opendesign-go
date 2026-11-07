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
/** Package name, as the registry, GitHub and the profile all spell it. */
export declare const PACKAGE_NAME = "dsh-opendesign-go";
/** Registry document this plugin reads its own latest version from. */
export declare const REGISTRY_LATEST_URL = "https://registry.npmjs.org/dsh-opendesign-go/latest";
/**
 * Tags of this plugin's own repository.
 *
 * Tags rather than `releases/latest`: the repository publishes a tag per
 * release and no GitHub Release, so the releases endpoint answers 404 while the
 * tags endpoint carries the whole history.
 */
export declare const GITHUB_TAGS_URL = "https://api.github.com/repos/EliteOtaku/dsh-opendesign-go/tags?per_page=30";
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
 * Read the newest tag out of the repository's tag list.
 *
 * The list is ordered newest-first by GitHub, but the order is not part of the
 * contract, so the maximum is taken rather than the first entry. Tags that are
 * not a dotted version are skipped: the repository also tags documents.
 * @param body - parsed JSON from the tags endpoint.
 * @returns the version without its leading `v`, or undefined when none is usable.
 */
export declare function parseLatestTag(body: unknown): string | undefined;
/**
 * Ask the repository for its newest tag.
 *
 * Never throws, for the same reason as {@link fetchLatestRelease}: this is a
 * background courtesy, and an unreachable host says nothing about the plugin.
 * @param fetchImpl - fetch implementation, injected for tests.
 * @param timeoutMs - request deadline.
 * @returns the version, or undefined when it could not be read.
 */
export declare function fetchLatestTag(fetchImpl?: typeof fetch, timeoutMs?: number): Promise<string | undefined>;
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
    /** Newest version the npm registry publishes, when it is newer than this build. */
    readonly latest: string | undefined;
    /** Newest version tagged in the repository, when it is newer than this build. */
    readonly githubLatest: string | undefined;
    /** Project page, when the registry carried one. */
    readonly homepage: string | undefined;
}
/**
 * Read the update notice from its serialized settings field.
 *
 * A malformed value reads as "no notice" rather than throwing: the field is
 * written by a background check, and one bad character must not take the whole
 * settings page down.
 *
 * A notice is kept when **either** source is ahead: the two surfaces can
 * disagree — a tag is pushed before the registry answers, and a registry
 * publish can exist without a tag — and suppressing the card because the other
 * source is current would hide the one route that does have something to offer.
 * @param raw - serialized notice, or undefined/empty when unset.
 * @returns the notice, or undefined when there is nothing to show.
 */
export declare function parseUpdate(raw: string | undefined): UpdateNotice | undefined;
