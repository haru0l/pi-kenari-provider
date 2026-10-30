import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateImageTool } from "../src/tools/image.js";

/** 1x1 transparent PNG. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

describe("generate_image tool", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    vi.unstubAllGlobals();
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function workspace(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "kenari-image-"));
    dirs.push(dir);
    return dir;
  }

  function context(cwd: string, apiKey: string | null = "kn-test") {
    return {
      cwd,
      modelRegistry: { getApiKeyForProvider: async () => apiKey },
    };
  }

  function stubFetch(count: number) {
    const body = {
      data: Array.from({ length: count }, () => ({
        b64_json: PNG_BASE64,
        revised_prompt: "a revised prompt",
      })),
    };
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("renders the image inline and writes it into the working directory", async () => {
    const cwd = await workspace();
    const fetchMock = stubFetch(1);

    const result = await generateImageTool.execute(
      "call-1",
      { prompt: "a cat on a rug" } as never,
      undefined,
      undefined,
      context(cwd) as never,
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kenari.id/v1/images/generations");
    expect(init.headers).toMatchObject({ Authorization: "Bearer kn-test" });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      prompt: "a cat on a rug",
      model: "agnes-image-2-5-flash:free",
    });

    // The bytes travel as an image block so chat renders them inline.
    expect(result.content[0]).toMatchObject({
      type: "image",
      mimeType: "image/png",
    });
    expect(result.content[0]).toHaveProperty("data", PNG_BASE64);

    const [file] = result.details.files as string[];
    expect(file).toMatch(/^generated-\d{8}-\d{6}\.png$/);
    const written = await readFile(join(cwd, file as string));
    expect(written.toString("base64")).toBe(PNG_BASE64);

    const text = result.content[result.content.length - 1];
    expect(text).toMatchObject({ type: "text" });
    expect((text as { text: string }).text).toContain(file as string);
    expect(result.details.revisedPrompts).toEqual(["a revised prompt"]);
  });

  it("numbers the images of one call and keeps the requested name", async () => {
    const cwd = await workspace();
    stubFetch(2);

    const result = await generateImageTool.execute(
      "call-2",
      { prompt: "two cats", n: 2, output: "art.png" } as never,
      undefined,
      undefined,
      context(cwd) as never,
    );

    expect(result.details.files).toEqual(["art.png", "art-2.png"]);
    for (const file of result.details.files as string[]) {
      expect((await readFile(join(cwd, file))).toString("base64")).toBe(
        PNG_BASE64,
      );
    }
    expect(
      result.content.filter((block) => block.type === "image"),
    ).toHaveLength(2);
  });

  it("never overwrites an existing file", async () => {
    const cwd = await workspace();
    await writeFile(join(cwd, "art.png"), "keep me");
    stubFetch(1);

    const result = await generateImageTool.execute(
      "call-3",
      { prompt: "another cat", output: "art.png" } as never,
      undefined,
      undefined,
      context(cwd) as never,
    );

    expect(result.details.files).toEqual(["art-1.png"]);
    expect(await readFile(join(cwd, "art.png"), "utf8")).toBe("keep me");
  });

  it("rejects an empty prompt before calling the API", async () => {
    const cwd = await workspace();
    const fetchMock = stubFetch(1);

    await expect(
      generateImageTool.execute(
        "call-4",
        { prompt: "   " } as never,
        undefined,
        undefined,
        context(cwd) as never,
      ),
    ).rejects.toThrow(/prompt/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains missing kenari credentials", async () => {
    const cwd = await workspace();

    await expect(
      generateImageTool.execute(
        "call-5",
        { prompt: "a cat" } as never,
        undefined,
        undefined,
        context(cwd, null) as never,
      ),
    ).rejects.toThrow(/no kenari credentials/);
  });
});
