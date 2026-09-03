/**
 * pi-kenari-provider
 *
 * A pi extension that registers kenari as a native AI provider. kenari
 * (https://kenari.id/v1) is an LLM gateway that speaks both the OpenAI
 * Chat Completions API and the Anthropic Messages API, routes to many
 * upstream providers, and bills in Indonesian Rupiah.
 *
 * Features:
 *  - Dynamic model discovery from GET /v1/models (public, no key needed)
 *  - OpenAI-completions wire format (kenari is an OpenAI drop-in)
 *  - :free model variants (no balance deducted)
 *  - Image generation, embeddings, rerank, moderations
 *  - Audio, music, and video generation
 *  - API key auth via KENARI_API_KEY env var or /login kenari
 */
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { BASE_URL_KENARI, PROVIDER_KENARI } from "./constants.js";
import { fetchKenariModels, getKenariBaselineModels, refreshKenariModels, } from "./models.js";
let compatPromise;
/** Single-flight dynamic import; failures are not cached so a later stream can retry. */
function loadPiAiCompat() {
    if (!compatPromise) {
        compatPromise = import("@earendil-works/pi-ai/compat")
            .then((mod) => mod)
            .catch((error) => {
            compatPromise = undefined;
            throw error;
        });
    }
    return compatPromise;
}
function createStreamErrorEvent(model, options, error) {
    return {
        role: "assistant",
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: options?.signal?.aborted ? "aborted" : "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
    };
}
/** Stream function that delegates to the compat OpenAI completions API. */
function kenariStreamSimple(model, context, options) {
    const outer = createAssistantMessageEventStream();
    void (async () => {
        try {
            const compat = await loadPiAiCompat();
            const inner = compat
                .openAICompletionsApi()
                .streamSimple(model, context, options);
            for await (const event of inner)
                outer.push(event);
            if (typeof inner.result === "function") {
                outer.end(await inner.result());
            }
            else {
                outer.end();
            }
        }
        catch (error) {
            const message = createStreamErrorEvent(model, options, error);
            outer.push({
                type: "error",
                reason: message.stopReason,
                error: message,
            });
        }
    })();
    return outer;
}
// =============================================================================
// Model conversion
// =============================================================================
/** Convert kenari models to pi's ProviderConfigInput models format. */
function toProviderModelConfigs(models) {
    return models.map((m) => ({
        id: m.id,
        name: m.name,
        api: m.api,
        baseUrl: m.baseUrl,
        reasoning: m.reasoning ?? false,
        thinkingLevelMap: m.thinkingLevelMap,
        input: m.input,
        cost: m.cost,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        samplingParams: m.samplingParams,
        compat: m.compat,
        headers: m.headers,
    }));
}
// =============================================================================
// Extension entry point
// =============================================================================
export default function (pi) {
    const baselineConfigs = toProviderModelConfigs(getKenariBaselineModels());
    pi.registerProvider(PROVIDER_KENARI, {
        name: "kenari",
        baseUrl: BASE_URL_KENARI,
        api: "openai-completions",
        apiKey: "$KENARI_API_KEY",
        authHeader: true,
        models: baselineConfigs,
        streamSimple: kenariStreamSimple,
        // API-key login so /login kenari stores the key for later sessions.
        oauth: {
            name: "kenari API key",
            login: async (callbacks) => {
                const key = await callbacks.onPrompt({
                    message: "Enter kenari API key (kn-...)",
                });
                if (!key?.trim())
                    throw new Error("kenari login cancelled: no API key entered");
                return {
                    refresh: key.trim(),
                    access: key.trim(),
                    expires: Number.MAX_SAFE_INTEGER,
                };
            },
            refreshToken: async (credentials) => credentials,
            getApiKey: (credentials) => credentials.access,
        },
        refreshModels: async (context) => {
            const models = await refreshKenariModels(context);
            return toProviderModelConfigs(models);
        },
    });
}
export { createVideoJob, generateAudio, generateMusic, generateVideo, pollVideoJob, } from "./api/audio.js";
export { createEmbeddings } from "./api/embeddings.js";
export { generateImages } from "./api/images.js";
export { moderateContent } from "./api/moderations.js";
export { rerankDocuments } from "./api/rerank.js";
// Re-export for programmatic use.
export { fetchKenariModels, fetchKenariModelsByModality, refreshKenariModels, toKenariModels, } from "./models.js";
