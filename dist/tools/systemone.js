/**
 * `system_one` tool: judge bounded decisions with a kenari System One model.
 *
 * Adapted from pi-system-one v1.3.4 (MIT, https://github.com/iamaamir/system-one),
 * retargeted at kenari's POST /v1/systemone: models come from
 * `?modality=systemone`, questions may be noul / choice / score / box, Clairic
 * `fields` extraction is available, and images travel as named `assets`.
 */
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { Type } from "typebox";
import { runSystemOne } from "../api/systemone.js";
import { PROVIDER_KENARI } from "../constants.js";
import { fetchKenariSystemOneModelCatalog, getKenariSystemOneInputRate, } from "../systemone.js";
import { defaultSystemOneModel, resolveSystemOneModel, } from "./systemone-model.js";
import { renderSystemOneModelCatalog, renderSystemOneResult, } from "./systemone-render.js";
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
export const systemOneParams = Type.Object({
    action: Type.Optional(Type.String({
        description: 'What to do: "models" lists the System One models (id, free/paid, text vs image input, questions vs fields, input price) and judges nothing. Omit it to judge.',
    })),
    state: Type.Optional(Type.Any({
        description: "Shared state or evidence that all questions should be evaluated against. Usually a string or object. Aliases: context, evidence.",
    })),
    context: Type.Optional(Type.Any()),
    evidence: Type.Optional(Type.Any()),
    questions: Type.Optional(Type.Any({
        description: 'One or more named decision questions. "choice" selects one outcome from a bounded set (criteria is an object keyed by label); "noul" estimates a yes/no likelihood (criteria usually omitted); "score" scores against an ordered rubric (criteria is an array of at least two levels). Accepts a name-keyed object, an array of questions, or a single unwrapped question. Aliases: question, queries; near-miss type spellings are normalized.',
    })),
    question: Type.Optional(Type.Any()),
    queries: Type.Optional(Type.Any()),
    model: Type.Optional(Type.String({
        description: 'Which System One model judges the request. Omit it and the tool picks by request shape: clef:free for questions, clairic:free for fields, an image-capable model when assets are sent. Call action: "models" for the current list, prices and capabilities; an unknown or unsuitable id is rejected with what fits.',
    })),
    fields: Type.Optional(Type.Any({
        description: 'Clairic extraction: a name-keyed map of fields to read out of the state, e.g. {"total": {"type": "number", "unit": "IDR"}}. Send this or questions, not both. Field types: text, number, date, time, datetime, duration, list, estimate, forecast.',
    })),
    assets: Type.Optional(Type.Any({
        description: 'Images under reference names you can cite in instructions, e.g. {"receipt": {"path": "./receipt.png"}} or {"receipt": {"data_base64": "iVBORw0...", "format": "png"}}. A relative path resolves against the working directory. Up to 16.',
    })),
    reference_date: Type.Optional(Type.String({
        description: "Clairic only: ISO date that anchors dates written without a year.",
    })),
}, {
    additionalProperties: true,
    description: 'Evaluate bounded decision questions against shared state. Example: {"state": "...", "questions": {"q1": {"type": "choice", "instructions": "...", "criteria": {"a": null, "b": null}}}}.',
});
/**
 * Request keys that travel beside `state` and `questions` untouched. They are
 * not part of the question contract, but dropping them would silently change
 * the request, so normalization carries them through verbatim.
 */
const PASSTHROUGH_KEYS = [
    "state",
    "action",
    "questions",
    "model",
    "fields",
    "reference_date",
    "assets",
];
/**
 * Near-miss spellings low-quality models emit for the `type` discriminator.
 * Lookup is case-insensitive; unlisted values pass through untouched so
 * validation still reports a clear error for genuinely unknown kinds.
 *
 * Every entry here must be SAFE: a representation-only difference whose
 * meaning is unambiguous. Deliberately NOT aliased (rejected instead):
 * - "probability" / "likelihood": describe an output statistic, not a task.
 *   They could mean a noul question, a choice with probabilities, or a
 *   free-floating number. Guessing noul would silently convert the wrong
 *   task into a valid but semantically incorrect request — a believable
 *   wrong answer is worse than a validation error the model can retry.
 * - "ranking": ordering items relative to each other is not scoring each
 *   against a rubric. Mapping it to score would corrupt the task.
 */
const QUESTION_TYPE_ALIASES = new Map([
    ["choice", "choice"],
    ["choose", "choice"],
    ["multiple_choice", "choice"],
    ["categorical", "choice"],
    ["select", "choice"],
    ["classify", "choice"],
    ["classification", "choice"],
    ["noul", "noul"],
    ["boolean", "noul"],
    ["bool", "noul"],
    ["yes_no", "noul"],
    ["yesno", "noul"],
    ["score", "score"],
    ["rating", "score"],
    ["rate", "score"],
    ["scale", "score"],
    ["rubric", "score"],
    ["grade", "score"],
    // Bounding box: "bbox" and "bounding_box" name the same rectangle.
    ["box", "box"],
    ["bbox", "box"],
    ["bounding_box", "box"],
    ["boundingbox", "box"],
]);
/** Field aliases models use instead of `criteria`. First hit wins. */
const CRITERIA_ALIASES = [
    "criteria",
    "options",
    "choices",
    "levels",
    "rubric",
    "labels",
    "candidates",
    "outcomes",
];
/** Field aliases models use instead of `instructions`. First hit wins. */
const INSTRUCTIONS_ALIASES = [
    "instructions",
    "instruction",
    "prompt",
    "question",
    "text",
    "query",
    "task",
];
/**
 * Names that can hold the question map. Inside a question map one of these
 * is a leftover echo of the argument wrapper, never a question in its own
 * right — the value is what matters.
 */
const QUESTION_NAME_ALIASES = new Set(["questions", "question", "queries"]);
/**
 * Question-level keys that are never part of the schema (naming metadata
 * from array-form questions, or hallucinated documentation fields).
 * Dropped so they don't trip `additionalProperties: false`.
 */
const QUESTION_JUNK_KEYS = new Set([
    "description",
    "title",
    "detail",
    "details",
    "example",
    "examples",
    "id",
    "key",
    "name",
    "label",
]);
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
 * Assign an externally controlled key. Plain `obj[key] = value` with
 * `key === "__proto__"` would reparent the object instead of storing an
 * entry; defineProperty always creates an ordinary own data property.
 */
