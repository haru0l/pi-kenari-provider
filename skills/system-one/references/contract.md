# System One contract reference

`POST https://kenari.id/v1/systemone` — kenari's own decision and extraction
contract. The `system_one` tool wraps it, resolves credentials, and prices the
call. Read this when you need exact shapes rather than the everyday patterns in
`SKILL.md`.

## Limits

| Thing | Limit |
| --- | --- |
| `questions` | 128 per call |
| `fields` | 64 per call |
| `assets` | 16 images per call |
| Image formats | PNG, JPEG (`png`, `jpg`, `jpeg`) |
| Audio | up to 4 clips, 8 MiB each |
| Video | up to 2 files, 16 MiB each |

`questions` and `fields` are mutually exclusive. `state` is required for
questions; a `fields` call may omit it only when it also sends an image.

## Question types

### `noul` — yes/no

```json
{ "type": "noul", "instructions": "Does this diff change the public API?" }
```

Answer: `{ "type": "noul", "noul": 0.87 }` — `noul` is the probability that the
answer is yes, and it is the only uncertainty signal: a `noul` answer carries no
`confidence` field. `criteria` is usually omitted; when you do send it, make it
an object naming both outcomes, e.g. `{ "true": "changes the public API",
"false": "internal only" }`.

### `choice` — one of several unordered options

```json
{
  "type": "choice",
  "instructions": "Which component owns this failure?",
  "criteria": { "gateway": "request routing and auth", "worker": "job execution", "db": "storage layer" }
}
```

Answer: `{ "type": "choice", "choice": "worker", "probabilities": { "worker": 0.72, "gateway": 0.2, "db": 0.08 } }`.

Option keys are what come back in `choice`. Use an object when each option needs
a description, an array when the names speak for themselves.

### `score` — ordered scale or rubric

```json
{
  "type": "score",
  "instructions": "How risky is this migration?",
  "criteria": ["safe", "reversible", "needs a backfill", "data loss possible"]
}
```

Answer: `{ "type": "score", "score": 1.67, "legend": { "0": "safe", "1": "reversible", "2": "needs a backfill", "3": "data loss possible" }, "probabilities": { ... } }`.

`score` is a position in the ordered `criteria` and it is **fractional** — 1.67
sits two thirds of the way from `reversible` to `needs a backfill`. Read `legend` to turn the
number back into a label, and never report the bare number to the user.

### `box` — locate something in an image

```json
{ "type": "box", "instructions": "Locate the signature line in image receipt." }
```

Takes no `criteria`; the image must be in `assets` and cited in `instructions`.

Answer: `{ "type": "box", "box": { "top": 0.71, "bottom": 0.78, "left": 0.12, "right": 0.63 } }`
— every edge is a fraction of image width/height, 0–1, not pixels.

## Field types (Clairic)

`fields` maps a name to a typed read-out of `state`:

```json
{
  "total":  { "type": "number", "unit": "IDR", "integer": true },
  "due":    { "type": "date" },
  "items":  { "type": "list", "items": { "type": "text" } },
  "eta":    { "type": "estimate" },
  "q3":     { "type": "forecast", "horizon": "3 months" }
}
```

| Type | Value |
| --- | --- |
| `text` | string |
| `number` | number (`unit`, `integer`, `decimals`, `min`, `max`, `step`) |
| `date` / `time` / `datetime` | ISO string |
| `duration` | number in the unit you set |
| `list` | array of item values |
| `estimate` | number with `median`, `p10`, `p90` |
| `forecast` | like `estimate`, over `horizon` |

Answer: `{ "type": "field", "value": 42000, "guess": 42000, "p_null": 0.02, "confidence": 0.95, "span": [12, 24] }`.

- `value` is `null` when the input does not determine the field; `guess` holds
  the best candidate anyway.
- `p_null` is the probability that the field genuinely is not there.
- `span` (text) / `spans` (list) index into `state`, so you can quote the source.
- `options.include_quantiles` adds 99 percentiles to estimates;
  `options.return_state_text` returns the text the spans refer to.

## Models

| Id | Modalities | Pricing | Notes |
| --- | --- | --- | --- |
| `clef:free` | text, image | free | default; the safest general choice |
| `clef-flash:free` | text, image | free | fastest |
| `clef-omni:free` | text, image, audio, video | free | use for audio/video state |
| `clef` | text, image | paid, per input token | higher quality than free tier |
| `jev-1-13` | text, image | paid, per input token | strong reasoning |
| `jev-1-14` | text, image | paid, per input token | most accurate |
| `clairic:free` | text, image | free | `fields` only; rejects `questions` |

The live list is `GET https://kenari.id/v1/models?modality=systemone`; the
provider also registers every questions-capable model as a pi classifier, so
`models.classify({ model: "kenari/clef:free", ... })` reaches the same endpoint
from codemode and extensions.

## Errors

The endpoint answers non-2xx with a JSON `error` message; the tool rethrows it as
`kenari systemone failed (<status>): <message>`. Common causes:

- `401` — missing or wrong key. Run `/login kenari` or set `KENARI_API_KEY`.
- `400` unknown field/question type — check the type names above.
- `400` questions plus fields — send one or the other.
- `400` oversized asset — compress or downscale the image before sending.
