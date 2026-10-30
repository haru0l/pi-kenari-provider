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
 *  - Image generation, embeddings, rerank, moderations, system one
 *  - Web and X search (POST /v1/web/search, /v1/web/fetch, /v1/x/search)
 *  - API key auth via KENARI_API_KEY env var or /login kenari
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function (pi: ExtensionAPI): void;
export { createEmbeddings } from "./api/embeddings.js";
export { decodeImage, generateImageBytes, generateImages, } from "./api/images.js";
export { moderateContent } from "./api/moderations.js";
export { rerankDocuments } from "./api/rerank.js";
export { runSystemOne } from "./api/systemone.js";
export { webFetch, webSearch, xSearch } from "./api/web.js";
export { fetchKenariModels, fetchKenariModelsByModality, refreshKenariModels, toKenariModels, } from "./models.js";
export { generateImageTool } from "./tools/image.js";
export type { KenariAnthropicModel, KenariImageData, KenariImageGenerateOptions, KenariImageResponse, KenariImageResult, KenariModality, KenariModel, KenariOpenAIModel, KenariPricingLine, KenariSystemOneAnswer, KenariSystemOneBoxAnswer, KenariSystemOneChoiceAnswer, KenariSystemOneField, KenariSystemOneFieldAnswer, KenariSystemOneFieldType, KenariSystemOneImageAsset, KenariSystemOneMedia, KenariSystemOneNoulAnswer, KenariSystemOneOptions, KenariSystemOneQuestion, KenariSystemOneQuestionType, KenariSystemOneResponse, KenariSystemOneScoreAnswer, KenariWebFetchOptions, KenariWebFetchResponse, KenariWebMeta, KenariWebSearchOptions, KenariWebSearchResponse, KenariWebSearchResult, KenariXSearchFilter, KenariXSearchOptions, KenariXSearchResponse, } from "./types.js";
export { KENARI_MODALITIES } from "./types.js";
//# sourceMappingURL=index.d.ts.map