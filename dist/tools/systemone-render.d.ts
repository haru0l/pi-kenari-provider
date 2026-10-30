/**
 * Render a kenari System One response as the text the agent reads at call time.
 *
 * Adapted from pi-system-one's renderer (MIT). The score answer is why the
 * wording matters: the contract lets a score distribute over either index slots
 * ("0".."n-1") or the level values themselves, and requires a legend labelling
 * exactly the distributed keys. On the index-slot convention a bare
 * `probabilities: 0: 0.57` names no level at all, so the legend is rendered
 * inline next to its key rather than dropped.
 *
 * kenari answers more than the reference renderer covered — `box` regions and
 * Clairic `fields` extraction — so those get their own branches, with a compact
 * JSON fallback for any answer shape this build does not know yet.
 */
import type { KenariSystemOneModelInfo } from "../systemone.js";
export declare function renderSystemOneResult(response: {
    answers: Record<string, any>;
}, discarded?: string[]): string;
/**
 * Render the model catalog for `action: "models"`.
 *
 * The point of this output is the *decision*, not the inventory: which id to
 * send, and what it will cost. So the capabilities and the caveats that make a
 * wrong pick fail (fields needs Clairic; two strong models cannot read images)
 * are spelled out rather than left to be inferred from columns, and the two
 * defaults are named at the bottom where the reader lands last.
 */
export declare function renderSystemOneModelCatalog(models: KenariSystemOneModelInfo[], defaults: {
    questions: string;
    fields: string;
}, source: "live" | "baseline"): string;
//# sourceMappingURL=systemone-render.d.ts.map