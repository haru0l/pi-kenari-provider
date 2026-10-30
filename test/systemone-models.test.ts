import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchKenariSystemOneModelCatalog,
  getKenariSystemOneBaselineModels,
  getKenariSystemOneInputRate,
  KENARI_SYSTEMONE_BASELINE_MODELS,
  KENARI_SYSTEMONE_MODEL_INFO,
  resetKenariSystemOneModelCatalog,
  toKenariSystemOneModel,
  toKenariSystemOneModels,
  toProviderClassifierConfigs,
} from "../src/systemone.js";
import { prepareSystemOneArgs, systemOneTool } from "../src/tools/systemone.js";
import { resolveSystemOneModel } from "../src/tools/systemone-model.js";
import type { KenariApiModel } from "../src/types.js";

function apiModel(overrides: Partial<KenariApiModel> = {}): KenariApiModel {
  return {
    id: "clef:free",
    name: "Clef",
    pricing: { currency: "IDR", free: true, input: null },
    modalities: { input: ["text", "image"] },
    endpoints: ["systemone"],
    ...overrides,
  };
}

describe("System One classifier models", () => {
  it("maps a free image model to a classifier with zero cost", () => {
    const model = toKenariSystemOneModel(apiModel());
    expect(model).toMatchObject({
      id: "clef:free",
      type: "classifier",
      api: "typesafe-system-one",
      provider: "kenari",
      baseUrl: "https://kenari.id/v1",
      input: ["text", "image"],
      isFree: true,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    });
    // Images travel as named assets, without TypeSafe's opt-in header.
    expect(model?.compat).toEqual({
      imageInput: "assets",
      sendImageOptInHeader: false,
    });
  });

  it("keeps text-only models text-only and carries no image compat", () => {
    const model = toKenariSystemOneModel(
      apiModel({
        id: "jev-1-13",
        name: "Jev 1.13",
        pricing: { input: 850_000_000 },
        modalities: { input: ["text"] },
      }),
    );
    expect(model?.input).toEqual(["text"]);
    expect(model?.compat).toBeUndefined();
    expect(model?.isFree).toBe(false);
  });

  it("converts micro-IDR input pricing to USD per million tokens", () => {
    const model = toKenariSystemOneModel(
      apiModel({ id: "clef", pricing: { input: 3_000_000_000 } }),
    );
    // 3000 IDR per 1M tokens at 16500 IDR/USD.
    expect(model?.cost.input).toBeCloseTo(
      3_000_000_000 / (1_000_000 * 16_500),
      12,
    );
    expect(model?.cost.output).toBe(0);
    expect(model?.cost.cacheRead).toBe(0);
  });

  it("drops Clairic, which answers fields extraction and rejects questions", () => {
    expect(toKenariSystemOneModel(apiModel({ id: "clairic:free" }))).toBeNull();
    const models = toKenariSystemOneModels([
      apiModel({ id: "clairic:free" }),
      apiModel({ id: "clef:free" }),
    ]);
    expect(models.map((m) => m.id)).toEqual(["clef:free"]);
  });

  it("falls back to a 64k context window when the catalog omits one", () => {
    expect(toKenariSystemOneModel(apiModel())?.contextWindow).toBe(64_000);
    expect(
      toKenariSystemOneModel(apiModel({ context_length: 32_000 }))
        ?.contextWindow,
    ).toBe(32_000);
  });

  it("ships a baseline of every questions-capable model", () => {
    const ids = getKenariSystemOneBaselineModels().map((m) => m.id);
    expect(ids).toEqual([
      "clef:free",
      "clef",
      "clef-flash:free",
      "clef-omni:free",
      "jev-1-13",
      "jev-1-14",
    ]);
    expect(ids.some((id) => id.startsWith("clairic"))).toBe(false);
    // clef-omni also reads audio and video; a classifier carries text and image.
    const omni = KENARI_SYSTEMONE_BASELINE_MODELS.find(
      (m) => m.id === "clef-omni:free",
    );
    expect(omni?.input).toEqual(["text", "image"]);
  });

  it("registers classifier configs with compat intact", () => {
    const configs = toProviderClassifierConfigs(
      getKenariSystemOneBaselineModels(),
    );
    expect(configs).toHaveLength(6);
    expect(configs[0]).toMatchObject({
      type: "classifier",
      id: "clef:free",
      api: "typesafe-system-one",
      contextWindow: 64_000,
    });
    expect(configs[0]?.compat?.imageInput).toBe("assets");
  });

  it("prices a model by id and returns zero for unknown ids", () => {
    expect(getKenariSystemOneInputRate("jev-1-14")).toBeCloseTo(
      850_000_000 / (1_000_000 * 16_500),
      12,
    );
    expect(getKenariSystemOneInputRate("clef:free")).toBe(0);
    expect(getKenariSystemOneInputRate("nope")).toBe(0);
  });
});

