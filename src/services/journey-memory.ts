import {
  JourneyMemoryEntryListSchema,
  JourneyMemoryEntrySchema,
  type Adventure,
  type GmJourneyMemoryCandidate,
  type JourneyMemoryEntry,
  type JourneyMemoryEntryType,
  type Message
} from "../domain";
import {
  loadJourneyMemoryEntriesForSession,
  saveJourneyMemoryEntriesForSession
} from "../storage/persistence";

const journeyMemoryBySession = new Map<string, JourneyMemoryEntry[]>();

type JourneyMemoryDraft = Omit<JourneyMemoryEntry, "id" | "sessionId" | "updatedAt"> & {
  key: string;
  updatedAt?: string;
};

type MemoryTurnInput = {
  adventure: Adventure;
  assistantMessage: Message;
  memoryCandidates?: readonly GmJourneyMemoryCandidate[];
  userMessage: Message;
};

export function initializeJourneyMemory(sessionId: string, adventure: Adventure): readonly JourneyMemoryEntry[] {
  const now = new Date().toISOString();
  const selectedPlayerSetup = adventure.playerSetupOptions.find(
    (option) => option.id === adventure.selectedPlayerSetupId
  );
  const drafts: JourneyMemoryDraft[] = [
    {
      key: selectedPlayerSetup?.id ?? "identity",
      type: "identity",
      title: "我的身份",
      summary: selectedPlayerSetup?.title ?? "身份尚未明确",
      details: [
        selectedPlayerSetup?.description ?? "你还没有明确的公开身份。",
        selectedPlayerSetup?.startingGoal ? `最初牵引：${selectedPlayerSetup.startingGoal}` : ""
      ].filter(Boolean),
      visibility: "known",
      relatedNpcIds: [],
      relatedLocationIds: [],
      sourceMessageIds: []
    },
    ...adventure.npcSeeds.map<JourneyMemoryDraft>((npc) => ({
      key: npc.id,
      type: "npc",
      title: npc.name,
      summary: npc.role,
      details: [npc.publicDescription],
      visibility: "known",
      relatedNpcIds: [npc.id],
      relatedLocationIds: [],
      sourceMessageIds: []
    })),
    ...adventure.locations.map<JourneyMemoryDraft>((location) => ({
      key: location.id,
      type: "location",
      title: location.name,
      summary: location.description,
      details: [location.description],
      visibility: "known",
      relatedNpcIds: [],
      relatedLocationIds: [location.id],
      sourceMessageIds: []
    }))
  ];

  const entries = drafts.map((draft) => createEntryFromDraft(sessionId, draft, now));
  journeyMemoryBySession.set(sessionId, entries);
  saveJourneyMemoryEntriesForSession(sessionId, entries);

  return JourneyMemoryEntryListSchema.parse(entries);
}

export function listJourneyMemory(sessionId: string): readonly JourneyMemoryEntry[] {
  const cachedEntries = journeyMemoryBySession.get(sessionId);

  if (cachedEntries) {
    return JourneyMemoryEntryListSchema.parse(cachedEntries);
  }

  const persistedEntries = loadJourneyMemoryEntriesForSession(sessionId);

  if (persistedEntries.length > 0) {
    journeyMemoryBySession.set(sessionId, [...persistedEntries]);
  }

  return JourneyMemoryEntryListSchema.parse(persistedEntries);
}

export function extractJourneyMemoryFromTurn(
  sessionId: string,
  input: MemoryTurnInput
): readonly JourneyMemoryEntry[] {
  if (input.userMessage.inferredIntent === "world_override_attempt") {
    return listJourneyMemory(sessionId);
  }

  const candidateDrafts = buildMemoryDraftsFromCandidates(input.memoryCandidates ?? [], input);
  const drafts =
    candidateDrafts.length > 0
      ? candidateDrafts
      : input.userMessage.inferredIntent === "ooc_instruction"
        ? buildCorrectionDraftsFromTurn(input)
        : buildMemoryDraftsFromTurn(input);

  if (drafts.length === 0) {
    return listJourneyMemory(sessionId);
  }

  const currentEntries = journeyMemoryBySession.get(sessionId) ?? [];
  const nextEntries = drafts.reduce(
    (entries, draft) => upsertJourneyMemoryEntry(sessionId, entries, draft),
    currentEntries
  );

  journeyMemoryBySession.set(sessionId, nextEntries);
  saveJourneyMemoryEntriesForSession(sessionId, nextEntries);

  return JourneyMemoryEntryListSchema.parse(nextEntries);
}

function buildMemoryDraftsFromCandidates(
  candidates: readonly GmJourneyMemoryCandidate[],
  input: MemoryTurnInput
): JourneyMemoryDraft[] {
  return candidates
    .filter((candidate) => candidate.confidence === "high")
    .map((candidate) => ({
      key: candidate.key,
      type: candidate.type,
      title: candidate.title,
      summary: candidate.summary,
      details: candidate.details,
      visibility: candidate.visibility,
      relatedNpcIds: candidate.relatedNpcIds,
      relatedLocationIds: candidate.relatedLocationIds,
      sourceMessageIds: [input.assistantMessage.id]
    }));
}

