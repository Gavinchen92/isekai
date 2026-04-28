import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdventureCandidatePreviewListSchema,
  AdventureSchema,
  JourneyMemoryEntryListSchema,
  SessionSchema,
  TurnStreamEventSchema,
  TurnResponseSchema,
  type WorldSeedId,
  WorldSeedPresetListSchema
} from "../domain";
import { HealthResponseSchema } from "../shared/health";
import { appLogger } from "../shared/logger";
import * as adventureService from "../services/adventures";
import * as journeyMemoryService from "../services/journey-memory";
import { resetDatabaseForTests } from "../storage/database";
import { createServer } from "./app";

beforeEach(() => {
  resetDatabaseForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function createAdventureFromGeneratedCandidate(
  server: ReturnType<typeof createServer>,
  worldSeedId: WorldSeedId,
  options: { selectedPlayerSetupIndex?: number } = {}
) {
  const candidateResponse = await server.inject({
    method: "POST",
    url: "/api/adventure-candidates",
    payload: {
      worldSeedId
    }
  });
  const [candidate] = AdventureCandidatePreviewListSchema.parse(candidateResponse.json());

  if (!candidate) {
    throw new Error("missing generated candidate");
  }

  const selectedPlayerSetupId =
    options.selectedPlayerSetupIndex === undefined
      ? undefined
      : candidate.playerSetupOptions[options.selectedPlayerSetupIndex]?.id;

  const adventureResponse = await server.inject({
    method: "POST",
    url: "/api/adventures",
    payload: {
      candidateId: candidate.id,
      ...(selectedPlayerSetupId ? { selectedPlayerSetupId } : {}),
      worldSeedId
    }
  });

  return {
    adventure: AdventureSchema.parse(adventureResponse.json()),
    adventureResponse,
    candidate,
    selectedPlayerSetupId
  };
}

describe("GET /api/health", () => {
  it("returns a schema-valid health payload", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/health"
    });

    await server.close();

    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(response.json())).toMatchObject({
      ok: true,
      service: "isekai"
    });
  });
});

describe("GET /api/world-seeds", () => {
  it("returns the built-in world seed presets", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/world-seeds"
    });

    await server.close();

    const seeds = WorldSeedPresetListSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(seeds.map((seed) => seed.id)).toEqual([
      "isekai",
      "medieval",
      "ancient-china",
      "sengoku-japan"
    ]);
  });
});

describe("POST /api/adventure-candidates", () => {
  it("returns mock candidates for a valid request", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/adventure-candidates",
      payload: {
        worldSeedId: "sengoku-japan"
      }
    });

    await server.close();

    const candidates = AdventureCandidatePreviewListSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(candidates).toHaveLength(3);
    expect(candidates[0]?.tags).toContain("日本战国");
    expect(JSON.stringify(candidates)).not.toContain("mainConflict");
    expect(JSON.stringify(candidates)).not.toContain("openingScene");
    expect(JSON.stringify(candidates)).not.toContain("winCondition");
    expect(JSON.stringify(candidates)).not.toContain("lossCondition");
    expect(JSON.stringify(candidates)).not.toContain("endingSeeds");
    expect(JSON.stringify(candidates)).not.toContain("hiddenGmNotes");
  });

  it("rejects invalid requests", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/adventure-candidates",
      payload: {
        worldSeedId: "space-opera"
      }
    });

    await server.close();

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /api/adventures", () => {
  it("creates an adventure from a selected candidate", async () => {
    const server = createServer();
    const { adventure, adventureResponse, candidate } = await createAdventureFromGeneratedCandidate(
      server,
      "ancient-china"
    );

    await server.close();

    expect(adventureResponse.statusCode).toBe(200);
    expect(adventure.sourceCandidateId).toBe(candidate.id);
    expect(adventure.worldSeedId).toBe("ancient-china");
    expect(adventure.currentAct).toBe("act1");
  });

  it("creates an adventure with a selected player setup", async () => {
    const server = createServer();
    const { adventure, adventureResponse, selectedPlayerSetupId } =
      await createAdventureFromGeneratedCandidate(server, "ancient-china", {
        selectedPlayerSetupIndex: 1
      });

    await server.close();

    expect(adventureResponse.statusCode).toBe(200);
    expect(adventure.selectedPlayerSetupId).toBe(selectedPlayerSetupId);
  });

  it("rejects invalid adventure creation requests", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/adventures",
      payload: {
        worldSeedId: "ancient-china"
      }
    });

    await server.close();

    expect(response.statusCode).toBe(400);
  });

  it("rejects player setup ids outside the selected candidate", async () => {
    const server = createServer();
    const candidateResponse = await server.inject({
      method: "POST",
      url: "/api/adventure-candidates",
      payload: {
        worldSeedId: "isekai"
      }
    });
    const [candidate] = AdventureCandidatePreviewListSchema.parse(candidateResponse.json());

    if (!candidate) {
      throw new Error("missing generated candidate");
    }

    const response = await server.inject({
      method: "POST",
      url: "/api/adventures",
      payload: {
        candidateId: candidate.id,
        selectedPlayerSetupId: "missing-player-setup",
        worldSeedId: "isekai"
      }
    });

    await server.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Player setup option does not belong to adventure candidate"
    });
  });

  it("returns bad gateway when full adventure generation fails", async () => {
    vi.spyOn(adventureService, "createAdventure").mockRejectedValue(
      new Error("upstream model failed")
    );
    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/adventures",
      payload: {
        candidateId: "candidate-1",
        worldSeedId: "isekai"
      }
    });

    await server.close();

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "Adventure generation failed"
    });
  });
});

