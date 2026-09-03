/**
 * Audio, Music, and Video generation APIs for kenari.
 *
 * kenari provides OpenAI-style endpoints for:
 * - Audio generation (text-to-speech)
 * - Music generation
 * - Video generation
 *
 * Each endpoint only serves models marked for it in the catalog.
 */

import { BASE_URL_KENARI } from "../constants.js";
import type { KenariAudioOptions, KenariMusicOptions, KenariVideoOptions } from "../types.js";
/** Generate audio (text-to-speech) via kenari. */
export async function generateAudio(
  options: KenariAudioOptions,
): Promise<ArrayBuffer> {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error("kenari API key required for audio generation");

  const body: Record<string, unknown> = {
    prompt: options.prompt,
    model: options.model,
  };
  if (options.voice !== undefined) body.voice = options.voice;
  if (options.response_format !== undefined) body.response_format = options.response_format;

  const response = await fetch(`${BASE_URL_KENARI}/audio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`kenari audio generation failed (${response.status}): ${await response.text()}`);
  }
  return await response.arrayBuffer();
}

/** Generate music via kenari. */
export async function generateMusic(
  options: KenariMusicOptions,
): Promise<ArrayBuffer> {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error("kenari API key required for music generation");

  const body: Record<string, unknown> = {
    prompt: options.prompt,
    model: options.model,
  };
  if (options.duration !== undefined) body.duration = options.duration;
  if (options.response_format !== undefined) body.response_format = options.response_format ?? "mp3";

  const response = await fetch(`${BASE_URL_KENARI}/music`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`kenari music generation failed (${response.status}): ${await response.text()}`);
  }
  return await response.arrayBuffer();
}

/** Generate video via kenari. */
export async function generateVideo(
  options: KenariVideoOptions,
): Promise<ArrayBuffer> {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error("kenari API key required for video generation");

  const body: Record<string, unknown> = {
    prompt: options.prompt,
    model: options.model,
  };
  if (options.duration !== undefined) body.duration = options.duration;
  if (options.format !== undefined) body.format = options.format;

  const response = await fetch(`${BASE_URL_KENARI}/video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`kenari video generation failed (${response.status}): ${await response.text()}`);
  }
  return await response.arrayBuffer();
}
