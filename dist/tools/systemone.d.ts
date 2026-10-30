import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";
import { Type } from "typebox";
import { type KenariSystemOneModelInfo } from "../systemone.js";
/**
 * Public tool parameters (the LLM-facing boundary schema).
 *
 * The LLM-facing tool contract is intentionally more permissive than the
 * System One domain model. The schema answers only "can I safely accept
 * and inspect this?" — every field is optional, extra keys are allowed,
 * and `questions` accepts any JSON so near-miss shapes (singular
 * `question`, arrays, unwrapped singles, alias spellings like `Choice`,
 * `rating`, or `Yes/No`) survive Pi's pre-execution validation on every
 * Pi version, including older ones without `prepareArguments`.
 * Normalization (`prepareSystemOneArgs`) repairs representation only;
 * semantic validation in `execute()` (via `assertAnswerableQuestions`)
 * establishes the canonical System One contract — `{type: "choice" |
 * "noul" | "score" | "box", instructions, criteria}` per question — and rejects
 * what cannot be repaired with an actionable error.
 */
export declare const systemOneParams: Type.TObject<{
    action: Type.TOptional<Type.TString>;
    state: Type.TOptional<Type.TAny>;
    context: Type.TOptional<Type.TAny>;
    evidence: Type.TOptional<Type.TAny>;
    questions: Type.TOptional<Type.TAny>;
    question: Type.TOptional<Type.TAny>;
    queries: Type.TOptional<Type.TAny>;
    model: Type.TOptional<Type.TString>;
    fields: Type.TOptional<Type.TAny>;
    assets: Type.TOptional<Type.TAny>;
    reference_date: Type.TOptional<Type.TString>;
}>;
export type SystemOneParams = Static<typeof systemOneParams>;
/**
 * Compatibility shim for sloppy tool arguments. Runs before schema
 * validation (wired as `prepareArguments`) and is idempotent, so `execute`
 * re-applies it defensively for direct calls that bypass validation.
 */
export declare function prepareSystemOneArgs(args: unknown): SystemOneParams;
/**
 * The same normalization, reporting any question-map entry it had to discard.
 * `prepareSystemOneArgs` stays pure because Pi calls it on every tool call and
 * the property harness relies on it being idempotent and reentrant; only the
 * tool's own execute() needs to know what was thrown away, so only it pays for
 * the second walk.
 */
export declare function collectDiscardedQuestions(args: unknown): string[];
export interface SystemOneDetails {
    /** Absent on `action: "models"`, which judges nothing. */
    answers?: Record<string, unknown>;
    /** The catalog an `action: "models"` call returned. */
    models?: KenariSystemOneModelInfo[];
    source?: string;
    /** The id that ran, and what the caller asked for when they differed. */
    model?: string;
    requestedModel?: string;
    action?: string;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
    requestId?: string;
    metadata: {
        provider: string;
        latencyMs?: number;
    };
}
/**
 * The `system_one` tool. It resolves kenari credentials from the model
 * registry, so it works wherever the kenari provider is logged in, and it never
 * holds a key of its own.
 */
export declare const systemOneTool: ToolDefinition<typeof systemOneParams, SystemOneDetails>;
//# sourceMappingURL=systemone.d.ts.map