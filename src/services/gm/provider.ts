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
  messageHistory: readonly Message[];
  previousInternalStatePatches: readonly GmInternalStatePatch[];
  previousSuggestedMoves: readonly SuggestedMove[];
};

export type GmProvider = {
  generateTurn(input: GmTurnInput): Promise<GmTurnResult>;
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