describe("POST /api/sessions", () => {
  it("creates a session for an existing adventure", async () => {
    const server = createServer();
    const { adventure } = await createAdventureFromGeneratedCandidate(server, "medieval");
    const sessionResponse = await server.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        adventureId: adventure.id
      }
    });

    await server.close();

    const session = SessionSchema.parse(sessionResponse.json());

    expect(sessionResponse.statusCode).toBe(200);
    expect(session.adventureId).toBe(adventure.id);
    expect(session.currentAct).toBe(adventure.currentAct);
  });

  it("returns not found for unknown adventures", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        adventureId: "missing"
      }
    });

    await server.close();

    expect(response.statusCode).toBe(404);
  });
});

describe("GET /api/sessions/latest", () => {
  it("returns not found when no session exists", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/sessions/latest"
    });

    await server.close();

    expect(response.statusCode).toBe(404);
  });

  it("returns the latest resumable session snapshot", async () => {
    const server = createServer();
    const { adventure } = await createAdventureFromGeneratedCandidate(server, "isekai");
    const sessionResponse = await server.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        adventureId: adventure.id
      }
    });
    const session = SessionSchema.parse(sessionResponse.json());

    await server.inject({
      method: "POST",
      url: "/api/turns",
      payload: {
        sessionId: session.id,
        content: "我尝试调查高塔入口"
      }
    });

    const latestResponse = await server.inject({
      method: "GET",
      url: "/api/sessions/latest"
    });

    await server.close();

    expect(latestResponse.statusCode).toBe(200);
    expect(latestResponse.json()).toMatchObject({
      adventure: {
        id: adventure.id
      },
      session: {
        id: session.id
      }
    });
    expect(latestResponse.json().messages).toHaveLength(2);
    expect(latestResponse.json().suggestedMoves).toHaveLength(3);
  });
});

describe("GET /api/sessions/:id", () => {
  it("returns a resumable session snapshot", async () => {
    const server = createServer();
    const { adventure } = await createAdventureFromGeneratedCandidate(server, "medieval");
    const sessionResponse = await server.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        adventureId: adventure.id
      }
    });
    const session = SessionSchema.parse(sessionResponse.json());
    const snapshotResponse = await server.inject({
      method: "GET",
      url: `/api/sessions/${session.id}`
    });

    await server.close();

    expect(snapshotResponse.statusCode).toBe(200);
    expect(snapshotResponse.json()).toMatchObject({
      adventure: {
        id: adventure.id
      },
      messages: [],
      session: {
        id: session.id
      },
      suggestedMoves: []
    });
  });

  it("returns not found for unknown sessions", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/sessions/missing"
    });

    await server.close();

    expect(response.statusCode).toBe(404);
  });
});

