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
 * @param timeoutMs - request deadline. Generous on purpose: this runs during
 * startup, when the machine is still bringing its network stack up and a
 * five-second deadline was observed to miss while a minute later the same
 * request answered in 0.4 s.
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
/** A source a newer release can come from. */
export type UpdateSource = 'npm' | 'github';
/**
 * Everything the settings page knows about versions.
 *
 * A source that did not answer is `undefined`, which is deliberately different
 * from "answered and is not newer": the page must be able to say "could not
 * check" instead of claiming the copy is current.
 */
export interface VersionLine {
    /** Version this build reports. */
    readonly current: string;
    /** Newest version on the registry, when this start reached it. */
    readonly npm: string | undefined;
    /** Newest repository tag, when this start reached it. */
    readonly github: string | undefined;
    /** When the check that produced these numbers finished. */
    readonly checkedAt: string | undefined;
    /** Sources carrying a strictly newer version than this build. */
    readonly aheadOf: readonly UpdateSource[];
    /** Whether the cache was written by a different build. */
    readonly stale: boolean;
    /** Version that wrote the cache, when it was a different build. */
    readonly writtenBy: string | undefined;
}
/** How the version line should read. */
export type VersionState = 'current' | 'outdated' | 'unknown';
/**
 * Read the version snapshot out of its serialized settings field.
 *
 * Returns a value even when the field is missing or malformed: the page shows
 * this build's own version regardless, and the remote halves degrade to
 * "unknown". Never throws — one bad character must not take the settings page
 * down.
 * @param raw - serialized snapshot, or undefined/empty when unset.
 * @param current - this build's version; a snapshot written by another version
 * is reported as `stale` instead of being read as facts.
 * @returns the snapshot view.
 */
export declare function parseVersionLine(raw: string | undefined, current?: string): VersionLine;
/**
 * Reduce a snapshot to the one state the page paints.
 * @param line - parsed snapshot.
 * @returns outdated when a source is ahead, current only when both answered,
 * unknown otherwise.
 */
export declare function versionStateOf(line: VersionLine): VersionState;
/**
 * Serialize one startup check into the settings field.
 *
 * Written even when neither source answered: "checked, nothing newer" and
 * "could not check" have to stay distinguishable on the page, and an absent
 * field cannot express the difference.
 * @param release - registry answer, or undefined when it was not read.
 * @param tag - newest repository tag, or undefined when it was not read.
 * @param now - check completion time, injectable for tests.
 * @param current - this build's version.
 * @returns the JSON payload for the cache field.
 */
export declare function snapshotOf(release: LatestRelease | undefined, tag: string | undefined, now?: Date, current?: string): string;
