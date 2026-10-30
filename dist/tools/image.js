/**
 * `generate_image` tool: draw images with kenari's [OI] Images endpoint.
 *
 * The picture comes back twice on purpose. The result carries the bytes as
 * image content blocks, so it renders inline in the conversation, and it writes
 * the same bytes into the working directory, so the picture outlives the
 * session and can be referenced by path. Files are written with the `wx` flag
 * and a numeric suffix on collision, so an existing file is never overwritten.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { Type } from "typebox";
import { generateImageBytes } from "../api/images.js";
import { DEFAULT_IMAGE_MODEL, PROVIDER_KENARI } from "../constants.js";
/** Image models are slow; kenari's own examples allow five minutes. */
const IMAGE_TIMEOUT_MS = 300_000;
const EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
};
const generateImageParams = Type.Object({
    prompt: Type.String({
        description: "What to draw. Describe subject, composition, style and lighting; the model does not see the conversation.",
    }),
    model: Type.Optional(Type.String({
        description: `Image model id. Defaults to ${DEFAULT_IMAGE_MODEL}; the other free ones are agnes-image-2-1-flash:free and agnes-image-2-0-flash:free, and paid ones include gpt-image-2, nano-banana-pro, grok-imagine-image and qwen-image-3.0-pro.`,
    })),
    n: Type.Optional(Type.Integer({
        minimum: 1,
        maximum: 4,
        description: "How many images to draw. Defaults to 1.",
    })),
    size: Type.Optional(Type.String({
        description: 'Pixel size as "WIDTHxHEIGHT", e.g. "1024x1024". Defaults to the model default.',
    })),
    quality: Type.Optional(Type.Union([Type.Literal("standard"), Type.Literal("hd")], {
        description: "Detail level, where the model supports it.",
    })),
    style: Type.Optional(Type.Union([Type.Literal("natural"), Type.Literal("vivid")], {
        description: "Style bias, where the model supports it.",
    })),
    background: Type.Optional(Type.Union([Type.Literal("opaque"), Type.Literal("auto")], {
        description: "Transparent-capable models only; leave unset otherwise.",
    })),
    output: Type.Optional(Type.String({
        description: 'File name or path for the saved image, relative to the working directory, e.g. "cat.png". Defaults to "generated-<timestamp>.<ext>". Extra images from n>1 get a -2, -3 suffix.',
    })),
});
const generateImageOutput = Type.Object({
    model: Type.String(),
    files: Type.Array(Type.String()),
});
/** `20261030-114233`, local time, sortable and filename-safe. */
function timestamp(now) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
        `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
        `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    ].join("-");
}
/**
 * Build the file name for one image. A caller-supplied `output` keeps its
 * directory and extension; siblings from the same call are numbered instead of
 * clobbering each other.
 */
function fileNameFor(requested, result, index, stamp) {
    const extension = EXTENSIONS[result.mimeType.toLowerCase()] ?? "png";
    const wanted = requested?.trim();
    if (wanted === undefined || wanted === "") {
        return index === 0
            ? `generated-${stamp}.${extension}`
            : `generated-${stamp}-${index + 1}.${extension}`;
    }
    const suffix = extname(wanted);
    const stem = suffix === "" ? wanted : wanted.slice(0, -suffix.length);
    const extensionToUse = suffix === "" ? `.${extension}` : suffix;
    return index === 0
        ? `${stem}${extensionToUse}`
        : `${stem}-${index + 1}${extensionToUse}`;
}
/**
 * Write without ever overwriting: `wx` fails on an existing file, so the loser
 * of a race steps aside to the next numbered name instead of clobbering.
 */
async function writeUnique(file, bytes) {
    const directory = dirname(file);
    const suffix = extname(file);
    const stem = file.slice(0, file.length - suffix.length);
    for (let attempt = 0; attempt < 1000; attempt += 1) {
        const candidate = attempt === 0 ? file : `${stem}-${attempt}${suffix}`;
        try {
            await mkdir(directory, { recursive: true });
            await writeFile(candidate, bytes, { flag: "wx" });
            return candidate;
        }
        catch (error) {
            if (error.code !== "EEXIST")
                throw error;
        }
    }
    throw new Error(`generate_image: no free filename near "${file}" after 1000 attempts`);
}
/**
 * The `generate_image` tool. Like `system_one`, it reads kenari credentials from
 * the model registry rather than holding a key of its own.
 */
