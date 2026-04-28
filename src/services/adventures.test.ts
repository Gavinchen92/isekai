import { afterEach, describe, expect, it, vi } from "vitest";
import { AdventureSchema } from "../domain";
import {
  generateAdventureCandidatePreviews,
  generateMockAdventureCandidates,
  storeAdventureCandidates
} from "./adventure-candidates";
import { createAdventure, getAdventure } from "./adventures";

const originalEnv = {
  GM_OPENAI_API_KEY: process.env.GM_OPENAI_API_KEY,
  GM_OPENAI_MODEL: process.env.GM_OPENAI_MODEL,
  GM_PROVIDER: process.env.GM_PROVIDER
};

afterEach(() => {
  restoreEnv("GM_PROVIDER", originalEnv.GM_PROVIDER);
  restoreEnv("GM_OPENAI_API_KEY", originalEnv.GM_OPENAI_API_KEY);
  restoreEnv("GM_OPENAI_MODEL", originalEnv.GM_OPENAI_MODEL);
  vi.unstubAllGlobals();
});

describe("createAdventure", () => {
  it("creates and stores an adventure from a candidate", async () => {
    const [candidate] = generateMockAdventureCandidates({ worldSeedId: "medieval" });

    if (!candidate) {
      throw new Error("missing candidate");
    }

    storeAdventureCandidates("medieval", [candidate]);

    const adventure = AdventureSchema.parse(
      await createAdventure({
        candidateId: candidate.id,
        worldSeedId: "medieval"
      })
    );

    expect(adventure.sourceCandidateId).toBe(candidate?.id);
    expect(adventure.worldSeedId).toBe("medieval");
    expect(adventure.currentAct).toBe("act1");
    expect(adventure.openingScene).toBe(candidate?.openingScene);
    expect(adventure.selectedPlayerSetupId).toBe(candidate.playerSetupOptions[0]?.id);
    expect(getAdventure(adventure.id)).toEqual(adventure);
  });

  it("uses an explicitly selected player setup from the candidate", async () => {
    const [candidate] = generateMockAdventureCandidates({ worldSeedId: "isekai" });

    if (!candidate) {
      throw new Error("missing candidate");
    }

    const selectedPlayerSetupId = candidate.playerSetupOptions[1]?.id;

    if (!selectedPlayerSetupId) {
      throw new Error("missing player setup option");
    }

    storeAdventureCandidates("isekai", [candidate]);

    const adventure = await createAdventure({
      candidateId: candidate.id,
      selectedPlayerSetupId,
      worldSeedId: "isekai"
    });

    expect(adventure.selectedPlayerSetupId).toBe(selectedPlayerSetupId);
  });

  it("rejects a selected player setup that does not belong to the candidate", async () => {
    const [candidate] = generateMockAdventureCandidates({ worldSeedId: "ancient-china" });

    if (!candidate) {
      throw new Error("missing candidate");
    }

    storeAdventureCandidates("ancient-china", [candidate]);

    await expect(
      createAdventure({
        candidateId: candidate.id,
        selectedPlayerSetupId: "unknown-player-setup",
        worldSeedId: "ancient-china"
      })
    ).rejects.toThrow(/player setup option does not belong/u);
  });

  it("materializes a selected preview before creating the adventure", async () => {
    process.env.GM_PROVIDER = "openai-compatible";
    process.env.GM_OPENAI_API_KEY = "test-key";
    process.env.GM_OPENAI_MODEL = "test-model";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createOpenAiResponse(createConceptResponseContent()))
      .mockResolvedValueOnce(createOpenAiResponse(createDetailResponseContent()));
    vi.stubGlobal("fetch", fetchMock);

    const [preview] = await generateAdventureCandidatePreviews({
      candidateCount: 1,
      worldSeedId: "isekai"
    });

    if (!preview) {
      throw new Error("missing preview");
    }

    const selectedPlayerSetupId = preview.playerSetupOptions[1]?.id;

    if (!selectedPlayerSetupId) {
      throw new Error("missing player setup option");
    }

    const adventure = await createAdventure({
      candidateId: preview.id,
      selectedPlayerSetupId,
      worldSeedId: "isekai"
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(adventure.sourceCandidateId).toBe(preview.id);
    expect(adventure.title).toBe(preview.title);
    expect(adventure.selectedPlayerSetupId).toBe(selectedPlayerSetupId);
    expect(adventure.openingScene).toContain("铜钟碎片");
  });

  it("rejects invalid preview player setup before full generation", async () => {
    process.env.GM_PROVIDER = "openai-compatible";
    process.env.GM_OPENAI_API_KEY = "test-key";
    process.env.GM_OPENAI_MODEL = "test-model";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createOpenAiResponse(createConceptResponseContent())
    );
    vi.stubGlobal("fetch", fetchMock);

    const [preview] = await generateAdventureCandidatePreviews({
      candidateCount: 1,
      worldSeedId: "isekai"
    });

    if (!preview) {
      throw new Error("missing preview");
    }

    await expect(
      createAdventure({
        candidateId: preview.id,
        selectedPlayerSetupId: "missing-player-setup",
        worldSeedId: "isekai"
      })
    ).rejects.toThrow(/player setup option does not belong/u);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function restoreEnv(key: keyof typeof originalEnv, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function createOpenAiResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content
          }
        }
      ]
    }),
    {
      status: 200
    }
  );
}

