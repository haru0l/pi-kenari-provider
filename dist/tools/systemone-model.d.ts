/**
 * Resolve the `model` argument of `system_one`.
 *
 * The tool takes a model id as a string, and the ids are not guessable:
 * `clef` and `clef:free` are different models at different prices, only one
 * model answers `fields`, and two of the strongest ones cannot read images.
 * A wrong pick is not a soft failure — kenari answers 400 — so this resolves
 * the id before the request leaves and explains every rejection in terms the
 * caller can act on.
 *
 * Resolution is offline: it reads the cached catalog and never fetches, so
 * choosing a model never costs a round trip. `action: "models"` is what
 * refreshes that cache.
 */
import { type KenariSystemOneModelInfo } from "../systemone.js";
/** What the request needs from the model that runs it. */
export interface SystemOneModelNeed {
    /** The request sends `fields` (Clairic) rather than `questions`. */
    fields: boolean;
    /** The request sends images, so the model has to accept image input. */
    images: boolean;
}
export interface ResolvedSystemOneModel {
    /** The catalog entry the request will run on. */
    info: KenariSystemOneModelInfo;
    /** The id to send to kenari. */
    id: string;
    /** What the caller asked for, when it was not already the catalog id. */
    requested?: string;
}
/** The catalog entry an id names, or undefined when nothing plausibly does. */
export declare function findSystemOneModelInfo(raw: string, catalog: readonly KenariSystemOneModelInfo[]): KenariSystemOneModelInfo | undefined;
/**
 * Ids close enough to what was asked for to be a typo of it. A version echo
 * (`jev-1.14.0`) is deliberately *not* resolved — kenari returns that form, and
 * silently mapping it onto a catalog id would hide a version mismatch — so it
 * comes back here as a suggestion instead.
 */
export declare function nearestSystemOneModelIds(raw: string, catalog: readonly KenariSystemOneModelInfo[], limit?: number): string[];
/** The model a request runs on when it names none. */
export declare function defaultSystemOneModel(need: SystemOneModelNeed, catalog?: readonly KenariSystemOneModelInfo[]): KenariSystemOneModelInfo;
/**
 * The model a request runs on: the id it named (normalized, alias-resolved and
 * checked against what the request needs), or the default for its shape.
 */
export declare function resolveSystemOneModel(requested: unknown, need: SystemOneModelNeed, catalog?: readonly KenariSystemOneModelInfo[]): ResolvedSystemOneModel;
//# sourceMappingURL=systemone-model.d.ts.map