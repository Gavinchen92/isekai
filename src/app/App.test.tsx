// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const worldSeeds = [
  {
    id: "isekai",
    name: "异世界",
    description: "召唤、转生、冒险者公会、魔法、魔王和技能系统。",
    genreTags: ["召唤", "转生", "魔法", "冒险"],
    defaultTone: "heroic",
    generationPrompt: "生成一段异世界冒险。"
  },
  {
    id: "medieval",
    name: "中古世界",
    description: "王国、骑士、教会、商会、边境战争和贵族阴谋。",
    genreTags: ["王国", "骑士", "教会", "边境"],
    defaultTone: "serious",
    generationPrompt: "生成一段中古世界冒险。"
  },
  {
    id: "ancient-china",
    name: "古代中国",
    description: "王朝、江湖、门派、朝堂、边塞、志怪和商旅。",
    genreTags: ["王朝", "江湖", "门派", "志怪"],
    defaultTone: "mystery",
    generationPrompt: "生成一段古代中国冒险。"
  },
  {
    id: "sengoku-japan",
    name: "日本战国",
    description: "大名、武士、忍者、城池、合战、商人和妖怪传说。",
    genreTags: ["大名", "武士", "忍者", "合战"],
    defaultTone: "dark",
    generationPrompt: "生成一段日本战国冒险。"
  }
];

const narrativeEngine = {
  dramaticQuestion: "玩家是否愿意牺牲城邦信任来查明召唤事故？",
  revelationLadder: [
    {
      id: "revelation-1",
      title: "符文只回应玩家",
      publicClue: "断塔入口的符文在玩家靠近时重新发亮。",
      hiddenTruth: "玩家不是事故源头，而是旧封印选中的替代钥匙。",
      unlockHint: "玩家检查符文或承受一次幻听后揭开。"
    },
    {
      id: "revelation-2",
      title: "书记官隐瞒登记册",
      publicClue: "莉瑟的登记册缺少事故当夜最后一页。",
      hiddenTruth: "她知道守塔人最后见过谁。",
      unlockHint: "玩家取得莉瑟信任或找到残页后揭开。"
    },
    {
      id: "revelation-3",
      title: "公会封锁另有目的",
      publicClue: "封锁令只抓召唤者，没有疏散高塔附近居民。",
      hiddenTruth: "公会高层想掩盖第一次封印事故。",
      unlockHint: "玩家进入终局或压力时钟推进后揭开。"
    }
  ],
  npcWeb: [
    {
      npcName: "莉瑟",
      desire: "查明事故并保住书记官身份。",
      fear: "玩家公开真相后她被公会清算。",
      leverage: "她能调取召唤事故登记册。",
      secret: "她知道守塔人并未正常离开。",
      relationshipToPlayer: "她需要玩家行动，但不完全信任玩家。"
    }
  ],
  pressureClocks: [
    {
      id: "clock-1",
      name: "公会封锁",
      stage: "active",
      trigger: "玩家公开使用符文能力或拖延调查。",
      nextConsequence: "公会会缩小行动范围并逮捕更多召唤者。"
    }
  ],
  scenePalette: [
    {
      type: "investigation",
      purpose: "确认符文为什么只回应玩家。",
      complication: "现场线索同时指向玩家和守塔人。",
      expectedPlayerActions: ["检查符文", "比对登记册"]
    },
    {
      type: "negotiation",
      purpose: "让莉瑟决定是否交出公会内部记录。",
      complication: "她担心玩家会害死自己的线人。",
      expectedPlayerActions: ["追问细节", "交换登记册线索"]
    },
    {
      type: "confrontation",
      purpose: "迫使公会承认封锁的真实目的。",
      complication: "公开真相会让旧封印提前外溢。",
      expectedPlayerActions: ["保护证人", "制造公开场合"]
    }
  ],
  consequenceRules: [
    {
      trigger: "玩家直接声明已经封住裂隙。",
      consequence: "降级成高风险尝试并推进封锁。",
      playerFacingSignal: "高塔附近的居民开始忘记彼此的名字。"
    },
    {
      trigger: "玩家欺骗莉瑟。",
      consequence: "莉瑟关系转冷，但会留下带偏见的线索。",
      playerFacingSignal: "莉瑟交出的记录缺少关键一页。"
    }
  ],
  antiClicheRules: ["不要把旧封印写成单纯最终 boss。", "不要用升级刷怪替代断塔调查。"]
};

