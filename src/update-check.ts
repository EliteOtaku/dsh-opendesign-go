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

import { PLUGIN_VERSION } from './config-contract.ts'

/** Package name, as the registry, GitHub and the profile all spell it. */
export const PACKAGE_NAME = 'dsh-opendesign-go'

/** Registry document this plugin reads its own latest version from. */
export const REGISTRY_LATEST_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`

/**
 * Tags of this plugin's own repository.
 *
 * Tags rather than `releases/latest`: the repository publishes a tag per
 * release and no GitHub Release, so the releases endpoint answers 404 while the
 * tags endpoint carries the whole history.
 */
export const GITHUB_TAGS_URL = `https://api.github.com/repos/EliteOtaku/${PACKAGE_NAME}/tags?per_page=30`

/** One release found on the registry. */
export interface LatestRelease {
  /** Version string as published. */
  readonly version: string
  /** Project page, when the registry carries one. */
  readonly homepage: string | undefined
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
export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] => (value.split('-')[0] ?? '')
    .split('.')
    .map((part) => {
      const parsed = Number.parseInt(part, 10)
      return Number.isFinite(parsed) ? parsed : 0
    })
  const a = parse(left)
  const b = parse(right)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Read the registry response body into a release record.
 *
 * Kept separate from the request so the parsing is testable without network
 * access, and so a malformed or unexpected body is rejected explicitly rather
 * than silently producing `undefined`.
 * @param body - parsed JSON from the registry.
 * @returns the release, or undefined when the body is not usable.
 */
export function parseLatestRelease(body: unknown): LatestRelease | undefined {
  if (body === null || typeof body !== 'object') return undefined
  const row = body as Record<string, unknown>
  const version = row.version
  if (typeof version !== 'string' || version.length === 0) return undefined
  const homepage = typeof row.homepage === 'string' ? row.homepage : undefined
  return { version, homepage }
}

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
export async function fetchLatestRelease(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<LatestRelease | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, timeoutMs)
  try {
    const response = await fetchImpl(REGISTRY_LATEST_URL, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return undefined
    return parseLatestRelease(await response.json())
  } catch {
    // Offline, a blocked proxy, a DNS failure: all mean "no information", not
    // "something is broken". The caller shows nothing.
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Read the newest tag out of the repository's tag list.
 *
 * The list is ordered newest-first by GitHub, but the order is not part of the
 * contract, so the maximum is taken rather than the first entry. Tags that are
 * not a dotted version are skipped: the repository also tags documents.
 * @param body - parsed JSON from the tags endpoint.
 * @returns the version without its leading `v`, or undefined when none is usable.
 */
export function parseLatestTag(body: unknown): string | undefined {
  if (!Array.isArray(body)) return undefined
  let best: string | undefined
  for (const entry of body) {
    if (entry === null || typeof entry !== 'object') continue
    const name = (entry as Record<string, unknown>).name
    if (typeof name !== 'string') continue
    const version = name.replace(/^v/u, '')
    if (!/^\d+(?:\.\d+)*$/u.test(version)) continue
    if (best === undefined || compareVersions(version, best) > 0) best = version
  }
  return best
}

/**
 * Ask the repository for its newest tag.
 *
 * Never throws, for the same reason as {@link fetchLatestRelease}: this is a
 * background courtesy, and an unreachable host says nothing about the plugin.
 * @param fetchImpl - fetch implementation, injected for tests.
 * @param timeoutMs - request deadline.
 * @returns the version, or undefined when it could not be read.
 */
export async function fetchLatestTag(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<string | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, timeoutMs)
  try {
    const response = await fetchImpl(GITHUB_TAGS_URL, {
      // GitHub rejects a request without a User-Agent, and this call carries no
      // credential, so the header is the whole access control.
      headers: { accept: 'application/vnd.github+json', 'user-agent': PACKAGE_NAME },
      signal: controller.signal,
    })
    if (!response.ok) return undefined
    return parseLatestTag(await response.json())
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/** A source a newer release can come from. */
export type UpdateSource = 'npm' | 'github'

/**
 * Everything the settings page knows about versions.
 *
 * A source that did not answer is `undefined`, which is deliberately different
 * from "answered and is not newer": the page must be able to say "could not
 * check" instead of claiming the copy is current.
 */
export interface VersionLine {
  /** Version this build reports. */
  readonly current: string
  /** Newest version on the registry, when this start reached it. */
  readonly npm: string | undefined
  /** Newest repository tag, when this start reached it. */
  readonly github: string | undefined
  /** When the check that produced these numbers finished. */
  readonly checkedAt: string | undefined
  /** Sources carrying a strictly newer version than this build. */
  readonly aheadOf: readonly UpdateSource[]
  /** Whether the cache was written by a different build. */
  readonly stale: boolean
  /** Version that wrote the cache, when it was a different build. */
  readonly writtenBy: string | undefined
}

/** How the version line should read. */
export type VersionState = 'current' | 'outdated' | 'unknown'

/** One non-empty string out of an unknown value, or undefined. */
function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

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
export function parseVersionLine(raw: string | undefined, current: string = PLUGIN_VERSION): VersionLine {
  const empty: VersionLine = {
    current,
    npm: undefined,
    github: undefined,
    checkedAt: undefined,
    aheadOf: [],
    stale: false,
    writtenBy: undefined,
  }
  if (raw === undefined || raw.length === 0) return empty

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return empty
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return empty

  const row = parsed as Record<string, unknown>
  const written = textOf(row.current)
  if (written === undefined) return empty

  // 0.1.15 wrote `latest` / `githubLatest`, and only for a source that was
  // ahead. Reading those names once means an upgrade shows the old card instead
  // of going blank until the next start check lands.
  const npm = textOf(row.npm) ?? textOf(row.latest)
  const github = textOf(row.github) ?? textOf(row.githubLatest)
  const checkedAt = textOf(row.checkedAt)

  if (written !== current) {
    // A snapshot without a writer version is old enough to predate this field;
    // treat it the same way rather than trusting numbers authored elsewhere.
    return { ...empty, stale: true, writtenBy: written }
  }

  const aheadOf: UpdateSource[] = []
  if (npm !== undefined && compareVersions(npm, current) > 0) aheadOf.push('npm')
  if (github !== undefined && compareVersions(github, current) > 0) aheadOf.push('github')

  return { current, npm, github, checkedAt, aheadOf, stale: false, writtenBy: undefined }
}

/**
 * Reduce a snapshot to the one state the page paints.
 * @param line - parsed snapshot.
 * @returns outdated when a source is ahead, current only when both answered,
 * unknown otherwise.
 */
export function versionStateOf(line: VersionLine): VersionState {
  if (line.aheadOf.length > 0) return 'outdated'
  if (line.npm !== undefined && line.github !== undefined) return 'current'
  return 'unknown'
}

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
export function snapshotOf(
  release: LatestRelease | undefined,
  tag: string | undefined,
  now: Date = new Date(),
  current: string = PLUGIN_VERSION,
): string {
  return JSON.stringify({
    current,
    ...(release === undefined ? {} : { npm: release.version }),
    ...(tag === undefined ? {} : { github: tag }),
    checkedAt: now.toISOString(),
  })
}
