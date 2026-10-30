/**
 * System One API for kenari.
 * POST /v1/systemone
 *
 * kenari's own decision and extraction contract: `questions` runs noul, choice,
 * score, and box questions; `fields` runs Clairic extraction. No OpenAI or
 * Anthropic SDK method maps to either.
 */
import type { KenariSystemOneOptions, KenariSystemOneResponse } from "../types.js";
export declare function runSystemOne(options: KenariSystemOneOptions): Promise<KenariSystemOneResponse>;
//# sourceMappingURL=systemone.d.ts.map