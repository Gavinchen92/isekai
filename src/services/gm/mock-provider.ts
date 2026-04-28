import {
  GmTurnResultSchema,
  type Adventure,
  type GmJourneyMemoryCandidate,
  type GmSuggestedMoveDraft,
  type GmTurnResult,
  type PressureClock,
  type RevelationStep,
  type ScenePaletteEntry
} from "../../domain";
import type { GmProvider, GmTurnInput, GmUserMessage } from "./provider";

export const mockGmProvider: GmProvider = {
  async generateTurn(input: GmTurnInput): Promise<GmTurnResult> {
    const scene = selectScene(input.adventure, input.userMessage);
    const revelation = selectRevelation(input.adventure, input.previousInternalStatePatches.length);
    const pressureClock = selectPressureClock(input.adventure, input.userMessage);
    const narration = narrateMockGmResponse(input.adventure, input.userMessage, {
      pressureClock,
      revelation,
      scene
    });

    return GmTurnResultSchema.parse({
      narration,
      suggestedMoves: buildSuggestedMoveDrafts(input.adventure, input.userMessage, {
        pressureClock,
        revelation,
        scene
      }),
      journeyMemoryCandidates: buildJourneyMemoryCandidates(input.adventure, input.userMessage, narration),
      internalStatePatch: {
        currentAct: input.session.currentAct,
        flags: [`intent:${input.userMessage.inferredIntent}`, `scene:${scene.type}`],
        revealedTruthIds:
          input.userMessage.inferredIntent === "world_override_attempt" ? [] : [revelation.id],
        pressureClockUpdates: [
          {
            clockId: pressureClock.id,
            status:
              input.userMessage.inferredIntent === "world_override_attempt" ? "advanced" : "unchanged",
            note:
              input.userMessage.inferredIntent === "world_override_attempt"
                ? pressureClock.nextConsequence
                : `本回合围绕「${scene.purpose}」推进，${pressureClock.name} 暂未完全爆发。`
          }
        ],
        npcRelationshipUpdates: [
          {
            npcName: input.adventure.npcSeeds[0]?.name ?? "关键 NPC",
            disposition:
              input.userMessage.inferredIntent === "character_speech" ? "warmer" : "guarded",
            note: "mock GM 根据玩家互动记录关系变化，真实 provider 会给出更细的判断。"
          }
        ],
        sceneState: {
          pressure: input.userMessage.inferredIntent === "world_override_attempt" ? "high" : "medium",
          sceneType: scene.type,
          unresolvedQuestion: input.adventure.dramaticQuestion
        },
        privateNotes: [
          `本回合玩家输入：${input.userMessage.content}`,
          `本回合场景目的：${scene.purpose}`,
          `当前真相层：${revelation.hiddenTruth}`,
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

type MockNarrationContext = {
  pressureClock: PressureClock;
  revelation: RevelationStep;
  scene: ScenePaletteEntry;
};

function narrateMockGmResponse(
  adventure: Adventure,
  userMessage: GmUserMessage,
  context: MockNarrationContext
): string {
  const location = adventure.locations[0]?.name ?? "当前地点";
  const npc = adventure.npcSeeds[0]?.name ?? "有人";
  const visibleSignal =
    adventure.consequenceRules[0]?.playerFacingSignal ??
    `${location} 的局势因为你的选择出现了新的压力。`;

  switch (userMessage.inferredIntent) {
    case "world_override_attempt":
      return `你的意图在故事里形成一次冒险尝试，而不是既成事实。${context.pressureClock.name} 因此向前推进，${visibleSignal} 如果要继续，你需要先处理「${context.scene.complication}」。`;
    case "ooc_instruction":
      return `已收到。接下来会把这条偏好作为叙事约束处理，但不会直接改写已经发生的事实。眼前真正悬着的问题仍是：${adventure.dramaticQuestion}`;
    case "character_speech":
      return `${npc} 听完你的话，先看了一眼 ${location} 深处的阴影，再压低声音回应。${context.revelation.publicClue} 这条线索让你更接近「${context.revelation.title}」，但 ${context.scene.complication}`;
    case "player_strategy":
      return `你的计划有可行之处，不过第一步需要验证。${location} 留下的痕迹指向两个方向：一个更稳，一个会刺激「${context.pressureClock.name}」。无论选哪条路，都在回答：${adventure.dramaticQuestion}`;
    case "character_action":
      return `你开始行动。${location} 的细节随之变得清晰：旧痕、脚印和一处被刻意掩盖的标记连在一起，指向「${context.revelation.publicClue}」。但 ${context.scene.complication}`;
    default: {
      const unhandledIntent: never = userMessage.inferredIntent;
      throw new Error(`unhandled player intent: ${unhandledIntent}`);
    }
  }
}

function buildSuggestedMoveDrafts(
  adventure: Adventure,
  userMessage: GmUserMessage,
  context: MockNarrationContext
): GmSuggestedMoveDraft[] {
  const npc = adventure.npcSeeds[0]?.name ?? "附近的人";
  const location = adventure.locations[0]?.name ?? "周围环境";
  const firstSceneAction = context.scene.expectedPlayerActions[0] ?? "观察现场";

  return [
    {
      label: `尝试向 ${npc} 追问「${context.revelation.title}」`,
      intent: "玩家尝试通过交谈确认下一层可验证线索",
      riskLevel: "low",
      tags: ["交涉"]
    },
    {
      label: `尝试在 ${location} ${firstSceneAction}`,
      intent: `玩家尝试围绕「${context.scene.purpose}」推进当前场景`,
      riskLevel: "medium",
      tags: [context.scene.type]
    },
    {
      label:
        userMessage.inferredIntent === "world_override_attempt"
          ? `尝试缓解「${context.pressureClock.name}」`
          : `谨慎处理「${context.pressureClock.name}」的下一步`,
      intent:
        userMessage.inferredIntent === "world_override_attempt"
          ? "玩家尝试把高风险行动拆成可执行的第一步"
          : "玩家尝试在推进线索和控制局势压力之间做取舍",
      riskLevel: "medium",
      tags: ["判断"]
    }
  ];
}

function selectScene(adventure: Adventure, userMessage: GmUserMessage): ScenePaletteEntry {
  const sceneByIntent = adventure.scenePalette.find((scene) => {
    if (userMessage.inferredIntent === "character_speech") {
      return /talk|negotiation|relationship|交涉|关系/u.test(scene.type);
    }

    if (userMessage.inferredIntent === "character_action") {
      return /investigation|exploration|调查|探索/u.test(scene.type);
    }

    return false;
  });

  return sceneByIntent ?? adventure.scenePalette[0] ?? createFallbackScene();
}

function selectRevelation(adventure: Adventure, turnIndex: number): RevelationStep {
  const ladder = adventure.revelationLadder.length > 0 ? adventure.revelationLadder : [createFallbackRevelation()];

  return ladder[Math.min(turnIndex, ladder.length - 1)] ?? createFallbackRevelation();
}

function selectPressureClock(adventure: Adventure, userMessage: GmUserMessage): PressureClock {
  const criticalClock = adventure.pressureClocks.find((clock) => clock.stage === "critical");
  const activeClock = adventure.pressureClocks.find((clock) => clock.stage === "active");

  if (userMessage.inferredIntent === "world_override_attempt") {
    return activeClock ?? criticalClock ?? adventure.pressureClocks[0] ?? createFallbackClock();
  }

  return criticalClock ?? activeClock ?? adventure.pressureClocks[0] ?? createFallbackClock();
}

function createFallbackScene(): ScenePaletteEntry {
  return {
    type: "investigation",
    purpose: "确认当前场景中最可靠的下一条线索。",
    complication: "现场信息互相矛盾，玩家必须先判断哪条线索可信。",
    expectedPlayerActions: ["观察现场", "追问证词"]
  };
}

function createFallbackRevelation(): RevelationStep {
  return {
    id: "fallback-revelation",
    title: "新的疑点",
    publicClue: "现场出现了与公开说法不一致的线索。",
    hiddenTruth: "真正的原因仍在 GM 私有状态中等待揭开。",
    unlockHint: "玩家继续调查或建立信任后揭开。"
  };
}

function createFallbackClock(): PressureClock {
  return {
    id: "fallback-clock",
    name: "局势压力",
    stage: "active",
    trigger: "玩家拖延或强行越过阻碍。",
    nextConsequence: "局势会变得更危险，安全选项减少。"
  };
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
