/**
 * Shared type definitions for pi-kenari-provider.
 */

import type { Api, Model } from "@earendil-works/pi-ai";

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
  /** Modality flags from the kenari catalog. */
  modalities?: KenariModalities;
}

/** A kenari model that speaks the Anthropic Messages wire format. */
export interface KenariAnthropicModel extends Model<"anthropic-messages"> {
  isFree?: boolean;
  modalities?: KenariModalities;
}

/** Modality support flags from kenari's model catalog. */
export interface KenariModalities {
  chat?: boolean;
  images?: boolean;
  embedding?: boolean;
  rerank?: boolean;
  moderation?: boolean;
  audio?: boolean;
  music?: boolean;
  video?: boolean;
}

/** Union of all kenari model types. */
export type KenariModel = KenariOpenAIModel | KenariAnthropicModel;

// =============================================================================
// kenari API response types (from GET /v1/models)
// =============================================================================

export interface KenariApiModel {
  id: string;
  name?: string;
  provider?: string;
  max_input_chars?: number;
  max_prompt_chars?: number;
  cost?: KenariCost;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  input?: string[];
  output?: string[];
  modalities?: KenariModalities;
  api?: string;
}

export interface KenariCost {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
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
  apiKey?: string;
  signal?: AbortSignal;
}

export interface KenariImageResponse {
  data: Array<{ url?: string; b64_json?: string }>;
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
// Audio/Music types
// =============================================================================

export interface KenariAudioOptions {
  prompt: string;
  model: string;
  voice?: string;
  response_format?: "mp3" | "wav" | "pcm";
  apiKey?: string;
  signal?: AbortSignal;
}

export interface KenariMusicOptions {
  prompt: string;
  model: string;
  duration?: number;
  response_format?: "mp3";
  apiKey?: string;
  signal?: AbortSignal;
}

export interface KenariVideoOptions {
  prompt: string;
  model: string;
  duration?: number;
  format?: "mp4" | "webm" | "quicktime";
  apiKey?: string;
  signal?: AbortSignal;
}
