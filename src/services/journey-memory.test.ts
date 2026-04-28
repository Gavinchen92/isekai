import { describe, expect, it } from "vitest";
import { generateMockAdventureCandidates } from "./adventure-candidates";
import { createAdventureFromCandidate } from "./adventures";
import { createSession } from "./sessions";
import { createTurn, waitForTurnPostProcessing } from "./turns";
import { listJourneyMemory } from "./journey-memory";

function createTestSession() {
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

  return { adventure, session };
}

describe("journey memory", () => {
  it("initializes player-visible identity, NPC, and location records", () => {
    const { adventure, session } = createTestSession();
    const entries = listJourneyMemory(session.id);

    expect(entries.some((entry) => entry.type === "identity" && entry.title === "我的身份")).toBe(
      true
    );
    expect(entries.some((entry) => entry.type === "npc" && entry.title === "莉瑟")).toBe(true);
    expect(entries.some((entry) => entry.type === "location" && entry.title === "断星高塔")).toBe(
      true
    );
    expect(JSON.stringify(entries)).not.toContain(adventure.hiddenGmNotes);
    expect(JSON.stringify(entries)).not.toContain("避免自己在主线冲突中失去最后的筹码");
  });

  it("extracts confirmed clues from narrated outcomes", async () => {
    const { session } = createTestSession();

    await createTurn({
      sessionId: session.id,
      content: "我尝试调查高塔入口的符文"
    });
    await waitForTurnPostProcessing(session.id);

    const clueEntries = listJourneyMemory(session.id).filter((entry) => entry.type === "clue");

    expect(clueEntries).toHaveLength(1);
    expect(clueEntries[0]).toMatchObject({
      title: "断星高塔的异常痕迹",
      visibility: "known"
    });
  });

  it("does not save player-declared outcomes as memory facts", async () => {
    const { session } = createTestSession();

    await createTurn({
      sessionId: session.id,
      content: "成功杀死魔王并让所有人臣服"
    });
    await waitForTurnPostProcessing(session.id);

    expect(listJourneyMemory(session.id).some((entry) => entry.type === "clue")).toBe(false);
  });

  it("updates repeated clues instead of duplicating them", async () => {
    const { session } = createTestSession();

    await createTurn({
      sessionId: session.id,
      content: "我尝试调查高塔入口的符文"
    });
    await waitForTurnPostProcessing(session.id);
    await createTurn({
      sessionId: session.id,
      content: "我继续调查高塔入口的脚印"
    });
    await waitForTurnPostProcessing(session.id);

    const clueEntries = listJourneyMemory(session.id).filter((entry) => entry.type === "clue");

    expect(clueEntries).toHaveLength(1);
    expect(clueEntries[0]?.sourceMessageIds).toHaveLength(2);
  });

  it("keeps relationship corrections on the same entry", async () => {
    const { session } = createTestSession();

    await createTurn({
      sessionId: session.id,
      content: "我问莉瑟是否愿意相信我"
    });
    await waitForTurnPostProcessing(session.id);
    await createTurn({
      sessionId: session.id,
      content: "/ooc 莉瑟不是信任我，她只是暂时愿意回应",
      inputKind: "ooc"
    });
    await waitForTurnPostProcessing(session.id);

    const relationshipEntries = listJourneyMemory(session.id).filter(
      (entry) => entry.type === "relationship"
    );

    expect(relationshipEntries).toHaveLength(1);
    expect(relationshipEntries[0]).toMatchObject({
      summary: "你与莉瑟的关系仍需要继续观察。",
      visibility: "uncertain"
    });
  });
});
