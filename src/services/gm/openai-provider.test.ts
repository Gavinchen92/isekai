import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageSchema } from "../../domain";
import { appLogger } from "../../shared/logger";
import { generateMockAdventureCandidates } from "../adventure-candidates";
import { createAdventureFromCandidate } from "../adventures";
import { listJourneyMemory } from "../journey-memory";
import { createSession } from "../sessions";
import {
  createOpenAiGmProvider,
  extractTopLevelNarrationPrefix,
  parseGmTurnResultJson,
  resolveOpenAiGmProviderConfig
} from "./openai-provider";
import {
  requestOpenAiCompatibleJsonObject,
  requestOpenAiCompatibleJsonObjectStream
} from "./openai-compatible";
import type { GmTurnInput, GmTurnStreamEvent, GmUserMessage } from "./provider";

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

async function collectTextStream(stream: AsyncGenerator<string, string>): Promise<{
  chunks: string[];
  content: string;
}> {
  const chunks: string[] = [];
  let next = await stream.next();

  while (!next.done) {
    chunks.push(next.value);
    next = await stream.next();
  }

  return {
    chunks,
    content: next.value
  };
}

function createStreamChunk(content: string): string {
  return `data: ${JSON.stringify({
    choices: [
      {
        delta: {
          content
        }
      }
    ]
  })}\n\n`;
}

afterEach(() => {
  vi.restoreAllMocks();
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

  it("streams narration chunks from an OpenAI-compatible chat completion", async () => {
    const content = createGmTurnResultContent();
    const deltas = [
      content.slice(0, 18),
      content.slice(18, 30),
      content.slice(30, 48),
      content.slice(48)
    ];
    const encoder = new TextEncoder();
    const fetchMock = vi.fn<typeof fetch>(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const delta of deltas) {
            controller.enqueue(encoder.encode(createStreamChunk(delta)));
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAiGmProvider({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      model: "test-model",
      timeoutMs: 10_000
    });
    const events: GmTurnStreamEvent[] = [];

    if (!provider.streamTurn) {
      throw new Error("provider streamTurn is missing");
    }

    for await (const event of provider.streamTurn(createProviderInput())) {
      events.push(event);
    }

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    const narrationChunks = events.filter(
      (event): event is Extract<GmTurnStreamEvent, { type: "narration_chunk" }> =>
        event.type === "narration_chunk"
    );
    const completedEvent = events.find((event) => event.type === "completed");

    expect(requestBody).toMatchObject({
      response_format: {
        type: "json_object"
      },
      stream: true
    });
    expect(narrationChunks.length).toBeGreaterThan(1);
    expect(narrationChunks.map((event) => event.chunk).join("")).toBe(
      "你在塔底发现被刻意掩盖的脚印。"
    );
    expect(completedEvent).toMatchObject({
      type: "completed",
      result: {
        narration: "你在塔底发现被刻意掩盖的脚印。"
      }
    });
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

describe("requestOpenAiCompatibleJsonObjectStream", () => {
  it("parses streamed Chat Completions SSE chunks and returns full content", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn<typeof fetch>(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              [
                "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
                "",
                ""
              ].join("\n")
            )
          );
          controller.enqueue(encoder.encode(createStreamChunk('{"narration":"你')));
          controller.enqueue(
            encoder.encode(
              [
                "data: {\"choices\":",
                "data: [{\"delta\":{\"content\":\"好\\\"}\"}}]}",
                "",
                ""
              ].join("\n")
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await collectTextStream(
      requestOpenAiCompatibleJsonObjectStream({
        config: {
          apiKey: "test-key",
          baseUrl: "https://example.test/v1",
          model: "test-model",
          temperature: 0.3,
          timeoutMs: 10_000
        },
        label: "stream parser",
        messages: [
          {
            role: "system",
            content: "system"
          },
          {
            role: "user",
            content: "user"
          }
        ]
      })
    );
    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));

    expect(requestBody.stream).toBe(true);
    expect(result.chunks).toEqual(['{"narration":"你', '好"}']);
    expect(result.content).toBe('{"narration":"你好"}');
  });

  it("surfaces streamed HTTP failures without leaking the API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response("upstream unavailable", {
          status: 503
        })
      )
    );

    await expect(
      collectTextStream(
        requestOpenAiCompatibleJsonObjectStream({
          config: {
            apiKey: "secret-key",
            baseUrl: "https://example.test/v1",
            model: "test-model",
            temperature: 0.3,
            timeoutMs: 10_000
          },
          label: "stream failure",
          messages: [
            {
              role: "system",
              content: "system"
            },
            {
              role: "user",
              content: "user"
            }
          ]
        })
      )
    ).rejects.toThrow(/503/u);
    await expect(
      collectTextStream(
        requestOpenAiCompatibleJsonObjectStream({
          config: {
            apiKey: "secret-key",
            baseUrl: "https://example.test/v1",
            model: "test-model",
            temperature: 0.3,
            timeoutMs: 10_000
          },
          label: "stream failure",
          messages: [
            {
              role: "system",
              content: "system"
            },
            {
              role: "user",
              content: "user"
            }
          ]
        })
      )
    ).rejects.not.toThrow(/secret-key/u);
  });

  it("applies timeout while reading streamed response chunks", async () => {
    vi.useFakeTimers();
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

    const request = collectTextStream(
      requestOpenAiCompatibleJsonObjectStream({
        config: {
          apiKey: "test-key",
          baseUrl: "https://example.test/v1",
          model: "test-model",
          temperature: 0.3,
          timeoutMs: 1_000
        },
        label: "stream timeout",
        messages: [
          {
            role: "system",
            content: "system"
          },
          {
            role: "user",
            content: "user"
          }
        ]
      })
    );
    const expectation = expect(request).rejects.toMatchObject({
      name: "AbortError"
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
  });

  it("propagates an external abort signal while streaming", async () => {
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

    const request = collectTextStream(
      requestOpenAiCompatibleJsonObjectStream({
        config: {
          apiKey: "test-key",
          baseUrl: "https://example.test/v1",
          model: "test-model",
          temperature: 0.3,
          timeoutMs: 10_000
        },
        label: "stream abort",
        messages: [
          {
            role: "system",
            content: "system"
          },
          {
            role: "user",
            content: "user"
          }
        ],
        signal: abortController.signal
      })
    );

    await Promise.resolve();
    abortController.abort(new DOMException("closed", "AbortError"));

    await expect(request).rejects.toMatchObject({
      name: "AbortError"
    });
  });
});

