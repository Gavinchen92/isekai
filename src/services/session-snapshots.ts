import { SessionSnapshotSchema, type SessionSnapshot } from "../domain";
import { getAdventure } from "./adventures";
import { getLatestSession, getSession } from "./sessions";
import { listMessages, listSuggestedMoves } from "./turns";

export function getSessionSnapshot(sessionId: string): SessionSnapshot | undefined {
  const session = getSession(sessionId);

  if (!session) {
    return undefined;
  }

  const adventure = getAdventure(session.adventureId);

  if (!adventure) {
    throw new Error(`adventure not found: ${session.adventureId}`);
  }

  return SessionSnapshotSchema.parse({
    adventure,
    messages: listMessages(session.id),
    session,
    suggestedMoves: listSuggestedMoves(session.id)
  });
}

export function getLatestSessionSnapshot(): SessionSnapshot | undefined {
  const session = getLatestSession();

  if (!session) {
    return undefined;
  }

  return getSessionSnapshot(session.id);
}
