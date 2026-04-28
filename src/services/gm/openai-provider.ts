import { GmTurnResultSchema, isResultClaim, type GmTurnResult } from "../../domain";
import {
  logAiStructuredOutputParseFailure,
  type LogContext
} from "../../shared/logger";
import { buildGmPromptMessages, buildGmTurnContext } from "./context";
import {
  requestOpenAiCompatibleJsonObject,
  requestOpenAiCompatibleJsonObjectStream,
  resolveOpenAiCompatibleProviderConfig,
  type OpenAiCompatibleProviderConfig,
  type OpenAiCompatibleProviderConfigInput
} from "./openai-compatible";
import type { GmProvider, GmTurnInput, GmTurnStreamEvent } from "./provider";

type OpenAiGmProviderConfigInput = OpenAiCompatibleProviderConfigInput;
type OpenAiGmProviderConfig = OpenAiCompatibleProviderConfig;

export function createOpenAiGmProvider(
  configInput: Partial<OpenAiGmProviderConfigInput> = {}
): GmProvider {
  return {
    async generateTurn(input: GmTurnInput): Promise<GmTurnResult> {
      const config = resolveOpenAiGmProviderConfig(configInput);
      const context = buildGmTurnContext(input);
      const messages = buildGmPromptMessages(context);
      const logContext: LogContext = {
        ...input.logContext,
        operation: input.logContext?.operation ?? "gm_turn",
        sessionId: input.logContext?.sessionId ?? input.session.id,
        worldSeedId: input.logContext?.worldSeedId ?? input.adventure.worldSeedId
      };
      const content = await requestOpenAiCompatibleJsonObject({
        config,
        label: "OpenAI-compatible GM",
        logContext,
        messages
      });

      return parseGmTurnResultJson(content, logContext);
    },
    async *streamTurn(input: GmTurnInput): AsyncGenerator<GmTurnStreamEvent> {
      const config = resolveOpenAiGmProviderConfig(configInput);
      const context = buildGmTurnContext(input);
      const messages = buildGmPromptMessages(context);
      const logContext: LogContext = {
        ...input.logContext,
        operation: input.logContext?.operation ?? "gm_turn_stream",
        sessionId: input.logContext?.sessionId ?? input.session.id,
        worldSeedId: input.logContext?.worldSeedId ?? input.adventure.worldSeedId
      };
      const narrationTracker = createNarrationDeltaTracker();
      const contentStream = requestOpenAiCompatibleJsonObjectStream({
        config,
        label: "OpenAI-compatible GM",
        logContext,
        messages
      });
      let next = await contentStream.next();

      while (!next.done) {
        const narrationDelta = narrationTracker.push(next.value);

        if (narrationDelta) {
          yield {
            type: "narration_chunk",
            chunk: narrationDelta
          };
        }

        next = await contentStream.next();
      }

      const result = parseGmTurnResultJson(next.value, logContext);
      const emittedNarration = narrationTracker.getEmittedNarration();

      if (result.narration.startsWith(emittedNarration)) {
        const remainingNarration = result.narration.slice(emittedNarration.length);

        if (remainingNarration) {
          yield {
            type: "narration_chunk",
            chunk: remainingNarration
          };
        }
      }

      yield {
        type: "completed",
        result
      };
    }
  };
}

export const openAiGmProvider = createOpenAiGmProvider();

export function resolveOpenAiGmProviderConfig(
  configInput: Partial<OpenAiGmProviderConfigInput> = {}
): OpenAiGmProviderConfig {
  return resolveOpenAiCompatibleProviderConfig(configInput);
}

