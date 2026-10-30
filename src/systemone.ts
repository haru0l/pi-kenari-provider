/**
 * System One models for kenari, registered as pi classifiers.
 *
 * kenari's System One endpoint (POST /v1/systemone) speaks TypeSafe's native
 * protocol, so pi's built-in `typesafe-system-one` transport can drive it
 * directly. That makes these models classifiers: they answer bounded questions
 * (`noul` / `choice` / `score` / `box`) instead of generating text, so they
 * never appear in `/model` and are reached through `models.classify()` from
 * codemode, routers, or extension code.
 *
 * The models come from `GET /v1/models?modality=systemone` — they are absent
 * from the bare chat catalog. Clairic is excluded: it answers `fields`
 * extraction and rejects `questions`, which is all a pi classifier can send.
 * For the full kenari contract (Clairic fields, `box` questions, audio and
 * video input) use the `system_one` tool instead.
 */

import type {
  ClassifierApi,
  ClassifierModel,
  RefreshModelsContext,
  SystemOneCompat,
} from "@earendil-works/pi-ai";
import {
  BASE_URL_KENARI,
  MICRO_IDR_PER_1M_TO_USD_PER_1M,
  PROVIDER_KENARI,
} from "./constants.js";
import { fetchKenariModelsByModality } from "./models.js";
import type { KenariApiModel } from "./types.js";

/** pi's built-in TypeSafe System One transport; kenari's endpoint is wire-compatible. */
export const KENARI_SYSTEMONE_API = "typesafe-system-one";

/**
 * kenari's catalog carries no `context_length` for System One entries. TypeSafe
 * runs the same models with a 64k window, and kenari enforces its own limits.
 */
const SYSTEMONE_CONTEXT_WINDOW = 64_000;

/** System One models bill input tokens only; nothing is generated. */
const SYSTEMONE_OUTPUT_COST = 0;

/**
 * Image input travels as named `assets` (the shape kenari documents), without
 * TypeSafe's experimental `TypeSafe-Danger-Zone-Images` opt-in header.
 */
const SYSTEMONE_IMAGE_COMPAT: SystemOneCompat = Object.freeze({
  imageInput: "assets",
  sendImageOptInHeader: false,
});

/** A kenari System One model usable as a pi classifier. */
export interface KenariSystemOneModel
  extends ClassifierModel<typeof KENARI_SYSTEMONE_API> {
  /** Whether this is a :free variant (no balance deducted). */
  /** Whether this is a :free variant (no balance deducted). */
  isFree?: boolean;
  /**
   * The catalog's own input rate, micro-Rupiah per 1M tokens, kept alongside
   * `cost` so model choice can quote the price in the currency kenari bills.
   */
  inputMicroIdr?: number;
}

/**
 * Shape of a classifier entry in `ProviderConfigInput.models`. pi's
 * `ProviderClassifierModelConfig` is not exported from the package root, and
 * this keeps `compat` (declared on `ClassifierModel`) on the way through.
 */
export interface KenariSystemOneModelConfig {
  type: "classifier";
  id: string;
  name: string;
  api: ClassifierApi;
  baseUrl: string;
  input: ("text" | "image")[];
  cost: KenariSystemOneModel["cost"];
  contextWindow: number;
  compat?: SystemOneCompat;
}

/** Convert kenari micro-IDR-per-1M-token input pricing to pi's USD ModelCost. */
function systemOneCost(
  pricing: KenariApiModel["pricing"],
): KenariSystemOneModel["cost"] {
  const input =
    typeof pricing?.input === "number" && Number.isFinite(pricing.input)
      ? pricing.input * MICRO_IDR_PER_1M_TO_USD_PER_1M
      : 0;
  return {
    input,
    output: SYSTEMONE_OUTPUT_COST,
    cacheRead: 0,
    cacheWrite: 0,
  };
}

/** The catalog input rate in micro-Rupiah per 1M tokens, when it quotes one. */
function microInputRate(
  pricing: KenariApiModel["pricing"],
): number | undefined {
  const input = pricing?.input;
  return typeof input === "number" && Number.isFinite(input)
    ? input
    : undefined;
}

