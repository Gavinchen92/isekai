import {
  CreateSessionRequestSchema,
  SessionSchema,
  type CreateSessionRequest,
  type Session
} from "../domain";
import {
  deleteSession as deletePersistedSession,
  loadLatestSession,
  loadSession,
  loadSessions,
  saveSession
} from "../storage/persistence";
import { forgetAdventure, getAdventure } from "./adventures";
import { initializeJourneyMemory } from "./journey-memory";

const sessions = new Map<string, Session>();

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createSession(rawRequest: unknown): Session {
  const request: CreateSessionRequest = CreateSessionRequestSchema.parse(rawRequest);
  const adventure = getAdventure(request.adventureId);

  if (!adventure) {
    throw new Error(`adventure not found: ${request.adventureId}`);
  }

  const now = new Date().toISOString();
  const session = SessionSchema.parse({
    id: createId("session"),
    adventureId: adventure.id,
    mode: "chat",
    dmEnabled: false,
    currentAct: adventure.currentAct,
    createdAt: now,
    updatedAt: now
  });

  sessions.set(session.id, session);
  saveSession(session);
  initializeJourneyMemory(session.id, adventure);

  return session;
}

export function getSession(sessionId: string): Session | undefined {
  const cachedSession = sessions.get(sessionId);

  if (cachedSession) {
    return cachedSession;
  }

  const persistedSession = loadSession(sessionId);

  if (persistedSession) {
    sessions.set(persistedSession.id, persistedSession);
  }

  return persistedSession;
}

export function getLatestSession(): Session | undefined {
  const persistedSession = loadLatestSession();

  if (persistedSession) {
    sessions.set(persistedSession.id, persistedSession);
  }

  return persistedSession;
}

export function listSessions(): readonly Session[] {
  const persistedSessions = loadSessions();

  persistedSessions.forEach((session) => {
    sessions.set(session.id, session);
  });

  return persistedSessions;
}

export function deleteSession(sessionId: string): Session {
  const deleteResult = deletePersistedSession(sessionId);

  if (!deleteResult) {
    throw new Error(`session not found: ${sessionId}`);
  }

  sessions.delete(sessionId);

  if (deleteResult.deletedAdventureId) {
    forgetAdventure(deleteResult.deletedAdventureId);
  }

  return deleteResult.session;
}

export function updateSessionAfterTurn(
  sessionId: string,
  patch: Pick<Session, "currentAct"> | undefined
): Session {
  const session = getSession(sessionId);

  if (!session) {
    throw new Error(`session not found: ${sessionId}`);
  }

  const updatedSession = SessionSchema.parse({
    ...session,
    currentAct: patch?.currentAct ?? session.currentAct,
    updatedAt: new Date().toISOString()
  });

  sessions.set(updatedSession.id, updatedSession);
  saveSession(updatedSession);

  return updatedSession;
}