export const generateImageTool = {
    name: "generate_image",
    label: "Generate Image",
    description: "Draw an image from a text prompt with a kenari image model. The picture is rendered in the conversation and also saved into the working directory, so it can be opened, edited, or referenced by path afterwards. " +
        `Defaults to the free ${DEFAULT_IMAGE_MODEL}; other free models are agnes-image-2-1-flash:free and agnes-image-2-0-flash:free, and paid ones include gpt-image-2, nano-banana-pro, grok-imagine-image and qwen-image-3.0-pro. ` +
        'The model does not see the conversation: put the whole description in "prompt", and say so explicitly when the image should match an existing style or subject. ' +
        'Use "output" to choose the file name (e.g. "logo.png") instead of the timestamped default, and "n" for several variations in one call.',
    parameters: generateImageParams,
    outputSchema: generateImageOutput,
    promptSnippet: "Use generate_image to draw pictures; it renders them inline and saves them into the working directory",
    promptGuidelines: [
        "When the user asks for an image, a picture, a drawing, a logo, or a visual mockup, call generate_image instead of describing what the image would look like.",
        "Write the prompt as a self-contained description: subject, composition, style, colours, lighting, and any text that must appear. The image model cannot see the conversation or read files.",
        'Name the output file when the picture has an obvious role ("logo.png", "hero.png") so later steps can reference it by path; otherwise let the timestamped default stand.',
        'After a successful call, refer to the saved file path rather than pasting base64, and do not re-generate the same prompt to "check" it.',
    ],
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        const prompt = params.prompt.trim();
        if (prompt === "") {
            throw new Error('generate_image: "prompt" is required and cannot be empty.');
        }
        const apiKey = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_KENARI);
        if (!apiKey) {
            throw new Error('generate_image: no kenari credentials. Run "/login kenari" or set KENARI_API_KEY.');
        }
        const model = params.model?.trim() || DEFAULT_IMAGE_MODEL;
        const results = await generateImageBytes({
            prompt,
            model,
            apiKey,
            signal,
            timeoutMs: IMAGE_TIMEOUT_MS,
            ...(params.n !== undefined ? { n: params.n } : {}),
            ...(params.size !== undefined ? { size: params.size } : {}),
            ...(params.quality !== undefined ? { quality: params.quality } : {}),
            ...(params.style !== undefined ? { style: params.style } : {}),
            ...(params.background !== undefined
                ? { background: params.background }
                : {}),
        });
        if (results.length === 0) {
            throw new Error(`generate_image: ${model} returned no images.`);
        }
        const stamp = timestamp(new Date());
        const cwd = ctx.cwd;
        const written = [];
        const sizes = [];
        const revisedPrompts = [];
        const blocks = [];
        for (const [index, result] of results.entries()) {
            const name = fileNameFor(params.output, result, index, stamp);
            const absolute = await writeUnique(resolve(cwd, name), result.bytes);
            const shown = isAbsolute(name) ? absolute : relative(cwd, absolute);
            written.push(shown);
            sizes.push(result.bytes.byteLength);
            if (result.revisedPrompt !== undefined) {
                revisedPrompts.push(result.revisedPrompt);
            }
            blocks.push({
                type: "image",
                data: Buffer.from(result.bytes).toString("base64"),
                mimeType: result.mimeType,
            });
        }
        const summary = written
            .map((file, index) => `- ${file} (${sizes[index] ?? 0} bytes)`)
            .join("\n");
        blocks.push({
            type: "text",
            text: `Generated ${written.length} image${written.length === 1 ? "" : "s"} with ${model}, saved in the working directory:\n${summary}`,
        });
        return {
            content: blocks,
            details: {
                model,
                prompt,
                files: written,
                bytes: sizes,
                revisedPrompts,
            },
        };
    },
};
