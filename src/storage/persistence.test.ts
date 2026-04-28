import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AdventureSchema,
  JourneyMemoryEntrySchema,
  MessageSchema,
  SessionSchema,
  SuggestedMoveSchema
} from "../domain";
import { generateMockAdventureCandidates } from "../services/adventure-candidates";
import { closeDatabaseForTests, getDatabase } from "./database";
import {
  loadAdventure,
  deleteSession as deletePersistedSession,
  loadGmInternalStatePatchesForSession,
  loadJourneyMemoryEntriesForSession,
  loadMessagesForSession,
  loadSessions,
  loadSession,
  loadSuggestedMovesForSession,
  saveAdventure,
  saveGmInternalStatePatchesForSession,
  saveJourneyMemoryEntriesForSession,
  saveMessagesForSession,
  saveSession,
  saveSuggestedMovesForSession
} from "./persistence";

const originalDbPath = process.env.ISEKAI_DB_PATH;
let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "isekai-storage-"));
  process.env.ISEKAI_DB_PATH = join(tempDir, "isekai.sqlite");
  closeDatabaseForTests();
});

afterEach(() => {
  closeDatabaseForTests();

  if (originalDbPath === undefined) {
    delete process.env.ISEKAI_DB_PATH;
  } else {
    process.env.ISEKAI_DB_PATH = originalDbPath;
  }

  rmSync(tempDir, { force: true, recursive: true });
});

