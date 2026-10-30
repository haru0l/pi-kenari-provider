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
import type { ClassifierApi, ClassifierModel, RefreshModelsContext, SystemOneCompat } from "@earendil-works/pi-ai";
import type { KenariApiModel } from "./types.js";
/** pi's built-in TypeSafe System One transport; kenari's endpoint is wire-compatible. */
export declare const KENARI_SYSTEMONE_API = "typesafe-system-one";
/** A kenari System One model usable as a pi classifier. */
export interface KenariSystemOneModel extends ClassifierModel<typeof KENARI_SYSTEMONE_API> {
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
/** Convert a kenari `?modality=systemone` entry to a pi classifier model. */
export declare function toKenariSystemOneModel(apiModel: KenariApiModel): KenariSystemOneModel | null;
/** Convert a System One catalog to pi classifier models, dropping non-questions models. */
export declare function toKenariSystemOneModels(apiModels: KenariApiModel[]): KenariSystemOneModel[];
/** Convert classifier models to the configs `registerProvider` accepts. */
export declare function toProviderClassifierConfigs(models: KenariSystemOneModel[]): KenariSystemOneModelConfig[];
/**
 * Static baseline, mirroring the live `?modality=systemone` catalog. Clairic is
 * intentionally absent: it answers `fields` extraction only.
 */
export declare const KENARI_SYSTEMONE_BASELINE_MODELS: KenariSystemOneModel[];
/** Get the baseline System One classifiers for offline init. */
export declare function getKenariSystemOneBaselineModels(): KenariSystemOneModel[];
/**
 * Input rate in USD per 1M tokens for a System One model id; 0 when unknown.
 *
 * Consults the live catalog's rate first: a paid model kenari ships tomorrow is
 * absent from the static baseline, and pricing it as free would hide real
 * spend. Falls back to the baseline for ids the catalog does not carry.
 */
export declare function getKenariSystemOneInputRate(modelId: string): number;
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
/** Convert a questions-capable classifier model to a catalog entry. */
export declare function toKenariSystemOneModelInfo(model: KenariSystemOneModel): KenariSystemOneModelInfo;
/** Convert a live `?modality=systemone` entry to a catalog entry. */
export declare function apiModelToKenariSystemOneModelInfo(apiModel: KenariApiModel): KenariSystemOneModelInfo | null;
/** The static catalog: every baseline model, then Clairic. */
export declare const KENARI_SYSTEMONE_MODEL_INFO: readonly KenariSystemOneModelInfo[];
/**
 * The catalog model choice resolves against: the live one while it is fresh,
 * the static one otherwise. Never fetches — resolving a `model` argument must
 * not cost a network round trip.
 */
export declare function getKenariSystemOneModelCatalog(): readonly KenariSystemOneModelInfo[];
/** Drop the cached catalog, so the next read falls back to the static one. */
export declare function resetKenariSystemOneModelCatalog(): void;
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
export declare function fetchKenariSystemOneModelCatalog(signal?: AbortSignal): Promise<KenariSystemOneCatalog>;
/** Fetch the System One catalog (public, no key needed). */
export declare function fetchKenariSystemOneModels(signal?: AbortSignal): Promise<KenariSystemOneModel[]>;
/**
 * Refresh the System One classifiers. Called from the provider's
 * `refreshModels`, so the returned list replaces the classifier entries.
 *
 * The chat catalog owns the persisted model store, so these models are never
 * published: mixing classifier entries into the stored chat list would feed
 * them back as chat configs on the next offline start. They are cheap to fetch
 * and the baseline covers offline starts.
 */
export declare function refreshKenariSystemOneModels(context: RefreshModelsContext): Promise<KenariSystemOneModel[]>;
//# sourceMappingURL=systemone.d.ts.map