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
- **Audio / Music / Video** — generation endpoints for models that support them
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

Fetch models filtered by modality (`chat`, `image`, `embedding`, `rerank`, `moderation`).

### `generateImages(options: KenariImageGenerateOptions): Promise<KenariImageResponse>`

Generate images via `POST /v1/images/generations`.

### `createEmbeddings(options: KenariEmbeddingOptions): Promise<KenariEmbeddingResponse>`

Create embeddings via `POST /v1/embeddings`.

### `rerankDocuments(options: KenariRerankOptions): Promise<KenariRerankResponse>`

Rank documents by relevance via `POST /v1/rerank`.

### `moderateContent(options: KenariModerationOptions): Promise<KenariModerationResponse>`

Moderate content via `POST /v1/moderations`.

### `generateAudio(options: KenariAudioOptions): Promise<ArrayBuffer>`

Generate audio via `POST /v1/audio`.

### `generateMusic(options: KenariMusicOptions): Promise<ArrayBuffer>`

Generate music via `POST /v1/music`.

### `generateVideo(options: KenariVideoOptions): Promise<ArrayBuffer>`

Generate video via `POST /v1/video`.

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
