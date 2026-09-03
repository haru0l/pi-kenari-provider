/**
 * Rerank API for kenari (Cohere-style, no OpenAI standard).
 * POST /v1/rerank
 */
import type { KenariRerankOptions, KenariRerankResponse } from "../types.js";
export declare function rerankDocuments(options: KenariRerankOptions): Promise<KenariRerankResponse>;
//# sourceMappingURL=rerank.d.ts.map