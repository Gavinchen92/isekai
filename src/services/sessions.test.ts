import { describe, expect, it } from "vitest";
import { SessionSchema } from "../domain";
import { generateMockAdventureCandidates } from "./adventure-candidates";
import { createAdventureFromCandidate } from "./adventures";
import { createSession, getSession } from "./sessions";

describe("createSession", () => {
  it("creates a chat session for an existing adventure", () => {
    const [candidate] = generateMockAdventureCandidates({ worldSeedId: "isekai" });
    if (!candidate) {
      throw new Error("missing candidate");
    }

    const adventure = createAdventureFromCandidate({
      candidate,
      worldSeedId: "isekai"
    });
    const session = SessionSchema.parse(
      createSession({
        adventureId: adventure.id
      })
    );

    expect(session.adventureId).toBe(adventure.id);
    expect(session.currentAct).toBe("act1");
    expect(getSession(session.id)).toEqual(session);
  });

  it("rejects unknown adventures", () => {
    expect(() => createSession({ adventureId: "missing" })).toThrow(/adventure not found/u);
  });
});
