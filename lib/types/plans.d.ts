/**
 * Plan tiers and their advertised monthly allowances.
 *
 * A user's own cap rarely equals the advertised one: OpenDesign sells the same
 * tier at different limits, and a subscription bought through a reseller or
 * during a promotion carries a number no pricing page states. The advertised
 * table is therefore a default, and an operator-supplied override string wins
 * over it without touching the price itself — the monthly fee is a fact, the
 * cap is the user's claim about their own account.
 *
 * @module dsh-opendesign-go/plans
 */
/** The four tiers OpenDesign Go publishes. */
export type PlanTier = 'go' | 'plus' | 'pro' | 'max';
/** What one tier costs and how much usage it is advertised to include. */
export interface PlanSpec {
    /** Monthly subscription fee in US dollars. */
    readonly monthlyUsd: number;
    /** Advertised maximum monthly usage value in US dollars. */
    readonly monthlyCapUsd: number;
}
/**
 * Advertised values, read from the official pricing page on 2026-10-20.
 *
 * Kept as a frozen literal rather than fetched: these numbers change a few
 * times a year at most, and a page that cannot reach the network still has to
 * draw a plan row. An override string is the escape hatch when a user's real
 * cap disagrees.
 */
export declare const PLAN_SPECS: Readonly<Record<PlanTier, PlanSpec>>;
/**
 * Read an operator-supplied override string, format `go:150,plus:200`.
 *
 * Parsing never throws: the string comes from a settings field that a user
 * types into, so a typo must cost that one entry and not the whole quota
 * card. Unknown tiers, non-positive numbers, and malformed pairs are dropped
 * silently; a later duplicate wins, which makes appending to the string the
 * natural way to change one value.
 *
 * @param raw Override string, or `undefined` when the setting is unset.
 * @returns Cap overrides keyed by tier, empty when nothing usable was found.
 */
export declare function parsePlanOverrides(raw: string | undefined): Partial<Record<PlanTier, number>>;
/**
 * Resolve one tier into the spec that is actually in effect.
 *
 * Overrides only replace `monthlyCapUsd`: the subscription fee is a fact of
 * the purchase and no settings field may rewrite it, otherwise the plan row
 * would claim a price the user never paid.
 *
 * @param tier Tier name as the console or the settings report it.
 * @param overrides Cap overrides, normally from {@link parsePlanOverrides}.
 * @returns The effective spec, or `undefined` when `tier` is not published.
 */
export declare function planOf(tier: string, overrides: Partial<Record<PlanTier, number>>): PlanSpec | undefined;
/** A recorded zero point for comparing plan spend against measured spend. */
export interface AlignBaseline {
    /** When the baseline was taken, epoch milliseconds. */
    readonly at: number;
    /** Plan credits already consumed at that instant. */
    readonly credits: number;
    /** Measured cost accumulated by then, in US dollars. */
    readonly measuredUsd: number;
}
/**
 * Read the alignment baseline from its serialized settings field.
 *
 * A malformed value reads as "not aligned" rather than throwing: the field is
 * written by a button press, and one bad character must not take the whole
 * settings page down with it.
 * @param raw - serialized baseline, or undefined/empty when unset.
 * @returns the baseline, or undefined when absent or unusable.
 */
export declare function parseBaseline(raw: string | undefined): AlignBaseline | undefined;
