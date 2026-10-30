---
name: system-one
description: Answer bounded decision questions with kenari System One through the `system_one` tool — classify into named options, get yes/no probabilities, score against a rubric, locate objects in images, or extract structured fields from documents. Use when a task needs a structured verdict, probability, score, or extraction instead of generated prose, and whenever a prompt would otherwise ask a model to "decide", "rate", "triage", "label", or "read fields from" given material.
---

# System One

System One is a classification endpoint, not a chat model. You send one body of
shared `state` plus named questions (or Clairic `fields`), and it returns one
answer per name. There is no prose output, no tool loop, and no follow-up
question — everything the model may look at has to be in `state` or in an image
asset.

Call it with the `system_one` tool. Read `references/contract.md` when you need
the full answer shapes, field types, or limits.

## Pick the question type mechanically

| The decision is… | Use | Answer you get back |
| --- | --- | --- |
| One of several unordered alternatives | `choice` | chosen criterion key + `probabilities` |
| Yes / no | `noul` | probability that it is yes (0–1) |
| An ordered scale: severity, risk, quality, confidence, grade | `score` | `score` + `legend` mapping positions to labels |
| Where something is in an image | `box` | `{top, bottom, left, right}` as fractions of the image |
| Reading values out of a document | `fields` (Clairic) | `value`, `guess`, `p_null`, spans |

The trap: a scale whose levels have names is still `score`, not `choice`.
`very low / low / moderate / high / very high` is `score`. `frontend / backend /
platform` is `choice`. Asking `choice` for an ordered scale throws away the order
you wanted to reason about.

## Shape of a call

```json
{
  "state": "the material under judgment — logs, ticket text, a diff, a transcript",
  "questions": {
    "incident": {
      "type": "noul",
      "instructions": "Is this describing a production incident?"
    },
    "owner": {
      "type": "choice",
      "instructions": "Which team should own this?",
      "criteria": { "frontend": null, "backend": null, "platform": null }
    },
    "severity": {
      "type": "score",
      "instructions": "How severe is the impact?",
      "criteria": ["trivial", "minor", "major", "critical"]
    }
  }
}
```

Every question is judged against the same `state`, so batch related questions
into one call instead of paying for the same state repeatedly. Keep each
`instructions` self-contained: a question cannot see another question's answer.

`criteria` carries the options (for `choice`) or the ordered levels (for
`score`). Spell out what each option means when the names are not obvious — the
model only knows what you write. `box` takes no criteria; describe what to
locate in `instructions` and send the image under `assets`.

## Reading images

Images travel under reference names you can cite in `instructions`:

```json
{
  "assets": { "receipt": { "path": "./receipt.png" } },
  "questions": {
    "legible": { "type": "noul", "instructions": "Is the receipt legible?" },
    "total_box": { "type": "box", "instructions": "Locate the total amount." }
  }
}
```

PNG and JPEG only, up to 16 assets. A relative `path` resolves against the
working directory, so fetch a URL to disk first. Box edges come back as
fractions of the image (0–1), not pixels — multiply by width/height yourself.

## Reading answers

`details.answers` is keyed by your question names:

```json
{
  "incident": { "type": "noul", "noul": 0.93 },
  "owner": { "type": "choice", "choice": "backend", "probabilities": { "backend": 0.81, "platform": 0.19 } },
  "severity": { "type": "score", "score": 1.67, "legend": { "0": "trivial", "1": "minor", "2": "major", "3": "critical" } }
}
```

Report the probability, not just the threshold verdict, when the number matters
for the decision — "0.93 likely a production incident" is more useful than
"yes". Treat a near-0.5 `noul` or a flat `probabilities` distribution as "the
state does not settle this" and say so instead of inventing a call.

`choice` and `score` answers also carry `confidence` (how sure the model is of
that answer); a `noul` answer has none — its probability is the only uncertainty
signal. `score` is fractional, so interpolate it into `legend` instead of
rounding: 1.67 sits two thirds of the way from `minor` to `major`.

## Extracting fields (Clairic)

`fields` runs document extraction instead of questions. Send `fields` or
`questions`, never both:

```json
{
  "model": "clairic:free",
  "state": "Invoice\nTotal: Rp 42.000\nDue: 14/03",
  "reference_date": "2025-03-01",
  "fields": {
    "total": { "type": "number", "unit": "IDR" },
    "due": { "type": "date" }
  }
}
```

`reference_date` anchors dates written without a year. Check `p_null` and fall
back to `guess` when `value` is `null` — a null `value` with a low `p_null` means
the input really does not contain the field.

## Choose the model

Omit `model` and the tool picks by request shape: `clef:free` for questions,
`clairic:free` for `fields`, and an image-capable model when you send `assets`.
That is the right choice most of the time.

To see what exists right now, with prices and capabilities:

```json
{ "action": "models" }
```

The list is fetched live from kenari, so it stays correct when models are added
or repriced. It is also public — it works before you log in.

Ask for a model explicitly when you have a reason:

| Situation | Model |
| --- | --- |
| Default for questions | `clef:free` |
| Bulk triage where speed beats accuracy | `clef-flash:free` |
| A free answer came back genuinely ambiguous, or the call is high-stakes | `jev-1-14` |
| `fields` extraction | `clairic:free` |

Two things the tool will reject before the request leaves, so you do not have to
remember them:

- `fields` needs Clairic. Any other model answers questions and refuses fields.
- `clef` and `jev-1-13` take **text only** — they cannot read `assets`. For
  images use `clef:free`, `clef-flash:free`, `clef-omni:free` or `jev-1-14`.

An unknown id is rejected with the nearest real ids, so a typo or a remembered
but stale name costs one cheap retry rather than a 400. Escalate to `jev-1-14`
only on a real ambiguity — it is billed per input token and the free tier is not.

These models are not chat models: never ask one to write, summarize, or explain.
Use the session's own model for prose and this tool for the verdict.

## Pitfalls

- Do not put a question's context only in another question's `instructions`.
- Do not ask open-ended questions ("what is wrong with this?"). Convert them
  into bounded ones ("is the failure a timeout, an auth error, or a crash?").
- Do not send `state` and expect the model to fetch files it names — resolve
  paths and inline the content first.
- Do not loop one question per call over the same state; batch them.
