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
import type { KenariAudioOptions, KenariMusicOptions, KenariVideoOptions } from "../types.js";
/** Generate audio (text-to-speech) via kenari. */
export declare function generateAudio(options: KenariAudioOptions): Promise<ArrayBuffer>;
/** Generate music via kenari. */
export declare function generateMusic(options: KenariMusicOptions): Promise<ArrayBuffer>;
/** Generate video via kenari. */
export declare function generateVideo(options: KenariVideoOptions): Promise<ArrayBuffer>;
//# sourceMappingURL=audio.d.ts.map