/**
 * Local usage card: what this plugin's own calls cost, per model.
 *
 * It answers the question a user can act on — which model on which key is
 * spending what — and needs no credential, because the numbers come from the
 * token usage the adapter already received. The console's own quota is a
 * different question and stays out of scope.
 *
 * Every figure is labelled with what it is not: only the base price tier is
 * public, so a long-context request is undercounted, and a model without a
 * published price contributes tokens but no money.
 *
 * @module dsh-opendesign-go/client/UsageCard
 */
import type { ReactElement } from 'react';
import type { UsageReport } from '../usage-ledger.ts';
/**
 * Render the local usage card.
 * @param props - the trailing-window report, or undefined while none exists.
 * @returns the card.
 */
export declare function UsageCard({ report }: {
    readonly report: UsageReport | undefined;
}): ReactElement;
