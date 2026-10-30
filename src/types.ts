/**
 * Shared type definitions for pi-kenari-provider.
 */

import type { Model } from "@earendil-works/pi-ai";

// =============================================================================
// Provider constants
// =============================================================================

export const PROVIDER_KENARI = "kenari";
export const BASE_URL_KENARI = "https://kenari.id/v1";
export const KENARI_API_KEY_ENV = "KENARI_API_KEY";

// =============================================================================
// Kenari-specific model extensions
// =============================================================================

/** A kenari model that speaks the OpenAI Chat Completions wire format. */
export interface KenariOpenAIModel extends Model<"openai-completions"> {
  /** Whether this is a :free variant (no balance deducted). */
  isFree?: boolean;
}

/** A kenari model that speaks the Anthropic Messages wire format. */
export interface KenariAnthropicModel extends Model<"anthropic-messages"> {
  isFree?: boolean;
}

/** Union of all kenari model types. */
export type KenariModel = KenariOpenAIModel | KenariAnthropicModel;

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
] as const;

export type KenariModality = (typeof KENARI_MODALITIES)[number];

/** Rates in micro-Rupiah per 1 million tokens. */
export interface KenariPricing {
  input?: number | null;
  output?: number | null;
  cache_read?: number | null;
  cache_write?: number | null;
  currency?: string;
  free?: boolean;
  unit?: string;
}
/**
 * One billable line on a model. Media and specialized models report `0` in
 * `pricing.input`/`output` and carry the real rate here instead.
 */
export interface KenariPricingLine {
  billable?: string;
  endpoint?: string;
  micro_idr?: number;
  unit?: string;
  variant?: string | null;
}

/** Matches the live GET /v1/models entry shape. */
export interface KenariApiModel {
  id: string;
  /** Present only on `?modality=` results; absent on the chat catalog. */
  modality?: KenariModality;
  name?: string;
  owned_by?: string;
  context_length?: number;
  max_input_chars?: number;
  max_lyrics_chars?: number;
  max_prompt_chars?: number;
  pricing?: KenariPricing;
  pricing_lines?: KenariPricingLine[];
  reasoning?: boolean;
  reasoning_options?: string[];
  reasoning_toggle?: boolean;
  tool_call?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  endpoints?: string[];
  sunset_at?: number | null;
  object?: string;
}

export interface KenariModelsResponse {
  data: KenariApiModel[];
}

// =============================================================================
// kenari quota response (from GET /v1/account/quota)
// =============================================================================

export interface KenariQuotaResponse {
  balance: number;
  currency: string;
  free_quota_remaining?: number;
  free_quota_daily?: number;
  free_quota_rpm?: number;
}

// =============================================================================
// Stream options
// =============================================================================

export interface KenariStreamOptions {
  /** Override the API key for this request. */
  apiKey?: string;
  /** Abort signal. */
  signal?: AbortSignal;
  /** Request timeout in ms. */
  timeoutMs?: number;
}

// =============================================================================
// Image generation types
// =============================================================================

export interface KenariImageGenerateOptions {
  prompt: string;
  model: string;
  n?: number;
  size?: string;
  quality?: "standard" | "hd";
  style?: "natural" | "vivid";
  background?: "opaque" | "auto";
  response_format?: "url" | "b64_json";
  /**
   * Abort the request after this many milliseconds. Image models are slow;
   * kenari's own examples allow 300000.
   */
  timeoutMs?: number;
  apiKey?: string;
  signal?: AbortSignal;
}

/** One image in a `/v1/images/generations` response. */
export interface KenariImageData {
  /** The image as base64, when the model returns it inline. */
  b64_json?: string;
  /**
   * A self-contained `data:` URI holding the image — not a link to a hosted
   * file. Read the part after the comma and decode it.
   */
  url?: string;
  /** The prompt the model actually used, when it reports one. */
  revised_prompt?: string;
}

export interface KenariImageResponse {
  created?: number;
  /** One entry per requested image. Each carries `b64_json`, `url`, or both. */
  data: KenariImageData[];
  usage?: Record<string, unknown>;
  size?: string;
  quality?: string;
  output_format?: string;
}

/** A decoded image: the bytes plus the type the response declared. */
export interface KenariImageResult {
  bytes: Uint8Array;
  /** From the `data:` URI, or `image/png` when only `b64_json` was returned. */
  mimeType: string;
  revisedPrompt?: string;
}

// =============================================================================
// Embedding types
// =============================================================================

export interface KenariEmbeddingOptions {
  input: string | string[];
  model: string;
  apiKey?: string;
  signal?: AbortSignal;
}

