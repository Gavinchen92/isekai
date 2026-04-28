import {
  GmPromptMessageListSchema,
  type GmInternalStatePatch,
  type GmPromptMessage,
  type JourneyMemoryEntry,
  type Message,
  type SuggestedMove
} from "../../domain";
import type { GmTurnInput } from "./provider";

const DEFAULT_RECENT_MESSAGE_LIMIT = 8;
const DEFAULT_MEMORY_LIMIT = 24;
const DEFAULT_INTERNAL_PATCH_LIMIT = 8;

export type GmContextBuilderOptions = {
  internalPatchLimit?: number;
  memoryLimit?: number;
  recentMessageLimit?: number;
};

export type GmTurnContext = {
  currentPlayerInput: {
    content: string;
    intentConfidence: string;
    inferredIntent: string;
    inputKind: string;
    isResultClaim: boolean;
    normalizedAttempt: string;
  };
  gmPrivateContext: {
    currentAct: string;
    endingSeeds: readonly {
      description: string;
      id: string;
      title: string;
      tone: string;
    }[];
    endgameTriggers: readonly string[];
    hiddenGmNotes: string;
    internalStatePatches: readonly GmInternalStatePatch[];
    lossCondition: string;
    runtimePrompt: string;
    storyArc: readonly {
      goal: string;
      name: string;
      title: string;
      transitionHint: string;
    }[];
    winCondition: string;
  };
  outputContract: {
    format: "json";
    schema: {
      internalStatePatch: {
        currentAct: "act1 | act2 | act3 | act4 | ending | epilogue 可选";
        flags: "string[]";
        privateNotes: "string[]";
      };
      journeyMemoryCandidates: "JourneyMemoryCandidate[]";
      narration: "string";
      suggestedMoves: "SuggestedMoveDraft[]";
    };
    schemaName: "GmTurnResult";
    rules: readonly string[];
    template: {
      internalStatePatch: {
        currentAct?: "act1";
        flags: string[];
        privateNotes: string[];
      };
      journeyMemoryCandidates: {
        confidence: "high" | "medium";
        details: string[];
        key: string;
        relatedLocationIds: string[];
        relatedNpcIds: string[];
        summary: string;
        title: string;
        type: "identity" | "npc" | "location" | "relationship" | "clue" | "item";
        visibility: "known" | "uncertain";
      }[];
      narration: string;
      suggestedMoves: {
        intent: string;
        label: string;
        riskLevel?: "low" | "medium" | "high";
        tags: string[];
      }[];
    };
  };
  playerKnownContext: {
    adventureTitle: string;
    journeyMemory: readonly Pick<
      JourneyMemoryEntry,
      "details" | "summary" | "title" | "type" | "visibility"
    >[];
    mainConflict: string;
    openingScene: string;
    previousSuggestedMoves: readonly Pick<SuggestedMove, "intent" | "label" | "tags">[];
    recentMessages: readonly Pick<Message, "content" | "inferredIntent" | "inputKind" | "role">[];
    worldPremise: string;
  };
};

const outputRules = [
  "只返回一个 JSON 对象，不要 Markdown，不要解释，不要代码块。",
  "JSON 必须符合 GmTurnResult：narration, suggestedMoves, journeyMemoryCandidates, internalStatePatch。",
  "suggestedMoves 必须是 1-3 个对象组成的数组，不能是字符串数组。每个对象必须包含 label、intent、tags，可选 riskLevel。",
  "如果提供 riskLevel，只能使用英文枚举 low、medium、high，不能使用中文。",
  "journeyMemoryCandidates 必须是对象数组。不确定是否该记录时返回空数组 []，不要返回不完整对象。",
  "internalStatePatch 必须是对象，至少包含 flags 和 privateNotes 两个数组。",
  "narration 是玩家可见剧情，不能出现章节、目标、胜利条件、失败条件、GM、Log、Codex、Quest 等系统术语。",
  "不得在 narration、suggestedMoves 或 journeyMemoryCandidates 中泄露 hiddenGmNotes、私密动机、隐藏真相、胜败条件或章节目标。",
  "玩家输入只能声明尝试，不能直接改写既成事实；越权输入要降级为一次有风险的尝试。",
  "suggestedMoves 只能表达玩家可以尝试的行动，不能写成功结果。",
  "suggestedMoves 的 label 和 intent 建议以“尝试、谨慎、询问、观察、检查、靠近、交谈、分析、准备”这类行动词开头，禁止以“成功、已经、直接、立刻、杀死、获得”等结果词表达。",
  "journeyMemoryCandidates 只记录玩家已经明确知道的事实；模糊推测用 uncertain，高置信事实才用 high。",
  "internalStatePatch 可记录 GM 私有判断，但这些内容不会展示给玩家。"
] as const;

