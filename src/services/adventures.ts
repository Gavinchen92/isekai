import {
  AdventureSchema,
  CreateAdventureRequestSchema,
  type Adventure,
  type AdventureCandidate,
  type CreateAdventureRequest
} from "../domain";
import { getStoredAdventureCandidate } from "./adventure-candidates";

const adventures = new Map<string, Adventure>();

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createAdventure(rawRequest: unknown): Adventure {
  const request: CreateAdventureRequest = CreateAdventureRequestSchema.parse(rawRequest);
  const storedCandidate = getStoredAdventureCandidate(request.candidateId);

  if (!storedCandidate) {
    throw new Error(`adventure candidate not found: ${request.candidateId}`);
  }

  if (storedCandidate.worldSeedId !== request.worldSeedId) {
    throw new Error(`adventure candidate does not belong to world seed: ${request.worldSeedId}`);
  }

  return createAdventureFromCandidate({
    candidate: storedCandidate.candidate,
    selectedPlayerSetupId: request.selectedPlayerSetupId,
    worldSeedId: request.worldSeedId
  });
}

export function createAdventureFromCandidate(request: {
  candidate: AdventureCandidate;
  selectedPlayerSetupId?: string;
  worldSeedId: CreateAdventureRequest["worldSeedId"];
}): Adventure {
  const now = new Date().toISOString();
  const adventure = AdventureSchema.parse({
    ...request.candidate,
    id: createId("adventure"),
    sourceCandidateId: request.candidate.id,
    worldSeedId: request.worldSeedId,
    currentAct: "act1",
    selectedPlayerSetupId:
      request.selectedPlayerSetupId ?? request.candidate.playerSetupOptions[0]?.id,
    createdAt: now,
    updatedAt: now
  });

  adventures.set(adventure.id, adventure);

  return adventure;
}

export function getAdventure(adventureId: string): Adventure | undefined {
  return adventures.get(adventureId);
}