/**
 * A paid baseline entry's rate, in both pi's USD `cost` and the catalog's own
 * micro-IDR, so the two never drift apart in the static list.
 */
function paidRate(
  microIdr: number,
): Pick<KenariSystemOneModel, "cost" | "inputMicroIdr"> {
  return { cost: systemOneCost({ input: microIdr }), inputMicroIdr: microIdr };
}

/** Model families that answer `fields` extraction only and cannot run questions. */
function isFieldsOnly(id: string): boolean {
  return id.startsWith("clairic");
}

/** Convert a kenari `?modality=systemone` entry to a pi classifier model. */
export function toKenariSystemOneModel(
  apiModel: KenariApiModel,
): KenariSystemOneModel | null {
  const id = apiModel.id;
  if (!id || isFieldsOnly(id)) return null;

  const isFree = id.endsWith(":free") || apiModel.pricing?.free === true;
  // pi classifiers accept text and image only; audio and video stay with the tool.
  const supportsImage = apiModel.modalities?.input?.includes("image") ?? false;
  const microInput = microInputRate(apiModel.pricing);

  return {
    id,
    name: apiModel.name ?? id,
    type: "classifier",
    api: KENARI_SYSTEMONE_API,
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI,
    input: supportsImage ? ["text", "image"] : ["text"],
    cost: isFree
      ? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      : systemOneCost(apiModel.pricing),
    contextWindow: apiModel.context_length ?? SYSTEMONE_CONTEXT_WINDOW,
    ...(supportsImage && { compat: { ...SYSTEMONE_IMAGE_COMPAT } }),
    isFree,
    ...(microInput !== undefined && { inputMicroIdr: microInput }),
  };
}

/** Convert a System One catalog to pi classifier models, dropping non-questions models. */
export function toKenariSystemOneModels(
  apiModels: KenariApiModel[],
): KenariSystemOneModel[] {
  const models: KenariSystemOneModel[] = [];
  for (const apiModel of apiModels) {
    const model = toKenariSystemOneModel(apiModel);
    if (model) models.push(model);
  }
  return models;
}

/** Convert classifier models to the configs `registerProvider` accepts. */
export function toProviderClassifierConfigs(
  models: KenariSystemOneModel[],
): KenariSystemOneModelConfig[] {
  return models.map((m) => ({
    type: "classifier" as const,
    id: m.id,
    name: m.name,
    api: m.api,
    baseUrl: m.baseUrl,
    input: m.input,
    cost: m.cost,
    contextWindow: m.contextWindow,
    compat: m.compat,
  }));
}

// =============================================================================
// Baseline catalog (offline fallback)
// =============================================================================

/**
 * Static baseline, mirroring the live `?modality=systemone` catalog. Clairic is
 * intentionally absent: it answers `fields` extraction only.
 */
export const KENARI_SYSTEMONE_BASELINE_MODELS: KenariSystemOneModel[] = [
  {
    id: "clef:free",
    name: "Clef",
    type: "classifier",
    api: KENARI_SYSTEMONE_API,
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    compat: { ...SYSTEMONE_IMAGE_COMPAT },
    isFree: true,
  },
  {
    id: "clef",
    name: "Clef",
    type: "classifier",
    api: KENARI_SYSTEMONE_API,
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI,
    input: ["text"],
    ...paidRate(3_000_000_000),
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    isFree: false,
  },
  {
    id: "clef-flash:free",
    name: "Clef Flash",
    type: "classifier",
    api: KENARI_SYSTEMONE_API,
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    compat: { ...SYSTEMONE_IMAGE_COMPAT },
    isFree: true,
  },
  {
    id: "clef-omni:free",
    name: "Clef Omni",
    type: "classifier",
    api: KENARI_SYSTEMONE_API,
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI,
    // Audio and video are dropped: a classifier carries text and image only.
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    compat: { ...SYSTEMONE_IMAGE_COMPAT },
    isFree: true,
  },
  {
    id: "jev-1-13",
    name: "Jev 1.13",
    type: "classifier",
    api: KENARI_SYSTEMONE_API,
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI,
    input: ["text"],
    ...paidRate(850_000_000),
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    isFree: false,
  },
  {
    id: "jev-1-14",
    name: "Jev 1.14",
    type: "classifier",
    api: KENARI_SYSTEMONE_API,
    provider: PROVIDER_KENARI,
    baseUrl: BASE_URL_KENARI,
    input: ["text", "image"],
    ...paidRate(850_000_000),
    contextWindow: SYSTEMONE_CONTEXT_WINDOW,
    compat: { ...SYSTEMONE_IMAGE_COMPAT },
    isFree: false,
  },
];

