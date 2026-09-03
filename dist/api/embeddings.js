/**
 * Embeddings API for kenari (OpenAI-compatible).
 * POST /v1/embeddings
 */
import { BASE_URL_KENARI } from "../constants.js";
export async function createEmbeddings(options) {
    const apiKey = options.apiKey;
    if (!apiKey)
        throw new Error("kenari API key required for embeddings");
    const response = await fetch(`${BASE_URL_KENARI}/embeddings`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            input: options.input,
            model: options.model,
        }),
        signal: options.signal,
    });
    if (!response.ok) {
        throw new Error(`kenari embeddings failed (${response.status}): ${await response.text()}`);
    }
    return (await response.json());
}
