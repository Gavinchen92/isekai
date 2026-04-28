import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdventureCandidateListSchema,
  AdventureCandidatePreviewListSchema,
  AdventureCandidatePreviewSchema
} from "../domain";
import {
  createAdventureCandidatePreview,
  generateAdventureCandidates,
  generateAdventureCandidatePreviews,
  generateMockAdventureCandidates,
  materializeAdventureCandidate,
  parseAdventureCandidateConceptDraftJson,
  parseAdventureCandidateDetailDraftJson,
  parseAdventureCandidateDraftJson
} from "./adventure-candidates";
import { listWorldSeedPresets } from "./world-seeds";

const originalEnv = {
  GM_OPENAI_API_KEY: process.env.GM_OPENAI_API_KEY,
  GM_OPENAI_MODEL: process.env.GM_OPENAI_MODEL,
  GM_OPENAI_PREVIEW_TEMPERATURE: process.env.GM_OPENAI_PREVIEW_TEMPERATURE,
  GM_OPENAI_PREVIEW_THINKING: process.env.GM_OPENAI_PREVIEW_THINKING,
  GM_PROVIDER: process.env.GM_PROVIDER
};

afterEach(() => {
  restoreEnv("GM_PROVIDER", originalEnv.GM_PROVIDER);
  restoreEnv("GM_OPENAI_API_KEY", originalEnv.GM_OPENAI_API_KEY);
  restoreEnv("GM_OPENAI_MODEL", originalEnv.GM_OPENAI_MODEL);
  restoreEnv("GM_OPENAI_PREVIEW_TEMPERATURE", originalEnv.GM_OPENAI_PREVIEW_TEMPERATURE);
  restoreEnv("GM_OPENAI_PREVIEW_THINKING", originalEnv.GM_OPENAI_PREVIEW_THINKING);
  vi.unstubAllGlobals();
});