/** Get the baseline System One classifiers for offline init. */
export function getKenariSystemOneBaselineModels(): KenariSystemOneModel[] {
  return KENARI_SYSTEMONE_BASELINE_MODELS;
}

/**
 * Input rate in USD per 1M tokens for a System One model id; 0 when unknown.
 *
 * Consults the live catalog's rate first: a paid model kenari ships tomorrow is
 * absent from the static baseline, and pricing it as free would hide real
 * spend. Falls back to the baseline for ids the catalog does not carry.
 */
export function getKenariSystemOneInputRate(modelId: string): number {
  const live = getKenariSystemOneModelCatalog().find((m) => m.id === modelId);
  if (live) {
    return live.isFree || live.inputMicroIdr === undefined
      ? 0
      : live.inputMicroIdr * MICRO_IDR_PER_1M_TO_USD_PER_1M;
  }
  const model = KENARI_SYSTEMONE_BASELINE_MODELS.find((m) => m.id === modelId);
  return model?.cost.input ?? 0;
}

// =============================================================================
// Model choice catalog
// =============================================================================

/**
 * What a System One model can answer. Clairic is the only `fields` model;
 * everything else answers `questions` and rejects `fields`.
 */
export type KenariSystemOneCapability = "questions" | "fields";

/**
 * A catalog entry, for choosing a model rather than running one. Wider than
 * `KenariSystemOneModel`, which is a pi classifier: this keeps Clairic (which
 * answers `fields` and can never be a classifier), the catalog's raw input
 * modalities, and the rate kenari quotes, so a caller can justify a choice.
 */
export interface KenariSystemOneModelInfo {
  id: string;
  name: string;
  isFree: boolean;
  /** Input modalities the model accepts: text, image, audio, video. */
  input: string[];
  capabilities: KenariSystemOneCapability[];
  /** Catalog rate in micro-Rupiah per 1M input tokens; absent when free. */
  inputMicroIdr?: number;
}

/** Clairic answers `fields` extraction only, so it is never a classifier. */
const CLAIRIC_MODEL_INFO: KenariSystemOneModelInfo = {
  id: "clairic:free",
  name: "Clairic",
  isFree: true,
  input: ["text", "image"],
  capabilities: ["fields"],
};

/** Convert a questions-capable classifier model to a catalog entry. */
export function toKenariSystemOneModelInfo(
  model: KenariSystemOneModel,
): KenariSystemOneModelInfo {
  return {
    id: model.id,
    name: model.name,
    isFree: model.isFree === true,
    // A classifier carries text and image only: pi cannot send audio or video,
    // and the tool's assets are PNG/JPEG.
    input: [...model.input],
    capabilities: ["questions"],
    ...(model.inputMicroIdr !== undefined
      ? { inputMicroIdr: model.inputMicroIdr }
      : {}),
  };
}

/** Convert a live `?modality=systemone` entry to a catalog entry. */
export function apiModelToKenariSystemOneModelInfo(
  apiModel: KenariApiModel,
): KenariSystemOneModelInfo | null {
  const id = apiModel.id;
  if (!id) return null;

  const isFree = id.endsWith(":free") || apiModel.pricing?.free === true;
  const microInput = microInputRate(apiModel.pricing);

  return {
    id,
    name: apiModel.name ?? id,
    isFree,
    input: [...(apiModel.modalities?.input ?? ["text"])],
    capabilities: isFieldsOnly(id) ? ["fields"] : ["questions"],
    ...(!isFree && microInput !== undefined
      ? { inputMicroIdr: microInput }
      : {}),
  };
}