export interface KenariEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

// =============================================================================
// Rerank types
// =============================================================================

export interface KenariRerankOptions {
  query: string;
  documents: string[];
  model: string;
  apiKey?: string;
  signal?: AbortSignal;
}

export interface KenariRerankResponse {
  results: Array<{ index: number; relevance_score: number }>;
}

// =============================================================================
// Moderation types
// =============================================================================

export interface KenariModerationOptions {
  input: string | string[];
  model: string;
  apiKey?: string;
  signal?: AbortSignal;
}

export interface KenariModerationResponse {
  results: Array<{
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  }>;
}

// =============================================================================
// System One types
//
// kenari's decision and extraction models. `POST /v1/systemone` is kenari's own
// contract — no OpenAI or Anthropic SDK method maps to it — so the shapes below
// follow https://kenari.id/en/docs/systemone.
// =============================================================================

/** The four question types. `box` needs an image and answers with pixel fractions. */
export type KenariSystemOneQuestionType = "noul" | "choice" | "score" | "box";

export interface KenariSystemOneQuestion {
  type: KenariSystemOneQuestionType;
  /**
   * The question itself. Use an image's `assets` reference name here (whole or
   * inside the text) to point at that image.
   */
  instructions: string | Record<string, unknown> | unknown[];
  /**
   * `noul`: true/false descriptions. `choice`: a map of option -> description.
   * `score`: an ordered rubric. `box` takes none.
   */
  criteria?: Record<string, unknown> | unknown[];
}

/** Field types accepted by Clairic's `fields` extraction. */
export type KenariSystemOneFieldType =
  | "text"
  | "number"
  | "date"
  | "time"
  | "datetime"
  | "duration"
  | "list"
  | "estimate"
  | "forecast";

export interface KenariSystemOneField {
  type: KenariSystemOneFieldType;
  /** What the field should hold. Use an image reference name to point at an image. */
  instructions?: string;
  /** Type settings passed through as-is: `unit`, `integer`, `decimals`, `items`, `min`, `max`, `step`, `scale`, `null_threshold`, `horizon`, `interval`. */
  [setting: string]: unknown;
}

/** An image sent under a reference name you choose. */
export interface KenariSystemOneImageAsset {
  type?: "image";
  /** Must match the image bytes. */
  format: "png" | "jpg" | "jpeg";
  /** Standard base64, without a `data:` prefix. */
  data_base64: string;
}

/** An audio clip or video: a `data:` URL, or the content type with base64. */
export type KenariSystemOneMedia =
  | string
  | { content_type: string; base64: string };

export interface KenariSystemOneOptions {
  /** A System One model id from `?modality=systemone`. */
  model: string;
  /**
   * The text or data to evaluate. An object or array is sent as its JSON text.
   * A `fields` call can leave it out only when it also sends an image.
   */
  state?: string | Record<string, unknown> | unknown[];
  /** Send this or `fields`, not both. Up to 128 questions. */
  questions?: Record<string, KenariSystemOneQuestion>;
  /** Clairic only. Send this or `questions`, not both. Up to 64 fields. */
  fields?: Record<string, KenariSystemOneField>;
  /** Clairic only. ISO date that anchors dates written without a year. */
  reference_date?: string;
  /** Clairic only. */
  options?: {
    /** Adds 99 percentiles to estimates. */
    include_quantiles?: boolean;
    /** Returns `state_text`, the text the answer `span`s refer to. */
    return_state_text?: boolean;
  };
  /** Images under reference names. Send this or `images`, not both. Up to 16. */
  assets?: Record<string, KenariSystemOneImageAsset>;
  /** Images in array order, for models that take this shape. */
  images?: KenariSystemOneMedia[];
  /** Up to 4 clips of 8 MiB each, for models that read audio. */
  audio?: KenariSystemOneMedia[];
  /** Up to 2 videos of 16 MiB each, for models that read video. */
  videos?: KenariSystemOneMedia[];
  apiKey?: string;
  signal?: AbortSignal;
}

/** Base of every answer: Clairic fields and all four question types share these. */
export interface KenariSystemOneAnswerBase {
  /** The field's or question's type. */
  type: KenariSystemOneQuestionType | KenariSystemOneFieldType;
  /** How sure the model is of the answer. */
  confidence?: number;
}

/** An answered `noul` question: the probability that the answer is "yes". */
export interface KenariSystemOneNoulAnswer extends KenariSystemOneAnswerBase {
  type: "noul";
  noul: number;
}

