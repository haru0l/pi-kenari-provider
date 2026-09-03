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

/** Matches the live GET /v1/models entry shape. */
export interface KenariApiModel {
  id: string;
  name?: string;
  owned_by?: string;
  context_length?: number;
  max_input_chars?: number;
  max_lyrics_chars?: number;
  max_prompt_chars?: number;
  pricing?: KenariPricing;
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
// Audio, music, and video types
// =============================================================================

/** Text-to-speech via POST /v1/audio/speech. Returns raw audio bytes. */
export interface KenariAudioOptions {
  model: string;
  /** Text to speak. */
  input: string;
  voice?: string;
  response_format?: "mp3" | "wav" | "pcm" | "opus" | "aac" | "flac";
  speed?: number;
  language?: string;
  apiKey?: string;
  signal?: AbortSignal;
}

/** Music generation via POST /v1/music/generations. Returns decoded mp3 bytes. */
export interface KenariMusicOptions {
  model: string;
  /** The words to be sung. Required unless instrumental. */
  lyrics?: string;
  /** Produce a track with no vocals; requires prompt. */
  instrumental?: boolean;
  /** Style/mood description; required when instrumental is true. */
  prompt?: string;
  apiKey?: string;
  signal?: AbortSignal;
}

/** Async video job via /v1/videos/*. Returns the decoded clip bytes. */
export interface KenariVideoOptions {
  model: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  apiKey?: string;
  signal?: AbortSignal;
}

/** Job object returned by POST /v1/videos/generations and GET /v1/videos/{id}. */
export interface KenariVideoJob {
  id: string;
  object?: "video.job";
  status: "rendering" | "done" | "failed" | "expired";
  model?: string;
  url?: string;
}