describe("GET /api/sessions/:id/journey-memory", () => {
  it("returns player-visible journey memory for a session", async () => {
    const server = createServer();
    const { adventure } = await createAdventureFromGeneratedCandidate(server, "isekai");
    const sessionResponse = await server.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        adventureId: adventure.id
      }
    });
    const session = SessionSchema.parse(sessionResponse.json());
    const memoryResponse = await server.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/journey-memory`
    });

    await server.close();

    const entries = JourneyMemoryEntryListSchema.parse(memoryResponse.json());

    expect(memoryResponse.statusCode).toBe(200);
    expect(entries.some((entry) => entry.type === "identity")).toBe(true);
    expect(JSON.stringify(entries)).not.toContain("hidden");
    expect(JSON.stringify(entries)).not.toContain("筹码");
  });

  it("returns not found for unknown sessions", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "GET",
      url: "/api/sessions/missing/journey-memory"
    });

    await server.close();

    expect(response.statusCode).toBe(404);
  });
});

describe("POST /api/turns", () => {
  it("creates the first playable turn for a session", async () => {
    const server = createServer();
    const { adventure } = await createAdventureFromGeneratedCandidate(server, "isekai");
    const sessionResponse = await server.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        adventureId: adventure.id
      }
    });
    const session = SessionSchema.parse(sessionResponse.json());
    const turnResponse = await server.inject({
      method: "POST",
      url: "/api/turns",
      payload: {
        sessionId: session.id,
        content: "我尝试调查高塔入口"
      }
    });

    await server.close();

    const turn = TurnResponseSchema.parse(turnResponse.json());

    expect(turnResponse.statusCode).toBe(200);
    expect(turn.messages[0]).toMatchObject({
      role: "user",
      inputKind: "free"
    });
    expect(turn.messages[1]?.role).toBe("assistant");
    expect(turn.suggestedMoves).toHaveLength(3);
  });

  it("returns not found for unknown sessions", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/api/turns",
      payload: {
        sessionId: "missing",
        content: "继续"
      }
    });

    await server.close();

    expect(response.statusCode).toBe(404);
  });

  it("still returns a successful turn when post-processing fails", async () => {
    const server = createServer();
    const extractSpy = vi
      .spyOn(journeyMemoryService, "extractJourneyMemoryFromTurn")
      .mockImplementationOnce(() => {
        throw new Error("post processing failed");
      });
    const { adventure } = await createAdventureFromGeneratedCandidate(server, "isekai");
    const sessionResponse = await server.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        adventureId: adventure.id
      }
    });
    const session = SessionSchema.parse(sessionResponse.json());
    const turnResponse = await server.inject({
      method: "POST",
      url: "/api/turns",
      payload: {
        sessionId: session.id,
        content: "我尝试调查高塔入口"
      }
    });

    await server.close();

    expect(turnResponse.statusCode).toBe(200);
    expect(TurnResponseSchema.parse(turnResponse.json()).messages).toHaveLength(2);
    extractSpy.mockRestore();
  });
});

describe("POST /api/turns/stream", () => {
  it("streams staged turn events in order", async () => {
    const server = createServer();
    const { adventure } = await createAdventureFromGeneratedCandidate(server, "isekai");
    const sessionResponse = await server.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        adventureId: adventure.id
      }
    });
    const session = SessionSchema.parse(sessionResponse.json());
    const turnResponse = await server.inject({
      method: "POST",
      url: "/api/turns/stream",
      payload: {
        sessionId: session.id,
        content: "我尝试调查高塔入口"
      }
    });

    await server.close();

    const blocks = turnResponse.body
      .trim()
      .split("\n\n")
      .map((block) => block.trim())
      .filter(Boolean);
    const events = blocks.map((block) => {
      const lines = block.split("\n");
      const dataLine = lines.find((line) => line.startsWith("data:"));

      if (!dataLine) {
        throw new Error("missing data line");
      }

      return TurnStreamEventSchema.parse(JSON.parse(dataLine.slice("data:".length).trim()));
    });
    const narrationChunks = events.filter((event) => event.type === "narration_chunk");

    expect(turnResponse.statusCode).toBe(200);
    expect(events[0]?.type).toBe("turn_started");
    expect(narrationChunks.length).toBeGreaterThan(1);
    expect(events.at(-2)?.type).toBe("suggested_moves_ready");
    expect(events.at(-1)?.type).toBe("turn_completed");
  });

  it("passes request context into LLM and structured parse failure logs", async () => {
    const previousEnv = {
      GM_PROVIDER: process.env.GM_PROVIDER,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL
    };
    const server = createServer();
    const { adventure } = await createAdventureFromGeneratedCandidate(server, "isekai");
    const sessionResponse = await server.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        adventureId: adventure.id
      }
    });
    const session = SessionSchema.parse(sessionResponse.json());
    const infoSpy = vi.spyOn(appLogger, "info").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(appLogger, "error").mockImplementation(() => undefined);

    process.env.GM_PROVIDER = "openai-compatible";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "test-model";
    const invalidGmContent = JSON.stringify({
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
    });
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [
                    {
                      delta: {
                        content: invalidGmContent
                      }
                    }
                  ]
                })}\n\n`
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
      })
    );

    try {
      const turnResponse = await server.inject({
        method: "POST",
        url: "/api/turns/stream",
        payload: {
          sessionId: session.id,
          content: "/ooc 测试日志上下文",
          inputKind: "ooc"
        }
      });

      const llmRequestFields = findLoggedEvent(infoSpy.mock.calls, "llm_request_started");
      const parseFailureFields = findLoggedEvent(
        errorSpy.mock.calls,
        "ai_structured_output_parse_failed"
      );

      expect(turnResponse.statusCode).toBe(200);
      expect(turnResponse.body).toContain("event: turn_error");
      expect(llmRequestFields).toMatchObject({
        operation: "turn_stream",
        sessionId: session.id,
        worldSeedId: "isekai"
      });
      expect(llmRequestFields.requestId).toEqual(expect.any(String));
      expect(parseFailureFields).toMatchObject({
        failedPath: "journeyMemoryCandidates.0.type",
        operation: "turn_stream",
        schemaName: "GmTurnResult",
        sessionId: session.id,
        worldSeedId: "isekai"
      });
      expect(parseFailureFields.requestId).toBe(llmRequestFields.requestId);
    } finally {
      await server.close();
      restoreEnv(previousEnv);
    }
  });
});

