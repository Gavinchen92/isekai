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
import { getGmProvider, type GmTurnInput, type GmUserMessage } from "./gm/provider";
import { classifyPlayerInput } from "./input-intent";
import * as journeyMemoryService from "./journey-memory";
import { getSession, updateSessionAfterTurn } from "./sessions";
import type { LogContext } from "../shared/logger";
import {
  loadGmInternalStatePatchesForSession,
  loadMessagesForSession,
  loadSuggestedMovesForSession,
  saveGmInternalStatePatchesForSession,
  saveMessagesForSession,
  saveSuggestedMovesForSession
} from "../storage/persistence";

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
  logContext?: LogContext;
  onJourneyMemoryPostProcessSettled?: (result: TurnPostProcessResult) => void;
};

type CreateTurnStreamOptions = {
  logContext?: LogContext;
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
  const context = await prepareTurnContext(rawRequest, {
    logContext: {
      ...options.logContext,
      operation: options.logContext?.operation ?? "turn_generation"
    }
  });
  const logContext = buildTurnLogContext(context, options.logContext, "turn_generation");
  const gmResult = await getGmProvider().generateTurn({
    adventure: context.adventure,
    session: getSessionOrThrow(context.request.sessionId),
    userMessage: context.userMessage,
    journeyMemory: journeyMemoryService.listJourneyMemory(context.sessionId),
    logContext,
    messageHistory: context.messageHistory,
    previousInternalStatePatches: context.previousInternalStatePatches,
    previousSuggestedMoves: context.previousSuggestedMoves
  });

  const artifacts = finalizeTurnFromGmResult(context, gmResult, undefined, options);

  return artifacts.response;
}

export async function* createTurnStream(
  rawRequest: unknown,
  options: CreateTurnStreamOptions = {}
): AsyncGenerator<TurnStreamEvent> {
  const context = await prepareTurnContext(rawRequest, {
    logContext: {
      ...options.logContext,
      operation: options.logContext?.operation ?? "turn_stream"
    }
  });
  const logContext = buildTurnLogContext(context, options.logContext, "turn_stream");
  const assistantMessageId = createId("message");
  const provider = getGmProvider();

  yield TurnStreamEventSchema.parse({
    type: "turn_started",
    userMessage: context.parsedUserMessage
  });

  const gmInput: GmTurnInput = {
    adventure: context.adventure,
    session: getSessionOrThrow(context.request.sessionId),
    userMessage: context.userMessage,
    journeyMemory: journeyMemoryService.listJourneyMemory(context.sessionId),
    logContext,
    messageHistory: context.messageHistory,
    previousInternalStatePatches: context.previousInternalStatePatches,
    previousSuggestedMoves: context.previousSuggestedMoves
  };
  let gmResult: GmTurnResult | undefined;

  if (provider.streamTurn) {
    for await (const event of provider.streamTurn(gmInput)) {
      if (event.type === "narration_chunk") {
        yield TurnStreamEventSchema.parse({
          type: "narration_chunk",
          assistantMessageId,
          chunk: event.chunk
        });
        continue;
      }

      gmResult = event.result;
    }
  } else {
    gmResult = await provider.generateTurn(gmInput);

    yield TurnStreamEventSchema.parse({
      type: "narration_chunk",
      assistantMessageId,
      chunk: gmResult.narration
    });
  }

  if (!gmResult) {
    throw new Error("GM stream did not complete");
  }

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
  const cachedMessages = messagesBySession.get(sessionId);

  if (cachedMessages) {
    return cachedMessages;
  }

  const persistedMessages = loadMessagesForSession(sessionId);

  if (persistedMessages.length > 0) {
    messagesBySession.set(sessionId, [...persistedMessages]);
  }

  return persistedMessages;
}

export function listSuggestedMoves(sessionId: string): readonly SuggestedMove[] {
  const cachedMoves = suggestedMovesBySession.get(sessionId);

  if (cachedMoves) {
    return cachedMoves;
  }

  const persistedMoves = loadSuggestedMovesForSession(sessionId);

  if (persistedMoves.length > 0) {
    suggestedMovesBySession.set(sessionId, [...persistedMoves]);
  }

  return persistedMoves;
}

export function listGmInternalStatePatches(sessionId: string): readonly GmInternalStatePatch[] {
  const cachedPatches = gmInternalStatePatchesBySession.get(sessionId);

  if (cachedPatches) {
    return cachedPatches;
  }

  const persistedPatches = loadGmInternalStatePatchesForSession(sessionId);

  if (persistedPatches.length > 0) {
    gmInternalStatePatchesBySession.set(sessionId, [...persistedPatches]);
  }

  return persistedPatches;
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

  const messages = listMessages(sessionId);

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

async function prepareTurnContext(
  rawRequest: unknown,
  options: { logContext?: LogContext } = {}
): Promise<PreparedTurnContext> {
  const request: CreateTurnRequest = CreateTurnRequestSchema.parse(rawRequest);
  const session = getSessionOrThrow(request.sessionId);
  const adventure = getAdventure(session.adventureId);

  if (!adventure) {
    throw new Error(`adventure not found: ${session.adventureId}`);
  }

  const now = new Date().toISOString();
  const inputIntent = await classifyPlayerInput(
    {
      content: request.content,
      inputKind: request.inputKind
    },
    {
      logContext: {
        ...options.logContext,
        sessionId: options.logContext?.sessionId ?? session.id,
        worldSeedId: options.logContext?.worldSeedId ?? adventure.worldSeedId
      }
    }
  );
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
    messageHistory: listMessages(session.id),
    previousSuggestedMoves: listSuggestedMoves(session.id),
    previousInternalStatePatches: listGmInternalStatePatches(session.id)
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
  saveMessagesForSession(context.sessionId, messages);
  saveSuggestedMovesForSession(context.sessionId, suggestedMoves);

  const nextInternalStatePatches = [
    ...listGmInternalStatePatches(context.sessionId),
    gmResult.internalStatePatch
  ];

  gmInternalStatePatchesBySession.set(context.sessionId, nextInternalStatePatches);
  saveGmInternalStatePatchesForSession(context.sessionId, nextInternalStatePatches);
  updateSessionAfterTurn(
    context.sessionId,
    gmResult.internalStatePatch.currentAct
      ? {
          currentAct: gmResult.internalStatePatch.currentAct
        }
      : undefined
  );
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

function buildTurnLogContext(
  context: PreparedTurnContext,
  logContext: LogContext | undefined,
  defaultOperation: string
): LogContext {
  return {
    ...logContext,
    operation: logContext?.operation ?? defaultOperation,
    sessionId: logContext?.sessionId ?? context.sessionId,
    worldSeedId: logContext?.worldSeedId ?? context.adventure.worldSeedId
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