/** An answered `choice` question. */
export interface KenariSystemOneChoiceAnswer extends KenariSystemOneAnswerBase {
  type: "choice";
  /** The chosen option key. */
  choice: string;
  probabilities?: Record<string, number>;
}

/** An answered `score` question. */
export interface KenariSystemOneScoreAnswer extends KenariSystemOneAnswerBase {
  type: "score";
  score: number;
  /** Maps rubric positions to their labels. */
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
}

/** An answered `box` question. Edges are fractions of the image, from 0 to 1. */
export interface KenariSystemOneBoxAnswer extends KenariSystemOneAnswerBase {
  type: "box";
  box: { top: number; bottom: number; left: number; right: number };
}

/** A Clairic extracted field. */
export interface KenariSystemOneFieldAnswer extends KenariSystemOneAnswerBase {
  /** The answer, or `null` when the input does not determine it. */
  value: string | number | unknown[] | null;
  /** The best candidate; stays present when `value` is `null`. */
  guess?: string | number | unknown[] | null;
  /** Probability that the input does not determine the value. */
  p_null?: number;
  /** For a `text` field: start and end of `guess` in the read text. */
  span?: [number, number];
  /** For a `list` field: one span per item. */
  spans?: Array<[number, number]>;
  /** For an `estimate` field. */
  median?: number;
  p10?: number;
  p90?: number;
}

export type KenariSystemOneAnswer =
  | KenariSystemOneNoulAnswer
  | KenariSystemOneChoiceAnswer
  | KenariSystemOneScoreAnswer
  | KenariSystemOneBoxAnswer
  | KenariSystemOneFieldAnswer;

export interface KenariSystemOneResponse {
  /** The versioned id that answered, falling back to the id you requested. */
  model: string;
  /** One entry per question id, or one per field name for a `fields` call. */
  answers: Record<string, KenariSystemOneAnswer>;
  /** Clairic only: `true` when the state was cut to fit the model. */
  truncated?: boolean;
  /** Present when `options.return_state_text` is true. */
  state_text?: string;
  usage: { input_tokens: number; output_tokens: number };
}

// =============================================================================
// Web and X search types
//
// POST /v1/web/search, /v1/web/fetch and /v1/x/search. Plain HTTP calls with no
// model in the loop; all need an API key. `cost_micro_idr` is the fee charged
// in micro-Rupiah (Rupiah times 1,000,000), and is 0 when a plan covers it.
// =============================================================================

/** Fields every web/X response carries alongside its payload. */
export interface KenariWebMeta {
  /** Identifies the request. */
  id?: string;
  cost_micro_idr?: number;
}

export interface KenariWebSearchOptions {
  /** The search query. It must not be empty. */
  query: string;
  /**
   * How many results to return. Defaults to 5. A value outside 1 to 10 is
   * moved to the nearest limit, not rejected; kenari fails to parse a negative
   * value or one above 255.
   */
  max_results?: number;
  apiKey?: string;
  signal?: AbortSignal;
}

export interface KenariWebSearchResult {
  title: string;
  url: string;
  /** A snippet of the page. */
  content: string;
}

export interface KenariWebSearchResponse extends KenariWebMeta {
  results: KenariWebSearchResult[];
}

export interface KenariWebFetchOptions {
  /** Must start with `http://` or `https://` and point to a public host. */
  url: string;
  apiKey?: string;
  signal?: AbortSignal;
}

export interface KenariWebFetchResponse extends KenariWebMeta {
  title?: string;
  /** The page as plain text. */
  content: string;
  /** The URLs found on the page. */
  links?: string[];
}

export interface KenariXSearchFilter {
  /** Search only these accounts. At most 20. Cannot be combined with `excluded_x_handles`. */
  allowed_x_handles?: string[];
  /** Leave these accounts out. At most 20. */
  excluded_x_handles?: string[];
  /** Start of the date range, `YYYY-MM-DD`. */
  from_date?: string;
  /** End of the date range, `YYYY-MM-DD`. Must not be before `from_date`. */
  to_date?: string;
  /** Read the images inside posts. */
  enable_image_understanding?: boolean;
  /** Read the videos inside posts. */
  enable_video_understanding?: boolean;
}

export interface KenariXSearchOptions {
  query: string;
  /** Narrows the search. Unknown fields are refused by kenari. */
  x_search_filter?: KenariXSearchFilter;
  apiKey?: string;
  signal?: AbortSignal;
}

export interface KenariXSearchResponse extends KenariWebMeta {
  answer: string;
  /** Posts the answer draws on. */
  citations: Array<{ url: string; title: string | null }>;
}
