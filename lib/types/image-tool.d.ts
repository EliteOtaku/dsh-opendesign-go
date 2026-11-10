import type { AttachmentsSeam } from './image-bytes.ts';
import type { OpenDesignConfig } from './config-contract.ts';
/** Tool name; distinct from `dsh-image-gen`'s `generate_image`, which may be mounted too. */
export declare const IMAGE_TOOL_NAME = "opendesign_generate_image";
/** One image committed to the store, as the tool result carries it. */
export interface ToolImage {
    readonly attachmentId: string;
    readonly mediaType: string;
    readonly bytes: number;
    readonly width: number;
    readonly height: number;
    readonly name?: string;
}
/** The validated result of one generation call. */
export interface ImageToolResult {
    readonly images: ToolImage[];
    /** Model that served the call, echoed back so the reply can name it. */
    readonly model: string;
}
/** Images one call produced, and what to tell the caller. */
export interface ImageToolDependencies {
    /** Current plugin configuration; read per call so settings changes apply. */
    readonly config: () => OpenDesignConfig;
    /** Resolve one account's API key by credential reference. */
    readonly resolveApiKey: (ref: string) => Promise<string | undefined>;
    /** Current attachment store, or undefined when none is mounted. */
    readonly attachments: () => AttachmentsSeam | undefined;
    /** Fetch implementation, injected so the call can be exercised without a gateway. */
    readonly fetchImpl?: typeof fetch;
}
/**
 * Image model ids this account may call, in catalog order.
 * @param config - configuration snapshot carrying the catalog.
 * @returns the enabled image ids; empty when the account has none.
 */
export declare function imageModelsOf(config: OpenDesignConfig): string[];
/**
 * Pick the image model one call should use.
 *
 * An explicit id wins, because the tool declares the ids it accepts as an enum
 * and the model may have been told which one is best for the job. Otherwise the
 * first enabled image model is used: the account pays for every one of them, and
 * refusing without a selection would make a plain "draw a cat" fail on an account
 * that plainly can draw.
 * @param requested - model name the caller passed, when any.
 * @param config - configuration snapshot carrying the catalog.
 * @returns the model id to call.
 * @throws LlmError - `INVALID_REQUEST` when the id is not an image model this
 * account may use, or the account has none.
 */
export declare function resolveImageModel(requested: string | undefined, config: OpenDesignConfig): string;
/**
 * Generate one image and commit it to the attachment store.
 *
 * A picture the store refuses to keep is a failure, not a partial success: a tool
 * result pointing at an attachment that was never written would render as a
 * broken image with no explanation.
 * @param deps - configuration, credential, and store seams.
 * @param args - prompt and optional model from the tool call.
 * @returns the committed images.
 * @throws LlmError - gateway failure, missing credential, or an unusable reply.
 */
export declare function generateForTool(deps: ImageToolDependencies, args: {
    readonly prompt: string;
    readonly model?: string;
    readonly size?: string;
}): Promise<ImageToolResult>;