function setOwn(obj, key, value) {
    Object.defineProperty(obj, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
    });
}
function normalizeQuestionType(raw) {
    if (typeof raw !== "string")
        return raw;
    const key = raw
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toLowerCase()
        .replace(/[-\s/.]+/g, "_");
    // Map lookup (not a plain object) so inherited names like "__proto__"
    // or "constructor" can never accidentally resolve to an alias.
    return QUESTION_TYPE_ALIASES.get(key) ?? raw;
}
function pickAlias(input, aliases) {
    for (const alias of aliases) {
        if (input[alias] !== undefined)
            return input[alias];
    }
    return undefined;
}
/**
 * An ordered rubric is an ARRAY. Models overwhelmingly hand it over as an
 * object instead, in one of two shapes:
 *
 *   {"item": ["low", "high"]}          a single wrapper key around the levels
 *   {"low": "desc", "high": "desc"}     the levels as keys of a map
 *
 * Both are representation-only differences: a rubric's meaning is its ordered
 * levels, and JS object key order is insertion order for string keys, so
 * folding recovers exactly that order. The single-key wrapper case is only
 * unwrapped when its value really is an array — a one-level rubric
 * (`{"low": "..."}`) keeps its level instead of being unwrapped to a string.
 *
 * Level labels survive as far as the shape allows: a described level keeps its
 * description, and a bare level (`{"low": null}`) falls back to its key.
 */
function foldScoreCriteria(criteria) {
    if (Array.isArray(criteria) || !isRecord(criteria))
        return criteria;
    const keys = Object.keys(criteria);
    if (keys.length === 0)
        return criteria;
    if (keys.length === 1) {
        const [only] = keys;
        if (only === undefined)
            return criteria;
        const wrapped = criteria[only];
        if (Array.isArray(wrapped) && wrapped.length >= 2)
            return wrapped;
        // The same wrapper, one level deeper: `{"item": {"item": [...]}}`. A key
        // that holds a single nested object names a container, not a level, so
        // keep peeling until an array or a real multi-level map is reached. Only
        // records are peeled, so a one-level rubric (`{"low": "bad"}`) is left
        // alone and still reports the one-level error rather than being unwrapped
        // into a bare string.
        if (isRecord(wrapped)) {
            const peeled = foldScoreCriteria(wrapped);
            if (Array.isArray(peeled) && peeled.length >= 2)
                return peeled;
        }
    }
    // TypeSafe's own levels stand on their own: the cookbook writes them as
    // "Moderate: access and correction rights, but limited means to act", not
    // as a bare "moderate". So when a model gives both a label and a
    // description, keep both — dropping the label for the description alone
    // loses which level the judge picked.
    const levels = [];
    for (const key of keys) {
        const value = criteria[key];
        if (value === null || value === undefined) {
            levels.push(key);
            continue;
        }
        if (typeof value === "string") {
            const text = value.trim();
            // An empty or absent description means the key IS the level; a
            // description that already names its level is left alone rather than
            // prefixed twice.
            if (text === "" || key === text || text.includes(key)) {
                levels.push(text === "" ? key : text);
            }
            else {
                levels.push(`${key}: ${text}`);
            }
            continue;
        }
        levels.push(value);
    }
    return levels;
}
/**
 * Copy-on-write canonicality check for one question. Returns true when
 * running the builder below would produce a key-for-key, value-for-value
 * identical record — in which case the caller reuses the input by
 * reference instead of allocating a copy. Any doubt returns false (the
 * builder then produces the correct output); false negatives only cost an
 * allocation, never correctness.
 *
 * Deliberately allocation-free itself (own-key probes, no entries/keys
 * arrays) so the defensive second normalization in execute() stays cheap.
 */
function isCanonicalQuestion(input) {
    const hasType = Object.hasOwn(input, "type");
    // Probe only: an exact canonical spelling (alias-map value identical to
    // the key) needs no work. Near-miss spellings report non-canonical
    // WITHOUT running full normalization here — the builder below runs it
    // exactly once. Non-string types pass (the builder copies them verbatim),
    // so doubt always errs toward a wasted rebuild, never a wrong share.
    if (hasType &&
        typeof input.type === "string" &&
        QUESTION_TYPE_ALIASES.get(input.type) !== input.type) {
        return false;
    }
    // Strings reaching here are already canonical, so the raw type doubles
    // as the normalized one for the criteria decisions below.
    const normalizedType = hasType ? input.type : undefined;
    const instructions = pickAlias(input, INSTRUCTIONS_ALIASES);
    // NOTE: no `else` for an own defined "instructions" slot — "instructions"
    // is the first alias, so pickAlias would have returned it above; reaching
    // here with one means it is undefined and the builder omits it too.
    if (instructions !== undefined) {
        // The builder emits own "instructions" with this value; canonical only
        // if it already sits there and no sibling alias key lingers (dropped).
        if (!Object.hasOwn(input, "instructions") ||
            input.instructions !== instructions) {
            return false;
        }
    }
    for (const alias of INSTRUCTIONS_ALIASES) {
        if (alias !== "instructions" && Object.hasOwn(input, alias))
            return false;
    }
    let criteria = pickAlias(input, CRITERIA_ALIASES);
    if (normalizedType === "noul" && criteria === null) {
        // The builder drops it; canonical only if no own alias key is dropped.
        for (const alias of CRITERIA_ALIASES) {
            if (Object.hasOwn(input, alias))
                return false;
        }
        criteria = undefined;
    }
    if (normalizedType === "choice" &&
        Array.isArray(criteria) &&
        criteria.every((item) => typeof item === "string")) {
        return false; // The builder folds string arrays to an object.
    }
    if (normalizedType === "score" && isRecord(criteria)) {
        return false; // The builder folds an object rubric to an ordered array.
    }
    if (normalizedType === "noul" &&
        (Object.hasOwn(input, "true") || Object.hasOwn(input, "false"))) {
        return false; // The builder lifts bare true/false keys into criteria.
    }
    if (criteria !== undefined) {
        if (!Object.hasOwn(input, "criteria") || input.criteria !== criteria) {
            return false;
        }
    }
    else if (Object.hasOwn(input, "criteria")) {
        return false; // Own undefined criteria is dropped by the builder.
    }
    for (const alias of CRITERIA_ALIASES) {
        if (alias !== "criteria" && Object.hasOwn(input, alias))
            return false;
    }
    for (const key of QUESTION_JUNK_KEYS) {
        if (Object.hasOwn(input, key))
            return false;
    }
    for (const key of Object.keys(input)) {
        // Any extra is merged (choice labels) or dropped, and a missing `type`
        // may be salvaged from one.
        if (isQuestionExtra(key))
            return false;
    }
    // `true`/`false` are lifted into `criteria` on a noul question and mean
    // nothing anywhere else. On any other type the builder drops them, so a
    // question carrying them is not already canonical and must be rebuilt -
    // otherwise the copy-on-write fast path would ship them to the provider.
    if (normalizedType !== "noul" &&
        (Object.hasOwn(input, "true") || Object.hasOwn(input, "false"))) {
        return false;
    }
    // Any other own key is preserved by reference, so it cannot differ.
    return true;
}
/**
 * A sibling key carrying no value. Models leave these beside a question for
 * two different reasons, and which reason applies is decided by the type.
 */
