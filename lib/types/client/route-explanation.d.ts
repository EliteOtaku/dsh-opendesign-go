/**
 * Explains why the model picker might be empty.
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
