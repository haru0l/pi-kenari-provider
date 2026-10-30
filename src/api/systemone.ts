/**
 * System One API for kenari.
 * POST /v1/systemone
 *
 * kenari's own decision and extraction contract: `questions` runs noul, choice,
 * score, and box questions; `fields` runs Clairic extraction. No OpenAI or
 * Anthropic SDK method maps to either.
 */

import { BASE_URL_KENARI } from "../constants.js";
import type {
  KenariSystemOneOptions,
  KenariSystemOneResponse,
} from "../types.js";

export async function runSystemOne(
  options: KenariSystemOneOptions,
): Promise<KenariSystemOneResponse> {
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error("kenari API key required for system one");

  const { apiKey: _apiKey, signal, state, ...rest } = options;

  const body: Record<string, unknown> = { ...rest };

  // kenari takes one state field; an object or array goes as its JSON text.
  if (state !== undefined) {
    body.state = typeof state === "string" ? state : JSON.stringify(state);
  }

  const response = await fetch(`${BASE_URL_KENARI}/systemone`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `kenari systemone failed (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as KenariSystemOneResponse;
}
