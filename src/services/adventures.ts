import {
  AdventureSchema,
  CreateAdventureRequestSchema,
  type Adventure,
  type AdventureCandidate,
  type CreateAdventureRequest
} from "../domain";
import { getStoredAdventureCandidate, materializeAdventureCandidate } from "./adventure-candidates";

const adventures = new Map<string, Adventure>();

type CreateAdventureOptions = {
  signal?: AbortSignal;
};

type PlayerSetupOwner = {
  id: string;
  playerSetupOptions: readonly { id: string }[];
};

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function createAdventure(
  rawRequest: unknown,
  options: CreateAdventureOptions = {}
): Promise<Adventure> {
  const request: CreateAdventureRequest = CreateAdventureRequestSchema.parse(rawRequest);
  const storedCandidate = getStoredAdventureCandidate(request.candidateId);

  if (!storedCandidate) {
    throw new Error(`adventure candidate not found: ${request.candidateId}`);
  }

  if (storedCandidate.worldSeedId !== request.worldSeedId) {
    throw new Error(`adventure candidate does not belong to world seed: ${request.worldSeedId}`);
  }

  resolveSelectedPlayerSetupId(storedCandidate.concept, request.selectedPlayerSetupId);

  const materializedCandidate = await materializeAdventureCandidate(request.candidateId, options);

  if (!materializedCandidate?.candidate) {
    throw new Error(`adventure candidate not found: ${request.candidateId}`);
  }

  return createAdventureFromCandidate({
    candidate: materializedCandidate.candidate,
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
  const selectedPlayerSetupId = resolveSelectedPlayerSetupId(
    request.candidate,
    request.selectedPlayerSetupId
  );
  const adventure = AdventureSchema.parse({
    ...request.candidate,
    id: createId("adventure"),
    sourceCandidateId: request.candidate.id,
    worldSeedId: request.worldSeedId,
    currentAct: "act1",
    selectedPlayerSetupId,
    createdAt: now,
    updatedAt: now
  });

  adventures.set(adventure.id, adventure);

  return adventure;
}

export function getAdventure(adventureId: string): Adventure | undefined {
  return adventures.get(adventureId);
}

function resolveSelectedPlayerSetupId(
  candidate: PlayerSetupOwner,
  selectedPlayerSetupId?: string
): string {
  const resolvedPlayerSetupId = selectedPlayerSetupId ?? candidate.playerSetupOptions[0]?.id;

  if (!resolvedPlayerSetupId) {
    throw new Error(`adventure candidate has no player setup options: ${candidate.id}`);
  }

  if (!candidate.playerSetupOptions.some((option) => option.id === resolvedPlayerSetupId)) {
    throw new Error(
      `player setup option does not belong to adventure candidate: ${resolvedPlayerSetupId}`
    );
  }

  return resolvedPlayerSetupId;
}
