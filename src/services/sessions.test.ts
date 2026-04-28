import { beforeEach, describe, expect, it } from "vitest";
import { SessionSchema } from "../domain";
import { resetDatabaseForTests } from "../storage/database";
import { generateMockAdventureCandidates } from "./adventure-candidates";
import { createAdventureFromCandidate, getAdventure } from "./adventures";
import { listSessionSnapshots } from "./session-snapshots";
import { createSession, deleteSession, getSession, listSessions } from "./sessions";

beforeEach(() => {
  resetDatabaseForTests();
});

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

  it("lists saved sessions and resumable snapshots", () => {
    const [candidate] = generateMockAdventureCandidates({ worldSeedId: "isekai" });
    if (!candidate) {
      throw new Error("missing candidate");
    }

    const adventure = createAdventureFromCandidate({
      candidate,
      worldSeedId: "isekai"
    });
    const firstSession = createSession({ adventureId: adventure.id });
    const secondSession = createSession({ adventureId: adventure.id });

    expect(listSessions().map((session) => session.id)).toEqual(
      expect.arrayContaining([firstSession.id, secondSession.id])
    );
    expect(listSessionSnapshots().map((snapshot) => snapshot.session.id)).toEqual(
      expect.arrayContaining([firstSession.id, secondSession.id])
    );
  });

  it("deletes saved sessions and rejects unknown session deletion", () => {
    const [candidate] = generateMockAdventureCandidates({ worldSeedId: "medieval" });
    if (!candidate) {
      throw new Error("missing candidate");
    }

    const adventure = createAdventureFromCandidate({
      candidate,
      worldSeedId: "medieval"
    });
    const session = createSession({ adventureId: adventure.id });

    expect(deleteSession(session.id)).toEqual(session);
    expect(getSession(session.id)).toBeUndefined();
    expect(getAdventure(adventure.id)).toBeUndefined();
    expect(() => deleteSession("missing")).toThrow(/session not found/u);
  });
});
