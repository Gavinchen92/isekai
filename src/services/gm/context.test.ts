import { describe, expect, it } from "vitest";
import { GmPromptMessageListSchema, MessageSchema } from "../../domain";
import { generateMockAdventureCandidates } from "../adventure-candidates";
import { createAdventureFromCandidate } from "../adventures";
import { listJourneyMemory } from "../journey-memory";
import { createSession } from "../sessions";
import { buildGmPromptMessages, buildGmTurnContext } from "./context";
import type { GmTurnInput, GmUserMessage } from "./provider";

function createContextInput(): GmTurnInput {
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
  const createdAt = new Date().toISOString();
  const parsedUserMessage = MessageSchema.parse({
    id: "message-user-current",
    sessionId: session.id,
    role: "user",
    inputKind: "free",
    inferredIntent: "character_action",
    content: "我尝试调查高塔入口的符文",
    createdAt
  });
  const userMessage = {
    ...parsedUserMessage,
    role: "user",
    inputKind: "free",
    inferredIntent: "character_action",
    intentConfidence: "high",
    isResultClaim: false,
    normalizedAttempt: "玩家尝试调查高塔入口的符文"
  } satisfies GmUserMessage;
  const messageHistory = Array.from({ length: 10 }, (_, index) =>
    MessageSchema.parse({
      id: `message-${index}`,
      sessionId: session.id,
      role: index % 2 === 0 ? "user" : "assistant",
      inputKind: index % 2 === 0 ? "free" : undefined,
      inferredIntent: index % 2 === 0 ? "character_action" : undefined,
      content: `历史消息 ${index}`,
      createdAt
    })
  );

  return {
    adventure,
    session,
    userMessage,
    journeyMemory: listJourneyMemory(session.id),
    messageHistory,
    previousInternalStatePatches: [
      {
        flags: ["old-state"],
        privateNotes: ["上一轮隐藏判断"]
      }
    ],
    previousSuggestedMoves: []
  };
}

describe("buildGmTurnContext", () => {
  it("separates player-known context from GM private context", () => {
    const input = createContextInput();
    const context = buildGmTurnContext(input);
    const publicContextText = JSON.stringify(context.playerKnownContext);

    expect(context.playerKnownContext.adventureTitle).toBe(input.adventure.title);
    expect(publicContextText).not.toContain(input.adventure.hiddenGmNotes);
    expect(publicContextText).not.toContain(input.adventure.winCondition);
    expect(publicContextText).not.toContain(input.adventure.lossCondition);
    expect(context.gmPrivateContext.hiddenGmNotes).toBe(input.adventure.hiddenGmNotes);
    expect(context.gmPrivateContext.winCondition).toBe(input.adventure.winCondition);
    expect(context.gmPrivateContext.internalStatePatches[0]?.privateNotes).toContain(
      "上一轮隐藏判断"
    );
  });

  it("keeps only recent messages and current player input", () => {
    const context = buildGmTurnContext(createContextInput(), {
      recentMessageLimit: 3
    });

    expect(context.playerKnownContext.recentMessages.map((message) => message.content)).toEqual([
      "历史消息 7",
      "历史消息 8",
      "历史消息 9"
    ]);
    expect(context.currentPlayerInput).toMatchObject({
      content: "我尝试调查高塔入口的符文",
      inferredIntent: "character_action",
      inputKind: "free",
      isResultClaim: false,
      normalizedAttempt: "玩家尝试调查高塔入口的符文"
    });
  });
});

describe("buildGmPromptMessages", () => {
  it("builds a strict JSON prompt contract for AI providers", () => {
    const context = buildGmTurnContext(createContextInput());
    const messages = GmPromptMessageListSchema.parse(buildGmPromptMessages(context));
    const promptText = messages.map((message) => message.content).join("\n");

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "system"
    });
    expect(promptText).toContain("只返回一个 JSON 对象");
    expect(promptText).toContain("GmTurnResult");
    expect(promptText).toContain("不得在 narration");
    expect(promptText).toContain(context.gmPrivateContext.hiddenGmNotes);
  });
});
