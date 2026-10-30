/**
 * Web and X search for kenari — plain HTTP calls with no model in the loop.
 *
 * - POST /v1/web/search — ranked results for a query
 * - POST /v1/web/fetch  — one page as text
 * - POST /v1/x/search   — a short answer from live posts on X, with citations
 *
 * These are the same operations kenari's server tools give to a model. All
 * three need an API key.
 */
import type { KenariWebFetchOptions, KenariWebFetchResponse, KenariWebSearchOptions, KenariWebSearchResponse, KenariXSearchOptions, KenariXSearchResponse } from "../types.js";
/** Search the web. `max_results` defaults to 5 on kenari's side. */
export declare function webSearch(options: KenariWebSearchOptions): Promise<KenariWebSearchResponse>;
/** Fetch one page as plain text, plus the links found on it. */
export declare function webFetch(options: KenariWebFetchOptions): Promise<KenariWebFetchResponse>;
/** Search live posts on X; the answer comes back with its citations. */
export declare function xSearch(options: KenariXSearchOptions): Promise<KenariXSearchResponse>;
//# sourceMappingURL=web.d.ts.map