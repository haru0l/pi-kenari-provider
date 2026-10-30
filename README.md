# pi-kenari-provider

A [pi](https://github.com/earendil-works/pi) extension that registers [kenari](https://kenari.id) as a native AI provider.

kenari is an LLM gateway — one base URL (`https://kenari.id/v1`) speaks both the OpenAI Chat Completions API and the Anthropic Messages API, routes to many upstream providers, and bills in Indonesian Rupiah from a prepaid balance.

## Features

- **Dynamic model discovery** — fetches the full catalog from `GET /v1/models` (public, no key needed) on session start
- **Dual wire formats** — supports both `openai-completions` and `anthropic-messages` APIs
- **:free models** — surfaces free-tier variants (e.g. `step-3-7-flash:free`) that deduct no balance
- **Image generation** — `POST /v1/images/generations` (OpenAI Images-compatible)
- **Embeddings** — `POST /v1/embeddings` (OpenAI Embeddings-compatible)
- **Rerank** — `POST /v1/rerank` (Cohere-style relevance ranking)
- **Moderations** — `POST /v1/moderations` (OpenAI Moderations-compatible)
- **System One** — `POST /v1/systemone` for typed questions (noul, choice, score, box) and Clairic field extraction
- **System One classifiers** — registers every questions-capable System One model as a pi classifier, callable from codemode (`models.classify`) and extensions, deliberately kept out of `/model`
- **`system_one` tool + `system-one` skill** — the bundled skill routes decisions, image questions and field extraction to the tool, which defaults by request shape (`clef:free`, or `clairic:free` for `fields`) and lists the live catalog on `action: "models"`
- **`generate_image` tool** — draws with kenari image models, renders the picture inline in the conversation, and saves the same bytes into the working directory
- **Specialized model discovery** — `GET /v1/models?modality=` for `embedding`, `rerank`, `moderation` and `systemone` models
- **Web search / fetch / X search** — `POST /v1/web/search`, `/v1/web/fetch` and `/v1/x/search`
- **API key auth** — via `KENARI_API_KEY` env var or `/login kenari` (stored in `~/.pi/agent/auth.json`)

## Installation

The package is loaded as a pi extension. Add it to your pi configuration:

```json
{
  "extensions": [
    "./node_modules/pi-kenari-provider/dist/index.js"
  ]
}
```

Or install from GitHub:

```bash
npm install haru0l/pi-kenari-provider
```

## Authentication

Set your kenari API key (starts with `kn-`):

```bash
export KENARI_API_KEY=kn-...
```

Or run `/login kenari` in pi to store the key securely.

Get your key from the [kenari dashboard](https://kenari.id/login).

## Usage

Once authenticated, kenari models appear in `/models`:

```
kenari/step-3-7-flash:free    # Free tier
kenari/step-3-7-flash         # Paid from balance
```

Use them like any pi model:

```
> kenari/step-3-7-flash:free
Hello!
```

## System One

System One models answer bounded questions about state you supply. They are not chat models, so they never appear in `/model` — they are registered as pi **classifiers** and reachable two ways.

**From codemode or an extension** — every questions-capable System One model is a classifier (`clef:free`, `clef-flash:free`, `clef-omni:free`, `clef`, `jev-1-13`, `jev-1-14`). The classifier interface speaks `bool`, `choice` and `score`, over text and images; `bool` goes on the wire as kenari's `noul`:

```js
const clef = models.getAvailableOfType("classifier").find((m) => m.id === "clef:free");
const out = await models.classify(clef, {
  state: "the deploy failed twice with 503 from the gateway",
  questions: {
    incident: { type: "bool", instructions: "Is this a production incident?" },
    owner: {
      type: "choice",
      instructions: "Which team owns it?",
      criteria: { gateway: "routing", worker: "jobs" },
    },
  },
});
// out.answers.incident -> { type: "bool", probability: 0.63 }
```

Extensions use `ctx.modelRegistry.classify()` with the same context shape.

**From chat** — the extension registers a `system_one` tool and ships the `system-one` skill that tells the model when to call it. The tool also reaches what the classifier interface cannot express: `box` questions (locate something in an image), Clairic `fields` extraction, audio/video state, and `reference_date` anchoring.

**Choosing a model** — omit `model` and the tool picks by request shape (`clef:free` for questions, `clairic:free` for `fields`, an image-capable model when `assets` are sent). To see the live catalog with prices and capabilities:

```json
{ "action": "models" }
```

That action is public, so it works before login, and it refreshes the cache model choice resolves against. An explicit `model` is validated offline against that cache: a provider prefix (`kenari/clef:free`), casing and the `jev` / `flash` / `omni` shorthands are normalized, an unknown id is rejected with the nearest real ids, and an id that cannot answer the request (fields on a questions model, an image on the text-only `clef` or `jev-1-13`) is rejected before the request leaves. Judgment calls never fetch the catalog — only `action: "models"` does.


## API

### `default(pi: ExtensionAPI)`

The extension entry point. Registers the kenari provider with pi.

### `createKenariProvider(): Provider`

Build the kenari provider object for manual registration.

### `refreshKenariModels(context: RefreshModelsContext): Promise<KenariModel[]>`

Fetch and convert the kenari catalog. Called by pi's model refresh lifecycle.

### `fetchKenariModels(signal?: AbortSignal): Promise<KenariApiModel[]>`

Fetch the raw model catalog from `GET /v1/models`.

### `fetchKenariModelsByModality(modality, signal?: AbortSignal): Promise<KenariApiModel[]>`

Fetch models filtered by modality — `embedding`, `rerank`, `moderation` or `systemone` (`KenariModality`). Any other value returns 400. The call is public (no key needed) and returns `modality` and `pricing_lines` on each entry. These models are never part of the bare `/v1/models` chat catalog, so they do not appear in pi's `/models` list; use this to discover them programmatically.

### `generateImages(options: KenariImageGenerateOptions): Promise<KenariImageResponse>`

Generate images via `POST /v1/images/generations`.

Images come back base64-encoded in `data[]`, as `b64_json` or as a `data:` URI in `url`. kenari reports failures as `{ error: { message } }`, so the thrown error carries that message rather than the raw body.

### `generateImageBytes(options: KenariImageGenerateOptions): Promise<KenariImageAsset[]>`

The same call, decoded: returns `{ bytes, mimeType, revisedPrompt? }` per image, preferring `b64_json` and falling back to a `data:` URI. `decodeImage(data)` is exported for when you already have the response.

```ts
const [image] = await generateImageBytes({
  apiKey,
  model: "gpt-image-2",
  prompt: "a red panda writing code",
  n: 1,
  size: "1024x1024",
});
await writeFile("image.png", image.bytes);
```

### `createEmbeddings(options: KenariEmbeddingOptions): Promise<KenariEmbeddingResponse>`

Create embeddings via `POST /v1/embeddings`.

### `rerankDocuments(options: KenariRerankOptions): Promise<KenariRerankResponse>`

Rank documents by relevance via `POST /v1/rerank`.

### `moderateContent(options: KenariModerationOptions): Promise<KenariModerationResponse>`

Moderate content via `POST /v1/moderations`.

### `runSystemOne(options: KenariSystemOneOptions): Promise<KenariSystemOneResponse>`

Ask typed questions or extract typed fields via `POST /v1/systemone` — kenari's own contract, which no OpenAI or Anthropic SDK method maps to. System One models are decision and extraction models, not chat models: call this endpoint with a chat id, or a chat endpoint with a System One id, and kenari returns 400. Discover the ids with `fetchKenariModelsByModality("systemone")`.

`questions` runs noul, choice, score and box questions (up to 128); `fields` runs Clairic extraction (up to 64) — send one or the other, not both. An object or array `state` is sent as its JSON text.

```ts
const { answers } = await runSystemOne({
  apiKey,
  model: "clef:free",
  state: "a cat sitting on a rug",
  questions: {
    pick: { type: "choice", instructions: "Which animal?", criteria: { cat: "a cat", dog: "a dog" } },
  },
});
// answers.pick -> { type: "choice", choice: "cat", confidence: 0.98, probabilities: {...} }

const invoice = await runSystemOne({
  apiKey,
  model: "clairic:free",
  state: "Invoice INV-2291, issued 3 March 2026. Total due: Rp 4,250,000.",
  fields: {
    total: { type: "number", instructions: "The total due in rupiah" },
    issued: { type: "date", instructions: "The issue date" },
  },
});
// invoice.answers.total.value -> 4250000
```

Answers carry `confidence`; Clairic fields also carry `guess`, `p_null` and, for text, the `span` of the guess in the read text. Use `reference_date` to anchor dates written without a year, and `options.return_state_text` to get back the text the spans refer to.
`choice` and `score` answers carry `confidence`; a `noul` answer carries only its probability (`noul`), which is its uncertainty measure. `score` is fractional — 1.67 sits between two `legend` labels. Clairic fields also carry `guess`, `p_null` and, for text, the `span` of the guess in the read text. Use `reference_date` to anchor dates written without a year, and `options.return_state_text` to get back the text the spans refer to.

### System One classifiers

`getKenariSystemOneBaselineModels()` returns the six questions-capable System One models, and `refreshKenariSystemOneModels(context)` fetches them live from `GET /v1/models?modality=systemone`. `toProviderClassifierConfigs()` turns either list into the `type: "classifier"` entries the provider registers, so they are callable through `models.classify()` and `ctx.modelRegistry.classify()` and never appear in `/model`.

`clairic:free` is deliberately excluded — it answers `fields` extraction and rejects `questions`, which the classifier interface cannot express. Use the `system_one` tool for it, and for `box` questions, audio/video state and `reference_date`. It stays visible in the `action: "models"` catalog, which is for choosing rather than classifying.

Images travel as kenari `assets` (`compat.imageInput: "assets"`) without TypeSafe's opt-in header, and `getKenariSystemOneInputRate(id)` gives the USD input rate pi uses for cost accounting.

### `generateImageTool` / `generate_image`

Draws through `POST /v1/images/generations` and does the two things the tool is
there for: it returns the bytes as image content blocks, so the picture renders
in the conversation, and it writes them into the working directory so later
steps can reference a path. Files are written with the `wx` flag and a numeric
suffix on collision, so nothing is ever overwritten; `output` names the first
file and extra images from `n > 1` get `-2`, `-3`.

It defaults to the free `agnes-image-2-5-flash:free`. `generateImageBytes()` and
`decodeImage()` stay exported for code that wants the bytes without the file
write.

### `webSearch(options: KenariWebSearchOptions): Promise<KenariWebSearchResponse>`

Search the web via `POST /v1/web/search` — `{ query, max_results? }`, with kenari defaulting `max_results` to 5. Returns `results[]` of `{ title, url, content }` alongside kenari's `id` and `cost_micro_idr`.

```ts
const { results } = await webSearch({
  apiKey,
  query: "latest stable Rust release",
  max_results: 5,
});
```

### `webFetch(options: KenariWebFetchOptions): Promise<KenariWebFetchResponse>`

Read one page via `POST /v1/web/fetch` — `{ url }` in, `{ title, content, links }` out, with the content already extracted from the HTML.

### `xSearch(options: KenariXSearchOptions): Promise<KenariXSearchResponse>`

Answer a question from X posts via `POST /v1/x/search` — `{ query, x_search_filter? }` in, `{ answer, citations }` out. The filter narrows the corpus with `from_date` / `to_date` and `allowed_x_handles` / `excluded_x_handles`:

```ts
const { answer, citations } = await xSearch({
  apiKey,
  query: "reactions to the latest Rust release",
  x_search_filter: { from_date: "2026-01-01", allowed_x_handles: ["rustlang"] },
});
```

The web and X endpoints are kenari's own, not [OI] shapes, and none of them need a model id — so they never show up in `GET /v1/models`.

## Development

```bash
npm install
npm run build     # esbuild bundle + tsc declarations
npm run check     # typecheck
npm run lint      # biome
npm test          # vitest
```

## License

MIT
