import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeImage,
  generateImageBytes,
  generateImages,
} from "../src/api/images.js";

describe("generateImages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(body: unknown, status = 200) {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: status < 400,
      status,
      json: async () => body,
      text: async () =>
        typeof body === "string" ? body : JSON.stringify(body),
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("posts the prompt, model and options to /v1/images/generations", async () => {
    const fetchMock = stubFetch({
      created: 1_718_700_000,
      data: [{ b64_json: "AAAA" }],
    });

    await generateImages({
      apiKey: "kn-test",
      model: "gpt-image-2",
      prompt: "a red panda writing code",
      n: 1,
      size: "1024x1024",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kenari.id/v1/images/generations");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer kn-test",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      prompt: "a red panda writing code",
      model: "gpt-image-2",
      n: 1,
      size: "1024x1024",
    });
  });

  it("surfaces kenari's error.message instead of the raw body", async () => {
    stubFetch({ error: { message: "model is not an image model" } }, 400);

    await expect(
      generateImages({ apiKey: "kn-test", model: "nope", prompt: "x" }),
    ).rejects.toThrow(
      /image generation failed \(400\): model is not an image model/,
    );
  });

  it("falls back to the raw body when the error is not JSON", async () => {
    stubFetch("upstream timeout", 504);

    await expect(
      generateImages({ apiKey: "kn-test", model: "gpt-image-2", prompt: "x" }),
    ).rejects.toThrow(/image generation failed \(504\): upstream timeout/);
  });

  it("throws kenari's message when a 200 body carries error instead of data", async () => {
    stubFetch({
      error: { message: "all_providers_failed", code: "all_providers_failed" },
    });

    await expect(
      generateImages({ apiKey: "kn-test", model: "gpt-image-2", prompt: "x" }),
    ).rejects.toThrow(/image generation failed: all_providers_failed/);
  });

  it("requires an api key", async () => {
    await expect(
      generateImages({ model: "gpt-image-2", prompt: "x" }),
    ).rejects.toThrow(/API key required/);
  });
});

describe("decodeImage", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const base64 = Buffer.from(bytes).toString("base64");

  it("decodes b64_json", () => {
    const result = decodeImage({ b64_json: base64 });

    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4]);
    expect(result.mimeType).toBe("image/png");
  });

  it("decodes a data: URI in url, as the curl example does", () => {
    const result = decodeImage({ url: `data:image/webp;base64,${base64}` });

    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4]);
    expect(result.mimeType).toBe("image/webp");
  });

  it("falls back to url when b64_json is an empty string", () => {
    // agnes-image-2-5-flash:free answers with b64_json:"" and a real data URI.
    const result = decodeImage({
      b64_json: "",
      revised_prompt: "",
      url: `data:image/png;base64,${base64}`,
    });

    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4]);
    expect(result.mimeType).toBe("image/png");
    expect(result.revisedPrompt).toBeUndefined();
  });

  it("prefers b64_json when both are present", () => {
    const other = Buffer.from([9, 9]).toString("base64");
    const result = decodeImage({
      b64_json: base64,
      url: `data:image/png;base64,${other}`,
    });

    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4]);
  });

  it("keeps revised_prompt", () => {
    const result = decodeImage({ b64_json: base64, revised_prompt: "a cat" });

    expect(result.revisedPrompt).toBe("a cat");
  });

  it("throws when neither field holds an image", () => {
    expect(() => decodeImage({})).toThrow(/neither b64_json nor a data: URI/);
    expect(() => decodeImage({ url: "https://example.com/a.png" })).toThrow(
      /neither b64_json nor a data: URI/,
    );
  });
});

describe("generateImageBytes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns one decoded image per data entry", async () => {
    const one = Buffer.from([1, 2]).toString("base64");
    const two = Buffer.from([3, 4]).toString("base64");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ b64_json: one }, { url: `data:image/jpeg;base64,${two}` }],
        }),
        text: async () => "",
      })),
    );

    const results = await generateImageBytes({
      apiKey: "kn-test",
      model: "gpt-image-2",
      prompt: "two images",
      n: 2,
    });

    const [first, second] = results;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(Array.from(first?.bytes ?? [])).toEqual([1, 2]);
    expect(Array.from(second?.bytes ?? [])).toEqual([3, 4]);
    expect(second?.mimeType).toBe("image/jpeg");
  });

  it("downloads an image when a model returns a hosted url", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/images/generations")
        ? {
            ok: true,
            status: 200,
            json: async () => ({
              data: [{ url: "https://cdn.example/a.webp" }],
            }),
            text: async () => "",
          }
        : {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "image/webp" }),
            arrayBuffer: async () => bytes.buffer,
          },
    );
    vi.stubGlobal("fetch", fetchMock);

    const [result] = await generateImageBytes({
      apiKey: "kn-test",
      model: "agnes-image-2-5-flash:free",
      prompt: "a hosted image",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://cdn.example/a.webp");
    expect(Array.from(result?.bytes ?? [])).toEqual([9, 8, 7]);
    expect(result?.mimeType).toBe("image/webp");
  });
});
