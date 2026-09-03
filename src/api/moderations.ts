/**
 * Moderations API for kenari (OpenAI-compatible).
 * POST /v1/moderations
 */

import { BASE_URL_KENARI } from "../constants.js";
import type {
  KenariModerationOptions,
  KenariModerationResponse,
} from "../types.js";
export async function moderateContent(
  options: KenariModerationOptions,
): Promise<KenariModerationResponse> {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error("kenari API key required for moderations");

  const response = await fetch(`${BASE_URL_KENARI}/moderations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: options.input,
      model: options.model,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(
      `kenari moderations failed (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as KenariModerationResponse;
}
