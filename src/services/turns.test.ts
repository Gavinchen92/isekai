import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TurnResponseSchema } from "../domain";
import { generateMockAdventureCandidates } from "./adventure-candidates";
import { createAdventureFromCandidate } from "./adventures";
import { createSession } from "./sessions";
import {
  createTurn,
  listGmInternalStatePatches,
  listMessages,
  listSuggestedMoves
} from "./turns";

const originalGmProvider = process.env.GM_PROVIDER;

beforeEach(() => {
  process.env.GM_PROVIDER = "mock";
});

afterEach(() => {
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

    expect(response.messages[0]?.inferredIntent).toBe("world_override_attempt");
    expect(response.messages[1]?.content).toContain("不是既成事实");
  });

  it("does not expose GM internal state in the public turn response", async () => {
    const session = createTestSession();
    const response = await createTurn({
      sessionId: session.id,
      content: "我尝试调查高塔入口的符文"
    });

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
});