describe("system_one argument normalization", () => {
  it("carries model, fields, assets and reference_date through untouched", () => {
    const args = prepareSystemOneArgs({
      model: "jev-1-14",
      fields: { total: { type: "number" } },
      assets: { receipt: { path: "./receipt.png" } },
      reference_date: "2024-05-01",
      junk: "dropped",
    }) as Record<string, unknown>;
    expect(args.model).toBe("jev-1-14");
    expect(args.fields).toEqual({ total: { type: "number" } });
    expect(args.assets).toEqual({ receipt: { path: "./receipt.png" } });
    expect(args.reference_date).toBe("2024-05-01");
    expect(args.junk).toBeUndefined();
  });

  it("carries the models action through normalization", () => {
    // The action must survive the unknown-key drop, or the tool never sees it.
    expect(prepareSystemOneArgs({ action: "models" })).toEqual({
      action: "models",
    });
  });

  it("normalizes box aliases to the box question type", () => {
    const args = prepareSystemOneArgs({
      state: "an image of a desk",
      questions: {
        where: { type: "bbox", instructions: "Find the keyboard." },
      },
    }) as { questions: Record<string, { type: string }> };
    expect(args.questions.where?.type).toBe("box");
  });
});

describe("system_one tool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function context(apiKey: string | null = "kn-test") {
    return {
      cwd: process.cwd(),
      modelRegistry: {
        getApiKeyForProvider: async () => apiKey,
      },
    };
  }

  function stubFetch(body: unknown) {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const okBody = {
    // kenari echoes a versioned id for the id we asked for ("jev-1-14" ->
    // "jev-1.14.0"); pricing must not depend on that echo.
    model: "jev-1.14.0",
    answers: { q: { type: "noul", noul: 0.91 } },
    usage: { input_tokens: 1_000_000, output_tokens: 0 },
  };

  it("judges questions and prices the call at the catalog rate", async () => {
    const fetchMock = stubFetch(okBody);
    const result = await systemOneTool.execute(
      "call-1",
      {
        model: "jev-1-14",
        state: "the deploy failed twice",
        questions: {
          q: { type: "noul", instructions: "Is this a production incident?" },
        },
      } as never,
      undefined,
      undefined,
      context() as never,
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://kenari.id/v1/systemone");
    expect(init.headers).toMatchObject({ Authorization: "Bearer kn-test" });
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("jev-1-14");
    expect(body.state).toBe("the deploy failed twice");

    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.details.answers).toEqual({ q: { type: "noul", noul: 0.91 } });
    // 1M input tokens at 850 IDR per 1M, priced in USD.
    expect(result.usage?.cost.total).toBeCloseTo(850 / 16_500, 10);
  });

  it("sends Clairic fields instead of questions", async () => {
    const fetchMock = stubFetch({
      model: "clairic:free",
      answers: { total: { type: "field", value: 42_000 } },
      usage: { input_tokens: 10, output_tokens: 0 },
    });

    await systemOneTool.execute(
      "call-2",
      {
        model: "clairic:free",
        state: "total: 42.000",
        fields: { total: { type: "number", unit: "IDR" } },
        reference_date: "2024-05-01",
      } as never,
      undefined,
      undefined,
      context() as never,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.fields).toEqual({ total: { type: "number", unit: "IDR" } });
    expect(body.questions).toBeUndefined();
    expect(body.reference_date).toBe("2024-05-01");
  });

  it("rejects a request that sends both questions and fields", async () => {
    await expect(
      systemOneTool.execute(
        "call-3",
        {
          state: "x",
          questions: { q: { type: "noul", instructions: "?" } },
          fields: { total: { type: "number" } },
        } as never,
        undefined,
        undefined,
        context() as never,
      ),
    ).rejects.toThrow(/either "questions" or "fields"/);
  });

  it("names the unknown field type", async () => {
    await expect(
      systemOneTool.execute(
        "call-4",
        { state: "x", fields: { total: { type: "money" } } } as never,
        undefined,
        undefined,
        context() as never,
      ),
    ).rejects.toThrow(/"total" has unknown type "money"/);
  });

  it("requires state when no image is sent", async () => {
    await expect(
      systemOneTool.execute(
        "call-5",
        { questions: { q: { type: "noul", instructions: "?" } } } as never,
        undefined,
        undefined,
        context() as never,
      ),
    ).rejects.toThrow(/state is required/);
  });

  it("explains missing kenari credentials", async () => {
    await expect(
      systemOneTool.execute(
        "call-6",
        {
          state: "x",
          questions: { q: { type: "noul", instructions: "?" } },
        } as never,
        undefined,
        undefined,
        context(null) as never,
      ),
    ).rejects.toThrow(/no kenari credentials/);
  });
});

