import { afterEach, describe, expect, it, vi } from "vitest";
import { kenariWebSearchTool } from "../src/tools/web.js";

describe("kenari_web_search tool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function context(apiKey: string | null = "kn-test") {
    return {
      cwd: process.cwd(),
      modelRegistry: { getApiKeyForProvider: async () => apiKey },
    };
  }

  function stubFetch(results: unknown[], meta: Record<string, unknown> = {}) {
    const body = { id: "req-1", cost_micro_idr: 250, results, ...meta };
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("searches with the /login key and renders each result", async () => {
    const fetchMock = stubFetch([
      {
        title: "Kuala Lumpur weather",
        url: "https://example.com/kl",
        content: "Showers likely in the evening.",
      },
      { title: "", url: "https://example.com/other", content: "" },
    ]);

    const result = await kenariWebSearchTool.execute(
      "call-1",
      { query: "  Kuala Lumpur weather today  " } as never,
      undefined,
      undefined,
      context() as never,
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kenari.id/v1/web/search");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer kn-test" });
    // The query is trimmed before it leaves.
    expect(JSON.parse(String(init.body))).toEqual({
      query: "Kuala Lumpur weather today",
    });

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("2 results");
    expect(text).toContain("Kuala Lumpur weather");
    expect(text).toContain("https://example.com/kl");
    expect(text).toContain("Showers likely in the evening.");
    // A missing title falls back to a placeholder instead of "undefined".
    expect(text).toContain("(untitled)");
    expect(text).not.toContain("undefined");

    expect(result.details.query).toBe("Kuala Lumpur weather today");
    expect(result.details.results).toHaveLength(2);
    expect(result.details.costMicroIdr).toBe(250);
    expect(result.details.requestId).toBe("req-1");
  });

  it("forwards max_results when given and omits it otherwise", async () => {
    const withLimit = stubFetch([]);
    await kenariWebSearchTool.execute(
      "call-2",
      { query: "cats", max_results: 3 } as never,
      undefined,
      undefined,
      context() as never,
    );
    const [, withLimitInit] = withLimit.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(withLimitInit.body))).toEqual({
      query: "cats",
      max_results: 3,
    });

    const withoutLimit = stubFetch([]);
    await kenariWebSearchTool.execute(
      "call-3",
      { query: "cats" } as never,
      undefined,
      undefined,
      context() as never,
    );
    const [, withoutLimitInit] = withoutLimit.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(withoutLimitInit.body))).toEqual({
      query: "cats",
    });
  });

  it("reports an empty result set instead of throwing", async () => {
    stubFetch([]);

    const result = await kenariWebSearchTool.execute(
      "call-4",
      { query: "nothing at all" } as never,
      undefined,
      undefined,
      context() as never,
    );

    expect((result.content[0] as { text: string }).text).toContain(
      'No results for "nothing at all".',
    );
    expect(result.details.results).toEqual([]);
  });

  it("rejects an empty query before calling the API", async () => {
    const fetchMock = stubFetch([]);

    await expect(
      kenariWebSearchTool.execute(
        "call-5",
        { query: "   " } as never,
        undefined,
        undefined,
        context() as never,
      ),
    ).rejects.toThrow(/query/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains missing kenari credentials", async () => {
    const fetchMock = stubFetch([]);

    await expect(
      kenariWebSearchTool.execute(
        "call-6",
        { query: "cats" } as never,
        undefined,
        undefined,
        context(null) as never,
      ),
    ).rejects.toThrow(/no kenari credentials/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces kenari's own error message", async () => {
    const body = { error: { message: "quota exhausted" } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 402,
        json: async () => body,
        text: async () => JSON.stringify(body),
      })),
    );

    await expect(
      kenariWebSearchTool.execute(
        "call-7",
        { query: "cats" } as never,
        undefined,
        undefined,
        context() as never,
      ),
    ).rejects.toThrow(/quota exhausted/);
  });
});
