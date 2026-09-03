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
import type { KenariAudioOptions, KenariMusicOptions, KenariVideoJob, KenariVideoOptions } from "../types.js";
/** Generate audio (text-to-speech) via kenari. Returns raw audio bytes. */
export declare function generateAudio(options: KenariAudioOptions): Promise<ArrayBuffer>;
/** Generate music via kenari. Returns the decoded mp3 bytes. */
export declare function generateMusic(options: KenariMusicOptions): Promise<ArrayBuffer>;
/** Create a video job via POST /v1/videos/generations. */
export declare function createVideoJob(options: KenariVideoOptions): Promise<KenariVideoJob>;
/** Poll a video job until it is done, failed, or expired. */
export declare function pollVideoJob(jobId: string, options: KenariVideoOptions): Promise<KenariVideoJob>;
/** Generate video via kenari: create, poll, download. Returns the clip bytes. */
export declare function generateVideo(options: KenariVideoOptions): Promise<ArrayBuffer>;
//# sourceMappingURL=audio.d.ts.map