import {
  CreateTurnRequestSchema,
  MessageSchema,
  SuggestedMoveSchema,
  TurnResponseSchema,
  type GmInternalStatePatch,
  type CreateTurnRequest,
  type Message,
  type MessageInputKind,
  type SuggestedMove,
  type TurnResponse
} from "../domain";
import { getAdventure } from "./adventures";
import { getGmProvider, type GmUserMessage } from "./gm/provider";
import { classifyPlayerInput } from "./input-intent";
import { extractJourneyMemoryFromTurn, listJourneyMemory } from "./journey-memory";
import { getSession } from "./sessions";

const messagesBySession = new Map<string, Message[]>();
const suggestedMovesBySession = new Map<string, SuggestedMove[]>();
const gmInternalStatePatchesBySession = new Map<string, GmInternalStatePatch[]>();

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function createTurn(rawRequest: unknown): Promise<TurnResponse> {
  const request: CreateTurnRequest = CreateTurnRequestSchema.parse(rawRequest);
  const session = getSession(request.sessionId);

  if (!session) {
    throw new Error(`session not found: ${request.sessionId}`);
  }

  const adventure = getAdventure(session.adventureId);

  if (!adventure) {
    throw new Error(`adventure not found: ${session.adventureId}`);
  }

  const now = new Date().toISOString();
  const inputIntent = await classifyPlayerInput({
    content: request.content,
    inputKind: request.inputKind
  });
  const inferredIntent = inputIntent.intent;
  const parsedUserMessage = MessageSchema.parse({
    id: createId("message"),
    sessionId: session.id,
    role: "user",
    inputKind: request.inputKind,
    inferredIntent,
    content: request.content,
    createdAt: now
  });
  const userMessage: GmUserMessage = {
    ...parsedUserMessage,
    role: "user",
    inputKind: request.inputKind,
    inferredIntent,
    intentConfidence: inputIntent.confidence,
    isResultClaim: inputIntent.isResultClaim,
    normalizedAttempt: inputIntent.normalizedAttempt
  };
  const messageHistory = messagesBySession.get(session.id) ?? [];
  const previousSuggestedMoves = suggestedMovesBySession.get(session.id) ?? [];
  const previousInternalStatePatches = gmInternalStatePatchesBySession.get(session.id) ?? [];
  const gmResult = await getGmProvider().generateTurn({
    adventure,
    session,
    userMessage,
    journeyMemory: listJourneyMemory(session.id),
    messageHistory,
    previousInternalStatePatches,
    previousSuggestedMoves
  });
  const assistantMessage = MessageSchema.parse({
    id: createId("message"),
    sessionId: session.id,
    role: "assistant",
    content: gmResult.narration,
    createdAt: new Date().toISOString()
  });
  const messages = [...messageHistory, parsedUserMessage, assistantMessage];
  const suggestedMoves = buildSuggestedMovesFromGmResult(
    session.id,
    assistantMessage.id,
    gmResult.suggestedMoves
  );

  messagesBySession.set(session.id, messages);
  suggestedMovesBySession.set(session.id, suggestedMoves);
  gmInternalStatePatchesBySession.set(session.id, [
    ...(gmInternalStatePatchesBySession.get(session.id) ?? []),
    gmResult.internalStatePatch
  ]);
  extractJourneyMemoryFromTurn(session.id, {
    adventure,
    assistantMessage,
    memoryCandidates: gmResult.journeyMemoryCandidates,
    userMessage
  });

  return TurnResponseSchema.parse({
    messages: [userMessage, assistantMessage],
    suggestedMoves
  });
}

export function listMessages(sessionId: string): readonly Message[] {
  return messagesBySession.get(sessionId) ?? [];
}

export function listSuggestedMoves(sessionId: string): readonly SuggestedMove[] {
  return suggestedMovesBySession.get(sessionId) ?? [];
}

export function listGmInternalStatePatches(sessionId: string): readonly GmInternalStatePatch[] {
  return gmInternalStatePatchesBySession.get(sessionId) ?? [];
}

export function refreshJourneyMemoryForSession(sessionId: string) {
  const session = getSession(sessionId);

  if (!session) {
    throw new Error(`session not found: ${sessionId}`);
  }

  const adventure = getAdventure(session.adventureId);

  if (!adventure) {
    throw new Error(`adventure not found: ${session.adventureId}`);
  }

  const messages = messagesBySession.get(sessionId) ?? [];

  for (let index = 0; index < messages.length; index += 2) {
    const userMessage = messages[index];
    const assistantMessage = messages[index + 1];

    if (
      userMessage?.role === "user" &&
      userMessage.inferredIntent &&
      assistantMessage?.role === "assistant"
    ) {
      extractJourneyMemoryFromTurn(session.id, {
        adventure,
        assistantMessage,
        userMessage
      });
    }
  }

  return listJourneyMemory(sessionId);
}

function buildSuggestedMovesFromGmResult(
  sessionId: string,
  sourceMessageId: string,
  moveDrafts: readonly {
    label: string;
    intent: string;
    riskLevel?: "low" | "medium" | "high";
    tags: readonly string[];
  }[]
): SuggestedMove[] {
  const now = new Date().toISOString();

  return moveDrafts.map((move) =>
    SuggestedMoveSchema.parse({
      id: createId("move"),
      sessionId,
      sourceMessageId,
      label: move.label,
      intent: move.intent,
      riskLevel: move.riskLevel,
      tags: move.tags,
      createdAt: now
    })
  );
}
