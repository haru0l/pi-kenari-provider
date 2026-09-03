/**
 * Image generation and editing for kenari.
 *
 * kenari provides OpenAI Images-compatible endpoints:
 * - POST /v1/images/generations — generate images
 * - POST /v1/images/edits — edit images (not yet implemented here)
 *
 * Only works with models marked as image models in the catalog.
 */
import type { KenariImageGenerateOptions, KenariImageResponse } from "../types.js";
/** Generate images via kenari's /v1/images/generations endpoint. */
export declare function generateImages(options: KenariImageGenerateOptions): Promise<KenariImageResponse>;
//# sourceMappingURL=images.d.ts.map