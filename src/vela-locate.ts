/**
 * Discovery of the OpenDesign desktop app's bundled `vela` CLI.
 *
 * `vela` is the official client's own binary. It already holds the user's
 * login, so reading quota through it needs **no credential from this plugin** —
 * the user signs in to OpenDesign once and that is the whole setup.
 *
 * Two facts keep this honest:
 *
 * - `vela` is a private CLI, not a published contract. Its output may change
 *   between OpenDesign releases, so every read is validated and a surprise
 *   degrades to "unavailable" rather than a wrong number.
 * - It is optional. A user who only wants an API key never installs anything,
 *   which is why discovery is silent on failure and never throws into `apply`.
 *
 * @module dsh-opendesign-go/vela-locate
 */
import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

/** Where a `vela` binary was found, and how. */
export interface VelaLocation {
  /** Absolute path to the executable. */
  readonly path: string
  /** How it was found, for the diagnostics line. */
  readonly via: 'env' | 'open-design-install' | 'path'
}

/**
 * Candidate install roots for the OpenDesign desktop app, newest convention
 * first.
 *
 * The list is intentionally short and explicit: guessing broadly would find an
 * unrelated `vela` and run it, and this module executes what it finds.
 * @returns absolute paths that may contain `resources/open-design/bin/vela`.
 */
function installRoots(): string[] {
  const home = homedir()
  const roots: string[] = []
  if (platform() === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    roots.push(join(local, 'Programs', 'Open Design', 'resources', 'open-design', 'bin'))
  } else if (platform() === 'darwin') {
    roots.push('/Applications/Open Design.app/Contents/Resources/open-design/bin')
  } else {
    roots.push(join(home, '.local', 'share', 'open-design', 'bin'))
  }
  return roots
}

/** Executable name on this platform. */
function binaryName(): string {
  return platform() === 'win32' ? 'vela.exe' : 'vela'
}

/**
 * Find a `vela` executable.
 *
 * Order matters: an explicit override wins, then the official app's bundled
 * copy, and only then `PATH`. The bundled copy is preferred over `PATH` because
 * it is the one that shares the app's login.
 * @param env - environment to read the override from.
 * @param exists - existence probe, injectable so tests do not depend on what is
 * installed on the machine running them.
 * @param roots - install roots to search, injectable for the same reason.
 * @returns the location, or undefined when none is present.
 */
export function locateVela(
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
  roots: readonly string[] = installRoots(),
): VelaLocation | undefined {
  const override = (env.OPENDESIGN_VELA_PATH ?? '').trim()
  if (override.length > 0 && exists(override)) return { path: override, via: 'env' }

  for (const root of roots) {
    const candidate = join(root, binaryName())
    if (exists(candidate)) return { path: candidate, via: 'open-design-install' }
  }

  const onPath = (env.PATH ?? '').split(platform() === 'win32' ? ';' : ':')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => join(entry, binaryName()))
    .find((candidate) => exists(candidate))
  if (onPath !== undefined) return { path: onPath, via: 'path' }

  return undefined
}
