import { describe, expect, it } from "vitest";
import register from "../src/index.js";

/**
 * The extension registers classifier *models* and the classifier *transport*.
 * pi only attaches `provider.classify` when the config carries a `classifiers`
 * map, so a model without a matching implementation is silently unusable from
 * `models.classify()` — this test pins the pair together.
 */
describe("provider registration", () => {
  function capture() {
    const providers: { id: string; config: Record<string, never> }[] = [];
    const tools: string[] = [];
    const pi = {
      registerProvider: (id: string, config: unknown) => {
        providers.push({ id, config: config as Record<string, never> });
      },
      registerTool: (tool: { name: string }) => {
        tools.push(tool.name);
      },
      on: () => {},
    };
    register(pi as never);
    return { providers, tools };
  }

  it("registers the System One classifier transport alongside its models", () => {
    const { providers } = capture();
    const [provider] = providers;
    const config = provider?.config as unknown as {
      models: { type?: string; api?: string }[];
      classifiers?: Record<string, { classify: unknown }>;
    };

    expect(provider?.id).toBe("kenari");
    expect(config.classifiers?.["typesafe-system-one"]?.classify).toBeTypeOf(
      "function",
    );

    // Every classifier model's api must have an implementation, or pi leaves
    // provider.classify undefined and classification fails at call time.
    const classifierApis = new Set(
      config.models
        .filter((model) => model.type === "classifier")
        .map((model) => model.api),
    );
    expect(classifierApis.size).toBeGreaterThan(0);
    for (const api of classifierApis) {
      expect(config.classifiers?.[api as string]?.classify).toBeTypeOf(
        "function",
      );
    }
  });

  it("registers every tool", () => {
    const { tools } = capture();
    expect(tools).toContain("system_one");
    expect(tools).toContain("generate_image");
    // Distinct from pi's built-in `web_search` on purpose.
    expect(tools).toContain("kenari_web_search");
  });
});
