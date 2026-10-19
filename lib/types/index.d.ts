/**
 * Dedicated OpenDesign Go adapter plugin.
 *
 * Registers one `dsh-opendesign-go` route whose catalog follows the Go plan's
 * Design Plan models, and resolves the API key per request through the
 * credentials seam, falling back to the process environment. The route
 * registers only while the plugin is enabled and its credential resolves, so a
 * keyless install never sits in a model picker pretending to be usable.
 *
 * M2 scope: one route, static catalog, Chat Completions streaming. The live
 * catalog, usage windows, accounts and the settings section arrive in later
 * milestones; nothing here is removed by them.
 *
 * @module dsh-opendesign-go
 */
import type { Context } from '@deepseek-ai/cordis';
import type { LiveConfig } from './config.ts';
import type { OpenDesignConfig } from './config-contract.ts';
import { listSeedModels } from './catalog.ts';
/** Plugin module name; stable, and declared in dsh-plugin.naming.json. */
export declare const name = "llm-opendesign-go";
/** The adapter needs the LLM registry to exist before it can register a route. */
export declare const inject: string[];
/** Settings namespace this plugin will install from M4. */
export declare const NS = "llm-opendesign-go";
export { OpenDesignAdapter } from './adapter.ts';
export { DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, DISPLAY_NAME, PROVIDER_ID, SETTINGS_NAMESPACE } from './config-contract.ts';
export type { OpenDesignAccount, OpenDesignConfig } from './config-contract.ts';
export { GO_DESIGN_PLAN_MODELS, listSeedModels } from './catalog.ts';
export { OpenDesignUsageService, CONSOLE_BASE_URL } from './usage.ts';
export { percentUsedOf, windowLabel } from './usage-contract.ts';
export type { QuotaWindow, UsageSnapshot, WalletSnapshot } from './usage-contract.ts';
export { Config, PlainConfig, assertApiKeyEnv, assertBaseURL, readConfig } from './config.ts';
/**
 * Mount the plugin for one composition entry.
 * @param ctx - Cordis context carrying the LLM registry.
 * @param raw - composition-entry config, or the Loader's live references.
 */
export declare function apply(ctx: Context, raw?: Partial<OpenDesignConfig> | LiveConfig): void;
/** Re-exported so composition patches can list the seed without importing internals. */
export { listSeedModels as seedCatalog };
