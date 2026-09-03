/**
 * Rerank API for kenari (Cohere-style, no OpenAI standard).
 * POST /v1/rerank
 */
import { BASE_URL_KENARI } from "../constants.js";
export async function rerankDocuments(options) {
    const apiKey = options.apiKey;
    if (!apiKey)
        throw new Error("kenari API key required for rerank");
    const response = await fetch(`${BASE_URL_KENARI}/rerank`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            query: options.query,
            documents: options.documents,
            model: options.model,
        }),
        signal: options.signal,
    });
    if (!response.ok) {
        throw new Error(`kenari rerank failed (${response.status}): ${await response.text()}`);
    }
    return (await response.json());
}
