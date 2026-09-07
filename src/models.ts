/**
 * Model catalog for kenari.
 *
 * kenari's catalog is dynamic — GET /v1/models (public) lists chat models with
 * prices and capabilities. We fetch it at refresh time and merge with a static
 * baseline for offline initialization. See llms-full.txt ("Models and pricing").
 *
 * Prices arrive as micro-Rupiah per 1M tokens and are converted to pi's
 * USD-per-1M-token ModelCost. One model can have a paid id and a `:free`
 * variant; both are listed by the API and both are surfaced here.
 */

import type { Api, Model, RefreshModelsContext } from "@earendil-works/pi-ai";
import {
  BASE_URL_KENARI,
  MICRO_IDR_PER_1M_TO_USD_PER_1M,
  PROVIDER_KENARI,
} from "./constants.js";
import type {
  KenariApiModel,
  KenariModel,
  KenariOpenAIModel,
} from "./types.js";

// =============================================================================
// Baseline catalog (offline fallback)
// =============================================================================

const ZERO_COST = Object.freeze({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
});

/** Shared compat: kenari documents `max_tokens` (not max_completion_tokens) and no `store` field. */
const KENARI_COMPAT = Object.freeze({
  supportsStore: false,
  maxTokensField: "max_tokens" as const,
  supportsReasoningEffort: true,
});

/**
 * The built-in kenari-free route: exists on every account, points at free
 * models, costs nothing, rate-limited per account. It is a route, not a
 * model, so GET /v1/models never lists it — add it manually.
 */
export const KENARI_FREE_ROUTE_MODEL: KenariOpenAIModel = {
  id: "kenari-free",
  name: "kenari-free route (free models)",
  api: "openai-completions",
  provider: PROVIDER_KENARI,
  baseUrl: BASE_URL_KENARI,
  reasoning: false,
  input: ["text", "image"],
  cost: ZERO_COST,
  contextWindow: 131072,
  maxTokens: 8192,
  compat: KENARI_COMPAT,
  isFree: true,
};
/** Static baseline models — used for offline init before first fetch. Prices from live catalog. */
export const KENARI_BASELINE_MODELS: KenariOpenAIModel[] = [
  {
    id: "step-3-7-flash:free",
    name: "Step 3.7 Flash (Free)",
    api: "openai-completions",
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI,
    reasoning: true,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow: 262144,
    maxTokens: 8192,
    compat: KENARI_COMPAT,
    isFree: true,
  },
  {
    id: "step-3-7-flash",
    name: "Step 3.7 Flash",
    api: "openai-completions",
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI,
    reasoning: true,
    input: ["text", "image"],
    cost: microIdrCost({
      input: 4_200_000_000,
      output: 24_000_000_000,
      cache_read: 840_000_000,
    }),
    contextWindow: 262144,
    maxTokens: 8192,
    compat: KENARI_COMPAT,
    isFree: false,
  },
  KENARI_FREE_ROUTE_MODEL,
];

// =============================================================================
// Dynamic catalog fetch
// =============================================================================

/** Fetch the full chat model catalog from kenari's public /v1/models endpoint. */
export async function fetchKenariModels(
  signal?: AbortSignal,
): Promise<KenariApiModel[]> {
  const url = `${BASE_URL_KENARI}/models`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `kenari /v1/models returned ${response.status}: ${await response.text()}`,
    );
  }
  const json = (await response.json()) as { data?: KenariApiModel[] };
  return json.data ?? [];
}