const candidates = [
  {
    id: "isekai-candidate-1",
    requestId: "isekai-request-local",
    title: "断塔召唤",
    pitch: "你在破碎高塔中醒来，召唤阵只完成了一半。",
    playerSetupOptions: [
      {
        id: "wanderer",
        title: "外来者",
        description: "你刚抵达此地。",
        startingGoal: "弄清召唤事故"
      },
      {
        id: "insider",
        title: "局内人",
        description: "你和当地有旧关系。",
        startingGoal: "保护旧关系"
      }
    ],
    openingScene: "银色符文在脚下熄灭。",
    worldPremise: "异世界冒险。",
    mainConflict: "召唤事故释放旧封印。",
    ...narrativeEngine,
    storyArc: {
      acts: [
        {
          name: "act1",
          title: "开局",
          goal: "发现线索",
          transitionHint: "找到徽章"
        },
        {
          name: "act2",
          title: "探索",
          goal: "调查高塔",
          transitionHint: "进入地下"
        },
        {
          name: "act3",
          title: "升级",
          goal: "面对信徒",
          transitionHint: "封印碎裂"
        },
        {
          name: "act4",
          title: "终局",
          goal: "做出选择",
          transitionHint: "触发终章"
        },
        {
          name: "ending",
          title: "结局",
          goal: "生成摘要",
          transitionHint: "结束"
        }
      ]
    },
    winCondition: "阻止封印碎片落入魔王信徒手中。",
    lossCondition: "城邦被封印污染吞没。",
    endingSeeds: [
      {
        id: "ending-1",
        title: "代价中的胜利",
        description: "危机被阻止。",
        tone: "bittersweet"
      },
      {
        id: "ending-2",
        title: "失控的余波",
        description: "危机失控。",
        tone: "tragic"
      }
    ],
    endgameTriggers: ["封印被打开"],
    factions: [],
    locations: [
      {
        id: "tower",
        name: "断星高塔",
        description: "第一幕关键地点。"
      }
    ],
    npcSeeds: [
      {
        id: "lise",
        name: "莉瑟",
        role: "书记官",
        publicDescription: "她愿意提供线索。"
      }
    ],
    toneGuidelines: "保持冒险感。",
    hiddenGmNotes: "mock notes",
    runtimePrompt: "mock prompt",
    tags: ["异世界", "召唤"]
  }
];

