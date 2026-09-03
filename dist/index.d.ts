/**
 * pi-kenari-provider
 *
 * A pi extension that registers kenari as a native AI provider. kenari
 * (https://kenari.id/v1) is an LLM gateway that speaks both the OpenAI
 * Chat Completions API and the Anthropic Messages API, routes to many
 * upstream providers, and bills in Indonesian Rupiah.
 *
 * Features:
 *  - Dynamic model discovery from GET /v1/models (public, no key needed)
 *  - OpenAI-completions wire format (kenari is an OpenAI drop-in)
 *  - :free model variants (no balance deducted)
 *  - Image generation, embeddings, rerank, moderations
 *  - Audio, music, and video generation
 *  - API key auth via KENARI_API_KEY env var or /login kenari
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function (pi: ExtensionAPI): void;
export { createVideoJob, generateAudio, generateMusic, generateVideo, pollVideoJob, } from "./api/audio.js";
export { createEmbeddings } from "./api/embeddings.js";
export { generateImages } from "./api/images.js";
export { moderateContent } from "./api/moderations.js";
export { rerankDocuments } from "./api/rerank.js";
export { fetchKenariModels, fetchKenariModelsByModality, refreshKenariModels, toKenariModels, } from "./models.js";
export type { KenariAnthropicModel, KenariModel, KenariOpenAIModel, } from "./types.js";
//# sourceMappingURL=index.d.ts.map