/** Fetch models filtered by modality (bare /v1/models lists chat models only). */
export async function fetchKenariModelsByModality(
  modality: "image" | "embedding" | "rerank" | "moderation",
  signal?: AbortSignal,
): Promise<KenariApiModel[]> {
  const url = `${BASE_URL_KENARI}/models?modality=${modality}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `kenari /v1/models?modality=${modality} returned ${response.status}`,
    );
  }
  const json = (await response.json()) as { data?: KenariApiModel[] };
  return json.data ?? [];
}

// =============================================================================
// Catalog conversion
// =============================================================================

/** Convert kenari micro-IDR-per-1M-token rates to pi's USD-per-1M-token ModelCost. */
export function microIdrCost(pricing: {
  input?: number | null;
  output?: number | null;
  cache_read?: number | null;
  cache_write?: number | null;
}): Model<Api>["cost"] {
  const rate = (v?: number | null) =>
    typeof v === "number" && Number.isFinite(v)
      ? v * MICRO_IDR_PER_1M_TO_USD_PER_1M
      : 0;
  const input = rate(pricing.input);
  return {
    input,
    output: rate(pricing.output),
    cacheRead: rate(pricing.cache_read),
    // kenari bills cache-write at the input rate when no own rate is set.
    cacheWrite: rate(pricing.cache_write ?? pricing.input),
  };
}

/** Map pi thinking levels onto the model's supported kenari reasoning_options. */
function toThinkingLevelMap(
  options?: string[],
): Model<Api>["thinkingLevelMap"] | undefined {
  if (!options || options.length === 0) return undefined;
  const ladder = ["low", "medium", "high", "xhigh", "max"] as const;
  const supported = ladder.filter((l) => options.includes(l));
  if (supported.length === 0) return undefined;
  const lowest = supported[0]!;
  const clamp = (level: string): string => {
    const rank = ladder.indexOf(level as (typeof ladder)[number]);
    if (rank === -1) return lowest; // minimal -> lowest supported option
    for (let i = rank; i >= 0; i--) {
      const candidate = ladder[i];
      if (candidate && options.includes(candidate)) return candidate;
    }
    return lowest;
  };
  const map: NonNullable<Model<Api>["thinkingLevelMap"]> = {
    off: "none", // kenari translates reasoning_effort "none" to the backend's native off
  };
  for (const level of [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ] as const) {
    map[level] = clamp(level);
  }
  return map;
}

/** Convert a kenari API model to a pi-ai Model. */
export function toKenariModel(apiModel: KenariApiModel): KenariModel | null {
  const id = apiModel.id;
  if (!id) return null;
  const isFree = id.endsWith(":free") || apiModel.pricing?.free === true;
  const reasoning = apiModel.reasoning ?? false;
  const inputs = apiModel.modalities?.input ?? ["text"];

  const model: KenariOpenAIModel = {
    id,
    name: apiModel.name ?? id,
    api: "openai-completions",
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI,
    reasoning,
    ...(reasoning && {
      thinkingLevelMap: toThinkingLevelMap(apiModel.reasoning_options),
    }),
    input: inputs.includes("image")
      ? (["text", "image"] as const)
      : (["text"] as const),
    // :free entries carry the paid rates in the catalog but are billed Rp 0.
    cost: isFree
      ? { ...ZERO_COST }
      : apiModel.pricing
        ? microIdrCost(apiModel.pricing)
        : { ...ZERO_COST },
    contextWindow: apiModel.context_length ?? 131072,
    // Catalog exposes no max-output field; reasoning traces bill against
    // max_tokens, so give reasoning models headroom (see kenari docs
    // "Small max_tokens and empty output").
    maxTokens: reasoning ? 16384 : 8192,
    compat: KENARI_COMPAT,
    isFree,
  };
  return model;
}

/** Convert a catalog of kenari API models to pi-ai Models. */
export function toKenariModels(apiModels: KenariApiModel[]): KenariModel[] {
  const models: KenariModel[] = [];
  for (const apiModel of apiModels) {
    const model = toKenariModel(apiModel);
    if (model) models.push(model);
  }
  return models;
}

// =============================================================================
// Model refresh (called by pi on session start / /refresh)
// =============================================================================

/** Refresh the model catalog. Called by pi's model refresh lifecycle. */
export async function refreshKenariModels(
  context: RefreshModelsContext,
): Promise<KenariModel[]> {
  // Offline init: restore from store, no network.
  if (!context.allowNetwork) {
    const stored = context.stored?.models as KenariModel[] | undefined;
    return stored ?? KENARI_BASELINE_MODELS;
  }

  // Online: fetch the public catalog.
  try {
    const apiModels = await fetchKenariModels(context.signal);
    const models = toKenariModels(apiModels);
    // The built-in route is not a catalog model; keep it available.
    if (!models.some((m) => m.id === KENARI_FREE_ROUTE_MODEL.id)) {
      models.unshift(KENARI_FREE_ROUTE_MODEL);
    }

    // Publish to pi's model store if available.
    if (context.publish && models.length > 0) {
      await context.publish({
        persist: { models, checkedAt: Date.now() },
      });
    }

    return models.length > 0 ? models : KENARI_BASELINE_MODELS;
  } catch {
    // On fetch failure, fall back to stored or baseline.
    const stored = context.stored?.models as KenariModel[] | undefined;
    return stored ?? KENARI_BASELINE_MODELS;
  }
}

/** Get the baseline models for offline init. */
export function getKenariBaselineModels(): KenariModel[] {
  return KENARI_BASELINE_MODELS;
}
