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

import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  RefreshModelsContext,
  SimpleStreamOptions,
  StreamOptions,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { ProviderConfig, ProviderModelConfig, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { BASE_URL_KENARI, PROVIDER_KENARI } from "./constants.js";
import {
  getKenariBaselineModels,
  toKenariModels,
  fetchKenariModels,
} from "./models.js";
import type { KenariModel } from "./types.js";

// =============================================================================
// Lazy compat bridge
// =============================================================================

interface KenariCompatApi {
  openAICompletionsApi(): {
    stream: (model: Model<Api>, context: Context, options?: StreamOptions) => AssistantMessageEventStream;
    streamSimple: (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream;
  };
}

let compatPromise: Promise<KenariCompatApi> | undefined;

function loadPiAiCompat(): Promise<KenariCompatApi> {
  if (!compatPromise) {
    compatPromise = import("@earendil-works/pi-ai/compat")
      .then((mod) => mod as unknown as KenariCompatApi)
      .catch((error) => {
        compatPromise = undefined;
        throw error;
      });
  }
  return compatPromise;
}

function createStreamErrorEvent(model: Model<Api>, error: unknown): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  stream.push({
    type: "error" as const,
    reason: "error" as const,
    error: {
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
      stopReason: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    },
  });
  stream.end();
  return stream;
}

/** Stream function that delegates to the compat OpenAI completions API. */
function kenariStreamSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
  const outer = createAssistantMessageEventStream();
  void (async () => {
    try {
      const compat = await loadPiAiCompat();
      const inner = compat.openAICompletionsApi().streamSimple(model, context, options as StreamOptions);
      for await (const event of inner) outer.push(event);
      if (typeof inner.result === "function") {
        outer.end(await inner.result());
      } else {
        outer.end();
      }
    } catch (error) {
      const errorStream = createStreamErrorEvent(model, error);
      for await (const event of errorStream) outer.push(event);
      outer.end();
    }
  })();
  return outer;
}

// =============================================================================
// Model conversion
// =============================================================================

/** Convert kenari models to pi's ProviderConfigInput models format. */
function toProviderModelConfigs(models: KenariModel[]) {
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
    headers: m.headers,
  }));
}

// =============================================================================
// Extension entry point
// =============================================================================

export default function (pi: ExtensionAPI) {
  const baselineConfigs = toProviderModelConfigs(getKenariBaselineModels());

  pi.registerProvider(PROVIDER_KENARI, {
    name: "kenari",
    baseUrl: BASE_URL_KENARI,
    api: "openai-completions",
    apiKey: "$KENARI_API_KEY",
    authHeader: true,
    models: baselineConfigs,
    streamSimple: kenariStreamSimple,
    refreshModels: async (context: RefreshModelsContext) => {
      if (!context.allowNetwork) return [];
      try {
        const apiModels = await fetchKenariModels(context.signal);
        const models = toKenariModels(apiModels);
        const configs = toProviderModelConfigs(models);
        if (configs.length > 0 && context.publish) {
          await context.publish({
            persist: {
              models: configs as unknown as readonly Model<Api>[],
              checkedAt: Date.now(),
            },
          });
        }
        return configs;
      } catch {
        return [];
      }
    },
  });
}

// Re-export for programmatic use.
export { fetchKenariModels } from "./models.js";
export { generateImages } from "./api/images.js";
export { createEmbeddings } from "./api/embeddings.js";
export { rerankDocuments } from "./api/rerank.js";
export { moderateContent } from "./api/moderations.js";
export { generateAudio, generateMusic, generateVideo } from "./api/audio.js";
export type { KenariModel, KenariOpenAIModel, KenariAnthropicModel } from "./types.js";
