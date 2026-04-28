import type {
  Adventure,
  GmInternalStatePatch,
  GmTurnResult,
  InputIntentClassification,
  JourneyMemoryEntry,
  Message,
  MessageInputKind,
  PlayerInputIntent,
  Session,
  SuggestedMove
} from "../../domain";
import type { LogContext } from "../../shared/logger";
import { mockGmProvider } from "./mock-provider";
import { openAiGmProvider } from "./openai-provider";

export type GmUserMessage = Message & {
  role: "user";
  inputKind: MessageInputKind;
  inferredIntent: PlayerInputIntent;
  normalizedAttempt: InputIntentClassification["normalizedAttempt"];
  isResultClaim: InputIntentClassification["isResultClaim"];
  intentConfidence: InputIntentClassification["confidence"];
};

export type GmTurnInput = {
  adventure: Adventure;
  session: Session;
  userMessage: GmUserMessage;
  journeyMemory: readonly JourneyMemoryEntry[];
  logContext?: LogContext;
  messageHistory: readonly Message[];
  previousInternalStatePatches: readonly GmInternalStatePatch[];
  previousSuggestedMoves: readonly SuggestedMove[];
};

export type GmTurnStreamEvent =
  | {
      type: "narration_chunk";
      chunk: string;
    }
  | {
      type: "completed";
      result: GmTurnResult;
    };

export type GmProvider = {
  generateTurn(input: GmTurnInput): Promise<GmTurnResult>;
  streamTurn?(input: GmTurnInput): AsyncGenerator<GmTurnStreamEvent>;
};

export function getGmProvider(): GmProvider {
  const providerName = process.env.GM_PROVIDER ?? "mock";

  switch (providerName) {
    case "mock":
      return mockGmProvider;
    case "openai":
    case "openai-compatible":
      return openAiGmProvider;
    default:
      throw new Error(`Unsupported GM_PROVIDER: ${providerName}`);
  }
}

export type { GmInternalStatePatch };
