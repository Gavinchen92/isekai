import {
  InputIntentClassificationSchema,
  MessageInputKindSchema,
  isResultClaim,
  type InputIntentClassification,
  type MessageInputKind,
  type PlayerInputIntent
} from "../domain";
import type { LogContext } from "../shared/logger";
import {
  requestOpenAiCompatibleJsonObject,
  resolveOpenAiCompatibleProviderConfig
} from "./gm/openai-compatible";

export type ClassifyPlayerInputRequest = {
  content: string;
  inputKind: MessageInputKind;
};

type ClassifyPlayerInputOptions = {
  logContext?: LogContext;
};

export async function classifyPlayerInput(
  rawRequest: ClassifyPlayerInputRequest,
  options: ClassifyPlayerInputOptions = {}
): Promise<InputIntentClassification> {
  const request = {
    content: rawRequest.content.trim(),
    inputKind: MessageInputKindSchema.parse(rawRequest.inputKind)
  };
  const hardClassification = classifyHardPlayerInput(request);

  if (hardClassification) {
    return hardClassification;
  }

  const providerName = process.env.GM_PROVIDER ?? "mock";

  switch (providerName) {
    case "mock":
      return classifyPlayerInputWithRules(request);
    case "openai":
    case "openai-compatible":
      return classifyPlayerInputWithOpenAiCompatible(request, options);
    default:
      throw new Error(`Unsupported input intent provider: ${providerName}`);
  }
}

export function classifyPlayerInputWithRules(
  request: ClassifyPlayerInputRequest
): InputIntentClassification {
  const normalized = request.content.trim();
  let intent: PlayerInputIntent = "character_action";

  if (isResultClaim(normalized)) {
    intent = "world_override_attempt";
  } else if (isSpeechLike(normalized)) {
    intent = "character_speech";
  } else if (isStrategyLike(normalized) || request.inputKind === "continue") {
    intent = "player_strategy";
  }

  return InputIntentClassificationSchema.parse({
    confidence: "medium",
    intent,
    isResultClaim: intent === "world_override_attempt",
    normalizedAttempt:
      intent === "world_override_attempt" ? normalizeResultClaimAsAttempt(normalized) : normalized
  });
}

export async function classifyPlayerInputWithOpenAiCompatible(
  request: ClassifyPlayerInputRequest,
  options: ClassifyPlayerInputOptions = {}
): Promise<InputIntentClassification> {
  const config = resolveOpenAiCompatibleProviderConfig();
  const content = await requestOpenAiCompatibleJsonObject({
    config,
    label: "OpenAI-compatible input intent",
    logContext: options.logContext,
    messages: [
      {
        role: "system",
        content: [
          "你是本地文字冒险游戏的用户输入意图分类器。",
          "只做分类，不推进剧情，不判断行动成败。",
          "输出必须是单个 JSON 对象，不要 Markdown，不要解释，不要代码块。",
          "JSON 必须符合：{ intent, normalizedAttempt, isResultClaim, confidence }。",
          "intent 只能是 character_action、character_speech、player_strategy、ooc_instruction、world_override_attempt。",
          "玩家直接宣称成功、获得资源、改写已发生事实、跳过挑战结果时，intent 必须是 world_override_attempt，isResultClaim 必须是 true。",
          "玩家只是尝试、打算、询问、观察、移动、交谈时，不要判为 world_override_attempt。",
          "normalizedAttempt 要把越权结果声明改写成一次尝试，比如把“我杀死魔王”改成“玩家尝试攻击魔王”。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          allowedIntentValues: [
            "character_action",
            "character_speech",
            "player_strategy",
            "ooc_instruction",
            "world_override_attempt"
          ],
          examples: [
            {
              input: "我推开门观察里面的人",
              output: {
                confidence: "high",
                intent: "character_action",
                isResultClaim: false,
                normalizedAttempt: "玩家尝试推开门并观察房间里的人"
              }
            },
            {
              input: "老板，我在找一个披红斗篷的女人",
              output: {
                confidence: "high",
                intent: "character_speech",
                isResultClaim: false,
                normalizedAttempt: "玩家向老板询问披红斗篷的女人"
              }
            },
            {
              input: "我成功杀死魔王并获得无限金币",
              output: {
                confidence: "high",
                intent: "world_override_attempt",
                isResultClaim: true,
                normalizedAttempt: "玩家尝试攻击魔王并夺取资源"
              }
            }
          ],
          input: request
        })
      }
    ]
  });

  return parseInputIntentClassificationJson(content);
}

export function parseInputIntentClassificationJson(content: string): InputIntentClassification {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(content.trim());
  } catch (error) {
    throw new Error(
      `OpenAI-compatible input intent response is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return InputIntentClassificationSchema.parse(parsedJson);
}

function classifyHardPlayerInput(
  request: ClassifyPlayerInputRequest
): InputIntentClassification | undefined {
  const normalized = request.content.trim();
  const lower = normalized.toLowerCase();
  const isOoc = request.inputKind === "ooc" || lower.startsWith("ooc:") || lower.startsWith("ooc：") || lower.startsWith("/ooc");

  if (!isOoc) {
    return undefined;
  }

  return InputIntentClassificationSchema.parse({
    confidence: "high",
    intent: "ooc_instruction",
    isResultClaim: false,
    normalizedAttempt: normalized
  });
}

function isSpeechLike(content: string): boolean {
  return /^["“「].+["”」]$/u.test(content) || /(说|问|喊|低声|告诉|reply|say|ask)/iu.test(content);
}

function isStrategyLike(content: string): boolean {
  return /(计划|策略|打算|准备|如果|先|然后|plan|strategy|intend|next)/iu.test(content);
}

function normalizeResultClaimAsAttempt(content: string): string {
  return `玩家尝试：${content}`;
}
