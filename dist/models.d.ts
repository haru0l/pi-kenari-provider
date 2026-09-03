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
import type { RefreshModelsContext } from "@earendil-works/pi-ai";
import type { KenariApiModel, KenariModel, KenariOpenAIModel } from "./types.js";
/** Static baseline models — used for offline init before first fetch. */
export declare const KENARI_BASELINE_MODELS: KenariOpenAIModel[];
/** Fetch the full model catalog from kenari's public /v1/models endpoint. */
export declare function fetchKenariModels(signal?: AbortSignal): Promise<KenariApiModel[]>;
/** Fetch models filtered by modality. */
export declare function fetchKenariModelsByModality(modality: "chat" | "image" | "embedding" | "rerank" | "moderation", signal?: AbortSignal): Promise<KenariApiModel[]>;
/** Convert a kenari API model to a pi-ai Model. */
export declare function toKenariModel(apiModel: KenariApiModel): KenariModel | null;
/** Convert a catalog of kenari API models to pi-ai Models. */
export declare function toKenariModels(apiModels: KenariApiModel[]): KenariModel[];
/** Refresh the model catalog. Called by pi's model refresh lifecycle. */
export declare function refreshKenariModels(context: RefreshModelsContext): Promise<KenariModel[]>;
/** Get the baseline models for offline init. */
export declare function getKenariBaselineModels(): KenariModel[];
//# sourceMappingURL=models.d.ts.map