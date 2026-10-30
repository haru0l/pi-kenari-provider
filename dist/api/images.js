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
import { BASE_URL_KENARI } from "../constants.js";
import { throwKenariError, withDeadline } from "./http.js";
/** Generate images via kenari's /v1/images/generations endpoint. */
export async function generateImages(options) {
    const apiKey = options.apiKey;
    if (!apiKey) {
        throw new Error("kenari API key required for image generation");
    }
    const body = {
        prompt: options.prompt,
        model: options.model,
    };
    if (options.n !== undefined)
        body.n = options.n;
    if (options.size !== undefined)
        body.size = options.size;
    if (options.quality !== undefined)
        body.quality = options.quality;
    if (options.style !== undefined)
        body.style = options.style;
    if (options.background !== undefined)
        body.background = options.background;
    if (options.response_format !== undefined)
        body.response_format = options.response_format;
    const response = await fetch(`${BASE_URL_KENARI}/images/generations`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: withDeadline(options.signal, options.timeoutMs),
    });
    if (!response.ok) {
        await throwKenariError("image generation", response);
    }
    return (await response.json());
}
/**
 * Generate images and decode them to bytes, the way kenari's own example does
 * with `jq -r '.data[0] | .b64_json // (.url | split(",")[1])' | base64 -d`.
 *
 * Throws when the model returns an image in a shape neither field covers.
 */
export async function generateImageBytes(options) {
    const response = await generateImages(options);
    return response.data.map(decodeImage);
}
/** Decode one image entry: `b64_json` first, then the `url` data URI. */
export function decodeImage(image) {
    const fromUri = image.url ? splitDataUri(image.url) : undefined;
    const base64 = image.b64_json ?? fromUri?.base64;
    if (!base64) {
        throw new Error("kenari returned an image with neither b64_json nor a data: URI in url");
    }
    return {
        bytes: new Uint8Array(Buffer.from(base64, "base64")),
        mimeType: fromUri?.mimeType ?? "image/png",
        ...(image.revised_prompt !== undefined
            ? { revisedPrompt: image.revised_prompt }
            : {}),
    };
}
/** Split `data:image/png;base64,AAAA` into its type and payload. */
function splitDataUri(uri) {
    if (!uri.startsWith("data:"))
        return undefined;
    const comma = uri.indexOf(",");
    if (comma === -1)
        return undefined;
    const header = uri.slice("data:".length, comma);
    const base64 = uri.slice(comma + 1);
    const mimeType = header.split(";")[0] || "image/png";
    return { mimeType, base64 };
}
