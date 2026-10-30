import { afterEach, describe, expect, it, vi } from "vitest";
import { webFetch, webSearch, xSearch } from "../src/api/web.js";

describe("web search", () => {
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

  it("posts the query to /v1/web/search", async () => {
    const fetchMock = stubFetch({
      results: [
        {
          title: "Announcing Rust 1.87.0",
          url: "https://blog.rust-lang.org/2025/05/15/Rust-1.87.0.html",
          content: "The Rust team is happy to announce...",
        },
      ],
      id: "req_2c9d0a7e",
      cost_micro_idr: 0,
    });

    const result = await webSearch({
      apiKey: "kn-test",
      query: "latest stable Rust release",
      max_results: 5,
    });

    expect(result.results[0]?.title).toBe("Announcing Rust 1.87.0");
    expect(result.cost_micro_idr).toBe(0);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kenari.id/v1/web/search");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer kn-test",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      query: "latest stable Rust release",
      max_results: 5,
    });
  });

  it("leaves max_results out when not given, so kenari defaults to 5", async () => {
    const fetchMock = stubFetch({ results: [] });

    await webSearch({ apiKey: "kn-test", query: "rust" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ query: "rust" });
  });

  it("requires an api key", async () => {
    await expect(webSearch({ query: "rust" })).rejects.toThrow(
      /API key required for web search/,
    );
  });

  it("surfaces kenari's error.message", async () => {
    stubFetch({ error: { message: "query must not be empty" } }, 400);

    await expect(webSearch({ apiKey: "kn-test", query: "" })).rejects.toThrow(
      /web search failed \(400\): query must not be empty/,
    );
  });
});

describe("web fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the url to /v1/web/fetch", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        title: "Rust 1.87.0",
        content: "The Rust team...",
        links: ["https://www.rust-lang.org/"],
        id: "req_6b1f4c88",
        cost_micro_idr: 0,
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await webFetch({
      apiKey: "kn-test",
      url: "https://blog.rust-lang.org/2025/05/15/Rust-1.87.0.html",
    });

    expect(result.links).toEqual(["https://www.rust-lang.org/"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kenari.id/v1/web/fetch");
    expect(JSON.parse(init.body as string)).toEqual({
      url: "https://blog.rust-lang.org/2025/05/15/Rust-1.87.0.html",
    });
  });
});

describe("x search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the query and filter to /v1/x/search", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        answer: "People are discussing faster builds",
        citations: [
          { url: "https://x.com/rustlang/status/1234567890", title: null },
        ],
        id: "req_9a40d1b3",
        cost_micro_idr: 0,
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await xSearch({
      apiKey: "kn-test",
      query: "reactions to the latest Rust release",
      x_search_filter: {
        from_date: "2026-01-01",
        allowed_x_handles: ["rustlang"],
      },
    });

    expect(result.citations[0]?.title).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kenari.id/v1/x/search");
    expect(JSON.parse(init.body as string)).toEqual({
      query: "reactions to the latest Rust release",
      x_search_filter: {
        from_date: "2026-01-01",
        allowed_x_handles: ["rustlang"],
      },
    });
  });

  it("omits the filter when not given", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ answer: "", citations: [] }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await xSearch({ apiKey: "kn-test", query: "rust" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ query: "rust" });
  });
});
