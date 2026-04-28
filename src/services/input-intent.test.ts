import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyPlayerInput,
  classifyPlayerInputWithRules,
  parseInputIntentClassificationJson
} from "./input-intent";

const originalEnv = {
  GM_OPENAI_API_KEY: process.env.GM_OPENAI_API_KEY,
  GM_OPENAI_MODEL: process.env.GM_OPENAI_MODEL,
  GM_PROVIDER: process.env.GM_PROVIDER
};

afterEach(() => {
  restoreEnv("GM_PROVIDER", originalEnv.GM_PROVIDER);
  restoreEnv("GM_OPENAI_API_KEY", originalEnv.GM_OPENAI_API_KEY);
  restoreEnv("GM_OPENAI_MODEL", originalEnv.GM_OPENAI_MODEL);
  vi.unstubAllGlobals();
});

describe("classifyPlayerInputWithRules", () => {
  it("detects result claims as world override attempts in mock mode", () => {
    expect(
      classifyPlayerInputWithRules({
        content: "杀死魔王并让所有人臣服",
        inputKind: "free"
      })
    ).toMatchObject({
      intent: "world_override_attempt",
      isResultClaim: true
    });
  });

  it("treats attempted dangerous actions as actions", () => {
    expect(
      classifyPlayerInputWithRules({
        content: "试图杀死黑骑士",
        inputKind: "free"
      })
    ).toMatchObject({
      intent: "character_action",
      isResultClaim: false
    });
  });
});

describe("classifyPlayerInput", () => {
  it("handles explicit OOC input without model calls", async () => {
    process.env.GM_PROVIDER = "openai-compatible";
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const result = await classifyPlayerInput({
      content: "/ooc 刚才的人名错了",
      inputKind: "free"
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      intent: "ooc_instruction",
      isResultClaim: false
    });
  });

  it("uses OpenAI-compatible classification when configured", async () => {
    process.env.GM_PROVIDER = "openai-compatible";
    process.env.GM_OPENAI_API_KEY = "test-key";
    process.env.GM_OPENAI_MODEL = "test-model";
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  confidence: "high",
                  intent: "world_override_attempt",
                  isResultClaim: true,
                  normalizedAttempt: "玩家尝试攻击魔王"
                })
              }
            }
          ]
        }),
        {
          status: 200
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await classifyPlayerInput({
      content: "我一刀杀死魔王",
      inputKind: "free"
    });
    const [, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>;
    const body = JSON.parse(String((init as RequestInit).body));

    expect(body.model).toBe("test-model");
    expect(body.messages[0].content).toContain("意图分类器");
    expect(result).toMatchObject({
      intent: "world_override_attempt",
      isResultClaim: true,
      normalizedAttempt: "玩家尝试攻击魔王"
    });
  });
});

describe("parseInputIntentClassificationJson", () => {
  it("rejects malformed model output", () => {
    expect(() => parseInputIntentClassificationJson("not json")).toThrow(/not valid JSON/u);
  });
});

function restoreEnv(key: keyof typeof originalEnv, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
