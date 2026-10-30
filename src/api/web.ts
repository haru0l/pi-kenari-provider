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

import { BASE_URL_KENARI } from "../constants.js";
import type {
  KenariWebFetchOptions,
  KenariWebFetchResponse,
  KenariWebSearchOptions,
  KenariWebSearchResponse,
  KenariXSearchOptions,
  KenariXSearchResponse,
} from "../types.js";
import { throwKenariError } from "./http.js";

/** Search the web. `max_results` defaults to 5 on kenari's side. */
export async function webSearch(
  options: KenariWebSearchOptions,
): Promise<KenariWebSearchResponse> {
  const body: Record<string, unknown> = { query: options.query };
  if (options.max_results !== undefined) body.max_results = options.max_results;

  return post<KenariWebSearchResponse>(
    "/web/search",
    "web search",
    body,
    options,
  );
}

/** Fetch one page as plain text, plus the links found on it. */
export async function webFetch(
  options: KenariWebFetchOptions,
): Promise<KenariWebFetchResponse> {
  return post<KenariWebFetchResponse>(
    "/web/fetch",
    "web fetch",
    { url: options.url },
    options,
  );
}

/** Search live posts on X; the answer comes back with its citations. */
export async function xSearch(
  options: KenariXSearchOptions,
): Promise<KenariXSearchResponse> {
  const body: Record<string, unknown> = { query: options.query };
  if (options.x_search_filter !== undefined)
    body.x_search_filter = options.x_search_filter;

  return post<KenariXSearchResponse>("/x/search", "x search", body, options);
}

async function post<T>(
  path: string,
  label: string,
  body: Record<string, unknown>,
  options: { apiKey?: string; signal?: AbortSignal },
): Promise<T> {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error(`kenari API key required for ${label}`);

  const response = await fetch(`${BASE_URL_KENARI}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    await throwKenariError(label, response);
  }
  return (await response.json()) as T;
}
