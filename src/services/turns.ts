import {
  CreateTurnRequestSchema,
  MessageSchema,
  SuggestedMoveSchema,
  TurnResponseSchema,
  TurnStreamEventSchema,
  type Adventure,
  type GmInternalStatePatch,
  type GmTurnResult,
  type CreateTurnRequest,
  type Message,
  type SuggestedMove,
  type TurnResponse,
  type TurnStreamEvent
} from "../domain";
import { getAdventure } from "./adventures";
import { getGmProvider, type GmUserMessage } from "./gm/provider";
import { classifyPlayerInput } from "./input-intent";
import * as journeyMemoryService from "./journey-memory";
import { getSession } from "./sessions";

const messagesBySession = new Map<string, Message[]>();
const suggestedMovesBySession = new Map<string, SuggestedMove[]>();
const gmInternalStatePatchesBySession = new Map<string, GmInternalStatePatch[]>();
const journeyMemoryPostProcessBySession = new Map<string, Promise<unknown>>();

export type TurnPostProcessResult =
  | {
      durationMs: number;
      status: "completed";
    }
  | {
      durationMs: number;
      error: unknown;
      status: "failed";
    };

type CreateTurnOptions = {
  onJourneyMemoryPostProcessSettled?: (result: TurnPostProcessResult) => void;
};

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

type PreparedTurnContext = {
  request: CreateTurnRequest;
  sessionId: string;
  adventure: Adventure;
  parsedUserMessage: Message;
  userMessage: GmUserMessage;
  messageHistory: readonly Message[];
  previousSuggestedMoves: readonly SuggestedMove[];
  previousInternalStatePatches: readonly GmInternalStatePatch[];
};

type TurnArtifacts = {
  assistantMessage: Message;
  suggestedMoves: SuggestedMove[];
  response: TurnResponse;
};

export async function createTurn(
  rawRequest: unknown,
  options: CreateTurnOptions = {}
): Promise<TurnResponse> {
  const context = await prepareTurnContext(rawRequest);
  const gmResult = await getGmProvider().generateTurn({
    adventure: context.adventure,
    session: getSessionOrThrow(context.request.sessionId),
    userMessage: context.userMessage,
    journeyMemory: journeyMemoryService.listJourneyMemory(context.sessionId),
    messageHistory: context.messageHistory,
    previousInternalStatePatches: context.previousInternalStatePatches,
    previousSuggestedMoves: context.previousSuggestedMoves
  });

  const artifacts = finalizeTurnFromGmResult(context, gmResult, undefined, options);

  return artifacts.response;
}

export async function* createTurnStream(rawRequest: unknown): AsyncGenerator<TurnStreamEvent> {
  const context = await prepareTurnContext(rawRequest);
  const assistantMessageId = createId("message");

  yield TurnStreamEventSchema.parse({
    type: "turn_started",
    userMessage: context.parsedUserMessage
  });

  const gmResult = await getGmProvider().generateTurn({
    adventure: context.adventure,
    session: getSessionOrThrow(context.request.sessionId),
    userMessage: context.userMessage,
    journeyMemory: journeyMemoryService.listJourneyMemory(context.sessionId),
    messageHistory: context.messageHistory,
    previousInternalStatePatches: context.previousInternalStatePatches,
    previousSuggestedMoves: context.previousSuggestedMoves
  });

  yield TurnStreamEventSchema.parse({
    type: "narration_chunk",
    assistantMessageId,
    chunk: gmResult.narration
  });

  const artifacts = finalizeTurnFromGmResult(context, gmResult, assistantMessageId);

  yield TurnStreamEventSchema.parse({
    type: "suggested_moves_ready",
    suggestedMoves: artifacts.suggestedMoves
  });

  yield TurnStreamEventSchema.parse({
    type: "turn_completed",
    turn: artifacts.response
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
      journeyMemoryService.extractJourneyMemoryFromTurn(session.id, {
        adventure,
        assistantMessage,
        userMessage
      });
    }
  }

  return journeyMemoryService.listJourneyMemory(sessionId);
}