describe("generateMockAdventureCandidates", () => {
  it("returns three schema-valid candidates for a world seed", () => {
    const candidates = AdventureCandidateListSchema.parse(
      generateMockAdventureCandidates({
        worldSeedId: "isekai"
      })
    );

    expect(candidates).toHaveLength(3);
    expect(candidates[0]?.storyArc.acts.at(-1)?.name).toBe("ending");
    expect(candidates[0]?.endingSeeds).toHaveLength(2);
  });

  it("supports smaller candidate counts", () => {
    const candidates = generateMockAdventureCandidates({
      worldSeedId: "ancient-china",
      candidateCount: 1
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.tags).toContain("古代中国");
  });
});

describe("generateAdventureCandidates", () => {
  it("uses mock candidates by default", async () => {
    delete process.env.GM_PROVIDER;
    const candidates = await generateAdventureCandidates({
      candidateCount: 1,
      worldSeedId: "medieval"
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.tags).toContain("中古世界");
  });

  it("uses OpenAI-compatible provider when configured", async () => {
    process.env.GM_PROVIDER = "openai-compatible";
    process.env.GM_OPENAI_API_KEY = "test-key";
    process.env.GM_OPENAI_MODEL = "test-model";
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: createDraftResponseContent()
              }
            }
          ]
        }),
        {
          status: 200
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const candidates = await generateAdventureCandidates({
      candidateCount: 1,
      worldSeedId: "isekai"
    });
    const [, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>;
    const body = JSON.parse(String((init as RequestInit).body));

    expect(body).toMatchObject({
      model: "test-model",
      response_format: {
        type: "json_object"
      }
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toContain("isekai-ai-1");
    expect(candidates[0]?.requestId).toContain("isekai-request-ai");
    expect(candidates[0]?.playerSetupOptions[0]?.id).toBe("isekai-ai-1-player-1");
    expect(candidates[0]?.tags).toContain("异世界");
  });
});

describe("generateAdventureCandidatePreviews", () => {
  it("generates and stores only preview concepts for OpenAI-compatible provider", async () => {
    process.env.GM_PROVIDER = "openai-compatible";
    process.env.GM_OPENAI_API_KEY = "test-key";
    process.env.GM_OPENAI_MODEL = "test-model";
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: createConceptResponseContent()
              }
            }
          ]
        }),
        {
          status: 200
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const previews = AdventureCandidatePreviewListSchema.parse(
      await generateAdventureCandidatePreviews({
        candidateCount: 1,
        worldSeedId: "isekai"
      })
    );
    const [, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>;
    const body = JSON.parse(String((init as RequestInit).body));
    const promptText = JSON.stringify(body.messages);

    expect(previews).toHaveLength(1);
    expect(previews[0]?.id).toContain("isekai-preview-1");
    expect(previews[0]?.title).toBe("裂钟召唤");
    expect(JSON.stringify(previews)).not.toContain("startingGoal");
    expect(JSON.stringify(previews)).not.toContain("openingScene");
    expect(body.temperature).toBe(1);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(promptText).toContain("teaser");
    expect(promptText).not.toContain("openingScene");
    expect(promptText).not.toContain("hiddenGmNotes");
  });

  it("fans out preview generation into one request per candidate with variants", async () => {
    process.env.GM_PROVIDER = "openai-compatible";
    process.env.GM_OPENAI_API_KEY = "test-key";
    process.env.GM_OPENAI_MODEL = "test-model";
    process.env.GM_OPENAI_PREVIEW_TEMPERATURE = "1.2";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createOpenAiResponse(createConceptResponseContent("裂钟召唤")))
      .mockResolvedValueOnce(createOpenAiResponse(createConceptResponseContent("雨港契约")))
      .mockResolvedValueOnce(createOpenAiResponse(createConceptResponseContent("雾中账本")));
    vi.stubGlobal("fetch", fetchMock);

    const previews = await generateAdventureCandidatePreviews({
      candidateCount: 3,
      worldSeedId: "isekai"
    });
    const bodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body))
    );
    const userPayloads = bodies.map((body) => JSON.parse(String(body.messages[1].content)));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(previews.map((preview) => preview.title)).toEqual([
      "裂钟召唤",
      "雨港契约",
      "雾中账本"
    ]);
    expect(bodies.every((body) => body.temperature === 1.2)).toBe(true);
    expect(bodies.every((body) => body.thinking.type === "disabled")).toBe(true);
    expect(userPayloads.every((payload) => payload.request.candidateCount === 1)).toBe(true);
    expect(new Set(userPayloads.map((payload) => payload.creativeVariant.variantSeed)).size).toBe(
      3
    );
    expect(new Set(userPayloads.map((payload) => payload.creativeVariant.variantFocus)).size).toBe(
      3
    );
  });

  it("returns successful previews when some parallel preview requests fail", async () => {
    process.env.GM_PROVIDER = "openai-compatible";
    process.env.GM_OPENAI_API_KEY = "test-key";
    process.env.GM_OPENAI_MODEL = "test-model";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createOpenAiResponse(createConceptResponseContent("裂钟召唤")))
      .mockRejectedValueOnce(new Error("upstream failed"))
      .mockResolvedValueOnce(createOpenAiResponse(createConceptResponseContent("雾中账本")));
    vi.stubGlobal("fetch", fetchMock);

    const previews = await generateAdventureCandidatePreviews({
      candidateCount: 3,
      worldSeedId: "isekai"
    });

    expect(previews.map((preview) => preview.title)).toEqual(["裂钟召唤", "雾中账本"]);
  });

  it("fails when all parallel preview requests fail", async () => {
    process.env.GM_PROVIDER = "openai-compatible";
    process.env.GM_OPENAI_API_KEY = "test-key";
    process.env.GM_OPENAI_MODEL = "test-model";
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error("upstream failed");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateAdventureCandidatePreviews({
        candidateCount: 3,
        worldSeedId: "isekai"
      })
    ).rejects.toThrow(/preview generation failed/u);
  });

  it("retries duplicate preview titles once with avoidTitles", async () => {
    process.env.GM_PROVIDER = "openai-compatible";
    process.env.GM_OPENAI_API_KEY = "test-key";
    process.env.GM_OPENAI_MODEL = "test-model";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createOpenAiResponse(createConceptResponseContent("裂钟召唤")))
      .mockResolvedValueOnce(createOpenAiResponse(createConceptResponseContent("裂钟召唤")))
      .mockResolvedValueOnce(createOpenAiResponse(createConceptResponseContent("雨港契约")));
    vi.stubGlobal("fetch", fetchMock);

    const previews = await generateAdventureCandidatePreviews({
      candidateCount: 2,
      worldSeedId: "isekai"
    });
    const retryBody = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body));
    const retryPayload = JSON.parse(String(retryBody.messages[1].content));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(previews.map((preview) => preview.title)).toEqual(["裂钟召唤", "雨港契约"]);
    expect(retryPayload.avoidTitles).toEqual(["裂钟召唤"]);
  });

  it("materializes only the selected preview and reuses the full candidate", async () => {
    process.env.GM_PROVIDER = "openai-compatible";
    process.env.GM_OPENAI_API_KEY = "test-key";
    process.env.GM_OPENAI_MODEL = "test-model";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: createConceptResponseContent()
                }
              }
            ]
          }),
          {
            status: 200
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: createDetailResponseContent()
                }
              }
            ]
          }),
          {
            status: 200
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const [preview] = await generateAdventureCandidatePreviews({
      candidateCount: 1,
      worldSeedId: "isekai"
    });

    if (!preview) {
      throw new Error("missing preview");
    }

    const materialized = await materializeAdventureCandidate(preview.id);
    const reused = await materializeAdventureCandidate(preview.id);
    const [, detailInit] = fetchMock.mock.calls[1] as Parameters<typeof fetch>;
    const detailBody = JSON.parse(String((detailInit as RequestInit).body));
    const detailUserContent = JSON.parse(String(detailBody.messages[1].content));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(materialized?.candidate?.id).toBe(preview.id);
    expect(materialized?.candidate?.title).toBe(preview.title);
    expect(materialized?.candidate?.playerSetupOptions[0]?.id).toBe(
      preview.playerSetupOptions[0]?.id
    );
    expect(reused?.candidate).toEqual(materialized?.candidate);
    expect(detailUserContent.selectedConcept.title).toBe(preview.title);
    expect("title" in detailUserContent.outputTemplate.adventure).toBe(false);
    expect("playerSetupOptions" in detailUserContent.outputTemplate.adventure).toBe(false);
  });
});

