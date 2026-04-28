import { describe, expect, it } from "vitest";
import { MessageSchema } from "../../domain";
import { generateMockAdventureCandidates } from "../adventure-candidates";
import { createAdventureFromCandidate } from "../adventures";
import { listJourneyMemory } from "../journey-memory";
import { createSession } from "../sessions";
import { mockGmProvider } from "./mock-provider";
import type { GmUserMessage } from "./provider";

function createProviderInput(content: string, inferredIntent: GmUserMessage["inferredIntent"]) {
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
  const parsedMessage = MessageSchema.parse({
    id: "message-1",
    sessionId: session.id,
    role: "user",
    inputKind: "free",
    inferredIntent,
    content,
    createdAt: new Date().toISOString()
  });

  return {
    adventure,
    session,
    userMessage: {
      ...parsedMessage,
      role: "user",
      inputKind: "free",
      inferredIntent,
      intentConfidence: "high",
      isResultClaim: inferredIntent === "world_override_attempt",
      normalizedAttempt:
        inferredIntent === "world_override_attempt" ? `玩家尝试：${content}` : content
    } satisfies GmUserMessage,
    journeyMemory: listJourneyMemory(session.id),
    messageHistory: [],
    previousInternalStatePatches: [],
    previousSuggestedMoves: []
  };
}

describe("mockGmProvider", () => {
  it("returns the stable GM turn contract", async () => {
    const result = await mockGmProvider.generateTurn(
      createProviderInput("我尝试调查高塔入口的符文", "character_action")
    );

    expect(result.narration).toContain("你开始行动");
    expect(result.suggestedMoves).toHaveLength(3);
    expect(result.journeyMemoryCandidates.some((candidate) => candidate.type === "clue")).toBe(
      true
    );
    expect(result.internalStatePatch.privateNotes.join("\n")).toContain("隐藏 GM 线索");
  });

  it("does not produce journey memory candidates for player-declared outcomes", async () => {
    const result = await mockGmProvider.generateTurn(
      createProviderInput("成功杀死魔王", "world_override_attempt")
    );

    expect(result.narration).toContain("不是既成事实");
    expect(result.journeyMemoryCandidates).toHaveLength(0);
  });
});
