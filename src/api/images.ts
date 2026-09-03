/**
 * Image generation and editing for kenari.
 *
 * kenari provides OpenAI Images-compatible endpoints:
 * - POST /v1/images/generations — generate images
 * - POST /v1/images/edits — edit images (not yet implemented here)
 *
 * Only works with models marked as image models in the catalog.
 */

import { BASE_URL_KENARI } from "../constants.js";
import type { KenariImageGenerateOptions, KenariImageResponse } from "../types.js";

/** Generate images via kenari's /v1/images/generations endpoint. */
export async function generateImages(
  options: KenariImageGenerateOptions,
): Promise<KenariImageResponse> {
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new Error("kenari API key required for image generation");
  }

  const body: Record<string, unknown> = {
    prompt: options.prompt,
    model: options.model,
  };
  if (options.n !== undefined) body.n = options.n;
  if (options.size !== undefined) body.size = options.size;
  if (options.quality !== undefined) body.quality = options.quality;
  if (options.style !== undefined) body.style = options.style;
  if (options.background !== undefined) body.background = options.background;
  if (options.response_format !== undefined) body.response_format = options.response_format;

  const response = await fetch(`${BASE_URL_KENARI}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`kenari image generation failed (${response.status}): ${text}`);
  }

  return (await response.json()) as KenariImageResponse;
}
