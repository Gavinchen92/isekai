import { describe, expect, it } from "vitest";
import { AdventureSchema } from "../domain";
import { generateMockAdventureCandidates, storeAdventureCandidates } from "./adventure-candidates";
import { createAdventure, getAdventure } from "./adventures";

describe("createAdventure", () => {
  it("creates and stores an adventure from a candidate", () => {
    const [candidate] = generateMockAdventureCandidates({ worldSeedId: "medieval" });

    if (!candidate) {
      throw new Error("missing candidate");
    }

    storeAdventureCandidates("medieval", [candidate]);

    const adventure = AdventureSchema.parse(
      createAdventure({
        candidateId: candidate.id,
        worldSeedId: "medieval"
      })
    );

    expect(adventure.sourceCandidateId).toBe(candidate?.id);
    expect(adventure.worldSeedId).toBe("medieval");
    expect(adventure.currentAct).toBe("act1");
    expect(adventure.openingScene).toBe(candidate?.openingScene);
    expect(adventure.selectedPlayerSetupId).toBe(candidate.playerSetupOptions[0]?.id);
    expect(getAdventure(adventure.id)).toEqual(adventure);
  });

  it("uses an explicitly selected player setup from the candidate", () => {
    const [candidate] = generateMockAdventureCandidates({ worldSeedId: "isekai" });

    if (!candidate) {
      throw new Error("missing candidate");
    }

    const selectedPlayerSetupId = candidate.playerSetupOptions[1]?.id;

    if (!selectedPlayerSetupId) {
      throw new Error("missing player setup option");
    }

    storeAdventureCandidates("isekai", [candidate]);

    const adventure = createAdventure({
      candidateId: candidate.id,
      selectedPlayerSetupId,
      worldSeedId: "isekai"
    });

    expect(adventure.selectedPlayerSetupId).toBe(selectedPlayerSetupId);
  });

  it("rejects a selected player setup that does not belong to the candidate", () => {
    const [candidate] = generateMockAdventureCandidates({ worldSeedId: "ancient-china" });

    if (!candidate) {
      throw new Error("missing candidate");
    }

    storeAdventureCandidates("ancient-china", [candidate]);

    expect(() =>
      createAdventure({
        candidateId: candidate.id,
        selectedPlayerSetupId: "unknown-player-setup",
        worldSeedId: "ancient-china"
      })
    ).toThrow(/player setup option does not belong/u);
  });
});
