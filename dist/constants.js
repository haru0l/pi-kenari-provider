/**
 * Shared constants for pi-kenari-provider.
 */
export const PROVIDER_KENARI = "kenari";
export const BASE_URL_KENARI = "https://kenari.id/v1";
export const KENARI_API_KEY_ENV = "KENARI_API_KEY";
/**
 * kenari prices are micro-IDR per 1M tokens; pi's ModelCost is USD per 1M
 * tokens. USD/1M = micro-IDR / (1e6 * IDR-per-USD).
 */
// ponytail: fixed FX rate, retune when IDR/USD moves materially
export const KENARI_IDR_PER_USD = 16_500;
/** micro-IDR per 1M tokens -> USD per 1M tokens. */
export const MICRO_IDR_PER_1M_TO_USD_PER_1M = 1 / (1_000_000 * KENARI_IDR_PER_USD);
