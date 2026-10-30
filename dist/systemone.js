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
import { BASE_URL_KENARI, MICRO_IDR_PER_1M_TO_USD_PER_1M, PROVIDER_KENARI, } from "./constants.js";
import { fetchKenariModelsByModality } from "./models.js";
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
const SYSTEMONE_IMAGE_COMPAT = Object.freeze({
    imageInput: "assets",
    sendImageOptInHeader: false,
});
/** Convert kenari micro-IDR-per-1M-token input pricing to pi's USD ModelCost. */
function systemOneCost(pricing) {
    const input = typeof pricing?.input === "number" && Number.isFinite(pricing.input)
        ? pricing.input * MICRO_IDR_PER_1M_TO_USD_PER_1M
        : 0;
    return {
        input,
        output: SYSTEMONE_OUTPUT_COST,
        cacheRead: 0,
        cacheWrite: 0,
    };
}
/** Model families that answer `fields` extraction only and cannot run questions. */
function isFieldsOnly(id) {
    return id.startsWith("clairic");
}
/** Convert a kenari `?modality=systemone` entry to a pi classifier model. */
export function toKenariSystemOneModel(apiModel) {
    const id = apiModel.id;
    if (!id || isFieldsOnly(id))
        return null;
    const isFree = id.endsWith(":free") || apiModel.pricing?.free === true;
    // pi classifiers accept text and image only; audio and video stay with the tool.
    const supportsImage = apiModel.modalities?.input?.includes("image") ?? false;
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
    };
}
/** Convert a System One catalog to pi classifier models, dropping non-questions models. */
export function toKenariSystemOneModels(apiModels) {
    const models = [];
    for (const apiModel of apiModels) {
        const model = toKenariSystemOneModel(apiModel);
        if (model)
            models.push(model);
    }
    return models;
}
/** Convert classifier models to the configs `registerProvider` accepts. */
export function toProviderClassifierConfigs(models) {
    return models.map((m) => ({
        type: "classifier",
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
export const KENARI_SYSTEMONE_BASELINE_MODELS = [
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
        cost: systemOneCost({ input: 3_000_000_000 }),
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
        cost: systemOneCost({ input: 850_000_000 }),
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
        cost: systemOneCost({ input: 850_000_000 }),
        contextWindow: SYSTEMONE_CONTEXT_WINDOW,
        compat: { ...SYSTEMONE_IMAGE_COMPAT },
        isFree: false,
    },
];
/** Get the baseline System One classifiers for offline init. */
export function getKenariSystemOneBaselineModels() {
    return KENARI_SYSTEMONE_BASELINE_MODELS;
}
/** Input rate in USD per 1M tokens for a System One model id; 0 when unknown. */
export function getKenariSystemOneInputRate(modelId) {
    const model = KENARI_SYSTEMONE_BASELINE_MODELS.find((m) => m.id === modelId);
    return model?.cost.input ?? 0;
}
// =============================================================================
// Refresh
// =============================================================================
/** Fetch the System One catalog (public, no key needed). */
export async function fetchKenariSystemOneModels(signal) {
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
export async function refreshKenariSystemOneModels(context) {
    if (!context.allowNetwork)
        return KENARI_SYSTEMONE_BASELINE_MODELS;
    try {
        const models = await fetchKenariSystemOneModels(context.signal);
        return models.length > 0 ? models : KENARI_SYSTEMONE_BASELINE_MODELS;
    }
    catch {
        return KENARI_SYSTEMONE_BASELINE_MODELS;
    }
}
