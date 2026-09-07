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
import type { KenariApiModel, KenariModel, KenariOpenAIModel } from "./types.js";
/**
 * The built-in kenari-free route: exists on every account, points at free
 * models, costs nothing, rate-limited per account. It is a route, not a
 * model, so GET /v1/models never lists it — add it manually.
 */
export declare const KENARI_FREE_ROUTE_MODEL: KenariOpenAIModel;
/** Static baseline models — used for offline init before first fetch. Prices from live catalog. */
export declare const KENARI_BASELINE_MODELS: KenariOpenAIModel[];
/** Fetch the full chat model catalog from kenari's public /v1/models endpoint. */
export declare function fetchKenariModels(signal?: AbortSignal): Promise<KenariApiModel[]>;
/** Fetch models filtered by modality (bare /v1/models lists chat models only). */
export declare function fetchKenariModelsByModality(modality: "image" | "embedding" | "rerank" | "moderation", signal?: AbortSignal): Promise<KenariApiModel[]>;
/** Convert kenari micro-IDR-per-1M-token rates to pi's USD-per-1M-token ModelCost. */
export declare function microIdrCost(pricing: {
    input?: number | null;
    output?: number | null;
    cache_read?: number | null;
    cache_write?: number | null;
}): Model<Api>["cost"];
/** Convert a kenari API model to a pi-ai Model. */
export declare function toKenariModel(apiModel: KenariApiModel): KenariModel | null;
/** Convert a catalog of kenari API models to pi-ai Models. */
export declare function toKenariModels(apiModels: KenariApiModel[]): KenariModel[];
/** Refresh the model catalog. Called by pi's model refresh lifecycle. */
export declare function refreshKenariModels(context: RefreshModelsContext): Promise<KenariModel[]>;
/** Get the baseline models for offline init. */
export declare function getKenariBaselineModels(): KenariModel[];
//# sourceMappingURL=models.d.ts.map