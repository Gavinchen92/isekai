import { afterEach, describe, expect, it } from "vitest";
import { mockGmProvider } from "./mock-provider";
import { openAiGmProvider } from "./openai-provider";
import { getGmProvider } from "./provider";

const originalGmProvider = process.env.GM_PROVIDER;

afterEach(() => {
  if (originalGmProvider === undefined) {
    delete process.env.GM_PROVIDER;
    return;
  }

  process.env.GM_PROVIDER = originalGmProvider;
});

describe("getGmProvider", () => {
  it("uses mock provider by default", () => {
    delete process.env.GM_PROVIDER;

    expect(getGmProvider()).toBe(mockGmProvider);
  });

  it("supports openai-compatible as the provider name", () => {
    process.env.GM_PROVIDER = "openai-compatible";

    expect(getGmProvider()).toBe(openAiGmProvider);
  });

  it("keeps openai as a backward-compatible alias", () => {
    process.env.GM_PROVIDER = "openai";

    expect(getGmProvider()).toBe(openAiGmProvider);
  });
});