describe("parseAdventureCandidateDraftJson", () => {
  it("adds stable service-owned ids to model drafts", () => {
    const [seed] = listWorldSeedPresets();

    if (!seed) {
      throw new Error("missing seed");
    }

    const candidates = parseAdventureCandidateDraftJson(
      seed,
      {
        candidateCount: 1,
        worldSeedId: seed.id
      },
      createDraftResponseContent()
    );

    expect(AdventureCandidateListSchema.parse(candidates)).toHaveLength(1);
    expect(candidates[0]?.endingSeeds[0]?.id).toBe("isekai-ai-1-ending-1");
    expect(candidates[0]?.locations[0]?.id).toBe("isekai-ai-1-location-1");
  });
});

describe("parseAdventureCandidateConceptDraftJson", () => {
  it("adds service-owned ids to preview concepts", () => {
    const [seed] = listWorldSeedPresets();

    if (!seed) {
      throw new Error("missing seed");
    }

    const [concept] = parseAdventureCandidateConceptDraftJson(
      seed,
      {
        candidateCount: 1,
        worldSeedId: seed.id
      },
      createConceptResponseContent()
    );

    expect(concept?.id).toContain("isekai-preview-1");
    expect(concept?.playerSetupOptions[0]?.id).toBe("isekai-preview-1-player-1");
    expect(concept?.playerSetupOptions[0]?.startingGoal).toContain("钟声");
  });
});

