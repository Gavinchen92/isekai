import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageSchema } from "../../domain";
import { generateMockAdventureCandidates } from "../adventure-candidates";
import { createAdventureFromCandidate } from "../adventures";
import { listJourneyMemory } from "../journey-memory";
import { createSession } from "../sessions";
import {
  createOpenAiGmProvider,
  parseGmTurnResultJson,
  resolveOpenAiGmProviderConfig
} from "./openai-provider";
import { requestOpenAiCompatibleJsonObject } from "./openai-compatible";
import type { GmTurnInput, GmUserMessage } from "./provider";

function createProviderInput(): GmTurnInput {
  const [candidate] = generateMockAdventureCandidates({ worldSeedId: "isekai" });
  if (!candidate) {
    throw new Error("missing candidate");
  }

  const adventure = createAdventureFromCandidate({
    candidate,
    worldSeedId: "isekai"
  });
  const session = createSession({
    adventureId: adventure.id
  });
  const parsedUserMessage = MessageSchema.parse({
    id: "message-current",
    sessionId: session.id,
    role: "user",
    inputKind: "free",
    inferredIntent: "character_action",
    content: "我尝试调查高塔入口的符文",
    createdAt: new Date().toISOString()
  });

  return {
    adventure,
    session,
    userMessage: {
      ...parsedUserMessage,
      role: "user",
      inputKind: "free",
      inferredIntent: "character_action",
      intentConfidence: "high",
      isResultClaim: false,
      normalizedAttempt: "玩家尝试调查高塔入口的符文"
    } satisfies GmUserMessage,
    journeyMemory: listJourneyMemory(session.id),
    messageHistory: [],
    previousInternalStatePatches: [],
    previousSuggestedMoves: []
  };
}

function createGmTurnResultContent(): string {
  return JSON.stringify({
    narration: "你在塔底发现被刻意掩盖的脚印。",
    suggestedMoves: [
      {
        label: "继续检查脚印",
        intent: "玩家尝试确认脚印通向哪里",
        riskLevel: "medium",
        tags: ["调查"]
      }
    ],
    journeyMemoryCandidates: [
      {
        key: "tower",
        type: "clue",
        title: "塔底脚印",
        summary: "塔底出现了被刻意掩盖的脚印。",
        details: ["脚印通向塔内深处。"],
        visibility: "known",
        confidence: "high",
        relatedNpcIds: [],
        relatedLocationIds: ["tower"]
      }
    ],
    internalStatePatch: {
      flags: ["saw-footprints"],
      privateNotes: ["真正留下脚印的是守塔人。"]
    }
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createOpenAiGmProvider", () => {
  it("calls an OpenAI-compatible chat completions endpoint and parses GmTurnResult", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: createGmTurnResultContent()
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

    const provider = createOpenAiGmProvider({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      model: "test-model",
      temperature: 0.3,
      timeoutMs: 10_000
    });
    const result = await provider.generateTurn(createProviderInput());
    const [url, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>;
    const requestInit = init as RequestInit;
    const body = JSON.parse(String(requestInit.body));

    expect(url).toBe("https://example.test/v1/chat/completions");
    expect(new Headers(requestInit.headers).get("authorization")).toBe("Bearer test-key");
    expect(body).toMatchObject({
      model: "test-model",
      response_format: {
        type: "json_object"
      },
      temperature: 0.3
    });
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1].content).toContain("hiddenGmNotes");
    expect(body.thinking).toBeUndefined();
    expect(result.narration).toBe("你在塔底发现被刻意掩盖的脚印。");
    expect(result.suggestedMoves).toHaveLength(1);
  });

  it("surfaces HTTP failures without leaking the API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response("upstream unavailable", {
          status: 503
        })
      )
    );
    const provider = createOpenAiGmProvider({
      apiKey: "secret-key",
      baseUrl: "https://example.test/v1",
      model: "test-model"
    });

    await expect(provider.generateTurn(createProviderInput())).rejects.toThrow(/503/u);
    await expect(provider.generateTurn(createProviderInput())).rejects.not.toThrow(/secret-key/u);
  });
});

