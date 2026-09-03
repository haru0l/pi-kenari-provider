/**
 * Shared constants for pi-kenari-provider.
 */
export declare const PROVIDER_KENARI = "kenari";
export declare const BASE_URL_KENARI = "https://kenari.id/v1";
export declare const KENARI_API_KEY_ENV = "KENARI_API_KEY";
/**
 * kenari prices are micro-IDR per 1M tokens; pi's ModelCost is USD per 1M
 * tokens. USD/1M = micro-IDR / (1e6 * IDR-per-USD).
 */
export declare const KENARI_IDR_PER_USD = 16500;
/** micro-IDR per 1M tokens -> USD per 1M tokens. */
export declare const MICRO_IDR_PER_1M_TO_USD_PER_1M: number;
//# sourceMappingURL=constants.d.ts.map