export function waitForTurnPostProcessing(sessionId: string): Promise<void> {
  return (journeyMemoryPostProcessBySession.get(sessionId) ?? Promise.resolve()).then(
    () => undefined
  );
}

function enqueueJourneyMemoryPostProcess(
  sessionId: string,
  task: () => void | Promise<void>
): Promise<unknown> {
  const previousTask = journeyMemoryPostProcessBySession.get(sessionId) ?? Promise.resolve();
  const nextTask = previousTask
    .then(
      () =>
        new Promise<unknown>((resolve) => {
          queueMicrotask(() => {
            Promise.resolve(task())
              .then(() => resolve(undefined))
              .catch((error: unknown) => resolve(error));
          });
        })
    );

  journeyMemoryPostProcessBySession.set(
    sessionId,
    nextTask.finally(() => {
      if (journeyMemoryPostProcessBySession.get(sessionId) === nextTask) {
        journeyMemoryPostProcessBySession.delete(sessionId);
      }
    })
  );

  return nextTask;
}

async function prepareTurnContext(rawRequest: unknown): Promise<PreparedTurnContext> {
  const request: CreateTurnRequest = CreateTurnRequestSchema.parse(rawRequest);
  const session = getSessionOrThrow(request.sessionId);
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

  return {
    request,
    sessionId: session.id,
    adventure,
    parsedUserMessage,
    userMessage,
    messageHistory: messagesBySession.get(session.id) ?? [],
    previousSuggestedMoves: suggestedMovesBySession.get(session.id) ?? [],
    previousInternalStatePatches: gmInternalStatePatchesBySession.get(session.id) ?? []
  };
}

function finalizeTurnFromGmResult(
  context: PreparedTurnContext,
  gmResult: GmTurnResult,
  assistantMessageId = createId("message"),
  options: CreateTurnOptions = {}
): TurnArtifacts {
  const assistantMessage = MessageSchema.parse({
    id: assistantMessageId,
    sessionId: context.sessionId,
    role: "assistant",
    content: gmResult.narration,
    createdAt: new Date().toISOString()
  });
  const messages = [...context.messageHistory, context.parsedUserMessage, assistantMessage];
  const suggestedMoves = buildSuggestedMovesFromGmResult(
    context.sessionId,
    assistantMessage.id,
    gmResult.suggestedMoves
  );

  messagesBySession.set(context.sessionId, messages);
  suggestedMovesBySession.set(context.sessionId, suggestedMoves);
  gmInternalStatePatchesBySession.set(context.sessionId, [
    ...(gmInternalStatePatchesBySession.get(context.sessionId) ?? []),
    gmResult.internalStatePatch
  ]);
  const journeyMemoryPostProcessStartedAt = performance.now();
  void enqueueJourneyMemoryPostProcess(context.sessionId, async () => {
    journeyMemoryService.extractJourneyMemoryFromTurn(context.sessionId, {
      adventure: context.adventure,
      assistantMessage,
      memoryCandidates: gmResult.journeyMemoryCandidates,
      userMessage: context.userMessage
    });
  }).then((error) => {
    if (!error) {
      options.onJourneyMemoryPostProcessSettled?.({
        durationMs: Math.round(performance.now() - journeyMemoryPostProcessStartedAt),
        status: "completed"
      });
      return;
    }

    options.onJourneyMemoryPostProcessSettled?.({
      durationMs: Math.round(performance.now() - journeyMemoryPostProcessStartedAt),
      error,
      status: "failed"
    });
  });

  const response = TurnResponseSchema.parse({
    messages: [context.userMessage, assistantMessage],
    suggestedMoves
  });

  return {
    assistantMessage,
    suggestedMoves,
    response
  };
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

function getSessionOrThrow(sessionId: string) {
  const session = getSession(sessionId);

  if (!session) {
    throw new Error(`session not found: ${sessionId}`);
  }

  return session;
}
