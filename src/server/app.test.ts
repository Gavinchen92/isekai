import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdventureCandidatePreviewListSchema,
  AdventureSchema,
  JourneyMemoryEntryListSchema,
  SessionSchema,
  TurnResponseSchema,
  type WorldSeedId,
  WorldSeedPresetListSchema
} from "../domain";
import { HealthResponseSchema } from "../shared/health";
import * as journeyMemoryService from "../services/journey-memory";
import { createServer } from "./app";

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
