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

// biome-ignore-all lint/suspicious/noExplicitAny: intentional dynamic boundary over JSON protocol values
import type { KenariSystemOneModelInfo } from "../systemone.js";

/** Is this probability key an index slot rather than a self-describing label? */
function isSlotKey(key: string): boolean {
  return /^\d+$/.test(key);
}

function renderProbabilityLine(
  key: string,
  value: unknown,
  legend: Record<string, unknown> | undefined,
): string {
  // Only index slots need help identifying themselves; a key that is already
  // the level text labels itself, and repeating it would just cost tokens.
  const label = isSlotKey(key) ? legend?.[key] : undefined;
  const described =
    typeof label === "string" && label.trim() !== "" && label !== key
      ? `${key} ${label}`
      : key;
  return `    ${described}: ${String(value)}`;
}

function scoreScaleNote(
  score: unknown,
  probabilities: unknown,
): string | undefined {
  if (typeof score !== "number" || !Number.isFinite(score)) return undefined;
  if (!probabilities || typeof probabilities !== "object") return undefined;
  const count = Object.keys(probabilities as object).length;
  if (count < 2) return undefined;
  // The score is a position on the rubric, not a level index and not a
  // percentage: it can land between levels. Say so, and give the range.
  return `  (position on the 0..${count - 1} rubric scale; it can land between levels)`;
}

/** Regions are pixel boxes in the source image, not normalized fractions. */
function renderBoxes(answer: Record<string, any>): string[] {
  const boxes = answer.boxes ?? (answer.box ? [answer.box] : undefined);
  if (!Array.isArray(boxes) || boxes.length === 0) {
    return ["  boxes: none"];
  }
  const lines = ["  boxes:"];
  for (const box of boxes) {
    if (!box || typeof box !== "object") {
      lines.push(`    ${String(box)}`);
      continue;
    }
    const label = typeof box.label === "string" ? `${box.label} ` : "";
    const region = ["x", "y", "w", "h"]
      .map((k) => (typeof box[k] === "number" ? `${k}=${box[k]}` : undefined))
      .filter(Boolean)
      .join(" ");
    const confidence =
      typeof box.confidence === "number" ? ` confidence=${box.confidence}` : "";
    lines.push(`    ${label}${region || JSON.stringify(box)}${confidence}`);
  }
  return lines;
}

/** Clairic extraction: a field answer carries `value`, or `values` for lists. */
function renderField(answer: Record<string, any>): string[] {
  if (Object.hasOwn(answer, "values")) {
    return [`  values: ${JSON.stringify(answer.values)}`];
  }
  if (Object.hasOwn(answer, "value")) {
    return [`  value: ${JSON.stringify(answer.value)}`];
  }
  return [`  ${JSON.stringify(answer)}`];
}

/** Any answer type this renderer does not know, kept readable but complete. */
function renderUnknown(answer: unknown): string[] {
  if (!answer || typeof answer !== "object") return [`  ${String(answer)}`];
  return [`  ${JSON.stringify(answer)}`];
}

