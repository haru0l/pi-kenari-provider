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
import { getKenariSystemOneModelCatalog, } from "../systemone.js";
/**
 * Shorthands that are a choice, not a derivation: `jev` means the newest Jev,
 * which the catalog cannot tell you. Anything else is matched literally.
 */
const MODEL_ALIASES = {
    jev: "jev-1-14",
    flash: "clef-flash:free",
    omni: "clef-omni:free",
};
/** Case, padding and a provider prefix are noise, not a different model. */
function normalizeModelId(raw) {
    return raw
        .trim()
        .toLowerCase()
        .replace(/^kenari\//, "");
}
/** The catalog entry an id names, or undefined when nothing plausibly does. */
export function findSystemOneModelInfo(raw, catalog) {
    const wanted = normalizeModelId(raw);
    if (wanted === "")
        return undefined;
    const exact = catalog.find((m) => m.id.toLowerCase() === wanted);
    if (exact)
        return exact;
    const alias = MODEL_ALIASES[wanted];
    if (alias) {
        const aliased = catalog.find((m) => m.id.toLowerCase() === alias);
        if (aliased)
            return aliased;
    }
    // `clef-flash` names the only model under that stem, its :free variant. A
    // stem that also has a paid id matched exactly above, so this cannot pick
    // the wrong one.
    return catalog.find((m) => m.id.toLowerCase() === `${wanted}:free`);
}
/** Can this model answer the request as specified? */
function fits(model, need) {
    if (!model.capabilities.includes(need.fields ? "fields" : "questions")) {
        return false;
    }
    return !need.images || model.input.includes("image");
}
/** Ids that can answer this request, for an error that offers a way out. */
function fittingIds(catalog, need) {
    return catalog.filter((m) => fits(m, need)).map((m) => m.id);
}
/** Two-row Levenshtein. Ids are short, so this stays cheap. */
function editDistance(a, b) {
    const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    const current = new Array(b.length + 1);
    for (let i = 1; i <= a.length; i += 1) {
        current[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + substitution);
        }
        for (let j = 0; j <= b.length; j += 1)
            previous[j] = current[j] ?? 0;
    }
    return previous[b.length] ?? 0;
}
/**
 * Ids close enough to what was asked for to be a typo of it. A version echo
 * (`jev-1.14.0`) is deliberately *not* resolved — kenari returns that form, and
 * silently mapping it onto a catalog id would hide a version mismatch — so it
 * comes back here as a suggestion instead.
 */
export function nearestSystemOneModelIds(raw, catalog, limit = 3) {
    const wanted = normalizeModelId(raw);
    if (wanted === "")
        return [];
    const threshold = Math.max(2, Math.floor(wanted.length / 3));
    return catalog
        .map((m) => ({
        id: m.id,
        distance: editDistance(wanted, m.id.toLowerCase()),
    }))
        .filter((scored) => scored.distance <= threshold)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit)
        .map((scored) => scored.id);
}
/** The model a request runs on when it names none. */
export function defaultSystemOneModel(need, catalog = getKenariSystemOneModelCatalog()) {
    const preferred = need.fields ? "clairic:free" : "clef:free";
    const exact = catalog.find((m) => m.id === preferred);
    if (exact && fits(exact, need))
        return exact;
    // A catalog without the preferred id (or one that moved it) still has to
    // run the request, so take the first model that can.
    const fallback = catalog.find((m) => fits(m, need));
    if (fallback)
        return fallback;
    throw new Error(`system_one: no System One model in the catalog can answer this request (${need.fields ? "fields" : "questions"}${need.images ? ", with images" : ""}).`);
}
/** Reject a model that exists but cannot answer what was asked of it. */
function assertFits(info, need, catalog) {
    if (need.fields && !info.capabilities.includes("fields")) {
        throw new Error(`system_one: model "${info.id}" answers questions, not fields extraction. Use "clairic:free" for fields, or send "questions" instead.`);
    }
    if (!need.fields && !info.capabilities.includes("questions")) {
        throw new Error(`system_one: model "${info.id}" extracts fields only and rejects questions. Use "${defaultSystemOneModel({ ...need, fields: false }, catalog).id}" for questions, or send "fields" instead.`);
    }
    if (need.images && !info.input.includes("image")) {
        throw new Error(`system_one: model "${info.id}" takes text input only, so it cannot read images. Image-capable models: ${fittingIds(catalog, need).join(", ")}.`);
    }
}
/** Reject an id the catalog does not know, naming what it probably meant. */
function assertKnown(raw, catalog) {
    const info = findSystemOneModelInfo(raw, catalog);
    if (info)
        return info;
    const suggestions = nearestSystemOneModelIds(raw, catalog);
    const hint = 'Call system_one with action "models" for the current list.';
    throw new Error(suggestions.length > 0
        ? `system_one: unknown System One model "${raw}". Did you mean ${suggestions.map((id) => `"${id}"`).join(" or ")}? ${hint}`
        : `system_one: unknown System One model "${raw}". Available: ${catalog.map((m) => m.id).join(", ")}. ${hint}`);
}
/**
 * The model a request runs on: the id it named (normalized, alias-resolved and
 * checked against what the request needs), or the default for its shape.
 */
export function resolveSystemOneModel(requested, need, catalog = getKenariSystemOneModelCatalog()) {
    const raw = typeof requested === "string" ? requested.trim() : "";
    if (raw === "") {
        const info = defaultSystemOneModel(need, catalog);
        return { info, id: info.id };
    }
    const info = assertKnown(raw, catalog);
    assertFits(info, need, catalog);
    return info.id === raw
        ? { info, id: info.id }
        : { info, id: info.id, requested: raw };
}