describe("extractTopLevelNarrationPrefix", () => {
  it("extracts partial narration strings before the full JSON is complete", () => {
    expect(extractTopLevelNarrationPrefix('{"narration":"你开始行动。')).toBe("你开始行动。");
    expect(extractTopLevelNarrationPrefix('{"other":1,"narration":"线索出现')).toBe("线索出现");
  });

  it("decodes escaped narration content", () => {
    expect(extractTopLevelNarrationPrefix('{"narration":"他说：\\"继续\\"\\n然后靠近')).toBe(
      '他说："继续"\n然后靠近'
    );
    expect(extractTopLevelNarrationPrefix('{"narration":"\\u4f60\\u597d')).toBe("你好");
  });

  it("ignores nested narration keys", () => {
    expect(
      extractTopLevelNarrationPrefix('{"meta":{"narration":"隐藏"},"narration":"公开剧情')
    ).toBe("公开剧情");
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

  it("logs structured parse failure context for invalid model output", () => {
    const logSpy = vi.spyOn(appLogger, "error").mockImplementation(() => undefined);

    expect(() =>
      parseGmTurnResultJson(
        JSON.stringify({
          narration: "你在塔底发现被刻意掩盖的脚印。",
          suggestedMoves: [
            {
              label: "继续检查脚印",
              intent: "玩家尝试确认脚印通向哪里",
              tags: ["调查"]
            }
          ],
          journeyMemoryCandidates: [
            {
              key: "tower",
              type: "lore",
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
            flags: [],
            privateNotes: []
          }
        }),
        {
          operation: "turn_stream",
          requestId: "req-i",
          sessionId: "session-1",
          worldSeedId: "isekai"
        }
      )
    ).toThrow(/Invalid option/u);

    const [fields] =
      logSpy.mock.calls.find(
        ([payload]) =>
          typeof payload === "object" &&
          payload !== null &&
          "event" in payload &&
          payload.event === "ai_structured_output_parse_failed"
      ) ?? [];

    expect(fields).toMatchObject({
      event: "ai_structured_output_parse_failed",
      failedPath: "journeyMemoryCandidates.0.type",
      operation: "turn_stream",
      requestId: "req-i",
      schemaName: "GmTurnResult",
      sessionId: "session-1",
      worldSeedId: "isekai"
    });
  });
});
