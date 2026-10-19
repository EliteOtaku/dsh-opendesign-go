/** Where a `vela` binary was found, and how. */
export interface VelaLocation {
    /** Absolute path to the executable. */
    readonly path: string;
    /** How it was found, for the diagnostics line. */
    readonly via: 'env' | 'open-design-install' | 'path';
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
export declare function locateVela(env?: NodeJS.ProcessEnv, exists?: (path: string) => boolean, roots?: readonly string[]): VelaLocation | undefined;
