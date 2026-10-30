/**
 * Shared type definitions for pi-kenari-provider.
 */
// =============================================================================
// Provider constants
// =============================================================================
export const PROVIDER_KENARI = "kenari";
export const BASE_URL_KENARI = "https://kenari.id/v1";
export const KENARI_API_KEY_ENV = "KENARI_API_KEY";
// =============================================================================
// kenari API response types (from GET /v1/models)
// =============================================================================
/**
 * Values accepted by `GET /v1/models?modality=...`. Any other value, including
 * an empty one, returns 400. These models are never part of the bare
 * `GET /v1/models` catalog, so they stay out of the pi chat model list.
 */
export const KENARI_MODALITIES = [
    "embedding",
    "rerank",
    "moderation",
    "systemone",
];