describe("POST /api/sessions/:id/journey-memory/extract", () => {
  it("refreshes journey memory from existing turns", async () => {
    const server = createServer();
    const { adventure } = await createAdventureFromGeneratedCandidate(server, "isekai");
    const sessionResponse = await server.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        adventureId: adventure.id
      }
    });
    const session = SessionSchema.parse(sessionResponse.json());
    await server.inject({
      method: "POST",
      url: "/api/turns",
      payload: {
        sessionId: session.id,
        content: "我尝试调查高塔入口"
      }
    });
    const refreshResponse = await server.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/journey-memory/extract`
    });

    await server.close();

    const entries = JourneyMemoryEntryListSchema.parse(refreshResponse.json());

    expect(refreshResponse.statusCode).toBe(200);
    expect(entries.some((entry) => entry.type === "clue")).toBe(true);
  });
});

function findLoggedEvent(
  calls: readonly (readonly unknown[])[],
  event: string
): Record<string, unknown> {
  const [fields] =
    calls.find(
      ([payload]) =>
        typeof payload === "object" &&
        payload !== null &&
        "event" in payload &&
        payload.event === event
    ) ?? [];

  if (!fields || typeof fields !== "object") {
    throw new Error(`missing logged event: ${event}`);
  }

  return fields as Record<string, unknown>;
}

function restoreEnv(previousEnv: Record<string, string | undefined>): void {
  Object.entries(previousEnv).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
      return;
    }

    process.env[key] = value;
  });
}