function isEmptyValue(value) {
    return value === "" || value === null || value === undefined;
}
/**
 * A question object holds exactly `type`, `instructions` and `criteria`.
 * Anything else is an extra: the model's own name for the question, a
 * prediction, or metadata it invented. The provider can never interpret one,
 * so extras are dropped rather than rejected — a rejected extra teaches the
 * model nothing it did not already know and costs a retry.
 */
/**
 * The names `state` can travel under at the top level of a request. A model
 * that puts one of them INSIDE a question meant it as the request state, not
 * as part of the question: a question is judged, it never carries what it is
 * judged against. Kept through normalization so the value survives long enough
 * to be lifted back out.
 */
const STATE_KEYS = ["state", "context", "evidence"];
/**
 * A question object holds exactly `type`, `instructions` and `criteria`.
 * Anything else is an extra: the model's own name for the question, a
 * prediction, or metadata it invented. The provider can never interpret one,
 * so extras are dropped rather than rejected — a rejected extra teaches the
 * model nothing it did not already know and costs a retry.
 */
function isQuestionExtra(key) {
    return (key !== "type" &&
        !INSTRUCTIONS_ALIASES.includes(key) &&
        !CRITERIA_ALIASES.includes(key) &&
        !QUESTION_JUNK_KEYS.has(key) &&
        !STATE_KEYS.includes(key) &&
        key !== "true" &&
        key !== "false");
}
/**
 * Repair option labels the model spilled out of `criteria`.
 *
 * A choice question that ends up with empty-valued siblings is the model
 * listing its options one level too high: `criteria: {"sre_oncall": ""}` with
 * `account_team: ""` and `ingest_service_owner: ""` beside it. Those siblings
 * are options, not metadata, so they go back where the contract says options
 * live. A label already present in `criteria` keeps its existing value.
 */
function mergeSpilledChoiceLabels(siblings, criteria) {
    const base = isRecord(criteria) ? criteria : {};
    let changed = !isRecord(criteria);
    for (const [label, value] of siblings) {
        if (Object.hasOwn(base, label))
            continue;
        setOwn(base, label, value);
        changed = true;
    }
    return changed ? base : criteria;
}
/**
 * Some model providers serialize nested tool arguments as JSON-encoded
 * strings (e.g. `questions: "{\"q1\": {...}}"`). If the string looks like
 * a JSON object or array, decode it so it can be normalized; anything else
 * passes through untouched and still reports a clear validation error.
 */
function tryParseJson(input) {
    try {
        return JSON.parse(input);
    }
    catch {
        return input;
    }
}
/** Decode a JSON-encoded question value; any non-string passes through. */
function decodeJsonInput(value) {
    return typeof value === "string" ? tryParseJson(value) : value;
}
/**
 * Coerce one question into the flat schema shape: canonical `type`,
 * `instructions` / `criteria` resolved through aliases, array-form choice
 * criteria (`["a", "b"]`) folded to `{"a": null, "b": null}`, and
 * naming/junk keys stripped.
 *
 * Pure, idempotent, non-mutating, with structural sharing: canonical input
 * is returned by reference; only repaired questions allocate.
 */
function normalizeQuestion(input) {
    if (!isRecord(input))
        return input;
    if (isCanonicalQuestion(input))
        return input;
    const out = {};
    // A question object holds exactly three keys, so its `type` is whatever an
    // EXTRA key holding a known kind is worth: `{"approach": "yes_no", ...}`
    // states the kind under a different name. Adopt it, then drop the key.
    let rawType = input.type;
    if (rawType === undefined) {
        for (const [key, value] of Object.entries(input)) {
            if (!isQuestionExtra(key) || typeof value !== "string")
                continue;
            const kind = normalizeQuestionType(value);
            if (kind === "choice" ||
                kind === "noul" ||
                kind === "score" ||
                kind === "box") {
                rawType = value;
                break;
            }
        }
    }
    if (rawType !== undefined)
        out.type = normalizeQuestionType(rawType);
    let instructions = pickAlias(input, INSTRUCTIONS_ALIASES);
    // `description` is naming metadata, so it is normally dropped. But a model
    // that writes its question text under `description` and nowhere else HAS
    // supplied instructions — and dropping it produces the actively misleading
    // error "needs instructions" for a question that carries one. Only taken as
    // a fallback, so a real `instructions` always wins.
    if (instructions === undefined && input.description !== undefined) {
        instructions = input.description;
    }
    if (instructions !== undefined)
        out.instructions = instructions;
    else if (Object.hasOwn(input, "instructions"))
        out.instructions = input.instructions;
    let criteria = pickAlias(input, CRITERIA_ALIASES);
    // `null` is this schema's idiom for "no content"; on noul it reads as
    // "omitted" rather than a degenerate value worth a backend round trip.
    if (out.type === "noul" && criteria === null)
        criteria = undefined;
    // A noul question that spells its outcomes as bare `true`/`false` keys
    // beside `instructions` means exactly the documented `criteria: {true,
    // false}` — the same two keys, one level up. Lift them back down so the
    // question object keeps its three-key shape.
    if (out.type === "noul" &&
        criteria === undefined &&
        (Object.hasOwn(input, "true") || Object.hasOwn(input, "false"))) {
        const outcomes = {};
        if (Object.hasOwn(input, "true"))
            setOwn(outcomes, "true", input.true);
        if (Object.hasOwn(input, "false"))
            setOwn(outcomes, "false", input.false);
        criteria = outcomes;
    }
    if (out.type === "choice" &&
        Array.isArray(criteria) &&
        criteria.every((item) => typeof item === "string")) {
        const folded = {};
        for (const item of criteria)
            setOwn(folded, item, null);
        criteria = folded;
    }
    if (out.type === "score")
        criteria = foldScoreCriteria(criteria);
    // Siblings that carry no value: option labels for a choice, the question's
    // own name or a prediction for noul/score. Only the first kind is data.
    const emptySiblings = [];
    for (const [key, value] of Object.entries(input)) {
        if (!isQuestionExtra(key) || !isEmptyValue(value))
            continue;
        emptySiblings.push([key, value]);
    }
    if (emptySiblings.length > 0 && out.type === "choice") {
        criteria = mergeSpilledChoiceLabels(emptySiblings, criteria);
    }
    if (criteria !== undefined)
        out.criteria = criteria;
    // Everything not part of the three-key contract is dropped on purpose — with
    // one exception: a `state` the model nested here is request state, and
    // prepareSystemOneArgs lifts it back to the top level.
    for (const key of STATE_KEYS) {
        if (Object.hasOwn(input, key))
            setOwn(out, key, input[key]);
    }
    return out;
}
/**
 * Move a `state` the model nested inside a question up to the top level of the
 * request, and remove it from the question it was found in.
 *
 * Only the question's own keys are examined. A `state` key nested inside
 * `criteria` is user data — an option literally labelled "state" — and is left
 * exactly where it is.
 */