describe("SQLite persistence", () => {
  it("persists adventures and sessions across database reopen", () => {
    const { adventure, session } = createStorageFixtures();

    saveAdventure(adventure);
    saveSession(session);
    closeDatabaseForTests();

    expect(loadAdventure(adventure.id)).toEqual(adventure);
    expect(loadSession(session.id)).toEqual(session);
  });

  it("loads sessions by latest update first", () => {
    const { adventure, session } = createStorageFixtures();
    const olderSession = SessionSchema.parse({
      ...session,
      id: "session-older",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:01.000Z"
    });
    const newerSession = SessionSchema.parse({
      ...session,
      id: "session-newer",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:03.000Z"
    });

    saveAdventure(adventure);
    saveSession(olderSession);
    saveSession(newerSession);

    expect(loadSessions().map((item) => item.id)).toEqual(["session-newer", "session-older"]);
  });

  it("persists turn state and journey memory", () => {
    const { adventure, session } = createStorageFixtures();
    const userMessage = MessageSchema.parse({
      id: "message-user",
      sessionId: session.id,
      role: "user",
      inputKind: "free",
      inferredIntent: "character_action",
      content: "我尝试调查高塔入口",
      createdAt: "2026-04-27T00:00:01.000Z"
    });
    const assistantMessage = MessageSchema.parse({
      id: "message-assistant",
      sessionId: session.id,
      role: "assistant",
      content: "你在高塔入口发现一处被刻意掩盖的痕迹。",
      createdAt: "2026-04-27T00:00:02.000Z"
    });
    const suggestedMove = SuggestedMoveSchema.parse({
      id: "move-1",
      sessionId: session.id,
      sourceMessageId: assistantMessage.id,
      label: "继续检查痕迹",
      intent: "玩家尝试确认痕迹通向哪里",
      riskLevel: "medium",
      tags: ["调查"],
      createdAt: "2026-04-27T00:00:02.000Z"
    });
    const memoryEntry = JourneyMemoryEntrySchema.parse({
      id: `${session.id}-clue-tower`,
      sessionId: session.id,
      type: "clue",
      title: "高塔入口的痕迹",
      summary: "入口处出现被刻意掩盖的痕迹。",
      details: ["痕迹通向高塔深处。"],
      visibility: "known",
      relatedNpcIds: [],
      relatedLocationIds: [adventure.locations[0]?.id ?? "tower"],
      sourceMessageIds: [assistantMessage.id],
      updatedAt: "2026-04-27T00:00:03.000Z"
    });
    const internalPatch = {
      currentAct: "act1" as const,
      flags: ["found-tower-trace"],
      privateNotes: ["玩家已经注意到入口痕迹。"]
    };

    saveMessagesForSession(session.id, [userMessage, assistantMessage]);
    saveSuggestedMovesForSession(session.id, [suggestedMove]);
    saveJourneyMemoryEntriesForSession(session.id, [memoryEntry]);
    saveGmInternalStatePatchesForSession(session.id, [internalPatch]);
    closeDatabaseForTests();

    expect(loadMessagesForSession(session.id)).toEqual([userMessage, assistantMessage]);
    expect(loadSuggestedMovesForSession(session.id)).toEqual([suggestedMove]);
    expect(loadJourneyMemoryEntriesForSession(session.id)).toEqual([memoryEntry]);
    expect(loadGmInternalStatePatchesForSession(session.id)).toEqual([internalPatch]);
  });

  it("deletes a session with its child rows and only removes unreferenced adventures", () => {
    const { adventure, session } = createStorageFixtures();
    const siblingSession = SessionSchema.parse({
      ...session,
      id: "session-sibling",
      createdAt: "2026-04-27T00:00:04.000Z",
      updatedAt: "2026-04-27T00:00:04.000Z"
    });
    const userMessage = MessageSchema.parse({
      id: "message-user-delete",
      sessionId: session.id,
      role: "user",
      inputKind: "free",
      inferredIntent: "character_action",
      content: "我尝试调查高塔入口",
      createdAt: "2026-04-27T00:00:01.000Z"
    });
    const assistantMessage = MessageSchema.parse({
      id: "message-assistant-delete",
      sessionId: session.id,
      role: "assistant",
      content: "你在高塔入口发现一处被刻意掩盖的痕迹。",
      createdAt: "2026-04-27T00:00:02.000Z"
    });
    const suggestedMove = SuggestedMoveSchema.parse({
      id: "move-delete",
      sessionId: session.id,
      sourceMessageId: assistantMessage.id,
      label: "继续检查痕迹",
      intent: "玩家尝试确认痕迹通向哪里",
      riskLevel: "medium",
      tags: ["调查"],
      createdAt: "2026-04-27T00:00:02.000Z"
    });
    const memoryEntry = JourneyMemoryEntrySchema.parse({
      id: `${session.id}-clue-delete`,
      sessionId: session.id,
      type: "clue",
      title: "高塔入口的痕迹",
      summary: "入口处出现被刻意掩盖的痕迹。",
      details: ["痕迹通向高塔深处。"],
      visibility: "known",
      relatedNpcIds: [],
      relatedLocationIds: [adventure.locations[0]?.id ?? "tower"],
      sourceMessageIds: [assistantMessage.id],
      updatedAt: "2026-04-27T00:00:03.000Z"
    });

    saveAdventure(adventure);
    saveSession(session);
    saveSession(siblingSession);
    saveMessagesForSession(session.id, [userMessage, assistantMessage]);
    saveSuggestedMovesForSession(session.id, [suggestedMove]);
    saveJourneyMemoryEntriesForSession(session.id, [memoryEntry]);
    saveGmInternalStatePatchesForSession(session.id, [
      {
        currentAct: "act1",
        flags: ["delete-session"],
        privateNotes: ["等待删除。"]
      }
    ]);

    expect(deletePersistedSession(session.id)).toEqual({ session });
    expect(loadSession(session.id)).toBeUndefined();
    expect(loadMessagesForSession(session.id)).toEqual([]);
    expect(loadSuggestedMovesForSession(session.id)).toEqual([]);
    expect(loadJourneyMemoryEntriesForSession(session.id)).toEqual([]);
    expect(loadGmInternalStatePatchesForSession(session.id)).toEqual([]);
    expect(loadAdventure(adventure.id)).toEqual(adventure);

    expect(deletePersistedSession(siblingSession.id)).toEqual({
      session: siblingSession,
      deletedAdventureId: adventure.id
    });
    expect(loadAdventure(adventure.id)).toBeUndefined();
  });

  it("validates persisted payloads with domain schemas when reading", () => {
    const { adventure } = createStorageFixtures();

    saveAdventure(adventure);
    getDatabase()
      .prepare("UPDATE adventures SET payload = ? WHERE id = ?")
      .run(JSON.stringify({ id: adventure.id }), adventure.id);

    expect(() => loadAdventure(adventure.id)).toThrow();
  });
});

function createStorageFixtures() {
  const [candidate] = generateMockAdventureCandidates({
    candidateCount: 1,
    worldSeedId: "isekai"
  });

  if (!candidate) {
    throw new Error("missing candidate");
  }

  const { requestId: _requestId, ...candidatePayload } = candidate;
  const adventure = AdventureSchema.parse({
    ...candidatePayload,
    id: "adventure-storage",
    sourceCandidateId: candidate.id,
    worldSeedId: "isekai",
    currentAct: "act1",
    selectedPlayerSetupId: candidate.playerSetupOptions[0]?.id,
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z"
  });
  const session = SessionSchema.parse({
    id: "session-storage",
    adventureId: adventure.id,
    mode: "chat",
    dmEnabled: false,
    currentAct: adventure.currentAct,
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z"
  });

  return {
    adventure,
    session
  };
}