function createConceptResponseContent(): string {
  return JSON.stringify({
    candidates: [
      {
        title: "裂钟召唤",
        teaser: "裂开的钟楼正在唤醒旧日钟声。",
        playerSetupOptions: [
          {
            title: "外来者",
            description: "你刚抵达此地，还没有固定阵营。",
            startingGoal: "弄清钟声为何只对你产生反应"
          },
          {
            title: "钟楼学徒",
            description: "你曾短暂跟随守钟人学习古老仪式。",
            startingGoal: "找到失踪的守钟人"
          }
        ],
        tags: ["召唤", "钟楼"]
      }
    ]
  });
}

function createDetailResponseContent(): string {
  return JSON.stringify({
    adventure: {
      pitch: "你在裂开的钟楼中醒来，钟声正在召唤不该醒来的旧神。",
      openingScene: "铜钟碎片散落在脚边，远处传来公会警钟。",
      worldPremise: "这是一个职业、魔法和公会并存的异世界城邦。",
      mainConflict: "钟楼裂缝释放旧神低语，城邦准备封锁所有召唤者。",
      ...createNarrativeEngineDraft(),
      storyArc: {
        acts: [
          {
            name: "act1",
            title: "钟楼醒来",
            goal: "发现钟声和玩家之间的联系。",
            transitionHint: "玩家确认第一条可追踪线索。"
          },
          {
            name: "act2",
            title: "公会调查",
            goal: "接触关键 NPC 并选择调查方向。",
            transitionHint: "旧神低语第一次影响现实。"
          },
          {
            name: "act3",
            title: "封锁升级",
            goal: "城邦势力开始追捕召唤相关人员。",
            transitionHint: "隐藏真相公开一部分。"
          },
          {
            name: "act4",
            title: "终局仪式",
            goal: "决定修复钟楼还是利用钟声。",
            transitionHint: "触发结局分歧。"
          },
          {
            name: "ending",
            title: "钟声余波",
            goal: "根据玩家选择生成结局。",
            transitionHint: "保存结局摘要。"
          }
        ]
      },
      winCondition: "阻止旧神低语吞没钟楼，并确认召唤事故真相。",
      lossCondition: "钟声扩散到全城，玩家被认定为灾厄核心。",
      endingSeeds: [
        {
          title: "沉默的钟楼",
          description: "玩家封住裂缝，但失去一位关键盟友。",
          tone: "bittersweet"
        },
        {
          title: "失控的钟声",
          description: "封锁失败，城邦进入长期戒严。",
          tone: "tragic"
        }
      ],
      endgameTriggers: ["旧神低语具象化"],
      factions: [
        {
          name: "银铃冒险者公会",
          publicDescription: "负责封锁钟楼和登记召唤者。"
        }
      ],
      locations: [
        {
          name: "裂钟楼",
          description: "第一幕醒来的关键地点，钟声从地下传出。"
        }
      ],
      npcSeeds: [
        {
          name: "莉瑟",
          role: "公会书记官",
          publicDescription: "愿意协助玩家登记异常现象。"
        }
      ],
      toneGuidelines: "保持冒险和悬疑气质，给玩家明确选择。",
      hiddenGmNotes: "守钟人并未死亡，而是被困在钟声裂隙内。",
      runtimePrompt: "围绕裂钟召唤推进故事，玩家只能声明尝试，结果由 GM 判断。"
    }
  });
}

