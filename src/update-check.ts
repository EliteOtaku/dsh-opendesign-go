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
 * @param timeoutMs - request deadline; the registry answers in well under this.
 * @returns the release, or undefined when it could not be read.
 */
export async function fetchLatestRelease(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5_000,
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
  timeoutMs = 5_000,
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

/**
 * Decide whether a discovered version is an upgrade worth reporting.
 * @param current - this build's version.
 * @param latest - version found on the registry, if any.
 * @returns the newer version string, or undefined when there is nothing to say.
 */
export function pendingUpdate(current: string, latest: LatestRelease | undefined): string | undefined {
  if (latest === undefined) return undefined
  return compareVersions(latest.version, current) > 0 ? latest.version : undefined
}

/** What the settings page shows when a newer release exists. */
export interface UpdateNotice {
  /** Version this build reports. */
  readonly current: string
  /** Newest version the npm registry publishes, when it is newer than this build. */
  readonly latest: string | undefined
  /** Newest version tagged in the repository, when it is newer than this build. */
  readonly githubLatest: string | undefined
  /** Project page, when the registry carried one. */
  readonly homepage: string | undefined
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
export function parseUpdate(raw: string | undefined): UpdateNotice | undefined {
  if (raw === undefined || raw.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const row = parsed as Record<string, unknown>
  const current = row.current
  if (typeof current !== 'string' || current.length === 0) return undefined
  /** Keep a version only when it is actually ahead of this build. */
  const ahead = (value: unknown): string | undefined =>
    // A stale field that still names this build (or an older one) would render
    // "新版本 0.1.0（当前 0.1.2）", which reads as a downgrade.
    (typeof value === 'string' && value.length > 0 && compareVersions(value, current) > 0 ? value : undefined)
  const latest = ahead(row.latest)
  const githubLatest = ahead(row.githubLatest)
  if (latest === undefined && githubLatest === undefined) return undefined
  const homepage = typeof row.homepage === 'string' ? row.homepage : undefined
  return { current, latest, githubLatest, homepage }
}
