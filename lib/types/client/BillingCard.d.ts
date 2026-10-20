import type { ReactElement } from 'react';
import type { PlanSpec } from '../plans.ts';
import type { UsageSnapshot } from '../usage-contract.ts';
/** Props of the reconciliation card. */
export interface BillingCardProps {
    readonly snapshot: UsageSnapshot | undefined;
    /** 套餐档位，来自 snapshot.tier */
    readonly plan: PlanSpec | undefined;
    /** 插件实测累计成本，美元；undefined 表示尚无数据 */
    readonly measuredUsd: number | undefined;
    /** 对齐基准，undefined 表示未对齐 */
    readonly baseline: {
        at: number;
        credits: number;
        measuredUsd: number;
    } | undefined;
    /** 点击「对齐当前周期」 */
    readonly onAlign: (() => void) | undefined;
    /** 是否可操作 */
    readonly editable: boolean;
}
/**
 * Convert a credits string into dollars at the rate the service reports.
 *
 * Credits are the service's unit and mean nothing to a user; a missing or
 * nonsensical rate must yield "unknown" rather than a number, because printing
 * `$0.00` would claim the plan spent nothing when in fact nothing was priced.
 * @param credits - decimal credits string as the console reports it.
 * @param creditsPerUsd - credits per US dollar, or undefined when unreported.
 * @returns the dollar amount, or undefined when it cannot be priced.
 */
export declare function spentFromCredits(credits: string, creditsPerUsd: number | undefined): number | undefined;
/**
 * Render the reconciliation card.
 *
 * Block order is fixed — monthly allowance, windows, alignment, equivalent API
 * cost — because the first three narrow from "what was sold" to "what this
 * plugin spent", and the last one is a caveated aside that must stay below the
 * numbers it qualifies.
 * @param props - snapshot, plan, measured cost, alignment baseline and controls.
 * @returns the billing card.
 */
export declare function BillingCard({ snapshot, plan, measuredUsd, baseline, onAlign, editable }: BillingCardProps): ReactElement;