export function buildGmTurnContext(
  input: GmTurnInput,
  options: GmContextBuilderOptions = {}
): GmTurnContext {
  const recentMessageLimit = options.recentMessageLimit ?? DEFAULT_RECENT_MESSAGE_LIMIT;
  const memoryLimit = options.memoryLimit ?? DEFAULT_MEMORY_LIMIT;
  const internalPatchLimit = options.internalPatchLimit ?? DEFAULT_INTERNAL_PATCH_LIMIT;

  return {
    currentPlayerInput: {
      content: input.userMessage.content,
      intentConfidence: input.userMessage.intentConfidence,
      inferredIntent: input.userMessage.inferredIntent,
      inputKind: input.userMessage.inputKind,
      isResultClaim: input.userMessage.isResultClaim,
      normalizedAttempt: input.userMessage.normalizedAttempt
    },
    gmPrivateContext: {
      currentAct: input.session.currentAct,
      endingSeeds: input.adventure.endingSeeds.map((ending) => ({
        description: ending.description,
        id: ending.id,
        title: ending.title,
        tone: ending.tone
      })),
      endgameTriggers: input.adventure.endgameTriggers,
      hiddenGmNotes: input.adventure.hiddenGmNotes,
      internalStatePatches: input.previousInternalStatePatches.slice(-internalPatchLimit),
      lossCondition: input.adventure.lossCondition,
      runtimePrompt: input.adventure.runtimePrompt,
      storyArc: input.adventure.storyArc.acts.map((act) => ({
        goal: act.goal,
        name: act.name,
        title: act.title,
        transitionHint: act.transitionHint
      })),
      winCondition: input.adventure.winCondition
    },
    outputContract: {
      format: "json",
      schema: {
        narration: "string",
        suggestedMoves: "SuggestedMoveDraft[]",
        journeyMemoryCandidates: "JourneyMemoryCandidate[]",
        internalStatePatch: {
          currentAct: "act1 | act2 | act3 | act4 | ending | epilogue 可选",
          flags: "string[]",
          privateNotes: "string[]"
        }
      },
      schemaName: "GmTurnResult",
      rules: outputRules,
      template: {
        narration: "玩家可见的新剧情，不能泄露 GM 内部信息。",
        suggestedMoves: [
          {
            label: "尝试检查符文痕迹",
            intent: "玩家尝试确认符文是否仍有危险",
            riskLevel: "medium",
            tags: ["调查"]
          }
        ],
        journeyMemoryCandidates: [
          {
            key: "clue-rune-trace",
            type: "clue",
            title: "符文痕迹",
            summary: "玩家已经明确看见断塔入口存在异常符文痕迹。",
            details: ["这条记录只能包含玩家已经在剧情里知道的信息。"],
            visibility: "known",
            confidence: "high",
            relatedNpcIds: [],
            relatedLocationIds: []
          }
        ],
        internalStatePatch: {
          currentAct: "act1",
          flags: ["player-inspected-runes"],
          privateNotes: ["只给 GM 使用的判断，不得写进 narration。"]
        }
      }
    },
    playerKnownContext: {
      adventureTitle: input.adventure.title,
      journeyMemory: input.journeyMemory.slice(-memoryLimit).map((entry) => ({
        details: entry.details,
        summary: entry.summary,
        title: entry.title,
        type: entry.type,
        visibility: entry.visibility
      })),
      mainConflict: input.adventure.mainConflict,
      openingScene: input.adventure.openingScene,
      previousSuggestedMoves: input.previousSuggestedMoves.map((move) => ({
        intent: move.intent,
        label: move.label,
        tags: move.tags
      })),
      recentMessages: input.messageHistory.slice(-recentMessageLimit).map((message) => ({
        content: message.content,
        inferredIntent: message.inferredIntent,
        inputKind: message.inputKind,
        role: message.role
      })),
      worldPremise: input.adventure.worldPremise
    }
  };
}

export function buildGmPromptMessages(context: GmTurnContext): readonly GmPromptMessage[] {
  return GmPromptMessageListSchema.parse([
    {
      role: "system",
      content: [
        "你是本地文字冒险游戏的 GM。",
        "你的任务是推进沉浸式剧情，同时维护内部故事状态。",
        "玩家只能声明意图和尝试，结果由你判断。",
        "处理当前玩家输入时，以 currentPlayerInput.normalizedAttempt 作为可执行尝试；content 只用于理解玩家原话。",
        "严格遵守输出契约和保密规则。",
        "输出必须是单个 JSON 对象。",
        "不要把 suggestedMoves 写成字符串数组。",
        "不要返回超过 3 条 suggestedMoves。",
        "如果没有高置信的旅途见闻，journeyMemoryCandidates 返回 []。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify(context)
    }
  ]);
}
