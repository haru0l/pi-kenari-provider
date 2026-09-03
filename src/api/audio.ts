/**
 * Audio, music, and video generation APIs for kenari.
 *
 * Endpoints (see llms-full.txt "Audio, music and video"):
 * - POST /v1/audio/speech        -> raw audio bytes (TTS)
 * - POST /v1/music/generations   -> JSON envelope, base64 mp3 in data[0].b64_json
 * - POST /v1/videos/generations  -> async job, poll GET /v1/videos/{id},
 *                                   download GET /v1/videos/{id}/content
 *
 * Music quirk: the gateway writes ASCII spaces every 20s to hold the
 * connection open, and a failure past the grace period arrives as HTTP 200
 * with an OpenAI error object — always parse the JSON and check `error`.
 */

import { BASE_URL_KENARI } from "../constants.js";
import type {
  KenariAudioOptions,
  KenariMusicOptions,
  KenariVideoJob,
  KenariVideoOptions,
} from "../types.js";

function requireKey(apiKey?: string, what = "this endpoint"): string {
  if (!apiKey) throw new Error(`kenari API key required for ${what}`);
  return apiKey;
}

async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

/** Generate audio (text-to-speech) via kenari. Returns raw audio bytes. */
export async function generateAudio(
  options: KenariAudioOptions,
): Promise<ArrayBuffer> {
  const apiKey = requireKey(options.apiKey, "audio generation");

  const body: Record<string, unknown> = {
    model: options.model,
    input: options.input,
  };
  if (options.voice !== undefined) body.voice = options.voice;
  if (options.response_format !== undefined)
    body.response_format = options.response_format;
  if (options.speed !== undefined) body.speed = options.speed;
  if (options.language !== undefined) body.language = options.language;

  const response = await postJson(
    `${BASE_URL_KENARI}/audio/speech`,
    apiKey,
    body,
    options.signal,
  );

  if (!response.ok) {
    throw new Error(
      `kenari audio generation failed (${response.status}): ${await response.text()}`,
    );
  }
  return await response.arrayBuffer();
}

/** Generate music via kenari. Returns the decoded mp3 bytes. */
export async function generateMusic(
  options: KenariMusicOptions,
): Promise<ArrayBuffer> {
  const apiKey = requireKey(options.apiKey, "music generation");
  if (options.instrumental !== true && !options.lyrics) {
    throw new Error(
      "kenari music generation requires lyrics (or instrumental: true with prompt)",
    );
  }
  if (options.instrumental === true && !options.prompt) {
    throw new Error("kenari instrumental music requires a prompt");
  }

  const body: Record<string, unknown> = { model: options.model };
  if (options.lyrics !== undefined) body.lyrics = options.lyrics;
  if (options.instrumental !== undefined)
    body.instrumental = options.instrumental;
  if (options.prompt !== undefined) body.prompt = options.prompt;

  // Music takes minutes; the gateway holds the connection open. Callers own
  // the timeout via options.signal — set it generously (>= 5 min).
  const response = await postJson(
    `${BASE_URL_KENARI}/music/generations`,
    apiKey,
    body,
    options.signal,
  );

  // Body may be prefixed with keepalive spaces; JSON.parse skips whitespace.
  const json = (await response.json()) as {
    data?: Array<{ b64_json?: string; format?: string }>;
    error?: { message?: string; code?: string };
  };
  if (json.error) {
    // Late failures come back as HTTP 200 with an error object.
    throw new Error(
      `kenari music generation failed: ${json.error.code ?? ""} ${json.error.message ?? ""}`.trim(),
    );
  }
  if (!response.ok) {
    throw new Error(
      `kenari music generation failed (${response.status}): ${JSON.stringify(json)}`,
    );
  }
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("kenari music generation returned no audio data");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Create a video job via POST /v1/videos/generations. */
export async function createVideoJob(
  options: KenariVideoOptions,
): Promise<KenariVideoJob> {
  const apiKey = requireKey(options.apiKey, "video generation");

  const body: Record<string, unknown> = {
    model: options.model,
    prompt: options.prompt,
  };
  if (options.duration !== undefined) body.duration = options.duration;
  if (options.resolution !== undefined) body.resolution = options.resolution;

  const response = await postJson(
    `${BASE_URL_KENARI}/videos/generations`,
    apiKey,
    body,
    options.signal,
  );
  if (!response.ok) {
    throw new Error(
      `kenari video creation failed (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as KenariVideoJob;
}

/** Poll a video job until it is done, failed, or expired. */
export async function pollVideoJob(
  jobId: string,
  options: KenariVideoOptions,
): Promise<KenariVideoJob> {
  const apiKey = requireKey(options.apiKey, "video generation");
  const intervalMs = options.pollIntervalMs ?? 5_000;
  const deadline = Date.now() + (options.timeoutMs ?? 15 * 60_000);

  for (;;) {
    options.signal?.throwIfAborted();
    const response = await fetch(`${BASE_URL_KENARI}/videos/${jobId}`, {
      headers: authHeaders(apiKey),
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(
        `kenari video poll failed (${response.status}): ${await response.text()}`,
      );
    }
    const job = (await response.json()) as KenariVideoJob;
    if (job.status !== "rendering") return job;
    if (Date.now() + intervalMs > deadline) {
      throw new Error(`kenari video job ${jobId} timed out after polling`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Generate video via kenari: create, poll, download. Returns the clip bytes. */
export async function generateVideo(
  options: KenariVideoOptions,
): Promise<ArrayBuffer> {
  const apiKey = requireKey(options.apiKey, "video generation");
  const job = await createVideoJob(options);
  const done = await pollVideoJob(job.id, options);
  if (done.status !== "done" || !done.url) {
    throw new Error(
      `kenari video job ${job.id} finished with status "${done.status}"`,
    );
  }
  const response = await fetch(done.url, {
    headers: authHeaders(apiKey),
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`kenari video download failed (${response.status})`);
  }
  return await response.arrayBuffer();
}
