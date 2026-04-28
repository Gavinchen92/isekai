import { GmTurnResultSchema, isResultClaim, type GmTurnResult } from "../../domain";
import { buildGmPromptMessages, buildGmTurnContext } from "./context";
import {
  requestOpenAiCompatibleJsonObject,
  resolveOpenAiCompatibleProviderConfig,
  type OpenAiCompatibleProviderConfig,
  type OpenAiCompatibleProviderConfigInput
} from "./openai-compatible";
import type { GmProvider, GmTurnInput } from "./provider";

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
      const content = await requestOpenAiCompatibleJsonObject({
        config,
        label: "OpenAI-compatible GM",
        messages
      });

      return parseGmTurnResultJson(content);
    }
  };
}

export const openAiGmProvider = createOpenAiGmProvider();

export function resolveOpenAiGmProviderConfig(
  configInput: Partial<OpenAiGmProviderConfigInput> = {}
): OpenAiGmProviderConfig {
  return resolveOpenAiCompatibleProviderConfig(configInput);
}

export function parseGmTurnResultJson(content: string): GmTurnResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(content.trim());
  } catch (error) {
    throw new Error(
      `OpenAI-compatible GM response is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return GmTurnResultSchema.parse(normalizeOpenAiGmTurnResultDraft(parsedJson));
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