describe("system_one model choice", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetKenariSystemOneModelCatalog();
  });

  const catalog = KENARI_SYSTEMONE_MODEL_INFO;

  it("lists Clairic as the only fields model", () => {
    const clairic = catalog.find((m) => m.id === "clairic:free");
    expect(clairic?.capabilities).toEqual(["fields"]);
    expect(
      catalog.filter((m) => m.capabilities.includes("questions")).length,
    ).toBe(6);
  });

  it("resolves a provider-qualified id and a case variant", () => {
    expect(resolveSystemOneModel("kenari/clef:free", need()).info.id).toBe(
      "clef:free",
    );
    expect(resolveSystemOneModel("CLEF:Free", need()).info.id).toBe(
      "clef:free",
    );
  });

  it("expands the documented shorthands", () => {
    expect(resolveSystemOneModel("jev", need()).info.id).toBe("jev-1-14");
    expect(resolveSystemOneModel("flash", need()).info.id).toBe(
      "clef-flash:free",
    );
    expect(resolveSystemOneModel("omni", need()).info.id).toBe(
      "clef-omni:free",
    );
  });

  it("suggests the catalog id for a version echo instead of guessing", () => {
    expect(() => resolveSystemOneModel("jev-1.14.0", need())).toThrow(
      /Did you mean "jev-1-14"/,
    );
  });

  it("names the nearest ids for a typo", () => {
    expect(() => resolveSystemOneModel("clef-falsh:free", need())).toThrow(
      /Did you mean "clef-flash:free"/,
    );
  });

  it("rejects fields on a questions model, naming the fields model", () => {
    expect(() =>
      resolveSystemOneModel("clef:free", { fields: true, images: false }),
    ).toThrow(/answers questions, not fields extraction.*clairic:free/);
  });

  it("rejects questions on Clairic, naming a questions default", () => {
    expect(() => resolveSystemOneModel("clairic:free", need())).toThrow(
      /extracts fields only.*clef:free/,
    );
  });

  it("rejects an image on a text-only model, listing what can read it", () => {
    expect(() =>
      resolveSystemOneModel("clef", { fields: false, images: true }),
    ).toThrow(/takes text input only.*clef:free/);
  });

  it("defaults to Clairic for fields and Clef for questions", () => {
    expect(
      resolveSystemOneModel(undefined, { fields: true, images: false }).id,
    ).toBe("clairic:free");
    expect(resolveSystemOneModel(undefined, need()).id).toBe("clef:free");
  });

  it("defaults an image request to an image-capable model", () => {
    const resolved = resolveSystemOneModel(undefined, {
      fields: false,
      images: true,
    });
    expect(resolved.info.input).toContain("image");
  });
});

/** A plain questions request: no fields, no images. */
function need(): { fields: boolean; images: boolean } {
  return { fields: false, images: false };
}

