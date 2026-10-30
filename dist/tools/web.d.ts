/**
 * `kenari_web_search` tool: ranked web results from kenari's own
 * `POST /v1/web/search`.
 *
 * Named `kenari_web_search` rather than `web_search` on purpose — pi ships a
 * built-in `web_search`, and registering a second tool under that name either
 * collides at load or shadows the built-in one. The prefix also makes it
 * obvious in a transcript which search backend produced the result.
 *
 * Credentials come from the model registry, exactly like `system_one` and
 * `generate_image`: the key stored by `/login kenari` is the same one the chat
 * models use, so there is no separate secret to configure.
 */
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { KenariWebSearchResult } from "../types.js";
declare const kenariWebSearchParams: Type.TObject<{
    query: Type.TString;
    max_results: Type.TOptional<Type.TInteger>;
}>;
export interface KenariWebSearchDetails {
    query: string;
    results: KenariWebSearchResult[];
    /** What kenari billed for the search, when it reports it. */
    costMicroIdr?: number;
    requestId?: string;
}
export declare const kenariWebSearchTool: ToolDefinition<typeof kenariWebSearchParams, KenariWebSearchDetails>;
export {};
//# sourceMappingURL=web.d.ts.map