function liftNestedState(questions, fallback) {
    if (!isRecord(questions))
        return { questions, state: fallback };
    // Every state key is stripped from every question in one pass, and the first
    // one found (by question order, then by STATE_KEYS priority) becomes the
    // request state. Stripping only the match would take two passes for a
    // question carrying two of them, which is not idempotent — and idempotence
    // is what lets execute() re-normalize defensively for free.
    let found;
    const rebuilt = {};
    let changed = false;
    for (const [name, question] of Object.entries(questions)) {
        if (!isRecord(question)) {
            setOwn(rebuilt, name, question);
            continue;
        }
        const kept = {};
        for (const own of Object.keys(question)) {
            if (STATE_KEYS.includes(own)) {
                if (found === undefined)
                    found = question[own];
                changed = true;
                continue;
            }
            setOwn(kept, own, question[own]);
        }
        setOwn(rebuilt, name, changed ? kept : question);
    }
    if (!changed)
        return { questions, state: fallback };
    return {
        questions: rebuilt,
        state: fallback !== undefined ? fallback : found,
    };
}
/**
 * A record-valued question-map entry is only a question if it looks like one.
 * A record holding none of the contract keys is a question FIELD that landed
 * in the name slot (`{"choice_under_test": "...", "criteria": {...}}`), not a
 * question.
 */
function looksLikeQuestion(value) {
    if (!isRecord(value))
        return false;
    if (typeof value.type === "string")
        return true;
    for (const alias of INSTRUCTIONS_ALIASES) {
        if (Object.hasOwn(value, alias))
            return true;
    }
    for (const alias of CRITERIA_ALIASES) {
        if (Object.hasOwn(value, alias))
            return true;
    }
    return false;
}
/**
 * Record a question-map entry that had to be discarded, so the caller can be
 * told rather than silently handed an answer to a smaller question set.
 *
 * The contract is one-directional: a choice cannot pick an option omitted
 * from its criteria, and a batch cannot report on a question that was never
 * sent. Every repair here is allowed to reshape or drop a malformed entry,
 * but none of them may do it invisibly — a dropped entry means the model asked
 * something that was quietly not judged, which is exactly the kind of mistake
 * a typed output cannot surface.
 */
function noteDrop(drops, name, value) {
    if (!drops)
        return;
    const shown = typeof value === "string" ? value : value === null ? "null" : "";
    drops.push(shown === "" ? name : `${name} (${truncateForNote(shown)})`);
}
function truncateForNote(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length <= 60 ? clean : `${clean.slice(0, 57)}...`;
}
/**
 * Some models write a batch of questions as parallel arrays — one entry per
 * field, aligned by position:
 *
 *   {"item": ["a", "b"], "type": ["choice", "noul"],
 *    "instructions": ["...", "..."], "criteria": [{...}, null]}
 *
 * That is a question list with the nesting flattened one level. Transposing it
 * loses nothing: position is the only thing tying the arrays together, and the
 * model clearly meant `a` to be the first question. Only fires when every own
 * value is an array of the same non-zero length AND at least one key is a
 * contract key, so a name-to-array map (`{"fixes": [...], "risks": [...]}`)
 * and a single wrapped array are both left to their own rules.
 */
function transposeParallelQuestions(input) {
    const keys = Object.keys(input);
    if (keys.length < 2)
        return undefined;
    const hasContractKey = keys.some((key) => key === "type" ||
        INSTRUCTIONS_ALIASES.includes(key) ||
        CRITERIA_ALIASES.includes(key));
    if (!hasContractKey)
        return undefined;
    const columns = keys.map((key) => input[key]);
    if (!columns.every(Array.isArray))
        return undefined;
    const width = columns[0].length;
    if (width < 1)
        return undefined;
    if (!columns.every((column) => column.length === width)) {
        return undefined;
    }
    const questions = {};
    const used = new Set();
    for (let i = 0; i < width; i += 1) {
        const parts = {};
        for (const key of keys) {
            if (key === "item" || key === "name" || key === "id" || key === "key") {
                continue;
            }
            setOwn(parts, key, input[key][i]);
        }
        const nameKey = ["item", "name", "id", "key"].find((key) => Array.isArray(input[key]));
        const raw = nameKey ? input[nameKey][i] : undefined;
        let name = typeof raw === "string" && raw.trim() !== "" ? raw : `q${i + 1}`;
        for (let n = 2; used.has(name); n += 1)
            name = `${raw ?? `q${i + 1}`}_${n}`;
        used.add(name);
        setOwn(questions, name, normalizeQuestion(parts));
    }
    return questions;
}
/**
 * A record holding only questions, i.e. a question map that landed in a name
 * slot, possibly more than one level deep. A question never holds a question,
 * so this reading is unambiguous. Bounded so a pathological object graph
 * cannot spin.
 */