describe("parseAdventureCandidateDetailDraftJson", () => {
  it("preserves selected concept ids and public fields", () => {
    const [seed] = listWorldSeedPresets();

    if (!seed) {
      throw new Error("missing seed");
    }

    const [concept] = parseAdventureCandidateConceptDraftJson(
      seed,
      {
        candidateCount: 1,
        worldSeedId: seed.id
      },
      createConceptResponseContent()
    );

    if (!concept) {
      throw new Error("missing concept");
    }

    const candidate = parseAdventureCandidateDetailDraftJson(
      seed,
      concept,
      createDetailResponseContent()
    );

    expect(candidate.id).toBe(concept.id);
    expect(candidate.title).toBe(concept.title);
    expect(candidate.playerSetupOptions).toEqual(concept.playerSetupOptions);
    expect(candidate.locations[0]?.id).toBe(`${concept.id}-location-1`);
  });
});

describe("createAdventureCandidatePreview", () => {
  it("does not expose concrete mainline or GM-only fields", () => {
    const [candidate] = generateMockAdventureCandidates({
      candidateCount: 1,
      worldSeedId: "isekai"
    });

    if (!candidate) {
      throw new Error("missing candidate");
    }

    const preview = AdventureCandidatePreviewSchema.parse(
      createAdventureCandidatePreview(candidate)
    );
    const previewText = JSON.stringify(preview);

    expect(previewText).not.toContain(candidate.openingScene);
    expect(previewText).not.toContain(candidate.mainConflict);
    expect(previewText).not.toContain(candidate.winCondition);
    expect(previewText).not.toContain(candidate.lossCondition);
    expect(previewText).not.toContain(candidate.hiddenGmNotes);
    expect(previewText).not.toContain(candidate.endingSeeds[0]?.title);
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

function createConceptResponseContent(title = "裂钟召唤"): string {
  return JSON.stringify({
    candidates: [
      {
        title,
        teaser: `${title} 正在唤醒旧日钟声，你被卷入一场公会不愿公开的召唤事故。`,
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
        tags: ["召唤", "钟楼", "旧神"]
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
      endgameTriggers: ["旧神低语具象化", "玩家找到守钟人留下的真相"],
      factions: [
        {
          name: "银铃冒险者公会",
          publicDescription: "负责封锁钟楼和登记召唤者。",
          hiddenAgenda: "公会高层隐瞒了旧钟楼的第一次事故。"
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
          publicDescription: "愿意协助玩家登记异常现象。",
          privateMotivation: "她正在寻找失踪的兄长。"
        }
      ],
      toneGuidelines: "保持冒险和悬疑气质，给玩家明确选择。",
      hiddenGmNotes: "守钟人并未死亡，而是被困在钟声裂隙内。",
      runtimePrompt: "围绕裂钟召唤推进故事，玩家只能声明尝试，结果由 GM 判断。"
    }
  });
}

function createDraftResponseContent(): string {
  return JSON.stringify({
    candidates: [
      {
        title: "裂钟召唤",
        pitch: "你在裂开的钟楼中醒来，钟声正在召唤不该醒来的旧神。",
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
        openingScene: "铜钟碎片散落在脚边，远处传来公会警钟。",
        worldPremise: "这是一个职业、魔法和公会并存的异世界城邦。",
        mainConflict: "钟楼裂缝释放旧神低语，城邦准备封锁所有召唤者。",
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
        endgameTriggers: ["旧神低语具象化", "玩家找到守钟人留下的真相"],
        factions: [
          {
            name: "银铃冒险者公会",
            publicDescription: "负责封锁钟楼和登记召唤者。",
            hiddenAgenda: "公会高层隐瞒了旧钟楼的第一次事故。"
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
            publicDescription: "愿意协助玩家登记异常现象。",
            privateMotivation: "她正在寻找失踪的兄长。"
          }
        ],
        toneGuidelines: "保持冒险和悬疑气质，给玩家明确选择。",
        hiddenGmNotes: "守钟人并未死亡，而是被困在钟声裂隙内。",
        runtimePrompt: "围绕裂钟召唤推进故事，玩家只能声明尝试，结果由 GM 判断。",
        tags: ["召唤", "钟楼", "旧神"]
      }
    ]
  });
}
