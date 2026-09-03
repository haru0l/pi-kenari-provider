/**
 * Model catalog for kenari.
 *
 * kenari's catalog is dynamic — it exposes GET /v1/models (public) that returns
 * all available models across modalities. We fetch this at refresh time and
 * merge with a static baseline for offline initialization.
 *
 * kenari models use a :free suffix variant (e.g. step-3-7-flash:free) that
 * deducts no balance. Both paid and free variants are surfaced.
 */
import { BASE_URL_KENARI, PROVIDER_KENARI } from "./constants.js";
// =============================================================================
// Baseline catalog (offline fallback)
// =============================================================================
const ZERO_COST = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
/** Static baseline models — used for offline init before first fetch. */
export const KENARI_BASELINE_MODELS = [
    {
        id: "step-3-7-flash:free",
        name: "Step 3.7 Flash (Free)",
        api: "openai-completions",
        provider: PROVIDER_KENARI,
        baseUrl: BASE_URL_KENARI,
        reasoning: true,
        input: ["text"],
        cost: ZERO_COST,
        contextWindow: 131072,
        maxTokens: 8192,
        isFree: true,
    },
    {
        id: "step-3-7-flash",
        name: "Step 3.7 Flash",
        api: "openai-completions",
        provider: PROVIDER_KENARI,
        baseUrl: BASE_URL_KENARI,
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131072,
        maxTokens: 8192,
        isFree: false,
    },
];
// =============================================================================
// Dynamic catalog fetch
// =============================================================================
/** Fetch the full model catalog from kenari's public /v1/models endpoint. */
export async function fetchKenariModels(signal) {
    const url = `${BASE_URL_KENARI}/models`;
    const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
    });
    if (!response.ok) {
        throw new Error(`kenari /v1/models returned ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json());
    return json.data ?? [];
}
/** Fetch models filtered by modality. */
export async function fetchKenariModelsByModality(modality, signal) {
    const url = `${BASE_URL_KENARI}/models?modality=${modality}`;
    const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
    });
    if (!response.ok) {
        throw new Error(`kenari /v1/models?modality=${modality} returned ${response.status}`);
    }
    const json = (await response.json());
    return json.data ?? [];
}
// =============================================================================
// Catalog conversion
// =============================================================================
/** Convert a kenari API model to a pi-ai Model. */
export function toKenariModel(apiModel) {
    const id = apiModel.id;
    // Skip :free variants in the main list — we add them separately.
    const isFree = id.endsWith(":free");
    // Determine the API wire format.
    // kenari supports both OpenAI-completions and Anthropic-messages.
    // Default to openai-completions for chat models.
    const api = "openai-completions";
    const inputModes = apiModel.input ?? ["text"];
    const cost = apiModel.cost ?? ZERO_COST;
    const model = {
        id,
        name: apiModel.name ?? id,
        api,
        provider: PROVIDER_KENARI,
        baseUrl: BASE_URL_KENARI,
        reasoning: apiModel.reasoning ?? isReasoningModel(id),
        input: inputModes,
        cost: {
            input: cost.input ?? 0,
            output: cost.output ?? 0,
            cacheRead: cost.cacheRead ?? 0,
            cacheWrite: cost.cacheWrite ?? 0,
        },
        contextWindow: apiModel.contextWindow ?? apiModel.max_input_chars ?? 131072,
        maxTokens: apiModel.maxTokens ?? 8192,
        isFree,
        modalities: apiModel.modalities,
    };
    return model;
}
function isReasoningModel(id) {
    const lower = id.toLowerCase();
    return (lower.includes("opus") ||
        lower.includes("sonnet") ||
        lower.includes("deepseek") ||
        lower.includes("step") ||
        lower.includes("reasoning") ||
        lower.includes("r1") ||
        lower.includes("o1") ||
        lower.includes("o3") ||
        lower.includes("o4"));
}
/** Convert a catalog of kenari API models to pi-ai Models. */
export function toKenariModels(apiModels) {
    const models = [];
    for (const apiModel of apiModels) {
        const model = toKenariModel(apiModel);
        if (model)
            models.push(model);
    }
    return models;
}
// =============================================================================
// Model refresh (called by pi on session start / /refresh)
// =============================================================================
/** Refresh the model catalog. Called by pi's model refresh lifecycle. */
export async function refreshKenariModels(context) {
    // Offline init: restore from store, no network.
    if (!context.allowNetwork) {
        const stored = context.stored?.models;
        return stored ?? KENARI_BASELINE_MODELS;
    }
    // Online: fetch the public catalog.
    try {
        const apiModels = await fetchKenariModels(context.signal);
        const models = toKenariModels(apiModels);
        // Publish to pi's model store if available.
        if (context.publish && models.length > 0) {
            await context.publish({
                persist: { models, checkedAt: Date.now() },
            });
        }
        return models.length > 0 ? models : KENARI_BASELINE_MODELS;
    }
    catch {
        // On fetch failure, fall back to stored or baseline.
        const stored = context.stored?.models;
        return stored ?? KENARI_BASELINE_MODELS;
    }
}
/** Get the baseline models for offline init. */
export function getKenariBaselineModels() {
    return KENARI_BASELINE_MODELS;
}