export function parseGmTurnResultJson(content: string, logContext: LogContext = {}): GmTurnResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(content.trim());
  } catch (error) {
    const parseError = new Error(
      `OpenAI-compatible GM response is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    logAiStructuredOutputParseFailure({
      ...logContext,
      content,
      error: parseError,
      schemaName: "GmTurnResult"
    });
    throw parseError;
  }

  const normalizedDraft = normalizeOpenAiGmTurnResultDraft(parsedJson);
  const result = GmTurnResultSchema.safeParse(normalizedDraft);

  if (!result.success) {
    logAiStructuredOutputParseFailure({
      ...logContext,
      content,
      error: result.error,
      parsedJson: normalizedDraft,
      schemaName: "GmTurnResult"
    });
    throw result.error;
  }

  return result.data;
}

export function extractTopLevelNarrationPrefix(jsonText: string): string | undefined {
  let depth = 0;
  let index = 0;

  while (index < jsonText.length) {
    const char = jsonText[index];

    if (char === "{") {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === "}" || char === "]") {
      depth -= 1;
      index += 1;
      continue;
    }

    if (char === "[") {
      depth += 1;
      index += 1;
      continue;
    }

    if (char !== '"') {
      index += 1;
      continue;
    }

    const parsedString = parseJsonStringPrefix(jsonText, index);

    if (!parsedString.complete) {
      return undefined;
    }

    if (depth !== 1) {
      index = parsedString.end;
      continue;
    }

    const colonIndex = skipJsonWhitespace(jsonText, parsedString.end);

    if (jsonText[colonIndex] !== ":") {
      index = parsedString.end;
      continue;
    }

    if (parsedString.value !== "narration") {
      index = colonIndex + 1;
      continue;
    }

    const valueStartIndex = skipJsonWhitespace(jsonText, colonIndex + 1);

    if (jsonText[valueStartIndex] !== '"') {
      return undefined;
    }

    return parseJsonStringPrefix(jsonText, valueStartIndex).value;
  }

  return undefined;
}

function normalizeOpenAiGmTurnResultDraft(parsedJson: unknown): unknown {
  if (!parsedJson || typeof parsedJson !== "object" || !("suggestedMoves" in parsedJson)) {
    return parsedJson;
  }

  const draft = parsedJson as { suggestedMoves: unknown };

  if (!Array.isArray(draft.suggestedMoves)) {
    return parsedJson;
  }

  return {
    ...parsedJson,
    suggestedMoves: draft.suggestedMoves.map(normalizeSuggestedMoveDraft)
  };
}

function createNarrationDeltaTracker(): {
  getEmittedNarration: () => string;
  push: (chunk: string) => string;
} {
  let jsonText = "";
  let emittedNarration = "";

  return {
    getEmittedNarration: () => emittedNarration,
    push: (chunk: string) => {
      jsonText += chunk;

      const narration = extractTopLevelNarrationPrefix(jsonText);

      if (narration === undefined || narration.length <= emittedNarration.length) {
        return "";
      }

      const delta = narration.slice(emittedNarration.length);
      emittedNarration = narration;

      return delta;
    }
  };
}

function parseJsonStringPrefix(
  text: string,
  startIndex: number
): {
  complete: boolean;
  end: number;
  value: string;
} {
  let value = "";
  let index = startIndex + 1;

  while (index < text.length) {
    const char = text[index];

    if (char === '"') {
      return {
        complete: true,
        end: index + 1,
        value
      };
    }

    if (char !== "\\") {
      value += char;
      index += 1;
      continue;
    }

    if (index + 1 >= text.length) {
      return {
        complete: false,
        end: index,
        value
      };
    }

    const escapedChar = text[index + 1];

    switch (escapedChar) {
      case '"':
      case "\\":
      case "/":
        value += escapedChar;
        index += 2;
        break;
      case "b":
        value += "\b";
        index += 2;
        break;
      case "f":
        value += "\f";
        index += 2;
        break;
      case "n":
        value += "\n";
        index += 2;
        break;
      case "r":
        value += "\r";
        index += 2;
        break;
      case "t":
        value += "\t";
        index += 2;
        break;
      case "u": {
        const hex = text.slice(index + 2, index + 6);

        if (!/^[\da-f]{4}$/iu.test(hex)) {
          return {
            complete: false,
            end: index,
            value
          };
        }

        value += String.fromCharCode(Number.parseInt(hex, 16));
        index += 6;
        break;
      }
      default:
        return {
          complete: false,
          end: index,
          value
        };
    }
  }

  return {
    complete: false,
    end: index,
    value
  };
}

function skipJsonWhitespace(text: string, startIndex: number): number {
  let index = startIndex;

  while (/\s/u.test(text[index] ?? "")) {
    index += 1;
  }

  return index;
}

function normalizeSuggestedMoveDraft(moveDraft: unknown): unknown {
  if (!moveDraft || typeof moveDraft !== "object") {
    return moveDraft;
  }

  const move = moveDraft as { intent?: unknown; label?: unknown; riskLevel?: unknown };

  return {
    ...moveDraft,
    intent:
      typeof move.intent === "string" ? normalizeSuggestedMoveAttemptText(move.intent) : move.intent,
    label:
      typeof move.label === "string" ? normalizeSuggestedMoveAttemptText(move.label) : move.label,
    riskLevel: normalizeSuggestedMoveRiskLevel(move.riskLevel)
  };
}

function normalizeSuggestedMoveAttemptText(text: string): string {
  const normalized = text.trim();

  if (!isResultClaim(normalized)) {
    return normalized;
  }

  const attemptText = normalized
    .replace(/^玩家\s*(成功|已经|直接|立刻)\s*/u, "玩家尝试")
    .replace(/^(成功|已经|直接|立刻)\s*/u, "尝试")
    .trim();

  if (attemptText !== normalized) {
    return attemptText;
  }

  if (normalized.startsWith("玩家")) {
    return normalized.replace(/^玩家\s*/u, "玩家尝试");
  }

  return `尝试${normalized}`;
}

function normalizeSuggestedMoveRiskLevel(riskLevel: unknown): "low" | "medium" | "high" | undefined {
  if (typeof riskLevel !== "string") {
    return undefined;
  }

  const normalized = riskLevel.trim().toLowerCase();

  if (["low", "低", "低风险", "安全", "稳妥"].includes(normalized)) {
    return "low";
  }

  if (["medium", "mid", "moderate", "中", "中等", "中风险", "普通"].includes(normalized)) {
    return "medium";
  }

  if (["high", "高", "高风险", "危险"].includes(normalized)) {
    return "high";
  }

  return undefined;
}