const MAX_NESTED_MAP_DEPTH = 4;
/** A question, or a (possibly nested) map whose every leaf is a question. */
function isQuestionTree(value, depth = 0) {
    if (looksLikeQuestion(value))
        return true;
    if (!isRecord(value) || depth >= MAX_NESTED_MAP_DEPTH)
        return false;
    const keys = Object.keys(value);
    return (keys.length > 0 &&
        keys.every((key) => isQuestionTree(value[key], depth + 1)));
}
function isNestedQuestionMap(value) {
    return isRecord(value) && !looksLikeQuestion(value) && isQuestionTree(value);
}
/** Every leaf question in a (possibly nested) question map, with its name. */
function flattenQuestionMap(value, depth = 0) {
    const out = [];
    for (const name of Object.keys(value)) {
        const child = value[name];
        if (isRecord(child) &&
            !looksLikeQuestion(child) &&
            depth < MAX_NESTED_MAP_DEPTH) {
            out.push(...flattenQuestionMap(child, depth + 1));
        }
        else {
            out.push([name, child]);
        }
    }
    return out;
}
function normalizeQuestions(input, drops) {
    if (typeof input === "string")
        input = tryParseJson(input);
    if (isRecord(input)) {
        // An array of questions wrapped in one key (`{"item": [...]}`) is the
        // list the contract already accepts, one level too deep. Unwrap it and
        // let the array path below name each entry the same way. Only when the
        // wrapped array actually holds records: `{"q1": ["junk", "junk"]}` is a
        // question map whose one entry is not a question, and unwrapping it
        // renamed the junk on every pass.
        const keys = Object.keys(input);
        const [onlyKey] = keys;
        if (onlyKey !== undefined &&
            keys.length === 1 &&
            Array.isArray(input[onlyKey]) &&
            input[onlyKey].some((entry) => isRecord(entry))) {
            return normalizeQuestions(input[onlyKey], drops);
        }
        // One unwrapped question filed under the wrapper's own name, e.g.
        // `{"questions": {"type": ..., "instructions": ...}}` — possibly beside
        // other junk keys, as the model leaves them. The value is the question.
        for (const key of keys) {
            if (!QUESTION_NAME_ALIASES.has(key.toLowerCase()))
                continue;
            const value = input[key];
            if (isRecord(value) && typeof value.type === "string") {
                // Every sibling is abandoned by this unwrap, and a sibling is often a
                // real question: `{"questions": {"questions": {choice}, "risk":
                // {noul}}}` is a two-question batch. Returning the aliased question
                // alone answered half the batch and said nothing, so name what was
                // left behind rather than letting the model believe it was answered.
                for (const other of keys) {
                    if (other !== key)
                        noteDrop(drops, other, input[other]);
                }
                return normalizeQuestions(value, drops);
            }
        }
        // Parallel arrays standing in for a batch of questions.
        const transposed = transposeParallelQuestions(input);
        if (transposed !== undefined)
            return transposed;
        // An array of questions the model sent as a name-to-array map. Naming is
        // metadata, so take every question rather than stopping at the first:
        // `{"fixes": [...], "risks": [...]}` is two questions, not one.
        if (keys.length > 0 && keys.every((key) => Array.isArray(input[key]))) {
            const entries = keys.flatMap((key) => input[key]);
            // Only a map of question lists: `{q1: ["junk"]}` is a question map whose
            // single entry is not a question, and flattening it renamed the junk.
            if (!entries.some((entry) => isRecord(entry))) {
                // fall through to the ordinary record handling
            }
            else {
                const merged = [];
                for (const key of keys) {
                    for (const entry of input[key]) {
                        merged.push(isRecord(entry) && entry.name === undefined
                            ? { name: key, ...entry }
                            : entry);
                    }
                }
                return normalizeQuestions(merged, drops);
            }
        }
    }
    if (Array.isArray(input)) {
        const record = {};
        const used = new Set();
        // Duplicate names would silently overwrite; suffix instead so every
        // requested question reaches the backend.
        const claimName = (base) => {
            let candidate = base;
            for (let n = 2; used.has(candidate); n += 1)
                candidate = `${base}_${n}`;
            used.add(candidate);
            return candidate;
        };
        // Same rule as the record branch below: a non-question entry is kept only
        // while no real question exists. Applying it in one branch but not the
        // other made normalization non-idempotent — `["junk", {a question}]`
        // produced different maps on the first and second pass, and the second
        // pass is the one execute() validates and sends.
        //
        // Question-ness is judged on the NORMALIZED entry, not the raw one: an
        // entry like `{"description": "..."}` becomes a question only after
        // normalization, so judging it raw makes the two passes disagree.
        const pairs = input.map((entry, index) => {
            // A question serialized as a JSON string (`["{\"type\":...}"]`) is the
            // same provider quirk one level down; decode it so it can be normalized,
            // and let a non-JSON string fall through as the junk it is.
            const question = decodeJsonInput(entry);
            if (!isRecord(question))
                return [`q${index + 1}`, question];
            // No intermediate `{...rest}` copy: normalizeQuestion() already drops
            // name/id/key as junk, so passing the entry through repairs naming
            // metadata and aliases in a single construction pass.
            const rawName = question.name ?? question.id ?? question.key;
            const base = typeof rawName === "string" && rawName.trim() !== ""
                ? rawName
                : `q${index + 1}`;
            return [base, normalizeQuestion(question)];
        });
        const hasQuestion = pairs.some(([, value]) => looksLikeQuestion(value));
        for (const [base, value] of pairs) {
            if (hasQuestion && !looksLikeQuestion(value)) {
                noteDrop(drops, base, value);
                continue;
            }
            setOwn(record, claimName(base), value);
        }
        return record;
    }
    if (isRecord(input)) {
        // Single question sent without a wrapping name (`questions: {type, ...}`)
        // instead of (`questions: {q1: {type, ...}}`). Unwrap on a known kind so
        // a hallucinated extra field still reports against the question (not as
        // phantom questions named "type"/"instructions"); fall back to the
        // vocabulary check for unknown types so those report precisely too. A
        // record that merely contains a question *named* "type" has an object
        // there, never a string, so it is never misread.
        if (typeof input.type === "string") {
            const kind = normalizeQuestionType(input.type);
            const knownKind = kind === "choice" ||
                kind === "noul" ||
                kind === "score" ||
                kind === "box";
            const keys = Object.keys(input);
            const allQuestionKeys = keys.every((key) => key === "type" ||
                INSTRUCTIONS_ALIASES.includes(key) ||
                CRITERIA_ALIASES.includes(key) ||
                QUESTION_JUNK_KEYS.has(key));
            if (knownKind || allQuestionKeys)
                return { q: normalizeQuestion(input) };
        }
        // Copy-on-write: share the map (and each canonical question) when
        // nothing needs repair; otherwise rebuild with repaired questions and
        // unaffected siblings shared by reference. The scan probes
        // canonicality only — it must never build (and discard) repairs.
        //
        // A whole question MAP can land in a name slot, one level too deep:
        // `{"Which library should we adopt?": {"pick": {type, instructions,
        // criteria}}}`. The outer key is the question text, the value is a map
        // whose every entry is a real question. Splice those entries up to this
        // level. Provably safe: a question never holds a question, so a record
        // whose values are ALL questions is a question map and nothing else.
        const entries = [];
        let dirty = false;
        for (const name in input) {
            if (!Object.hasOwn(input, name))
                continue;
            const question = input[name];
            if (isNestedQuestionMap(question)) {
                dirty = true;
                entries.push(...flattenQuestionMap(question));
                continue;
            }
            if (!isRecord(question) || !isCanonicalQuestion(question))
                dirty = true;
            entries.push([name, question]);
        }
        if (!dirty)
            return input;
        const record = {};
        // A question is always an object carrying a contract key. Anything else in
        // a name slot is a label or a question field that landed a level too high
        // (`{"deny": "refund it"}`, `{"criteria": {...}}`), so it is dropped — but
        // only while a real question remains to answer with. A map with no real
        // question carries none at all, and is left to report the precise error.
        // Question-ness is judged on the normalized entry, matching the array
        // branch: an entry that only becomes a question after normalization must
        // still count, or the two passes disagree about what to keep.
        const pairs = [];
        for (const [name, value] of entries) {
            const question = decodeJsonInput(value);
            pairs.push([
                name,
                isRecord(question) ? normalizeQuestion(question) : question,
            ]);
        }
        const hasQuestion = pairs.some(([, value]) => looksLikeQuestion(value));
        for (const [name, question] of pairs) {
            if (hasQuestion && !looksLikeQuestion(question)) {
                noteDrop(drops, name, question);
                continue;
            }
            // Two questions can only reach the same name if one was spliced up out
            // of a nested map; suffix rather than silently drop the second.
            let unique = name;
            for (let n = 2; Object.hasOwn(record, unique); n += 1) {
                unique = `${name}_${n}`;
            }
            setOwn(record, unique, question);
        }
        return record;
    }
    return input;
}
/**
 * Compatibility shim for sloppy tool arguments. Runs before schema
 * validation (wired as `prepareArguments`) and is idempotent, so `execute`
 * re-applies it defensively for direct calls that bypass validation.
 */