function buildMemoryDraftsFromTurn(input: MemoryTurnInput): JourneyMemoryDraft[] {
  const firstNpc = input.adventure.npcSeeds[0];
  const firstLocation = input.adventure.locations[0];
  const assistantContent = input.assistantMessage.content;
  const sourceMessageIds = [input.assistantMessage.id];
  const drafts: JourneyMemoryDraft[] = [];

  if (firstNpc && input.userMessage.inferredIntent === "character_speech") {
    drafts.push({
      key: firstNpc.id,
      type: "relationship",
      title: `${firstNpc.name}的回应`,
      summary: `${firstNpc.name}愿意继续回应你，但仍保留一部分真相。`,
      details: [trimMemoryDetail(assistantContent)],
      visibility: "known",
      relatedNpcIds: [firstNpc.id],
      relatedLocationIds: firstLocation ? [firstLocation.id] : [],
      sourceMessageIds
    });
  }

  if (isConfirmedClueText(assistantContent)) {
    drafts.push({
      key: firstLocation?.id ?? "scene",
      type: "clue",
      title: firstLocation ? `${firstLocation.name}的异常痕迹` : "新的异常痕迹",
      summary: "现场出现了可以继续追查的明确痕迹。",
      details: [trimMemoryDetail(assistantContent)],
      visibility: "known",
      relatedNpcIds: firstNpc ? [firstNpc.id] : [],
      relatedLocationIds: firstLocation ? [firstLocation.id] : [],
      sourceMessageIds
    });
  }

  return drafts;
}

function buildCorrectionDraftsFromTurn(input: MemoryTurnInput): JourneyMemoryDraft[] {
  const firstNpc = input.adventure.npcSeeds[0];

  if (!firstNpc) {
    return [];
  }

  return [
    {
      key: firstNpc.id,
      type: "relationship",
      title: `${firstNpc.name}的回应`,
      summary: `你与${firstNpc.name}的关系仍需要继续观察。`,
      details: ["这段关系仍有疑点，暂时按存疑记录。"],
      visibility: "uncertain",
      relatedNpcIds: [firstNpc.id],
      relatedLocationIds: [],
      sourceMessageIds: [input.userMessage.id, input.assistantMessage.id]
    }
  ];
}

function upsertJourneyMemoryEntry(
  sessionId: string,
  entries: JourneyMemoryEntry[],
  draft: JourneyMemoryDraft
): JourneyMemoryEntry[] {
  const now = new Date().toISOString();
  const id = createJourneyMemoryId(sessionId, draft.type, draft.key);
  const existingEntryIndex = entries.findIndex((entry) => entry.id === id);
  const existingEntry = entries[existingEntryIndex];

  if (!existingEntry) {
    return [...entries, createEntryFromDraft(sessionId, draft, now)];
  }

  const mergedEntry = JourneyMemoryEntrySchema.parse({
    ...existingEntry,
    summary: draft.summary,
    details: mergeUniqueText(existingEntry.details, draft.details),
    visibility: draft.visibility,
    relatedNpcIds: mergeUniqueText(existingEntry.relatedNpcIds, draft.relatedNpcIds),
    relatedLocationIds: mergeUniqueText(existingEntry.relatedLocationIds, draft.relatedLocationIds),
    sourceMessageIds: mergeUniqueText(existingEntry.sourceMessageIds, draft.sourceMessageIds),
    updatedAt: now
  });

  return entries.map((entry, index) => (index === existingEntryIndex ? mergedEntry : entry));
}

function createEntryFromDraft(
  sessionId: string,
  draft: JourneyMemoryDraft,
  updatedAt: string
): JourneyMemoryEntry {
  return JourneyMemoryEntrySchema.parse({
    id: createJourneyMemoryId(sessionId, draft.type, draft.key),
    sessionId,
    type: draft.type,
    title: draft.title,
    summary: draft.summary,
    details: draft.details,
    visibility: draft.visibility,
    relatedNpcIds: draft.relatedNpcIds,
    relatedLocationIds: draft.relatedLocationIds,
    sourceMessageIds: draft.sourceMessageIds,
    updatedAt: draft.updatedAt ?? updatedAt
  });
}

function createJourneyMemoryId(
  sessionId: string,
  type: JourneyMemoryEntryType,
  key: string
): string {
  return `${sessionId}-${type}-${key.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
}

function isConfirmedClueText(text: string): boolean {
  return /(线索|痕迹|证据|标记|符文|脚印|刻意掩盖|浮出水面|指向)/u.test(text);
}

function trimMemoryDetail(text: string): string {
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

function mergeUniqueText(left: readonly string[], right: readonly string[]): string[] {
  return Array.from(new Set([...left, ...right]));
}
