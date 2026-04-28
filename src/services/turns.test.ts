import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TurnResponseSchema, type TurnStreamEvent } from "../domain";
import { generateMockAdventureCandidates } from "./adventure-candidates";
import { createAdventureFromCandidate } from "./adventures";
import * as journeyMemoryService from "./journey-memory";
import { createSession } from "./sessions";
import {
  createTurn,
  createTurnStream,
  listGmInternalStatePatches,
  listMessages,
  listSuggestedMoves,
  waitForTurnPostProcessing
} from "./turns";

const originalGmProvider = process.env.GM_PROVIDER;

beforeEach(() => {
  process.env.GM_PROVIDER = "mock";
});

afterEach(() => {
  vi.restoreAllMocks();

  if (originalGmProvider === undefined) {
    delete process.env.GM_PROVIDER;
    return;
  }

  process.env.GM_PROVIDER = originalGmProvider;
});

function createTestSession() {
  const [candidate] = generateMockAdventureCandidates({ worldSeedId: "isekai" });
  if (!candidate) {
    throw new Error("missing candidate");
  }

  const adventure = createAdventureFromCandidate({
    candidate,
    worldSeedId: "isekai"
  });

  return createSession({
    adventureId: adventure.id
  });
}

describe("createTurn", () => {
  it("creates a user message, GM response, and suggested moves", async () => {
    const session = createTestSession();
    const response = TurnResponseSchema.parse(
      await createTurn({
        sessionId: session.id,
        content: "我尝试调查高塔入口的符文"
      })
    );
    await waitForTurnPostProcessing(session.id);

    expect(response.messages).toHaveLength(2);
    expect(response.messages[0]).toMatchObject({
      role: "user",
      inferredIntent: "character_action"
    });
    expect(response.messages[1]?.role).toBe("assistant");
    expect(response.suggestedMoves).toHaveLength(3);
    expect(listMessages(session.id)).toHaveLength(2);
    expect(listSuggestedMoves(session.id)).toHaveLength(3);
    expect(listGmInternalStatePatches(session.id)).toHaveLength(1);
  });

  it("does not accept player-declared outcomes as canon", async () => {
    const session = createTestSession();
    const response = await createTurn({
      sessionId: session.id,
      content: "成功杀死魔王"
    });
    await waitForTurnPostProcessing(session.id);

    expect(response.messages[0]?.inferredIntent).toBe("world_override_attempt");
    expect(response.messages[1]?.content).toContain("不是既成事实");
  });

  it("does not expose GM internal state in the public turn response", async () => {
    const session = createTestSession();
    const response = await createTurn({
      sessionId: session.id,
      content: "我尝试调查高塔入口的符文"
    });
    await waitForTurnPostProcessing(session.id);

    expect(JSON.stringify(response)).not.toContain("privateNotes");
    expect(JSON.stringify(response)).not.toContain("隐藏 GM 线索");
    expect(listGmInternalStatePatches(session.id)[0]?.privateNotes.join("\n")).toContain(
      "隐藏 GM 线索"
    );
  });

  it("rejects unknown sessions", async () => {
    await expect(
      createTurn({
        sessionId: "missing",
        content: "继续"
      })
    ).rejects.toThrow(/session not found/u);
  });

  it("keeps main response successful when journey memory post-processing fails", async () => {
    const session = createTestSession();
    const onJourneyMemoryPostProcessSettled = vi.fn();
    const extractSpy = vi
      .spyOn(journeyMemoryService, "extractJourneyMemoryFromTurn")
      .mockImplementationOnce(() => {
        throw new Error("post processing failed");
      });

    const response = await createTurn({
      sessionId: session.id,
      content: "我尝试调查高塔入口的符文"
    }, { onJourneyMemoryPostProcessSettled });

    await waitForTurnPostProcessing(session.id);
    expect(response.messages).toHaveLength(2);
    expect(response.suggestedMoves).toHaveLength(3);
    expect(onJourneyMemoryPostProcessSettled).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed"
      })
    );
    extractSpy.mockRestore();
  });
});

describe("createTurnStream", () => {
  it("emits staged events and persists final turn state", async () => {
    const session = createTestSession();
    const events: TurnStreamEvent[] = [];

    for await (const event of createTurnStream({
      sessionId: session.id,
      content: "我尝试调查高塔入口的符文"
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "turn_started",
      "narration_chunk",
      "suggested_moves_ready",
      "turn_completed"
    ]);
    expect(listMessages(session.id)).toHaveLength(2);
    expect(listSuggestedMoves(session.id)).toHaveLength(3);
    expect(listGmInternalStatePatches(session.id)).toHaveLength(1);
  });
});
