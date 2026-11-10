import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { ImageToolDependencies, ToolImage } from './image-tool.ts';
/**
 * Text plus one image block per committed reference.
 * @param text - the sentence the model reads first.
 * @param images - committed images, in reply order.
 * @returns content blocks, text first.
 */
export declare function imageBlocks(text: string, images: readonly ToolImage[]): ContentBlock[];
/**
 * Model-facing content of one successful call.
 *
 * The pictures are included so they reach the next turn's context: a tool result
 * that only named the attachment would make the model describe a picture it never
 * received.
 * @param images - committed images, in reply order.
 * @param model - model that served the call.
 * @returns text describing the result plus one block per picture.
 */
export declare function renderImages(images: readonly ToolImage[], model: string): ContentBlock[];
/**
 * The tool definition, unbound so a test can inspect it without a host.
 *
 * The model ids are deliberately not an enum: `generateForTool` reads the catalog
 * on every call, so a model added by a refresh is accepted without re-registering
 * the tool.
 * @param deps - configuration, credential, and store seams.
 * @returns the registry-ready definition.
 */
export declare function createImageTool(deps: ImageToolDependencies): ToolDefinition;
/**
 * Register the tool on one context and return its disposer.
 * @param ctx - context that owns a tool registry.
 * @param deps - configuration, credential, and store seams.
 * @returns the exact disposer that unregisters the tool.
 */
export declare function registerImageTool(ctx: Context, deps: ImageToolDependencies): () => void;