export function prepareSystemOneArgs(args) {
    return normalizeArgs(args);
}
/**
 * The same normalization, reporting any question-map entry it had to discard.
 * `prepareSystemOneArgs` stays pure because Pi calls it on every tool call and
 * the property harness relies on it being idempotent and reentrant; only the
 * tool's own execute() needs to know what was thrown away, so only it pays for
 * the second walk.
 */
export function collectDiscardedQuestions(args) {
    const drops = [];
    if (!isRecord(args))
        return drops;
    normalizeArgs(args, drops);
    return drops;
}
function normalizeArgs(args, drops) {
    if (!isRecord(args))
        return args;
    const questions = args.questions ?? args.question ?? args.queries ?? undefined;
    const normalizedQuestions = questions !== undefined ? normalizeQuestions(questions, drops) : undefined;
    // A state nested inside a question is request state; lift it unless a real
    // top-level one was supplied, which always wins.
    const lifted = liftNestedState(normalizedQuestions, args.state ?? args.context ?? args.evidence);
    const topState = lifted.state;
    const finalQuestions = lifted.questions;
    // Copy-on-write fast path: canonical state/questions slots, no alias keys
    // to rename, no unknown keys to drop — return the input by reference, so
    // the defensive re-normalization in execute() never copies the question
    // map or any question object, and retains nothing.
    //
    // The path is cheap to *copy* but no longer cheap to *decide*: the
    // canonicality checks below now have to rule out all 13 repair rules
    // before they can conclude "nothing to do". Measured on the canonical
    // fixture in bench/normalize.bench.ts, against 8cf6ba1 on the same
    // machine: 620 -> 1329 ns/op and 290 -> 1939 B/op generated, with
    // retained memory ~0 on both sides. The cost is transient garbage from
    // the analysis, not copies, and it is negligible against the network
    // round trip to the judge. The repair path itself is unchanged
    // (sloppy fixture: 1571 -> 1563 B/op generated).
    const questionsCanonical = finalQuestions === questions &&
        (questions === undefined
            ? !Object.hasOwn(args, "questions") &&
                !Object.hasOwn(args, "question") &&
                !Object.hasOwn(args, "queries")
            : questions === args.questions &&
                !Object.hasOwn(args, "question") &&
                !Object.hasOwn(args, "queries"));
    if (questionsCanonical &&
        Object.hasOwn(args, "state") &&
        args.state !== undefined &&
        !Object.hasOwn(args, "context") &&
        !Object.hasOwn(args, "evidence")) {
        let knownKeysOnly = true;
        for (const key in args) {
            if (Object.hasOwn(args, key) && !PASSTHROUGH_KEYS.includes(key)) {
                knownKeysOnly = false;
                break;
            }
        }
        if (knownKeysOnly)
            return args;
    }
    const out = {};
    if (topState !== undefined)
        out.state = topState;
    if (finalQuestions !== undefined)
        out.questions = finalQuestions;
    // Drop unknown top-level keys; a missing `state` / `questions` still
    // produces a clear error from semantic validation in execute().
    for (const key of PASSTHROUGH_KEYS) {
        if (key === "state" || key === "questions")
            continue;
        if (!Object.hasOwn(args, key))
            continue;
        const value = args[key];
        if (value !== undefined)
            out[key] = value;
    }
    return out;
}
// Keep codemode's result small and question-name keyed; each answer carries
// its own kind-specific fields without requiring a per-kind schema union.
const systemOneAnswersOutput = Type.Object({
    answers: Type.Object({}, {
        additionalProperties: Type.Object({
            type: Type.String(),
            noul: Type.Optional(Type.Number()),
            choice: Type.Optional(Type.String()),
            score: Type.Optional(Type.Number()),
            probabilities: Type.Optional(Type.Object({}, { additionalProperties: Type.Number() })),
            legend: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
            confidence: Type.Optional(Type.Number()),
        }, { additionalProperties: true }),
    }),
    model: Type.Optional(Type.String()),
    usage: Type.Optional(Type.Object({
        inputTokens: Type.Optional(Type.Number()),
        outputTokens: Type.Optional(Type.Number()),
    })),
    requestId: Type.Optional(Type.String()),
    metadata: Type.Object({
        provider: Type.String(),
        latencyMs: Type.Optional(Type.Number()),
    }),
});
// `action: "models"` answers with the catalog and judges nothing, so the two
// results share no `answers` slot — the union keeps each shape honest.
const systemOneModelsOutput = Type.Object({
    models: Type.Array(Type.Object({
        id: Type.String(),
        name: Type.String(),
        isFree: Type.Boolean(),
        input: Type.Array(Type.String()),
        capabilities: Type.Array(Type.String()),
        inputMicroIdr: Type.Optional(Type.Number()),
    })),
    defaults: Type.Object({
        questions: Type.String(),
        fields: Type.String(),
    }),
    source: Type.String(),
});
const systemOneOutput = Type.Union([
    systemOneAnswersOutput,
    systemOneModelsOutput,
]);
/**
 * Runtime semantic validation: "is this actually a valid System One
 * request?" The public schema lets repairable shapes through; this gate
 * enforces the canonical contract the provider requires. Limits here are
 * the ones the tool itself guarantees (verified against
 * system-one-core, which enforces no option/level counts — the backend
 * is the final arbiter for anything stricter). Every error states what
 * was wrong, which question it was in, and what valid shape looks like.
 */