/** The static catalog: every baseline model, then Clairic. */
export const KENARI_SYSTEMONE_MODEL_INFO: readonly KenariSystemOneModelInfo[] =
  [
    ...KENARI_SYSTEMONE_BASELINE_MODELS.map(toKenariSystemOneModelInfo),
    CLAIRIC_MODEL_INFO,
  ];

/** How long a fetched catalog is trusted before model choice re-fetches it. */
const MODEL_INFO_TTL_MS = 5 * 60_000;

let modelInfoCache:
  | { models: KenariSystemOneModelInfo[]; fetchedAt: number }
  | undefined;

/** Cache a fetched catalog for model choice; returns what it stored. */
function rememberSystemOneModelCatalog(
  apiModels: KenariApiModel[],
): KenariSystemOneModelInfo[] {
  const models: KenariSystemOneModelInfo[] = [];
  for (const apiModel of apiModels) {
    const info = apiModelToKenariSystemOneModelInfo(apiModel);
    if (info) models.push(info);
  }
  if (models.length > 0) {
    modelInfoCache = { models, fetchedAt: Date.now() };
  }
  return models;
}

/**
 * The catalog model choice resolves against: the live one while it is fresh,
 * the static one otherwise. Never fetches — resolving a `model` argument must
 * not cost a network round trip.
 */
export function getKenariSystemOneModelCatalog(): readonly KenariSystemOneModelInfo[] {
  if (
    modelInfoCache &&
    Date.now() - modelInfoCache.fetchedAt < MODEL_INFO_TTL_MS
  ) {
    return modelInfoCache.models;
  }
  return KENARI_SYSTEMONE_MODEL_INFO;
}

/** Drop the cached catalog, so the next read falls back to the static one. */
export function resetKenariSystemOneModelCatalog(): void {
  modelInfoCache = undefined;
}

/** Where a catalog came from. */
export type KenariSystemOneCatalogSource = "live" | "baseline";

export interface KenariSystemOneCatalog {
  models: KenariSystemOneModelInfo[];
  source: KenariSystemOneCatalogSource;
}

/**
 * Fetch the catalog for model choice and cache it. The endpoint is public, so
 * this works before login; a failed fetch degrades to the static catalog
 * instead of failing the call.
 */
export async function fetchKenariSystemOneModelCatalog(
  signal?: AbortSignal,
): Promise<KenariSystemOneCatalog> {
  try {
    const apiModels = await fetchKenariModelsByModality("systemone", signal);
    const models = rememberSystemOneModelCatalog(apiModels);
    if (models.length > 0) return { models, source: "live" };
  } catch {
    // Offline, or the catalog endpoint is unhappy: the static list still
    // describes every model the baseline knows about.
  }
  return { models: [...KENARI_SYSTEMONE_MODEL_INFO], source: "baseline" };
}

// =============================================================================
// Refresh
// =============================================================================

/** Fetch the System One catalog (public, no key needed). */
export async function fetchKenariSystemOneModels(
  signal?: AbortSignal,
): Promise<KenariSystemOneModel[]> {
  const apiModels = await fetchKenariModelsByModality("systemone", signal);
  return toKenariSystemOneModels(apiModels);
}

/**
 * Refresh the System One classifiers. Called from the provider's
 * `refreshModels`, so the returned list replaces the classifier entries.
 *
 * The chat catalog owns the persisted model store, so these models are never
 * published: mixing classifier entries into the stored chat list would feed
 * them back as chat configs on the next offline start. They are cheap to fetch
 * and the baseline covers offline starts.
 */
export async function refreshKenariSystemOneModels(
  context: RefreshModelsContext,
): Promise<KenariSystemOneModel[]> {
  if (!context.allowNetwork) return KENARI_SYSTEMONE_BASELINE_MODELS;

  try {
    const apiModels = await fetchKenariModelsByModality(
      "systemone",
      context.signal,
    );
    // Model choice reuses this fetch: the classifier list drops Clairic, the
    // catalog keeps it.
    rememberSystemOneModelCatalog(apiModels);
    const models = toKenariSystemOneModels(apiModels);
    return models.length > 0 ? models : KENARI_SYSTEMONE_BASELINE_MODELS;
  } catch {
    return KENARI_SYSTEMONE_BASELINE_MODELS;
  }
}
