import { describe, expect, it } from "vitest";
import {
  KENARI_BASELINE_MODELS,
  microIdrCost,
  toKenariModel,
  toKenariModels,
} from "../src/models.js";
import type { KenariApiModel } from "../src/types.js";

// Live-catalog-shaped entry (claude-fable-5-like pricing, micro-IDR per 1M tokens).
const sample: KenariApiModel = {
  id: "claude-fable-5",
  owned_by: "anthropic",
  context_length: 1_000_000,
  modalities: { input: ["text", "image", "pdf"], output: ["text"] },
  pricing: {
    currency: "IDR",
    unit: "micro_idr_per_1m_tokens",
    free: false,
    input: 210_000_000_000,
    output: 1_000_000_000_000,
    cache_read: 21_000_000_000,
    cache_write: 260_000_000_000,
  },
  reasoning: true,
  reasoning_options: ["low", "medium", "high", "xhigh", "max"],
  tool_call: true,
  sunset_at: null,
};

describe("microIdrCost", () => {
  it("converts micro-IDR/1M tokens to USD/1M tokens", () => {
    const cost = microIdrCost({
      input: 210_000_000_000,
      output: 1_000_000_000_000,
    });
    // 210_000_000_000 micro-IDR = Rp 210,000/1M ≈ $12.7/1M at 16,500
    expect(cost.input).toBeCloseTo(210_000 / 16_500, 6);
    expect(cost.output).toBeCloseTo(1_000_000 / 16_500, 6);
  });

  it("falls back to the input rate for cache-write when unset", () => {
    const cost = microIdrCost({
      input: 4_200_000_000,
      cache_read: 840_000_000,
      cache_write: null,
    });
    expect(cost.cacheRead).toBeCloseTo(840 / 16_500, 6);
    expect(cost.cacheWrite).toBe(cost.input);
  });

  it("yields zero rates for missing pricing", () => {
    const cost = microIdrCost({});
    expect(cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });
});

describe("toKenariModel", () => {
  it("maps real catalog fields", () => {
    const model = toKenariModel(sample)!;
    expect(model.id).toBe("claude-fable-5");
    expect(model.contextWindow).toBe(1_000_000);
    expect(model.input).toEqual(["text", "image"]);
    expect(model.reasoning).toBe(true);
    expect(model.isFree).toBe(false);
    expect(model.cost.input).toBeGreaterThan(0);
  });

  it("maps reasoning_options to a thinking level map clamped to the model's options", () => {
    const model = toKenariModel({
      ...sample,
      reasoning_options: ["low", "medium", "high"],
    })!;
    expect(model.thinkingLevelMap?.off).toBe("none");
    expect(model.thinkingLevelMap?.medium).toBe("medium");
    expect(model.thinkingLevelMap?.max).toBe("high"); // clamped down
    expect(model.thinkingLevelMap?.minimal).toBe("low");
  });

  it("marks :free variants and pricing.free as free", () => {
    const freeModel = toKenariModel({ ...sample, id: "step-3-7-flash:free" })!;
    expect(freeModel.isFree).toBe(true);
    // :free entries carry paid rates in the catalog but are billed Rp 0.
    expect(freeModel.cost.input).toBe(0);
    expect(
      toKenariModel({
        ...sample,
        id: "x",
        pricing: { ...sample.pricing, free: true },
      })!.isFree,
    ).toBe(true);
  });

  it("keeps text-only input for text models and skips id-less entries", () => {
    expect(
      toKenariModel({ ...sample, modalities: { input: ["text"] } })!.input,
    ).toEqual(["text"]);
    expect(toKenariModel({ ...sample, id: "" })).toBeNull();
  });
});

describe("toKenariModels", () => {
  it("converts a catalog and drops nothing valid", () => {
    const models = toKenariModels([sample, { id: "bge-m3" }]);
    expect(models).toHaveLength(2);
    expect(models[1]!.name).toBe("bge-m3");
  });
});

describe("kenari-free route", () => {
  it("is in the baseline catalog and costs nothing", () => {
    const route = KENARI_BASELINE_MODELS.find((m) => m.id === "kenari-free");
    expect(route).toBeDefined();
    expect(route!.isFree).toBe(true);
    expect(route!.cost.input).toBe(0);
  });
});
