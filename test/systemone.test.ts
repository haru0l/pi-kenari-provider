import { afterEach, describe, expect, it, vi } from "vitest";
import { runSystemOne } from "../src/api/systemone.js";

describe("runSystemOne", () => {
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

  it("posts questions to /v1/systemone with the bearer key", async () => {
    const fetchMock = stubFetch({
      model: "clef:free",
      answers: { q: { type: "noul", noul: 0.98 } },
      usage: { input_tokens: 12, output_tokens: 0 },
    });

    const result = await runSystemOne({
      apiKey: "kn-test",
      model: "clef:free",
      state: "a cat sitting on a rug",
      questions: {
        q: { type: "noul", instructions: "Is this about an animal?" },
      },
    });

    expect(result.answers.q).toMatchObject({ type: "noul", noul: 0.98 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kenari.id/v1/systemone");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer kn-test",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      model: "clef:free",
      state: "a cat sitting on a rug",
      questions: {
        q: { type: "noul", instructions: "Is this about an animal?" },
      },
    });
  });

  it("sends an object state as its JSON text", async () => {
    const fetchMock = stubFetch({
      model: "clef:free",
      answers: { ok: { type: "noul", noul: 0.9 } },
      usage: { input_tokens: 12, output_tokens: 0 },
    });

    await runSystemOne({
      apiKey: "kn-test",
      model: "clef:free",
      state: { order: "INV-2291", total: 4_250_000 },
      questions: { ok: { type: "noul", instructions: "Above one million?" } },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).state).toBe(
      '{"order":"INV-2291","total":4250000}',
    );
  });

  it("passes Clairic fields, reference_date, and options through", async () => {
    const fetchMock = stubFetch({
      model: "clairic:free",
      answers: {
        total: {
          type: "number",
          value: 4_250_000,
          confidence: 0.99,
          p_null: 0.0001,
        },
      },
      truncated: false,
      usage: { input_tokens: 20, output_tokens: 0 },
    });

    await runSystemOne({
      apiKey: "kn-test",
      model: "clairic:free",
      state: "Invoice INV-2291, issued 3 March 2026.",
      fields: { total: { type: "number", instructions: "The total due" } },
      reference_date: "2026-01-01",
      options: { return_state_text: true },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent.fields).toEqual({
      total: { type: "number", instructions: "The total due" },
    });
    expect(sent.reference_date).toBe("2026-01-01");
    expect(sent.options).toEqual({ return_state_text: true });
    // the client-only apiKey must never reach the wire
    expect(sent).not.toHaveProperty("apiKey");
  });

  it("throws kenari's message on a rejected request", async () => {
    stubFetch('{"error":{"message":"state is required"}}', 400);

    await expect(
      runSystemOne({
        apiKey: "kn-test",
        model: "clef:free",
        questions: { q: { type: "noul", instructions: "yes?" } },
      }),
    ).rejects.toThrow(/systemone failed \(400\).*state is required/);
  });

  it("requires an api key", async () => {
    await expect(
      runSystemOne({ model: "clef:free", questions: {} }),
    ).rejects.toThrow(/API key required/);
  });
});
