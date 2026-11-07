/**
 * Page → host channel for updating this plugin.
 *
 * DSH exposes no plugin-wide "update" action to a third-party page, but the
 * Host already publishes `remote.pluginManager`, the same namespace the desktop
 * plugin manager itself calls. This module wraps the two routes that namespace
 * supports and turns every answer into one sentence the page can show:
 *
 * - **npm** (`listVersions` + `updateBundle`): the normal path. The Host only
 *   accepts it for a bundle installed from a registry under its own name, which
 *   is how this plugin is installed, and it restores the previous version
 *   itself when the install fails.
 * - **GitHub** (`removeBundle` + `installBundle('github:…#vX')`): the fallback
 *   for a release published before it reached the registry, or for a version
 *   the registry cannot serve. The Host refuses to install a package name the
 *   profile already holds, so this route has to remove first — and therefore has
 *   to put the old version back if the install does not land. That restore is
 *   attempted here, and its outcome is reported rather than hidden.
 *
 * A failure is always returned as a message, never thrown: every one of these
 * calls can refuse for reasons the user needs to read (a release still inside
 * pnpm's minimum-release-age window, an incompatible DSH version, a network
 * fault), and a thrown error would surface as a broken settings page instead of
 * a sentence.
 *
 * @module dsh-opendesign-go/client/update-controller
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/** One sentence describing what happened, plus whether it succeeded. */
export type UpdateOutcome = {
    readonly ok: true;
    readonly message: string;
} | {
    readonly ok: false;
    readonly message: string;
};
/** Executes one update route. */
export type RunUpdate = (version: string) => Promise<UpdateOutcome>;
/** Which step the channel reached, for diagnostics. */
export type UpdateChannelState = () => string;
/** How the Host applied one change. */
type Application = 'cancelled' | 'failed' | 'applied' | 'restart-required' | 'overridden';
/** The `updateBundle` answer. */
interface UpdateResult {
    readonly from: string;
    readonly to: string;
    readonly step: 'check' | 'remove' | 'install' | 'enable' | 'restore';
    readonly result: ChangeResult;
}
/** The fields of `PluginChangeResult` this page reads. */
interface ChangeResult {
    readonly application?: Application;
    readonly error?: {
        readonly code?: string;
        readonly diagnostic?: string;
    };
    readonly version?: string;
    readonly packageResult?: {
        readonly kind?: string;
        readonly output?: string;
    };
    readonly restartReason?: string;
}
/**
 * Turn one `PluginChangeResult` into an outcome.
 * @param change - the result the Host answered with.
 * @param version - the version the change was for, when known.
 * @returns the outcome.
 */
export declare function changeOutcome(change: ChangeResult, version?: string): UpdateOutcome;
/**
 * Turn one `updateBundle` answer into an outcome.
 *
 * The step matters: a refusal during `check` means the version was never
 * touched, while one during `restore` means the new version landed and the old
 * one could not be put back — a state the user must not read as success.
 * @param update - the answer.
 * @returns the outcome.
 */
export declare function updateBundleOutcome(update: UpdateResult): UpdateOutcome;
/**
 * Build the two executors over the Host's plugin manager.
 *
 * The namespace is injected after mounting rather than required at activation:
 * declaring it in `inject` would park the whole settings page on a service the
 * shell may not have published yet, and the page is the only way to fix a
 * broken configuration.
 * @param ctx - client root context that has already been granted `remote`.
 * @returns the executors, a stage reader, and a promise settling when injected.
 */
export declare function updateCommands(ctx: ClientContext): {
    updateFromNpm: RunUpdate;
    installFromGithub: RunUpdate;
    state: UpdateChannelState;
    ready: PromiseLike<unknown>;
};
export {};
