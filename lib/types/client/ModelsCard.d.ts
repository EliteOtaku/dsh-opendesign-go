import type { ReactElement } from 'react';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { OpenDesignConfig } from '../config-contract.ts';
/**
 * Render the model list with editable parameters.
 * @param props - config form and current configuration.
 * @returns the card.
 */
export declare function ModelsCard({ form, config, editable }: {
    readonly form: ConfigForm<OpenDesignConfig>;
    readonly config: OpenDesignConfig | undefined;
    readonly editable: boolean;
}): ReactElement;