const candidatePreviews = candidates.map((candidate) => ({
  id: candidate.id,
  requestId: candidate.requestId,
  title: candidate.title,
  teaser: "一段偏异世界、召唤气质的冒险；真正的危机、关键人物和结局会在游玩中揭开。",
  playerSetupOptions: candidate.playerSetupOptions.map((option) => ({
    id: option.id,
    title: option.title,
    description: option.description
  })),
  tags: candidate.tags
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("does not show saved sessions when no local session exists", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (requestUrl === "/api/world-seeds") {
        return Promise.resolve(
          new Response(JSON.stringify(worldSeeds), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/sessions") {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(<App />);

    expect(await screen.findByRole("button", { name: "开始新冒险" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "冒险存档" })).not.toBeInTheDocument();
  });

  it("shows saved sessions and can resume a selected adventure", async () => {
    const adventure = {
      ...candidates[0],
      id: "adventure-1",
      sourceCandidateId: candidates[0]?.id,
      worldSeedId: "isekai",
      currentAct: "act1",
      selectedPlayerSetupId: "wanderer",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z"
    };
    const session = {
      id: "session-1",
      adventureId: "adventure-1",
      mode: "chat",
      dmEnabled: false,
      currentAct: "act1",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:02.000Z"
    };
    const newerAdventure = {
      ...adventure,
      id: "adventure-2",
      title: "灰堡密约",
      pitch: "你在边境古堡里醒来，密约已经被烧去一半。",
      sourceCandidateId: "medieval-candidate-1",
      worldSeedId: "medieval",
      updatedAt: "2026-04-27T00:00:03.000Z"
    };
    const newerSession = {
      ...session,
      id: "session-2",
      adventureId: "adventure-2",
      updatedAt: "2026-04-27T00:00:04.000Z"
    };
    const journeyMemoryEntries = [
      {
        id: "session-1-identity-wanderer",
        sessionId: "session-1",
        type: "identity",
        title: "我的身份",
        summary: "外来者",
        details: ["你刚抵达此地。"],
        visibility: "known",
        relatedNpcIds: [],
        relatedLocationIds: [],
        sourceMessageIds: [],
        updatedAt: "2026-04-27T00:00:00.000Z"
      }
    ];
    const encoder = new TextEncoder();
    let turnStreamController: ReadableStreamDefaultController<Uint8Array> | undefined;

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (requestUrl === "/api/world-seeds") {
        return Promise.resolve(
          new Response(JSON.stringify(worldSeeds), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/sessions") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                adventure: newerAdventure,
                messages: [],
                session: newerSession,
                suggestedMoves: []
              },
              {
                adventure,
                messages: [
                  {
                    id: "message-user-1",
                    sessionId: "session-1",
                    role: "user",
                    inputKind: "free",
                    inferredIntent: "character_action",
                    content: "我尝试调查高塔入口",
                    createdAt: "2026-04-27T00:00:01.000Z"
                  },
                  {
                    id: "message-gm-1",
                    sessionId: "session-1",
                    role: "assistant",
                    content: "你在断星高塔入口发现一处被刻意掩盖的痕迹。",
                    createdAt: "2026-04-27T00:00:02.000Z"
                  }
                ],
                session,
                suggestedMoves: [
                  {
                    id: "move-1",
                    sessionId: "session-1",
                    sourceMessageId: "message-gm-1",
                    label: "继续检查痕迹",
                    intent: "玩家尝试确认痕迹通向哪里",
                    riskLevel: "medium",
                    tags: ["调查"],
                    createdAt: "2026-04-27T00:00:02.000Z"
                  }
                ]
              }
            ]),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          )
        );
      }

      if (requestUrl === "/api/sessions/session-1/journey-memory") {
        return Promise.resolve(
          new Response(JSON.stringify(journeyMemoryEntries), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/turns/stream") {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            turnStreamController = controller;
          }
        });

        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          })
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(<App />);

    expect(await screen.findByText("断塔召唤")).toBeInTheDocument();
    expect(screen.getByText("灰堡密约")).toBeInTheDocument();
    expect(screen.getByText("1 段剧情")).toBeInTheDocument();

    const savedCard = screen.getByText("断塔召唤").closest("article");
    if (!savedCard) {
      throw new Error("saved session card is missing");
    }

    await userEvent.click(within(savedCard).getByRole("button", { name: "继续" }));

    expect(screen.getByRole("heading", { name: "断塔召唤" })).toBeInTheDocument();
    expect(screen.getByText("银色符文在脚下熄灭。")).toBeInTheDocument();
    expect(screen.getByText("你在断星高塔入口发现一处被刻意掩盖的痕迹。")).toBeInTheDocument();
    expect(screen.queryByText("我尝试调查高塔入口")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "继续检查痕迹" }));

    if (!turnStreamController) {
      throw new Error("turn stream controller is missing");
    }

    turnStreamController.enqueue(
      encoder.encode(
        [
          "event: turn_started",
          'data: {"type":"turn_started","userMessage":{"id":"message-user-2","sessionId":"session-1","role":"user","inputKind":"suggested-move","inferredIntent":"character_action","content":"玩家尝试确认痕迹通向哪里","createdAt":"2026-04-27T00:00:03.000Z"}}',
          "",
          "event: narration_chunk",
          'data: {"type":"narration_chunk","assistantMessageId":"message-gm-2","chunk":"痕迹一路延伸到高塔内侧，"}',
          "",
          ""
        ].join("\n")
      )
    );

    expect(await screen.findByText("痕迹一路延伸到高塔内侧，")).toBeInTheDocument();
    expect(screen.queryByLabelText("故事生成中")).not.toBeInTheDocument();

    turnStreamController.enqueue(
      encoder.encode(
        [
          "event: narration_chunk",
          'data: {"type":"narration_chunk","assistantMessageId":"message-gm-2","chunk":"石缝里残留着银色粉末。"}',
          "",
          "event: suggested_moves_ready",
          'data: {"type":"suggested_moves_ready","suggestedMoves":[{"id":"move-2","sessionId":"session-1","sourceMessageId":"message-gm-2","label":"尝试收集银色粉末","intent":"玩家尝试收集少量粉末用于辨认","riskLevel":"medium","tags":["调查"],"createdAt":"2026-04-27T00:00:04.000Z"}]}',
          "",
          "event: turn_completed",
          'data: {"type":"turn_completed","turn":{"messages":[{"id":"message-user-2","sessionId":"session-1","role":"user","inputKind":"suggested-move","inferredIntent":"character_action","content":"玩家尝试确认痕迹通向哪里","createdAt":"2026-04-27T00:00:03.000Z"},{"id":"message-gm-2","sessionId":"session-1","role":"assistant","content":"痕迹一路延伸到高塔内侧，石缝里残留着银色粉末。","createdAt":"2026-04-27T00:00:04.000Z"}],"suggestedMoves":[{"id":"move-2","sessionId":"session-1","sourceMessageId":"message-gm-2","label":"尝试收集银色粉末","intent":"玩家尝试收集少量粉末用于辨认","riskLevel":"medium","tags":["调查"],"createdAt":"2026-04-27T00:00:04.000Z"}]}}',
          "",
          ""
        ].join("\n")
      )
    );
    turnStreamController.close();

    expect(
      await screen.findByText("痕迹一路延伸到高塔内侧，石缝里残留着银色粉末。")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "尝试收集银色粉末" })).toBeInTheDocument();
  });

  it("deletes a saved session after confirmation", async () => {
    const adventure = {
      ...candidates[0],
      id: "adventure-1",
      sourceCandidateId: candidates[0]?.id,
      worldSeedId: "isekai",
      currentAct: "act1",
      selectedPlayerSetupId: "wanderer",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z"
    };
    const session = {
      id: "session-1",
      adventureId: "adventure-1",
      mode: "chat",
      dmEnabled: false,
      currentAct: "act1",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:02.000Z"
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (requestUrl === "/api/world-seeds") {
        return Promise.resolve(
          new Response(JSON.stringify(worldSeeds), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/sessions") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                adventure,
                messages: [],
                session,
                suggestedMoves: []
              }
            ]),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          )
        );
      }

      if (requestUrl === "/api/sessions/session-1" && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);

    const savedCard = (await screen.findByText("断塔召唤")).closest("article");
    if (!savedCard) {
      throw new Error("saved session card is missing");
    }

    await userEvent.click(within(savedCard).getByRole("button", { name: "删除" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "确定删除「断塔召唤」的冒险存档吗？此操作不可恢复。"
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/session-1", {
      method: "DELETE"
    });
    expect(screen.queryByText("断塔召唤")).not.toBeInTheDocument();
  });

  it("keeps a saved session when delete confirmation is cancelled", async () => {
    const adventure = {
      ...candidates[0],
      id: "adventure-1",
      sourceCandidateId: candidates[0]?.id,
      worldSeedId: "isekai",
      currentAct: "act1",
      selectedPlayerSetupId: "wanderer",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z"
    };
    const session = {
      id: "session-1",
      adventureId: "adventure-1",
      mode: "chat",
      dmEnabled: false,
      currentAct: "act1",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:02.000Z"
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (requestUrl === "/api/world-seeds") {
        return Promise.resolve(
          new Response(JSON.stringify(worldSeeds), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/sessions") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                adventure,
                messages: [],
                session,
                suggestedMoves: []
              }
            ]),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          )
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<App />);

    const savedCard = (await screen.findByText("断塔召唤")).closest("article");
    if (!savedCard) {
      throw new Error("saved session card is missing");
    }

    await userEvent.click(within(savedCard).getByRole("button", { name: "删除" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByText("断塔召唤")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/sessions/session-1", {
      method: "DELETE"
    });
  });

  it("aborts candidate generation when the modal closes", async () => {
    let candidateSignal: AbortSignal | undefined;

    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (requestUrl === "/api/world-seeds") {
        return Promise.resolve(
          new Response(JSON.stringify(worldSeeds), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/adventure-candidates" && init?.method === "POST") {
        candidateSignal = init.signal ?? undefined;

        return new Promise<Response>(() => {
          // keep request pending until the UI aborts it
        });
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "开始新冒险" }));
    expect(await screen.findByRole("heading", { name: "异世界" })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "选择这个世界" })[0]!);
    expect(await screen.findByText(/构思冒险入口/u)).toBeInTheDocument();
    expect(candidateSignal?.aborted).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(candidateSignal?.aborted).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not expose internal candidate generation errors to players", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (requestUrl === "/api/world-seeds") {
        return Promise.resolve(
          new Response(JSON.stringify(worldSeeds), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/sessions") {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/adventure-candidates") {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Adventure candidate generation failed" }), {
            status: 502,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "开始新冒险" }));
    await userEvent.click((await screen.findAllByRole("button", { name: "选择这个世界" }))[0]!);

    expect(
      await screen.findByText("AI 服务超时或暂时不可用，请重试生成冒险入口。")
    ).toBeInTheDocument();
    expect(screen.queryByText(/generate adventure candidates failed/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/502/u)).not.toBeInTheDocument();
  });

  it("starts a new adventure from a world seed modal", async () => {
    let resolveCandidateRequest: ((response: Response) => void) | undefined;
    let resolveAdventureRequest: ((response: Response) => void) | undefined;
    let journeyMemoryEntries: unknown[] = [
      {
        id: "session-1-identity-wanderer",
        sessionId: "session-1",
        type: "identity",
        title: "我的身份",
        summary: "局内人",
        details: ["你和当地有旧关系。"],
        visibility: "known",
        relatedNpcIds: [],
        relatedLocationIds: [],
        sourceMessageIds: [],
        updatedAt: "2026-04-27T00:00:00.000Z"
      },
      {
        id: "session-1-npc-lise",
        sessionId: "session-1",
        type: "npc",
        title: "莉瑟",
        summary: "书记官",
        details: ["她愿意提供线索。"],
        visibility: "known",
        relatedNpcIds: ["lise"],
        relatedLocationIds: [],
        sourceMessageIds: [],
        updatedAt: "2026-04-27T00:00:00.000Z"
      },
      {
        id: "session-1-location-tower",
        sessionId: "session-1",
        type: "location",
        title: "断星高塔",
        summary: "第一幕关键地点。",
        details: ["第一幕关键地点。"],
        visibility: "known",
        relatedNpcIds: [],
        relatedLocationIds: ["tower"],
        sourceMessageIds: [],
        updatedAt: "2026-04-27T00:00:00.000Z"
      }
    ];

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (requestUrl === "/api/world-seeds") {
        return Promise.resolve(
          new Response(JSON.stringify(worldSeeds), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/adventure-candidates" && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveCandidateRequest = resolve;
        });
      }

      if (requestUrl === "/api/adventures" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          candidateId: "isekai-candidate-1",
          selectedPlayerSetupId: "insider",
          worldSeedId: "isekai"
        });
        expect(String(init.body)).not.toContain("hiddenGmNotes");
        expect(String(init.body)).not.toContain("mainConflict");

        return new Promise<Response>((resolve) => {
          resolveAdventureRequest = resolve;
        });
      }

      if (requestUrl === "/api/sessions" && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "session-1",
              adventureId: "adventure-1",
              mode: "chat",
              dmEnabled: false,
              currentAct: "act1",
              createdAt: "2026-04-27T00:00:00.000Z",
              updatedAt: "2026-04-27T00:00:00.000Z"
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          )
        );
      }

      if (requestUrl === "/api/sessions/session-1/journey-memory") {
        return Promise.resolve(
          new Response(JSON.stringify(journeyMemoryEntries), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }

      if (requestUrl === "/api/turns/stream") {
        journeyMemoryEntries = [
          ...journeyMemoryEntries,
          {
            id: "session-1-clue-tower",
            sessionId: "session-1",
            type: "clue",
            title: "断星高塔的异常痕迹",
            summary: "现场出现了可以继续追查的明确痕迹。",
            details: ["断星高塔入口的旧痕连在一起，指向更深处。"],
            visibility: "known",
            relatedNpcIds: ["lise"],
            relatedLocationIds: ["tower"],
            sourceMessageIds: ["message-gm-1"],
            updatedAt: "2026-04-27T00:00:02.000Z"
          }
        ];

        const streamBody = [
          "event: turn_started",
          'data: {"type":"turn_started","userMessage":{"id":"message-user-1","sessionId":"session-1","role":"user","inputKind":"free","inferredIntent":"character_action","content":"我尝试调查高塔入口","createdAt":"2026-04-27T00:00:01.000Z"}}',
          "",
          "event: narration_chunk",
          'data: {"type":"narration_chunk","assistantMessageId":"message-gm-1","chunk":"你开始行动。断星高塔入口的旧痕连在一起，指向更深处。"}',
          "",
          "event: suggested_moves_ready",
          'data: {"type":"suggested_moves_ready","suggestedMoves":[{"id":"move-1","sessionId":"session-1","sourceMessageId":"message-gm-1","label":"尝试向 莉瑟 追问关键细节","intent":"玩家尝试通过交谈确认下一条线索","riskLevel":"low","tags":["交涉"],"createdAt":"2026-04-27T00:00:02.000Z"}]}',
          "",
          "event: turn_completed",
          'data: {"type":"turn_completed","turn":{"messages":[{"id":"message-user-1","sessionId":"session-1","role":"user","inputKind":"free","inferredIntent":"character_action","content":"我尝试调查高塔入口","createdAt":"2026-04-27T00:00:01.000Z"},{"id":"message-gm-1","sessionId":"session-1","role":"assistant","content":"你开始行动。断星高塔入口的旧痕连在一起，指向更深处。","createdAt":"2026-04-27T00:00:02.000Z"}],"suggestedMoves":[{"id":"move-1","sessionId":"session-1","sourceMessageId":"message-gm-1","label":"尝试向 莉瑟 追问关键细节","intent":"玩家尝试通过交谈确认下一条线索","riskLevel":"low","tags":["交涉"],"createdAt":"2026-04-27T00:00:02.000Z"}]}}',
          ""
        ].join("\n");

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(streamBody));
            controller.close();
          }
        });

        return Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          })
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(<App />);

    expect(screen.getByRole("heading", { name: "Isekai" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始新冒险" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "异世界" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "MVP 边界" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成冒险候选" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "开始新冒险" }));

    expect(screen.getByRole("button", { name: "开始新冒险" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "选择世界种子" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "异世界" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "古代中国" })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "选择这个世界" })[0]!);

    expect(screen.queryByRole("button", { name: "生成冒险候选" })).not.toBeInTheDocument();
    expect(await screen.findByText(/正在为.*构思冒险入口/u)).toBeInTheDocument();
    expect(
      screen.getByText("这里只生成无剧透候选卡片，完整冒险包会在你选中后再构建。")
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/adventure-candidates",
      expect.objectContaining({
        method: "POST"
      })
    );

    resolveCandidateRequest?.(
      new Response(JSON.stringify(candidatePreviews), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    expect(await screen.findByRole("dialog", { name: "选择冒险候选" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "断塔召唤" })).toBeInTheDocument();
    expect(screen.getByText(candidatePreviews[0]!.teaser)).toBeInTheDocument();
    expect(
      screen.getByText("这些是无剧透入口。选择后才会生成完整冒险包，可能需要几十秒。")
    ).toBeInTheDocument();
    expect(screen.queryByText("银色符文在脚下熄灭。")).not.toBeInTheDocument();
    expect(screen.queryByText("召唤事故释放旧封印。")).not.toBeInTheDocument();

    const defaultIdentityOption = screen.getByRole("radio", { name: /外来者/u });
    const selectedIdentityOption = screen.getByRole("radio", { name: /局内人/u });

    expect(defaultIdentityOption).toBeChecked();
    await userEvent.click(selectedIdentityOption);
    expect(selectedIdentityOption).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "开始这个冒险" }));

    expect(await screen.findByRole("button", { name: "构建中..." })).toBeDisabled();
    expect(screen.getByText("正在构建完整冒险包，可能需要几十秒...")).toBeInTheDocument();

    resolveAdventureRequest?.(
      new Response(
        JSON.stringify({
          ...candidates[0],
          id: "adventure-1",
          sourceCandidateId: candidates[0]?.id,
          worldSeedId: "isekai",
          currentAct: "act1",
          selectedPlayerSetupId: "insider",
          createdAt: "2026-04-27T00:00:00.000Z",
          updatedAt: "2026-04-27T00:00:00.000Z"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    expect(await screen.findByRole("heading", { name: "你要怎么做？" })).toBeInTheDocument();
    expect(screen.getByText("银色符文在脚下熄灭。")).toBeInTheDocument();
    expect(screen.queryByText("召唤事故释放旧封印。")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "旅途见闻" })).toBeInTheDocument();
    expect(await screen.findByText("局内人")).toBeInTheDocument();
    expect(screen.getByText("断星高塔")).toBeInTheDocument();
    expect(screen.queryByText("当前章节")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "当前目标" })).not.toBeInTheDocument();
    expect(screen.queryByText("发现线索")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "推荐动作" })).not.toBeInTheDocument();
    expect(screen.queryByText("Quest Log")).not.toBeInTheDocument();
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
    expect(screen.queryByText("胜利条件")).not.toBeInTheDocument();
    expect(screen.queryByText("失败条件")).not.toBeInTheDocument();
    expect(screen.queryByText("阻止封印碎片落入魔王信徒手中。")).not.toBeInTheDocument();
    expect(screen.queryByText("城邦被封印污染吞没。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回首页" })).toBeInTheDocument();
    expect(screen.queryByText(/旁白/u)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "查看" }));

    expect(screen.getByRole("dialog", { name: "旅途见闻" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "身份" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "人物" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "地点" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关系" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "线索" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "物件" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "人物" }));
    expect(screen.getByRole("heading", { name: "莉瑟" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    await userEvent.type(screen.getByRole("textbox", { name: "你的下一步行动" }), "我尝试调查高塔入口");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(
      await screen.findByText("你开始行动。断星高塔入口的旧痕连在一起，指向更深处。")
    ).toBeInTheDocument();
    expect(screen.queryByText("我尝试调查高塔入口")).not.toBeInTheDocument();
    expect(screen.queryByText(/旁白/u)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "尝试向 莉瑟 追问关键细节" })).toBeInTheDocument();
    expect(await screen.findByText("有新见闻")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "查看" }));
    await userEvent.click(screen.getByRole("button", { name: "线索" }));
    expect(screen.getByRole("heading", { name: "断星高塔的异常痕迹" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    await userEvent.click(screen.getByRole("button", { name: "返回首页" }));

    expect(screen.getByRole("heading", { name: "Isekai" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始新冒险" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "你要怎么做？" })).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/adventure-candidates",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/adventures",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions",
      expect.objectContaining({
        method: "POST"
      })
    );
  });
});