function assertAnswerableQuestions(questions) {
    if (questions === undefined) {
        throw new Error('system_one: questions is required (or "fields" for Clairic extraction). Provide at least one named question, e.g. {"q1": {"type": "choice", "instructions": "...", "criteria": {"a": null}}}.');
    }
    // The semantic gate is authoritative: anything that is not a question
    // map after normalization is rejected here, never sent to the provider.
    if (!isRecord(questions)) {
        throw new Error('system_one: "questions" must resolve to a question map after normalization, e.g. {"q1": {"type": "choice", "instructions": "...", "criteria": {"a": null}}}.');
    }
    if (Object.keys(questions).length === 0) {
        throw new Error("system_one: at least one question is required in questions.");
    }
    for (const [name, value] of Object.entries(questions)) {
        if (!isRecord(value)) {
            throw new Error(`system_one: question "${name}" must be an object with "type", "instructions", and "criteria".`);
        }
        if (value.instructions === undefined || value.instructions === null) {
            throw new Error(`system_one: question "${name}" needs "instructions" describing what to evaluate, e.g. {"type": "${typeof value.type === "string" ? value.type : "choice"}", "instructions": "Which option fits best?"}.`);
        }
        if (value.type === "choice") {
            if (!isRecord(value.criteria) ||
                Object.keys(value.criteria).length === 0) {
                throw new Error(`system_one: choice question "${name}" needs criteria as an object keyed by choice label with at least one choice, e.g. {"a": null, "b": null}.`);
            }
        }
        else if (value.type === "score") {
            if (!Array.isArray(value.criteria) || value.criteria.length < 2) {
                throw new Error(`system_one: score question "${name}" needs criteria as an ordered array of at least two levels from lowest to highest, e.g. ["low", "high"].`);
            }
        }
        else if (value.type === "noul") {
            if (value.criteria !== undefined && !isRecord(value.criteria)) {
                throw new Error(`system_one: noul question "${name}" needs criteria omitted or as an object describing the true/false outcomes, e.g. {"true": "...", "false": "..."}.`);
            }
        }
        else if (value.type === "box") {
            // A box question names what to locate and needs an image under `assets`;
            // it takes no criteria.
            if (value.criteria !== undefined && !isRecord(value.criteria)) {
                throw new Error(`system_one: box question "${name}" takes no criteria. Put the object to locate in "instructions" and send the image under "assets".`);
            }
        }
        else {
            const got = typeof value.type === "string" ? `"${value.type}"` : "missing";
            throw new Error(`system_one: question "${name}" has unknown type ${got}; use "choice", "noul", "score", or "box".`);
        }
    }
}
/** Field types Clairic accepts. Anything else is a caller mistake worth naming. */
const FIELD_TYPES = new Set([
    "text",
    "number",
    "date",
    "time",
    "datetime",
    "duration",
    "list",
    "estimate",
    "forecast",
]);
/**
 * Clairic `fields` gate. A field map holds up to 64 named fields, each with a
 * known type and optional `instructions`; type settings pass through as-is.
 */
function assertAnswerableFields(fields) {
    if (!isRecord(fields)) {
        throw new Error('system_one: "fields" must be an object keyed by field name, e.g. {"total": {"type": "number"}}.');
    }
    if (Object.keys(fields).length === 0) {
        throw new Error("system_one: at least one field is required in fields.");
    }
    for (const [name, value] of Object.entries(fields)) {
        if (!isRecord(value)) {
            throw new Error(`system_one: field "${name}" must be an object with a "type", e.g. {"type": "text"}.`);
        }
        const type = typeof value.type === "string" ? value.type : undefined;
        if (type === undefined || !FIELD_TYPES.has(type)) {
            const got = type === undefined ? "missing" : `"${type}"`;
            throw new Error(`system_one: field "${name}" has unknown type ${got}; use one of ${[...FIELD_TYPES].join(", ")}.`);
        }
    }
}
/**
 * Answer `action: "models"`: fetch the catalog, cache it for model choice, and
 * render the decision — which id, what it costs, what it can answer. Judging
 * nothing, it returns zero usage.
 */
async function renderModelCatalogAction(signal) {
    const catalog = await fetchKenariSystemOneModelCatalog(signal);
    const defaults = {
        questions: defaultSystemOneModel({ fields: false, images: false }, catalog.models).id,
        fields: defaultSystemOneModel({ fields: true, images: false }, catalog.models).id,
    };
    return {
        content: [
            {
                type: "text",
                text: renderSystemOneModelCatalog(catalog.models, defaults, catalog.source),
            },
        ],
        // The catalog entries are plain data; the cast only satisfies JsonValue's
        // index signature, which a declared interface never carries.
        structuredContent: {
            models: catalog.models,
            defaults,
            source: catalog.source,
            metadata: { provider: PROVIDER_KENARI },
        },
        details: {
            models: catalog.models,
            source: catalog.source,
            action: "models",
            metadata: { provider: PROVIDER_KENARI },
        },
        // Nothing was judged, so nothing was billed.
        usage: zeroUsage(),
    };
}
/** Image formats kenari accepts for `assets`. */
const ASSET_FORMATS = {
    ".png": "png",
    ".jpg": "jpg",
    ".jpeg": "jpg",
};
/** Resolve `assets` into base64 payloads, reading `path` entries from disk. */
async function resolveAssets(raw, cwd) {
    if (raw === undefined)
        return undefined;
    if (!isRecord(raw)) {
        throw new Error('system_one: "assets" must be an object keyed by reference name, e.g. {"photo": {"path": "./photo.png"}}.');
    }
    const assets = {};
    for (const [name, value] of Object.entries(raw)) {
        if (!isRecord(value)) {
            throw new Error(`system_one: asset "${name}" must be an object with "path" or "data_base64".`);
        }
        if (typeof value.data_base64 === "string" && value.data_base64 !== "") {
            const declared = typeof value.format === "string"
                ? value.format.toLowerCase()
                : undefined;
            const format = declared === "jpeg"
                ? "jpg"
                : declared === "png" || declared === "jpg"
                    ? declared
                    : undefined;
            if (!format) {
                throw new Error(`system_one: asset "${name}" needs "format": "png" or "jpg" next to data_base64.`);
            }
            assets[name] = { format, data_base64: value.data_base64 };
            continue;
        }
        if (typeof value.path !== "string" || value.path.trim() === "") {
            throw new Error(`system_one: asset "${name}" needs "path" or "data_base64".`);
        }
        const file = resolve(cwd, value.path);
        const extension = extname(file).toLowerCase();
        const format = ASSET_FORMATS[extension];
        if (!format) {
            throw new Error(`system_one: asset "${name}" must be a .png, .jpg or .jpeg file (got "${extension || "no extension"}").`);
        }
        assets[name] = {
            format,
            data_base64: (await readFile(file)).toString("base64"),
        };
    }
    return assets;
}
/**
 * Price the call at the catalog rate so session cost accounting stays right.
 * System One bills input tokens only, so generated tokens carry no cost.
 */
function toUsage(response, model) {
    const input = response.usage?.input_tokens ?? 0;
    const output = response.usage?.output_tokens ?? 0;
    const inputCost = (input / 1_000_000) * getKenariSystemOneInputRate(model);
    return {
        input,
        output,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: input + output,
        cost: {
            input: inputCost,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: inputCost,
        },
    };
}
/** Nothing was judged, so nothing was billed. */
function zeroUsage() {
    return {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
        },
    };
}
/**
 * The `system_one` tool. It resolves kenari credentials from the model
 * registry, so it works wherever the kenari provider is logged in, and it never
 * holds a key of its own.
 */