describe("system_one action: models", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetKenariSystemOneModelCatalog();
  });

  function stubCatalog(body: unknown, ok = true) {
    const fetchMock = vi.fn(async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const liveCatalog = {
    data: [
      apiModel({
        id: "clef:free",
        name: "Clef",
        pricing: { free: true, input: null },
        modalities: { input: ["text", "image"] },
      }),
      apiModel({
        id: "clef",
        name: "Clef (paid)",
        pricing: { input: 3_000_000_000 },
        modalities: { input: ["text"] },
      }),
      apiModel({
        id: "clairic:free",
        name: "Clairic",
        pricing: { free: true, input: null },
        modalities: { input: ["text", "image"] },
      }),
    ],
  };

  /** The models action needs no credentials, so the registry can fail loudly. */
  function noCredentialsContext() {
    return {
      cwd: process.cwd(),
      modelRegistry: {
        getApiKeyForProvider: async () => {
          throw new Error("credentials must not be required");
        },
      },
    };
  }

  it("lists the catalog without needing credentials or state", async () => {
    const fetchMock = stubCatalog(liveCatalog);
    const result = await systemOneTool.execute(
      "call-models",
      { action: "models" } as never,
      undefined,
      undefined,
      noCredentialsContext() as never,
    );

    // One fetch, to the public catalog endpoint, and nothing judgment-shaped.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(String(url)).toContain("/models?modality=systemone");

    const details = result.details as { models: { id: string }[] };
    expect(details.models.map((m) => m.id)).toEqual([
      "clef:free",
      "clef",
      "clairic:free",
    ]);
    // Clairic is listed as a fields model, not dropped.
    const clairic = (
      result.details as { models: { id: string; capabilities: string[] }[] }
    ).models.find((m) => m.id === "clairic:free");
    expect(clairic?.capabilities).toEqual(["fields"]);

    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.usage?.cost.total).toBe(0);
  });

  it("renders prices, modalities and the two defaults", async () => {
    stubCatalog(liveCatalog);
    const result = await systemOneTool.execute(
      "call-models",
      { action: "models" } as never,
      undefined,
      undefined,
      noCredentialsContext() as never,
    );

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("clef:free");
    expect(text).toContain("3,000 IDR/1M in");
    expect(text).toContain("Defaults: clef:free for questions, clairic:free");
  });

  it("falls back to the static catalog when the fetch fails", async () => {
    stubCatalog({}, false);
    const result = await systemOneTool.execute(
      "call-models",
      { action: "models" } as never,
      undefined,
      undefined,
      noCredentialsContext() as never,
    );

    expect(result.details?.source).toBe("baseline");
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("static catalog");
  });

  it("rejects an unknown action", async () => {
    await expect(
      systemOneTool.execute(
        "call-bad",
        { action: "list" } as never,
        undefined,
        undefined,
        noCredentialsContext() as never,
      ),
    ).rejects.toThrow(/unknown action "list"/);
  });

  it("caches the catalog so a judgment call does not re-fetch it", async () => {
    const fetchMock = stubCatalog(liveCatalog);
    await systemOneTool.execute(
      "call-models",
      { action: "models" } as never,
      undefined,
      undefined,
      noCredentialsContext() as never,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Model resolution now runs against the cached catalog: an id only the
    // live catalog has must resolve without another fetch.
    const resolved = resolveSystemOneModel("clef", {
      fields: false,
      images: false,
    });
    expect(resolved.id).toBe("clef");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("pricing follows the live catalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetKenariSystemOneModelCatalog();
  });

  it("prices a model the baseline does not know at its fetched rate", async () => {
    // A paid model kenari ships after this build: absent from the static
    // baseline, so only the fetched catalog can price it.
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          apiModel({
            id: "jev-2-0",
            name: "Jev 2.0",
            pricing: { input: 2_000_000_000 },
            modalities: { input: ["text"] },
          }),
        ],
      }),
      text: async () => "{}",
    }));
    vi.stubGlobal("fetch", fetchMock);

    // Unknown before the catalog is fetched: no baseline entry, no rate.
    expect(getKenariSystemOneInputRate("jev-2-0")).toBe(0);

    await fetchKenariSystemOneModelCatalog();

    // 2000 IDR per 1M tokens, in USD.
    expect(getKenariSystemOneInputRate("jev-2-0")).toBeCloseTo(
      2_000_000_000 / (1_000_000 * 16_500),
      12,
    );
  });
});
