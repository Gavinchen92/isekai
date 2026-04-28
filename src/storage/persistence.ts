import {
  AdventureSchema,
  GmInternalStatePatchSchema,
  JourneyMemoryEntryListSchema,
  JourneyMemoryEntrySchema,
  MessageSchema,
  SessionSchema,
  SuggestedMoveSchema,
  type Adventure,
  type GmInternalStatePatch,
  type JourneyMemoryEntry,
  type Message,
  type Session,
  type SuggestedMove
} from "../domain";
import { getDatabase } from "./database";
import { z } from "zod";

const PayloadRowSchema = z.object({
  payload: z.string()
});

export function saveAdventure(adventure: Adventure): void {
  getDatabase()
    .prepare(
      `
        INSERT INTO adventures (
          id,
          source_candidate_id,
          world_seed_id,
          created_at,
          updated_at,
          payload
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_candidate_id = excluded.source_candidate_id,
          world_seed_id = excluded.world_seed_id,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          payload = excluded.payload
      `
    )
    .run(
      adventure.id,
      adventure.sourceCandidateId,
      adventure.worldSeedId,
      adventure.createdAt,
      adventure.updatedAt,
      serializePayload(adventure)
    );
}

export function loadAdventure(adventureId: string): Adventure | undefined {
  return parsePayloadRow(AdventureSchema, selectPayloadById("adventures", adventureId));
}

export function saveSession(session: Session): void {
  getDatabase()
    .prepare(
      `
        INSERT INTO sessions (
          id,
          adventure_id,
          current_act,
          created_at,
          updated_at,
          payload
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          adventure_id = excluded.adventure_id,
          current_act = excluded.current_act,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          payload = excluded.payload
      `
    )
    .run(
      session.id,
      session.adventureId,
      session.currentAct,
      session.createdAt,
      session.updatedAt,
      serializePayload(session)
    );
}

export function loadSession(sessionId: string): Session | undefined {
  return parsePayloadRow(SessionSchema, selectPayloadById("sessions", sessionId));
}

export function loadLatestSession(): Session | undefined {
  const row = getDatabase()
    .prepare(
      `
        SELECT payload
        FROM sessions
        ORDER BY updated_at DESC, created_at DESC, id DESC
        LIMIT 1
      `
    )
    .get();

  return parsePayloadRow(SessionSchema, row);
}

export function saveMessagesForSession(
  sessionId: string,
  messages: readonly Message[]
): void {
  replaceSessionRows(
    "messages",
    sessionId,
    messages.map((message, index) => ({
      createdAt: message.createdAt,
      id: message.id,
      payload: serializePayload(message),
      position: index,
      sessionId
    }))
  );
}

export function loadMessagesForSession(sessionId: string): readonly Message[] {
  return selectPayloadsForSession("messages", sessionId).map((row) =>
    parsePayload(MessageSchema, row.payload)
  );
}

export function saveSuggestedMovesForSession(
  sessionId: string,
  suggestedMoves: readonly SuggestedMove[]
): void {
  replaceSessionRows(
    "suggested_moves",
    sessionId,
    suggestedMoves.map((move, index) => ({
      createdAt: move.createdAt,
      id: move.id,
      payload: serializePayload(move),
      position: index,
      sessionId
    }))
  );
}

export function loadSuggestedMovesForSession(sessionId: string): readonly SuggestedMove[] {
  return selectPayloadsForSession("suggested_moves", sessionId).map((row) =>
    parsePayload(SuggestedMoveSchema, row.payload)
  );
}

export function saveJourneyMemoryEntriesForSession(
  sessionId: string,
  entries: readonly JourneyMemoryEntry[]
): void {
  const parsedEntries = JourneyMemoryEntryListSchema.parse(entries);
  const database = getDatabase();

  database.prepare("DELETE FROM journey_memory_entries WHERE session_id = ?").run(sessionId);

  const insertEntry = database.prepare(
    `
      INSERT INTO journey_memory_entries (
        id,
        session_id,
        type,
        updated_at,
        payload
      )
      VALUES (?, ?, ?, ?, ?)
    `
  );

  parsedEntries.forEach((entry) => {
    insertEntry.run(entry.id, sessionId, entry.type, entry.updatedAt, serializePayload(entry));
  });
}

export function loadJourneyMemoryEntriesForSession(
  sessionId: string
): readonly JourneyMemoryEntry[] {
  const rows = getDatabase()
    .prepare(
      `
        SELECT payload
        FROM journey_memory_entries
        WHERE session_id = ?
        ORDER BY updated_at ASC, id ASC
      `
    )
    .all(sessionId);

  return JourneyMemoryEntryListSchema.parse(
    rows.map((row) => parsePayloadRow(JourneyMemoryEntrySchema, row))
  );
}

export function saveGmInternalStatePatchesForSession(
  sessionId: string,
  patches: readonly GmInternalStatePatch[]
): void {
  const database = getDatabase();

  database.prepare("DELETE FROM gm_internal_state_patches WHERE session_id = ?").run(sessionId);

  const insertPatch = database.prepare(
    `
      INSERT INTO gm_internal_state_patches (
        id,
        session_id,
        position,
        payload
      )
      VALUES (?, ?, ?, ?)
    `
  );

  patches.forEach((patch, index) => {
    insertPatch.run(
      `${sessionId}-patch-${index}`,
      sessionId,
      index,
      serializePayload(GmInternalStatePatchSchema.parse(patch))
    );
  });
}

export function loadGmInternalStatePatchesForSession(
  sessionId: string
): readonly GmInternalStatePatch[] {
  return selectPayloadsForSession("gm_internal_state_patches", sessionId).map((row) =>
    parsePayload(GmInternalStatePatchSchema, row.payload)
  );
}

function selectPayloadById(tableName: "adventures" | "sessions", id: string): unknown {
  return getDatabase().prepare(`SELECT payload FROM ${tableName} WHERE id = ?`).get(id);
}

function replaceSessionRows(
  tableName: "messages" | "suggested_moves",
  sessionId: string,
  rows: readonly {
    createdAt: string;
    id: string;
    payload: string;
    position: number;
    sessionId: string;
  }[]
): void {
  const database = getDatabase();

  database.prepare(`DELETE FROM ${tableName} WHERE session_id = ?`).run(sessionId);

  const insertRow = database.prepare(
    `
      INSERT INTO ${tableName} (
        id,
        session_id,
        position,
        created_at,
        payload
      )
      VALUES (?, ?, ?, ?, ?)
    `
  );

  rows.forEach((row) => {
    insertRow.run(row.id, row.sessionId, row.position, row.createdAt, row.payload);
  });
}

function selectPayloadsForSession(
  tableName: "messages" | "suggested_moves" | "gm_internal_state_patches",
  sessionId: string
): readonly { payload: string }[] {
  return getDatabase()
    .prepare(
      `
        SELECT payload
        FROM ${tableName}
        WHERE session_id = ?
        ORDER BY position ASC, id ASC
      `
    )
    .all(sessionId)
    .map((row) => PayloadRowSchema.parse(row));
}

function serializePayload(payload: unknown): string {
  return JSON.stringify(payload);
}

function parsePayloadRow<T>(schema: z.ZodType<T>, row: unknown): T | undefined {
  if (!row) {
    return undefined;
  }

  return parsePayload(schema, PayloadRowSchema.parse(row).payload);
}

function parsePayload<T>(schema: z.ZodType<T>, payload: string): T {
  return schema.parse(JSON.parse(payload));
}
