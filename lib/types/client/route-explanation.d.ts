/**
 * Explain why the model picker might be empty.
 *
 * The failure this addresses is the one the user hit: the settings page renders
 * normally while the session model picker shows nothing, and the only clue is a
 * status line in the middle of the page that reads "未注册". Without a cause and
 * a next step, that is indistinguishable from "the plugin is broken" and the only
 * recovery is asking someone.
 *
 * The route can be absent for four different reasons, three of which the user can
 * fix. Naming them is the whole point: the fix differs completely between a
 * missing profile entry and an unresolved credential.
 *
 * This module also answers "how many models does this build advertise": the
 * cached report is a mirror written by the host, so it can lag the catalog the
 * page is running against, and the page must never show the stale number as if
 * it were current.
 *
 * @module dsh-opendesign-go/route-explanation
 */
import type { RouteDiagnostics } from '../diagnostics.ts';
/** One thing the user should look at, ordered most likely first. */
export interface RouteCause {
    /** Short label, shown as a bullet. */
    readonly text: string;
}
/** Why the route is absent, when it is. */
export interface RouteProblem {
    /** Headline stating the observable symptom. */
    readonly title: string;
    /** Causes and next steps, most likely first. */
    readonly causes: readonly RouteCause[];
}
/**
 * Decide whether the user needs an explanation, and what it should say.
 *
 * Returns undefined when the route is registered, and also when the host has not
 * reported yet — an unactivated plugin is a different situation (the page would
 * not render at all in most cases), and guessing at causes with no data would
 * produce a warning that is itself unreliable.
 * @param diagnostics - last reported route state, or undefined when never reported.
 * @returns the problem to display, or undefined when there is nothing wrong.
 */
export declare function explainRouteProblem(diagnostics: RouteDiagnostics | undefined): RouteProblem | undefined;
/** How many models this build advertises, as the page should report it. */
export interface ModelCount {
    /** The number to display. */
    readonly count: number;
    /**
     * Whether the number came from the cached report rather than this build.
     *
     * True means the host's mirror is out of date — it says a different number than
     * the catalog in this bundle — so the page shows the live count and says so,
     * instead of presenting a stale figure as current.
     */
    readonly stale: boolean;
}
/**
 * Reconcile the cached model count with the catalog this build carries.
 *
 * The count is written into the config document by the host and read back by the
 * page, so it only moves when a write lands. One refused write at boot left it
 * reporting twelve models while fourteen were registered, and nothing refreshed
 * it afterwards; the page now compares the cached figure against its own catalog
 * and prefers the catalog, because this bundle is the code actually serving
 * requests.
 * @param diagnostics - last reported route state, or undefined when never reported.
 * @param advertised - models this build advertises.
 * @returns the count to show and whether the report disagreed.
 */
export declare function modelCountOf(diagnostics: RouteDiagnostics | undefined, advertised: number): ModelCount;
