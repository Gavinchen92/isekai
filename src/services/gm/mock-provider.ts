import {
  GmTurnResultSchema,
  type Adventure,
  type GmJourneyMemoryCandidate,
  type GmSuggestedMoveDraft,
  type GmTurnResult
} from "../../domain";
import type { GmProvider, GmTurnInput, GmUserMessage } from "./provider";

export const mockGmProvider: GmProvider = {
  async generateTurn(input: GmTurnInput): Promise<GmTurnResult> {
    const narration = narrateMockGmResponse(input.adventure, input.userMessage);

    return GmTurnResultSchema.parse({
      narration,
      suggestedMoves: buildSuggestedMoveDrafts(input.adventure, input.userMessage),
      journeyMemoryCandidates: buildJourneyMemoryCandidates(input.adventure, input.userMessage, narration),
      internalStatePatch: {
        currentAct: input.session.currentAct,
        flags: [`intent:${input.userMessage.inferredIntent}`],
        privateNotes: [
          `本回合玩家输入：${input.userMessage.content}`,
          `隐藏 GM 线索：${input.adventure.hiddenGmNotes}`
        ]
      }
    });
  },
  async *streamTurn(input: GmTurnInput) {
    const result = await mockGmProvider.generateTurn(input);

    for (const chunk of splitMockNarrationChunks(result.narration)) {
      yield {
        type: "narration_chunk" as const,
        chunk
      };
    }

    yield {
      type: "completed" as const,
      result
    };
  }
};

function narrateMockGmResponse(adventure: Adventure, userMessage: GmUserMessage): string {
  const location = adventure.locations[0]?.name ?? "当前地点";
  const npc = adventure.npcSeeds[0]?.name ?? "有人";

  switch (userMessage.inferredIntent) {
    case "world_override_attempt":
      return `你的意图在故事里形成一次冒险尝试，而不是既成事实。${location} 的气氛骤然绷紧，${npc} 注意到了你的举动；如果要推进这件事，你还需要先处理眼前的阻碍。`;
    case "ooc_instruction":
      return `已收到。接下来会把这条偏好作为叙事约束处理，但不会直接改写已经发生的事实。眼前的局势仍停留在「${adventure.mainConflict}」。`;
    case "character_speech":
      return `${npc} 听完你的话，先看了一眼 ${location} 深处的阴影，再压低声音回应。新的线索浮出水面，但它也把你推向了「${adventure.mainConflict}」的核心。`;
    case "player_strategy":
      return `你的计划有可行之处，不过第一步需要验证。${location} 留下的痕迹指向两个方向：一个更稳，一个更危险；无论选哪条路，都会让局势继续向前。`;
    case "character_action":
      return `你开始行动。${location} 的细节随之变得清晰：旧痕、脚印和一处被刻意掩盖的标记连在一起，像是在邀请你继续追查。`;
    default: {
      const unhandledIntent: never = userMessage.inferredIntent;
      throw new Error(`unhandled player intent: ${unhandledIntent}`);
    }
  }
}

function buildSuggestedMoveDrafts(
  adventure: Adventure,
  userMessage: GmUserMessage
): GmSuggestedMoveDraft[] {
  const npc = adventure.npcSeeds[0]?.name ?? "附近的人";
  const location = adventure.locations[0]?.name ?? "周围环境";

  return [
    {
      label: `继续向 ${npc} 追问线索`,
      intent: "玩家尝试通过交谈确认下一条可验证线索",
      riskLevel: "low",
      tags: ["交涉"]
    },
    {
      label: `检查 ${location} 被掩盖的痕迹`,
      intent: "玩家尝试观察现场，寻找可验证的证据",
      riskLevel: "medium",
      tags: ["调查"]
    },
    {
      label:
        userMessage.inferredIntent === "world_override_attempt"
          ? "先确认眼前阻碍"
          : "梳理线索，选择稳妥的推进方式",
      intent:
        userMessage.inferredIntent === "world_override_attempt"
          ? "玩家尝试把高风险行动拆成可执行的第一步"
          : "玩家尝试整理已知信息，再决定推进方向",
      riskLevel: "medium",
      tags: ["判断"]
    }
  ];
}

function buildJourneyMemoryCandidates(
  adventure: Adventure,
  userMessage: GmUserMessage,
  narration: string
): GmJourneyMemoryCandidate[] {
  if (userMessage.inferredIntent === "world_override_attempt") {
    return [];
  }

  const firstNpc = adventure.npcSeeds[0];
  const firstLocation = adventure.locations[0];

  if (userMessage.inferredIntent === "ooc_instruction" && firstNpc) {
    return [
      {
        key: firstNpc.id,
        type: "relationship",
        title: `${firstNpc.name}的回应`,
        summary: `你与${firstNpc.name}的关系仍需要继续观察。`,
        details: ["这段关系仍有疑点，暂时按存疑记录。"],
        visibility: "uncertain",
        confidence: "high",
        relatedNpcIds: [firstNpc.id],
        relatedLocationIds: []
      }
    ];
  }

  if (userMessage.inferredIntent === "character_speech" && firstNpc) {
    return [
      {
        key: firstNpc.id,
        type: "relationship",
        title: `${firstNpc.name}的回应`,
        summary: `${firstNpc.name}愿意继续回应你，但仍保留一部分真相。`,
        details: [trimMemoryDetail(narration)],
        visibility: "known",
        confidence: "high",
        relatedNpcIds: [firstNpc.id],
        relatedLocationIds: firstLocation ? [firstLocation.id] : []
      }
    ];
  }

  if (!firstLocation || !isConfirmedClueText(narration)) {
    return [];
  }

  return [
    {
      key: firstLocation.id,
      type: "clue",
      title: `${firstLocation.name}的异常痕迹`,
      summary: "现场出现了可以继续追查的明确痕迹。",
      details: [trimMemoryDetail(narration)],
      visibility: "known",
      confidence: "high",
      relatedNpcIds: firstNpc ? [firstNpc.id] : [],
      relatedLocationIds: [firstLocation.id]
    }
  ];
}

function splitMockNarrationChunks(narration: string): string[] {
  const chars = Array.from(narration);
  const chunkSize = 12;
  const chunks: string[] = [];

  for (let index = 0; index < chars.length; index += chunkSize) {
    chunks.push(chars.slice(index, index + chunkSize).join(""));
  }

  return chunks;
}

function isConfirmedClueText(text: string): boolean {
  return /(线索|痕迹|证据|标记|符文|脚印|刻意掩盖|浮出水面|指向)/u.test(text);
}

function trimMemoryDetail(text: string): string {
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}
