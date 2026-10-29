import type { ReactElement } from 'react';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { OpenDesignConfig } from '../config-contract.ts';
import type { QuotaWindow, UsageSnapshot } from '../usage-contract.ts';
/** Props injected into the pill by the registering plugin. */
export interface ComposerUsageInjected {
    /** Live config form; its `usageJson` is where the reading arrives. */
    readonly form: ConfigForm<OpenDesignConfig>;
    /**
     * The session's shared model directory. The pill is the quota of *this*
     * provider, so it belongs to a session only while this provider's model is
     * the one selected — every other model's request spends someone else's quota.
     */
    readonly directory: ObservableSnapshot<ModelDirectoryState>;
}
/**
 * Whether the pill speaks for the session's current selection.
 *
 * A session that has not selected anything yet shows no pill rather than a
 * number that may describe a different provider's quota; the seat then still
 * carries the default, and the pill appears as soon as this provider's model
 * is selected.
 * @param directory - the session's shared model directory state.
 * @returns true when the selected provider is this plugin's.
 */
export declare function ownedByThisProvider(directory: ModelDirectoryState): boolean;
/** One quota window as the pill presents it. */
export interface PillWindow {
    /** Window length from the console, used for both labels. */
    readonly durationSeconds: number;
    /** Percent still available, clamped to 0..100 and rounded. */
    readonly remaining: number;
    /** The console window this row came from, for credits and reset time. */
    readonly window: QuotaWindow;
}
/**
 * Select the windows the pill can describe.
 *
 * A window whose console reading carried no percentage is dropped rather than
 * rendered as 0%: "no limit reported" and "nothing left" are different facts,
 * and the pill is too small to explain the difference.
 * @param usage - parsed quota snapshot, or `undefined` when nothing is cached.
 * @returns one entry per describable window, in console order.
 */
export declare function pillWindows(usage: UsageSnapshot | undefined): PillWindow[];
/**
 * One-line label for the collapsed pill.
 * @param windows - rows from {@link pillWindows}.
 * @returns text such as `5h 62% · 7d 88%`, or an empty string with no rows.
 */
export declare function pillLabel(windows: readonly PillWindow[]): string;
/**
 * The worst remaining percentage among the windows.
 *
 * The dot takes this colour because a user with 90% short-window quota and 4%
 * weekly quota is nearly out, and averaging would hide that.
 * @param windows - rows from {@link pillWindows}.
 * @returns the smallest `remaining`, or 100 with no rows.
 */
export declare function worstRemaining(windows: readonly PillWindow[]): number;
/** Render the collapsed pill and, when open, its panel. */
export declare function ComposerUsagePill({ form, directory }: ComposerUsageInjected): ReactElement | null;