export const systemOneTool = {
    name: "system_one",
    label: "System One",
    description: "Judge bounded decisions over explicitly supplied state with a dedicated kenari System One model - calibrated probabilities conditional on that state (confidence for choice/score only; noul has no confidence field, its probability is the uncertainty measure). " +
        "Call system_one instead of making a bounded judgment directly when the decision is a pick from named options, a yes/no likelihood, a rubric score, or a region located in an image. This applies both to final answers and intermediate agent decisions such as classification, routing, or choosing among plausible tools, skills, strategies, implementations, models, or providers. " +
        "The judge only weighs the state you supply: it cannot recall facts or browse, so retrieve evidence first and never ask it to recall facts. " +
        "Do not use it for open-ended generation itself or factual lookup. A generative task may still contain bounded intermediate judgments where system_one is useful. " +
        "Questions that share the same state can be evaluated together in one call. " +
        'Each question is {"type": "choice" | "noul" | "score" | "box", "instructions": "...", "criteria": ...}: ' +
        'choice criteria is an object keyed by choice label ({"a": null, "b": null}), ' +
        "noul usually omits criteria, " +
        "score criteria is an ordered array of at least two levels, " +
        'box takes no criteria and needs an image under "assets". ' +
        'Clairic models extract structured data instead: send "fields" with typed entries (text, number, date, list, estimate, ...). ' +
        'Images travel under reference names in "assets" - cite the name in instructions. Models: clef:free (default), clef-flash:free, clef-omni:free, clef, jev-1-13, jev-1-14; clairic:free handles fields.',
    parameters: systemOneParams,
    outputSchema: systemOneOutput,
    promptSnippet: "Use system_one for bounded judgments over supplied evidence, including classification, routing, and selecting among plausible tools, skills, strategies, implementations, models, or providers",
    promptGuidelines: [
        "Whenever you encounter a bounded judgment over supplied or retrieved evidence, including as an intermediate step in a larger task, call system_one instead of making the judgment yourself. A bounded judgment is choosing among explicit alternatives, making a yes/no judgment, or rating something on an ordered scale.",
        "Common bounded-choice patterns include classification into known labels, selecting among plausible candidate tools or skills, routing among models/providers, and choosing among plausible strategies or implementations. These are examples, not an exhaustive list; recognize other bounded decisions from their structure.",
        "Pick the system_one question type mechanically: unordered alternatives (frontend, backend, platform) -> choice; yes/no -> noul; ordered scale, rating, severity, risk, or grade -> score; where in an image something is -> box with the image under assets. Never use choice for an ordered scale merely because its levels have names: very low / low / moderate / high / very high is score, not choice.",
        "Retrieve missing factual evidence into state first; never ask system_one to recall facts or browse. Use system_one for bounded judgments over available evidence, not as a replacement for factual lookup.",
        "Do not use system_one to perform open-ended generation itself - writing, drafting, composing, generating code, or explaining. However, a generative task may contain bounded intermediate judgments where system_one is appropriate, such as classification, routing, or choosing among plausible tools, skills, strategies, implementations, models, or providers.",
        "Do not use system_one for trivial or mechanically obvious selections where there is no meaningful judgment to make. Use it when multiple candidates are genuinely plausible and the choice depends on supplied or retrieved evidence.",
        "Batch independent system_one questions sharing the same state into one call instead of one call per question.",
        "For system_one choice questions, the keys of criteria are the available choices - preserve user-specified labels and use null values when labels are self-explanatory; never add a separate options field.",
        "Use system_one when you need to make fast decisions in bulk",
    ],
    prepareArguments: (args) => prepareSystemOneArgs(args),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        /*
         * The LLM-facing TypeBox schema is intentionally separate from the
         * provider protocol types. Cast only at this boundary instead of
         * spreading `any` throughout the implementation.
         *
         * `prepareArguments` above is an optimization: it runs before schema
         * validation where Pi supports it, but correctness never depends on it -
         * re-normalize here so every path converges on the same canonical shape
         * before semantic validation.
         */
        const normalized = prepareSystemOneArgs(params);
        // prepareSystemOneArgs passes non-objects through untouched; direct
        // calls bypassing Pi validation must get an actionable error, not a
        // TypeError from property access on null.
        if (!isRecord(normalized)) {
            throw new Error('system_one: request must be an object with "state" and "questions".');
        }
        const request = normalized;
        // The catalog action answers before any request validation: it judges
        // nothing, so it needs no state, no questions and no credentials — the
        // kenari catalog endpoint is public, and being able to list models before
        // login is the whole point of the action.
        const action = typeof request.action === "string"
            ? request.action.trim().toLowerCase()
            : "";
        if (action !== "") {
            if (action !== "models") {
                throw new Error(`system_one: unknown action "${action}". The only action is "models"; omit it to judge.`);
            }
            return renderModelCatalogAction(signal);
        }
        const fields = request.fields;
        if (fields !== undefined && request.questions !== undefined) {
            throw new Error('system_one: send either "questions" or "fields", not both.');
        }
        if (fields !== undefined)
            assertAnswerableFields(fields);
        else
            assertAnswerableQuestions(request.questions);
        const assets = await resolveAssets(request.assets, ctx.cwd);
        // Clairic can read the state off an image alone; questions cannot.
        if (request.state === undefined && assets === undefined) {
            throw new Error('system_one: state is required. Put the material under judgment in "state" (string or object), e.g. {"state": "<evidence>", "questions": {...}}. A fields call may omit it only when it also sends an image under "assets".');
        }
        // Resolve the model against the cached catalog: this rejects an unknown or
        // unsuitable id before the request leaves, and never costs a round trip.
        // Capability is judged from the request shape, so the default is the model
        // that can actually answer it.
        const resolved = resolveSystemOneModel(request.model, {
            fields: fields !== undefined,
            images: assets !== undefined,
        });
        const model = resolved.id;
        const apiKey = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_KENARI);
        if (!apiKey) {
            throw new Error('system_one: no kenari credentials. Run "/login kenari" or set KENARI_API_KEY.');
        }
        const startedAt = Date.now();
        const response = await runSystemOne({
            model,
            apiKey,
            signal,
            ...(request.state !== undefined
                ? { state: request.state }
                : {}),
            ...(fields !== undefined
                ? { fields: fields }
                : {
                    questions: request.questions,
                }),
            ...(assets !== undefined ? { assets } : {}),
            ...(typeof request.reference_date === "string"
                ? { reference_date: request.reference_date }
                : {}),
        });
        const latencyMs = Date.now() - startedAt;
        const answers = response.answers;
        const usage = {
            inputTokens: response.usage?.input_tokens ?? 0,
            outputTokens: response.usage?.output_tokens ?? 0,
        };
        return {
            content: [
                {
                    type: "text",
                    text: renderSystemOneResult(response, collectDiscardedQuestions(params)),
                },
            ],
            structuredContent: {
                answers,
                metadata: { provider: PROVIDER_KENARI, latencyMs },
                model: response.model,
                usage,
            },
            // Priced at the catalog rate so session cost accounting stays right.
            // Price with the id we asked for: kenari echoes a versioned one
            // ("jev-1-14" comes back as "jev-1.14.0"), which the catalog doesn't know.
            usage: toUsage(response, model),
            details: {
                answers,
                model: response.model,
                // Only set when the caller's spelling differed from the id that ran,
                // so an alias is reported rather than silently swallowed.
                ...(resolved.requested !== undefined
                    ? { requestedModel: resolved.requested }
                    : {}),
                usage,
                metadata: { provider: PROVIDER_KENARI, latencyMs },
            },
        };
    },
};