function createNarrativeEngineDraft() {
  return {
    dramaticQuestion: "玩家是否愿意牺牲一位无辜者的自由来封住旧神低语？",
    revelationLadder: [
      {
        title: "钟声只回应玩家",
        publicClue: "钟楼碎片在玩家靠近时重新发热。",
        hiddenTruth: "玩家并不是事故源头，而是旧封印选中的替代钥匙。",
        unlockHint: "玩家检查钟楼碎片或承受一次钟声幻听后揭开。"
      },
      {
        title: "守钟人留下假死线索",
        publicClue: "守钟人的登记册最后一页被人为撕掉。",
        hiddenTruth: "守钟人主动进入裂隙，阻止公会高层夺取封印钥匙。",
        unlockHint: "玩家取得莉瑟信任或找到登记册残页后揭开。"
      },
      {
        title: "公会封锁另有目的",
        publicClue: "封锁令只抓召唤者，却没有疏散钟楼附近居民。",
        hiddenTruth: "公会高层想借封锁掩盖第一次钟楼事故的责任。",
        unlockHint: "玩家进入 act3 或压力时钟推进到 critical 后揭开。"
      }
    ],
    npcWeb: [
      {
        npcName: "莉瑟",
        desire: "找到失踪兄长并保住公会书记官身份。",
        fear: "玩家过早公开真相，导致兄长被当成灾厄处决。",
        leverage: "她能调取钟楼事故登记册。",
        secret: "她知道守钟人和自己兄长最后一次见面。",
        relationshipToPlayer: "她需要玩家行动，但不完全信任玩家。"
      }
    ],
    pressureClocks: [
      {
        name: "公会封锁",
        stage: "active",
        trigger: "玩家公开使用钟声能力或拖延调查。",
        nextConsequence: "公会会缩小行动范围并逮捕更多召唤者。"
      }
    ],
    scenePalette: [
      {
        type: "investigation",
        purpose: "确认钟声为什么只回应玩家。",
        complication: "现场线索同时指向玩家和守钟人。",
        expectedPlayerActions: ["检查碎片", "比对登记册"]
      },
      {
        type: "negotiation",
        purpose: "让莉瑟决定是否交出公会内部记录。",
        complication: "她担心玩家会害死自己的兄长。",
        expectedPlayerActions: ["追问细节", "提出交换条件"]
      },
      {
        type: "confrontation",
        purpose: "迫使公会承认封锁的真实目的。",
        complication: "公开真相会让旧神低语提前外溢。",
        expectedPlayerActions: ["保护证人", "制造公开场合"]
      }
    ],
    consequenceRules: [
      {
        trigger: "玩家直接声明已经封住裂隙。",
        consequence: "降级成高风险尝试，并推进旧神低语外溢。",
        playerFacingSignal: "钟楼附近的居民开始忘记彼此的名字。"
      },
      {
        trigger: "玩家欺骗莉瑟。",
        consequence: "莉瑟关系转冷，但会留下带偏见的线索。",
        playerFacingSignal: "莉瑟交出的记录缺少关键一页。"
      }
    ],
    antiClicheRules: ["不要把旧神写成单纯最终 boss。", "不要用升级刷怪替代钟楼调查。"]
  };
}
