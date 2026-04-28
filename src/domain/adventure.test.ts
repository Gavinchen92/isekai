import { describe, expect, it } from "vitest";
import {
  AdventureCandidateGenerationRequestSchema,
  AdventureCandidatePreviewSchema,
  AdventureCandidateSchema
} from "./adventure";

const baseCandidate = {
  id: "candidate-1",
  requestId: "request-1",
  title: "边境钟声",
  pitch: "一个边境小镇在古老钟声中醒来，失踪骑士留下的线索指向旧教堂。",
  playerSetupOptions: [
    {
      id: "traveler",
      title: "失忆旅人",
      description: "你在镇外醒来，只记得一枚破损徽章。",
      startingGoal: "查清徽章来源"
    },
    {
      id: "squire",
      title: "落魄侍从",
      description: "你曾侍奉失踪骑士，如今被迫独自追查。",
      startingGoal: "找到失踪骑士"
    }
  ],
  openingScene: "暮色压低时，钟楼响起第十三声。",
  worldPremise: "边境领地夹在王国和荒原之间，旧教会仍掌握秘密。",
  mainConflict: "失踪骑士牵出边境叛乱和旧教会封印。",
  dramaticQuestion: "玩家是否愿意牺牲小镇秩序来揭开骑士失踪的真相？",
  storyArc: {
    acts: [
      {
        name: "act1",
        title: "钟声",
        goal: "抵达小镇并发现第一条线索",
        transitionHint: "玩家找到失踪骑士的徽章"
      },
      {
        name: "act2",
        title: "旧教堂",
        goal: "查明教会和骑士的关系",
        transitionHint: "玩家发现地下密室"
      },
      {
        name: "act3",
        title: "边境火光",
        goal: "选择协助哪一方",
        transitionHint: "叛乱爆发"
      },
      {
        name: "act4",
        title: "终局抉择",
        goal: "面对骑士留下的真实计划",
        transitionHint: "玩家做出不可逆选择"
      },
      {
        name: "ending",
        title: "余钟",
        goal: "结算边境命运",
        transitionHint: "生成结局摘要"
      }
    ]
  },
  winCondition: "玩家解决边境封印危机，并让小镇保留基本秩序。",
  lossCondition: "封印失控或小镇彻底陷落。",
  endingSeeds: [
    {
      id: "saved-town",
      title: "守住边境",
      description: "小镇付出代价后幸存。",
      tone: "bittersweet"
    },
    {
      id: "fallen-bell",
      title: "沉默的钟楼",
      description: "钟楼坍塌，边境进入混乱。",
      tone: "tragic"
    }
  ],
  endgameTriggers: ["封印被打开", "叛乱首领暴露真实身份"],
  factions: [],
  locations: [
    {
      id: "bell-town",
      name: "钟楼镇",
      description: "边境上的贸易镇，钟声从不在午夜后响起。"
    }
  ],
  npcSeeds: [
    {
      id: "mara",
      name: "玛拉",
      role: "酒馆老板",
      publicDescription: "她知道每个陌生人进镇的时间。"
    }
  ],
  revelationLadder: [
    {
      id: "revelation-1",
      title: "钟声并非来自钟楼",
      publicClue: "钟声响起时钟楼的大钟没有晃动。",
      hiddenTruth: "真正的钟声来自地下封印。",
      unlockHint: "玩家检查钟楼结构后揭开。"
    },
    {
      id: "revelation-2",
      title: "失踪骑士留下误导",
      publicClue: "骑士徽章出现在不该出现的旧教堂。",
      hiddenTruth: "骑士主动藏身，试图拖延叛乱爆发。",
      unlockHint: "玩家比对徽章和教会记录后揭开。"
    },
    {
      id: "revelation-3",
      title: "封印与叛乱互相牵制",
      publicClue: "叛乱者避开了最容易攻破的钟楼门。",
      hiddenTruth: "双方都害怕破坏地下封印。",
      unlockHint: "玩家进入终局前揭开。"
    }
  ],
  npcWeb: [
    {
      npcName: "玛拉",
      desire: "保住酒馆和镇民的退路。",
      fear: "玩家公开真相后小镇被清洗。",
      leverage: "她知道骑士最后见过谁。",
      secret: "她藏起了一名叛乱信使。",
      relationshipToPlayer: "她愿意帮忙，但会先试探玩家。"
    }
  ],
  pressureClocks: [
    {
      id: "clock-1",
      name: "边境戒严",
      stage: "active",
      trigger: "玩家拖延调查或惊动教会。",
      nextConsequence: "王国军队会封锁小镇。"
    }
  ],
  scenePalette: [
    {
      type: "investigation",
      purpose: "确认钟声真正来源。",
      complication: "钟楼和地下封印给出矛盾线索。",
      expectedPlayerActions: ["检查钟楼", "寻找地下入口"]
    },
    {
      type: "negotiation",
      purpose: "让玛拉交出骑士最后行踪。",
      complication: "她担心镇民被清算。",
      expectedPlayerActions: ["建立信任", "交换保护承诺"]
    },
    {
      type: "confrontation",
      purpose: "阻止教会提前开启清洗。",
      complication: "公开证据会刺激叛乱者行动。",
      expectedPlayerActions: ["保护证人", "揭露证据"]
    }
  ],
  consequenceRules: [
    {
      trigger: "玩家直接声明解决封印。",
      consequence: "降级成高风险尝试并推进戒严。",
      playerFacingSignal: "镇口开始增派士兵。"
    },
    {
      trigger: "玩家欺骗玛拉。",
      consequence: "玛拉关系转冷，只提供不完整线索。",
      playerFacingSignal: "她交出的名单缺少最后一页。"
    }
  ],
  antiClicheRules: ["不要把旧教会写成单纯邪教。", "不要让骑士只承担失踪道具功能。"],
  toneGuidelines: "保持悬疑和低魔氛围。",
  hiddenGmNotes: "钟声来自地下封印，不是钟楼。",
  runtimePrompt: "围绕边境小镇、失踪骑士和旧教会推进故事。",
  tags: ["中古世界", "悬疑", "低魔"]
};