describe("resolveOpenAiGmProviderConfig", () => {
  it("requires an API key and model", () => {
    expect(() =>
      resolveOpenAiGmProviderConfig({
        apiKey: "",
        model: ""
      })
    ).toThrow(/Invalid OpenAI-compatible provider config/u);
  });

  it("uses the OpenAI base URL by default", () => {
    const previousBaseUrl = process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_BASE_URL;

    const config = resolveOpenAiGmProviderConfig({
      apiKey: "test-key",
      model: "test-model"
    });

    expect(config.baseUrl).toBe("https://api.openai.com/v1");

    if (previousBaseUrl === undefined) {
      delete process.env.OPENAI_BASE_URL;
    } else {
      process.env.OPENAI_BASE_URL = previousBaseUrl;
    }
  });
});

describe("requestOpenAiCompatibleJsonObject", () => {
  const messages = [
    {
      role: "system" as const,
      content: "system"
    },
    {
      role: "user" as const,
      content: "user"
    }
  ];
  const config = {
    apiKey: "test-key",
    baseUrl: "https://example.test/v1",
    model: "test-model",
    temperature: 0.3,
    timeoutMs: 1_000
  };

  it("supports per-request temperature and thinking overrides", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "{\"ok\":true}"
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

    await requestOpenAiCompatibleJsonObject({
      config,
      label: "preview override",
      messages,
      temperature: 1.1,
      thinking: "disabled"
    });
    const [, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>;
    const body = JSON.parse(String((init as RequestInit).body));

    expect(body.temperature).toBe(1.1);
    expect(body.thinking).toEqual({
      type: "disabled"
    });
  });

  it("does not send thinking without a per-request override", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "{\"ok\":true}"
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

    await requestOpenAiCompatibleJsonObject({
      config,
      label: "no thinking override",
      messages
    });
    const [, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>;
    const body = JSON.parse(String((init as RequestInit).body));

    expect(body.temperature).toBe(0.3);
    expect(body.thinking).toBeUndefined();
  });

  it("applies timeout while reading the response body", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_url, init) => {
        const signal = (init as RequestInit).signal as AbortSignal;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode("{"));
            signal.addEventListener("abort", () => {
              controller.error(signal.reason);
            });
          }
        });

        return new Response(stream, {
          status: 200
        });
      })
    );

    const request = requestOpenAiCompatibleJsonObject({
      config,
      label: "timeout body",
      messages
    });
    const expectation = expect(request).rejects.toMatchObject({
      name: "AbortError"
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
  });

  it("propagates an external abort signal", async () => {
    const abortController = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_url, init) => {
        const signal = (init as RequestInit).signal as AbortSignal;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            signal.addEventListener("abort", () => {
              controller.error(signal.reason);
            });
          }
        });

        return new Response(stream, {
          status: 200
        });
      })
    );

    const request = requestOpenAiCompatibleJsonObject({
      config: {
        ...config,
        timeoutMs: 10_000
      },
      label: "external abort",
      messages,
      signal: abortController.signal
    });

    await Promise.resolve();
    abortController.abort(new DOMException("closed", "AbortError"));

    await expect(request).rejects.toMatchObject({
      name: "AbortError"
    });
  });
});

describe("parseGmTurnResultJson", () => {
  it("rejects non-JSON model output", () => {
    expect(() => parseGmTurnResultJson("not json")).toThrow(/not valid JSON/u);
  });

  it("normalizes result-like suggested move wording into attempts", () => {
    const result = parseGmTurnResultJson(
      JSON.stringify({
        narration: "门后传来压低的争执声。",
        suggestedMoves: [
          {
            label: "直接杀死守门人",
            intent: "玩家直接杀死守门人并闯进去",
            riskLevel: "high",
            tags: ["冲突"]
          }
        ],
        journeyMemoryCandidates: [],
        internalStatePatch: {
          flags: [],
          privateNotes: []
        }
      })
    );

    expect(result.suggestedMoves[0]).toMatchObject({
      intent: "玩家尝试杀死守门人并闯进去",
      label: "尝试杀死守门人"
    });
  });

  it("normalizes non-English suggested move risk levels", () => {
    const result = parseGmTurnResultJson(
      JSON.stringify({
        narration: "守卫的脚步声从楼梯上传来。",
        suggestedMoves: [
          {
            label: "尝试藏进帷幕后",
            intent: "玩家尝试避开守卫视线",
            riskLevel: "高风险",
            tags: ["潜行"]
          }
        ],
        journeyMemoryCandidates: [],
        internalStatePatch: {
          flags: [],
          privateNotes: []
        }
      })
    );

    expect(result.suggestedMoves[0]?.riskLevel).toBe("high");
  });
});
