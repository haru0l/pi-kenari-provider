/**
 * Image generation for kenari.
 *
 * kenari provides [OI] Images-compatible endpoints:
 * - POST /v1/images/generations — generate images
 * - POST /v1/images/edits — edit images (not yet implemented here)
 *
 * Only works with models marked as image models in the catalog.
 *
 * Each returned image carries `b64_json`, a `data:` URI in `url`, or both —
 * `url` is never a hosted link. `generateImageBytes` does the decode for you.
 */
import type { KenariImageData, KenariImageGenerateOptions, KenariImageResponse, KenariImageResult } from "../types.js";
/** Generate images via kenari's /v1/images/generations endpoint. */
export declare function generateImages(options: KenariImageGenerateOptions): Promise<KenariImageResponse>;
/**
 * Generate images and decode them to bytes, the way kenari's own example does
 * with `jq -r '.data[0] | .b64_json // (.url | split(",")[1])' | base64 -d`.
 *
 * Throws when the model returns an image in a shape neither field covers.
 */
export declare function generateImageBytes(options: KenariImageGenerateOptions): Promise<KenariImageResult[]>;
/** Decode one image entry: `b64_json` first, then the `url` data URI. */
export declare function decodeImage(image: KenariImageData): KenariImageResult;
//# sourceMappingURL=images.d.ts.map