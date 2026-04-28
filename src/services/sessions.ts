import {
  CreateSessionRequestSchema,
  SessionSchema,
  type CreateSessionRequest,
  type Session
} from "../domain";
import { getAdventure } from "./adventures";
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
  initializeJourneyMemory(session.id, adventure);

  return session;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}