describe("AdventureCandidateSchema", () => {
  it("requires story arc and ending conditions", () => {
    const candidate = AdventureCandidateSchema.parse(baseCandidate);

    expect(candidate.storyArc.acts).toHaveLength(5);
    expect(candidate.winCondition).toContain("解决");
    expect(candidate.endingSeeds).toHaveLength(2);
  });
});

describe("AdventureCandidatePreviewSchema", () => {
  it("contains only spoiler-free selection fields", () => {
    const preview = AdventureCandidatePreviewSchema.parse({
      id: "candidate-1",
      requestId: "request-1",
      title: "边境钟声",
      teaser: "一段悬疑冒险；真正的危机会在游玩中揭开。",
      playerSetupOptions: [
        {
          id: "traveler",
          title: "失忆旅人",
          description: "你在镇外醒来，只记得一枚破损徽章。"
        },
        {
          id: "squire",
          title: "落魄侍从",
          description: "你曾侍奉失踪骑士。"
        }
      ],
      tags: ["中古世界", "悬疑"]
    });

    expect(JSON.stringify(preview)).not.toContain("mainConflict");
    expect(JSON.stringify(preview)).not.toContain("openingScene");
    expect(JSON.stringify(preview)).not.toContain("endingSeeds");
    expect(JSON.stringify(preview)).not.toContain("hiddenGmNotes");
  });
});

describe("AdventureCandidateGenerationRequestSchema", () => {
  it("defaults candidate count to three", () => {
    expect(
      AdventureCandidateGenerationRequestSchema.parse({
        worldSeedId: "medieval"
      }).candidateCount
    ).toBe(3);
  });
});
