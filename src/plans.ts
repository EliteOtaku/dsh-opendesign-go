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
export type PlanTier = 'go' | 'plus' | 'pro' | 'max'

/** What one tier costs and how much usage it is advertised to include. */
export interface PlanSpec {
  /** Monthly subscription fee in US dollars. */
  readonly monthlyUsd: number
  /** Advertised maximum monthly usage value in US dollars. */
  readonly monthlyCapUsd: number
}

/**
 * Advertised values, read from the official pricing page on 2026-10-20.
 *
 * Kept as a frozen literal rather than fetched: these numbers change a few
 * times a year at most, and a page that cannot reach the network still has to
 * draw a plan row. An override string is the escape hatch when a user's real
 * cap disagrees.
 */
export const PLAN_SPECS: Readonly<Record<PlanTier, PlanSpec>> = Object.freeze({
  go: Object.freeze({ monthlyUsd: 10, monthlyCapUsd: 120 }),
  plus: Object.freeze({ monthlyUsd: 20, monthlyCapUsd: 180 }),
  pro: Object.freeze({ monthlyUsd: 100, monthlyCapUsd: 480 }),
  max: Object.freeze({ monthlyUsd: 200, monthlyCapUsd: 900 }),
})

/** Tier names in pricing order, reused by the parser and by tests. */
const TIER_NAMES: readonly PlanTier[] = ['go', 'plus', 'pro', 'max']

/** A cap is money, so only a plain positive decimal is accepted. */
const CAP_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/

/**
 * Narrow an arbitrary string to a known tier.
 *
 * @param value Candidate tier name.
 * @returns True when `value` names one of the published tiers.
 */
function isPlanTier(value: string): value is PlanTier {
  return (TIER_NAMES as readonly string[]).includes(value)
}

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
export function parsePlanOverrides(raw: string | undefined): Partial<Record<PlanTier, number>> {
  const overrides: Partial<Record<PlanTier, number>> = {}
  if (raw === undefined) return overrides

  for (const part of raw.split(',')) {
    const entry = part.trim()
    if (entry === '') continue

    const separator = entry.indexOf(':')
    // A missing or repeated separator means the pair shape itself is broken.
    if (separator <= 0 || separator === entry.length - 1) continue
    if (entry.indexOf(':', separator + 1) !== -1) continue

    const tier = entry.slice(0, separator).trim()
    const capText = entry.slice(separator + 1).trim()
    if (!isPlanTier(tier)) continue
    if (!CAP_PATTERN.test(capText)) continue

    const cap = Number(capText)
    if (!Number.isFinite(cap) || cap <= 0) continue

    overrides[tier] = cap
  }

  return overrides
}

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
export function planOf(
  tier: string,
  overrides: Partial<Record<PlanTier, number>>,
): PlanSpec | undefined {
  if (!isPlanTier(tier)) return undefined

  const base = PLAN_SPECS[tier]
  const override = overrides[tier]
  // Guard the override here too: a caller may build the map by hand, and a
  // NaN cap would render as `$NaN` instead of falling back to a usable row.
  if (override === undefined || !Number.isFinite(override) || override <= 0) return base

  return { monthlyUsd: base.monthlyUsd, monthlyCapUsd: override }
}

/** A recorded zero point for comparing plan spend against measured spend. */
export interface AlignBaseline {
  /** When the baseline was taken, epoch milliseconds. */
  readonly at: number
  /** Plan credits already consumed at that instant. */
  readonly credits: number
  /** Measured cost accumulated by then, in US dollars. */
  readonly measuredUsd: number
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
export function parseBaseline(raw: string | undefined): AlignBaseline | undefined {
  if (raw === undefined || raw.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const row = parsed as Record<string, unknown>
  const at = row.at
  const credits = row.credits
  const measuredUsd = row.measuredUsd
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return undefined
  if (typeof credits !== 'number' || !Number.isFinite(credits) || credits < 0) return undefined
  // A missing measured figure is treated as zero rather than invalid: the plugin
  // may have served nothing before the baseline was taken.
  const measured = typeof measuredUsd === 'number' && Number.isFinite(measuredUsd) && measuredUsd >= 0
    ? measuredUsd
    : 0
  return { at, credits, measuredUsd: measured }
}