export function renderSystemOneResult(
  response: { answers: Record<string, any> },
  discarded: string[] = [],
): string {
  const lines = ["System One result", ""];
  for (const [id, a] of Object.entries(response.answers)) {
    if (a?.type === "choice") {
      lines.push(
        `${id}:`,
        `  choice: ${a.choice}`,
        `  confidence: ${a.confidence}`,
        `  probabilities:`,
      );
      for (const [k, v] of Object.entries(a.probabilities ?? {}))
        lines.push(renderProbabilityLine(k, v, undefined));
    } else if (a?.type === "noul") {
      lines.push(`${id}:`, `  noul: ${a.noul}`);
    } else if (a?.type === "score") {
      lines.push(
        `${id}:`,
        `  score: ${a.score}`,
        `  confidence: ${a.confidence}`,
      );
      const note = scoreScaleNote(a.score, a.probabilities);
      if (note) lines.push(note);
      if (a.probabilities && typeof a.probabilities === "object") {
        lines.push(`  probabilities:`);
        for (const [k, v] of Object.entries(a.probabilities))
          lines.push(renderProbabilityLine(k, v, a.legend));
      }
    } else if (a?.type === "box") {
      lines.push(`${id}:`, ...renderBoxes(a));
    } else if (a?.type === "field" || a?.type === "fields") {
      lines.push(`${id}:`, ...renderField(a));
    } else {
      lines.push(`${id}:`, ...renderUnknown(a));
    }
    lines.push("");
  }
  // One line, once, instead of a paragraph per answer: the three things an
  // agent cannot infer from the numbers alone.
  lines.push(
    "noul is P(yes). A choice always returns a winner, so treat it as the best fit rather than proof one applies. confidence reflects the least certain judgment behind an answer and is not permission to act.",
  );
  if (discarded.length > 0) {
    // Lead with this, not bury it: the answers above are complete and
    // confident, and without this the model cannot tell that it asked for
    // more than it got. Re-send those entries as proper questions.
    lines.unshift(
      "",
      `NOTE: ${discarded.length} question entr${discarded.length === 1 ? "y was" : "ies were"} discarded during normalization and NOT judged: ${discarded.join("; ")}. Every entry above is a complete answer, but it does not cover what was dropped. Re-send ${discarded.length === 1 ? "that entry" : "those entries"} as a question object with type, instructions and criteria.`,
      "",
    );
  }
  return lines.join("\n").trimEnd();
}

/**
 * Render the model catalog for `action: "models"`.
 *
 * The point of this output is the *decision*, not the inventory: which id to
 * send, and what it will cost. So the capabilities and the caveats that make a
 * wrong pick fail (fields needs Clairic; two strong models cannot read images)
 * are spelled out rather than left to be inferred from columns, and the two
 * defaults are named at the bottom where the reader lands last.
 */
export function renderSystemOneModelCatalog(
  models: KenariSystemOneModelInfo[],
  defaults: { questions: string; fields: string },
  source: "live" | "baseline",
): string {
  const lines = [
    source === "live"
      ? "System One models (live catalog)"
      : "System One models (static catalog; the live fetch was unavailable)",
    "",
  ];

  // Column widths come from the data: clef-omni accepts four modalities, and a
  // fixed width would run that row into the next column.
  const priceOf = (model: KenariSystemOneModelInfo): string =>
    model.isFree
      ? "free"
      : model.inputMicroIdr !== undefined
        ? `${formatMicroIdr(model.inputMicroIdr)} IDR/1M in`
        : "paid";
  const idWidth = Math.max(...models.map((m) => m.id.length), 2);
  const priceWidth = Math.max(...models.map((m) => priceOf(m).length), 5) + 2;
  const inputWidth =
    Math.max(...models.map((m) => m.input.join("+").length), 5) + 2;

  for (const model of models) {
    const id = model.id.padEnd(idWidth);
    const price = priceOf(model).padEnd(priceWidth);
    const input = model.input.join("+").padEnd(inputWidth);
    const answers = model.capabilities.join("/");
    lines.push(`  ${id}  ${price}${input}${answers}`);
  }

  lines.push(
    "",
    `Defaults: ${defaults.questions} for questions, ${defaults.fields} for fields (omit "model" and the tool chooses by request shape).`,
  );

  // A paid input rate is the only figure here that costs money to ignore, so
  // say what the unit means once rather than per row.
  if (models.some((m) => !m.isFree && m.inputMicroIdr !== undefined)) {
    lines.push(
      "Prices are kenari's input rate per 1M tokens; questions are answered in one pass, so output is not usually billed.",
    );
  }

  return lines.join("\n");
}

/** Micro-Rupiah per 1M tokens is a large number; show it as IDR per 1M. */
function formatMicroIdr(microIdr: number): string {
  return (microIdr / 1_000_000).toLocaleString("en-US");
}
