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
    expect(getAdventure(adventure.id)).toEqual(adventure);
  });
});
