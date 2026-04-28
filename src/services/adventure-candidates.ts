import {
  AdventureCandidateGenerationRequestSchema,
  AdventureCandidateListSchema,
  AdventureCandidatePreviewListSchema,
  AdventureCandidatePreviewSchema,
  AdventureCandidateSchema,
  AdventureIntensitySchema,
  AdventureToneSchema,
  EndingSeedSchema,
  FactionSeedSchema,
  LocationSeedSchema,
  NpcSeedSchema,
  PlayerSetupOptionSchema,
  StoryActNameSchema,
  type AdventureCandidate,
  type AdventureCandidateGenerationRequest,
  type AdventureCandidatePreview,
  type EndingSeed,
  type StoryArc,
  type WorldSeedId,
  type WorldSeedPreset
} from "../domain";
import {
  requestOpenAiCompatibleJsonObject,
  resolveOpenAiCompatibleProviderConfig,
  type OpenAiCompatibleProviderConfig
} from "./gm/openai-compatible";
import { listWorldSeedPresets } from "./world-seeds";
import {
  logAiStructuredOutputParseFailure,
  logEvent,
  type LogContext
} from "../shared/logger";
import { z } from "zod";

type CandidateBlueprint = {
  title: string;
  pitch: string;
  openingScene: string;
  mainConflict: string;
  winCondition: string;
  lossCondition: string;
  locationName: string;
  npcName: string;
  npcRole: string;
  factionName: string;
  tags: string[];
  endingTone: EndingSeed["tone"];
};

const AdventureCandidatePreviewRequestConfigSchema = z.object({
  temperature: z.coerce.number().min(0).max(2).default(1),
  thinking: z.enum(["enabled", "disabled"]).default("disabled")
});

const adventureCandidatePreviewVariantFocuses = [
  "事件钩子：用一个立即发生的突发事件带出冒险入口。",
  "人物关系：用一个可互动人物和关系压力带出冒险入口。",
  "地点谜团：用一个地点异常、禁忌或谜团带出冒险入口。"
] as const;

const AdventureCandidateConceptSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  title: z.string().min(1),
  teaser: z.string().min(1),
  playerSetupOptions: z.array(PlayerSetupOptionSchema).min(2).max(4),
  tags: z.array(z.string().min(1)).min(1).max(8)
});

const AdventureCandidateConceptDraftSchema = z.object({
  title: z.string().min(1),
  teaser: z.string().min(1),
  playerSetupOptions: z.array(PlayerSetupOptionSchema.omit({ id: true })).min(2).max(4),
  tags: z.array(z.string().min(1)).min(1).max(8)
});

const AdventureCandidateConceptDraftResponseSchema = z.object({
  candidates: z.array(AdventureCandidateConceptDraftSchema).min(1).max(3)
});

const AdventureCandidateDraftSchema = z.object({
  title: z.string().min(1),
  pitch: z.string().min(1),
  playerSetupOptions: z.array(PlayerSetupOptionSchema.omit({ id: true })).min(2).max(4),
  openingScene: z.string().min(1),
  worldPremise: z.string().min(1),
  mainConflict: z.string().min(1),
  storyArc: z.object({
    acts: z
      .array(
        z.object({
          name: StoryActNameSchema,
          title: z.string().min(1),
          goal: z.string().min(1),
          transitionHint: z.string().optional().default("")
        })
      )
      .min(5)
  }),
  winCondition: z.string().min(1),
  lossCondition: z.string().min(1),
  endingSeeds: z.array(EndingSeedSchema.omit({ id: true })).min(2).max(4),
  endgameTriggers: z.array(z.string().min(1)).min(1),
  factions: z.array(FactionSeedSchema.omit({ id: true })).min(1).max(4),
  locations: z.array(LocationSeedSchema.omit({ id: true })).min(1).max(5),
  npcSeeds: z.array(NpcSeedSchema.omit({ id: true })).min(1).max(5),
  toneGuidelines: z.string().min(1),
  hiddenGmNotes: z.string().min(1),
  runtimePrompt: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1).max(8)
});

const AdventureCandidateDraftResponseSchema = z.object({
  candidates: z.array(AdventureCandidateDraftSchema).min(1).max(3)
});

const AdventureCandidateDetailDraftSchema = AdventureCandidateDraftSchema.omit({
  playerSetupOptions: true,
  tags: true,
  title: true
});

const AdventureCandidateDetailDraftResponseSchema = z.object({
  adventure: AdventureCandidateDetailDraftSchema
});

type AdventureCandidateConcept = z.infer<typeof AdventureCandidateConceptSchema>;
type AdventureCandidateConceptDraft = z.infer<typeof AdventureCandidateConceptDraftSchema>;
type AdventureCandidateDetailDraft = z.infer<typeof AdventureCandidateDetailDraftSchema>;
type AdventureCandidateDraft = z.infer<typeof AdventureCandidateDraftSchema>;
type AdventureCandidatePreviewRequestConfig = z.infer<
  typeof AdventureCandidatePreviewRequestConfigSchema
>;
type AdventureCandidatePreviewVariantFocus =
  (typeof adventureCandidatePreviewVariantFocuses)[number];
type StoredAdventureCandidate = {
  candidate?: AdventureCandidate;
  concept: AdventureCandidateConcept;
  providerName: string;
  request: AdventureCandidateGenerationRequest;
  worldSeedId: WorldSeedId;
};

type GenerateAdventureCandidateOptions = {
  logContext?: LogContext;
  signal?: AbortSignal;
};

type PreviewConceptGenerationInput = {
  avoidTitles: readonly string[];
  config: OpenAiCompatibleProviderConfig;
  previewConfig: AdventureCandidatePreviewRequestConfig;
  request: AdventureCandidateGenerationRequest;
  seed: WorldSeedPreset;
  logContext?: LogContext;
  signal?: AbortSignal;
  variantFocus: AdventureCandidatePreviewVariantFocus;
  variantIndex: number;
};

type PreviewConceptGenerationResult = {
  concept: AdventureCandidateConcept;
  generationInput: PreviewConceptGenerationInput;
};

const adventureCandidatesById = new Map<string, StoredAdventureCandidate>();

const blueprintsBySeed: Record<WorldSeedPreset["id"], readonly CandidateBlueprint[]> = {
  isekai: [
    {
      title: "断塔召唤",
      pitch: "你在破碎高塔中醒来，召唤阵只完成了一半，城邦已经把你当成灾厄源头。",
      openingScene: "银色符文在脚下熄灭，塔外传来冒险者公会的警钟。",
      mainConflict: "召唤事故释放了旧魔王的封印碎片，城邦准备处决所有召唤者。",
      winCondition: "查明召唤事故真相，并阻止封印碎片落入魔王信徒手中。",
      lossCondition: "城邦被封印污染吞没，玩家被认定为灾厄核心。",
      locationName: "断星高塔",
      npcName: "莉瑟",
      npcRole: "公会书记官",
      factionName: "银铃冒险者公会",
      tags: ["异世界", "召唤", "封印"],
      endingTone: "bittersweet"
    },
    {
      title: "无职者的第七技能",
      pitch: "你被判定为无职者，却看见只有自己能读懂的第七技能栏。",
      openingScene: "职业评定石沉默下来，人群的嘲笑还没散去，石面却裂开一道细光。",
      mainConflict: "第七技能能改写职业规则，也会引来王都审判庭。",
      winCondition: "掌握第七技能的限制，并决定是否公开职业系统的秘密。",
      lossCondition: "第七技能失控，职业规则被审判庭夺走。",
      locationName: "白鸦王都",
      npcName: "诺恩",
      npcRole: "被流放的技能鉴定师",
      factionName: "王都审判庭",
      tags: ["异世界", "技能", "王都"],
      endingTone: "triumphant"
    },
    {
      title: "迷宫税务官",
      pitch: "你不是勇者，而是被派去清查迷宫税账的临时官员。",
      openingScene: "迷宫入口的商队排成长龙，守卫把一摞发霉账本塞进你怀里。",
      mainConflict: "迷宫收益失踪牵出领主、商会和地下魔物的暗线交易。",
      winCondition: "找回失踪税金，并决定迷宫收益该归谁。",
      lossCondition: "迷宫暴动，边境财政和冒险者秩序同时崩溃。",
      locationName: "苔石迷宫",
      npcName: "巴洛",
      npcRole: "迷宫门卫",
      factionName: "赤印商会",
      tags: ["异世界", "迷宫", "商会"],
      endingTone: "ambiguous"
    }
  ],
  medieval: [
    {
      title: "黑麦边境",
      pitch: "边境黑麦歉收，骑士团和教会都声称这不是天灾。",
      openingScene: "雨停后的田野散出铁锈味，第一具骑士尸体倒在麦垄边。",
      mainConflict: "饥荒、征税和旧教会遗物把边境推向叛乱。",
      winCondition: "找出歉收背后的真相，并避免边境公开叛乱。",
      lossCondition: "边境粮仓被焚，王国军队进驻清洗。",
      locationName: "黑麦镇",
      npcName: "埃达",
      npcRole: "磨坊主遗孀",
      factionName: "圣灰教会",
      tags: ["中古", "边境", "低魔"],
      endingTone: "bittersweet"
    },
    {
      title: "银鹿继承案",
      pitch: "公爵死后没有合法继承人，三枚银鹿戒指同时出现。",
      openingScene: "你抵达公爵葬礼时，第三口棺材被人悄悄抬进地下室。",
      mainConflict: "继承权争夺掩盖了公爵与外敌签下的秘密契约。",
      winCondition: "确认真正继承者，或让公国找到新的权力平衡。",
      lossCondition: "继承战争爆发，银鹿公国分裂。",
      locationName: "银鹿堡",
      npcName: "罗温",
      npcRole: "失势书记官",
      factionName: "北境骑士会",
      tags: ["中古", "继承", "阴谋"],
      endingTone: "ambiguous"
    },
    {
      title: "第九座烽火台",
      pitch: "王国地图上只有八座烽火台，但北境夜里亮起了第九道火。",
      openingScene: "风雪封住山口，你看见远处不该存在的火光连续闪烁三次。",
      mainConflict: "失落烽火台传回古战场警讯，边境守军无人敢承认它存在。",
      winCondition: "抵达第九座烽火台，并决定是否公开古战场的警讯。",
      lossCondition: "北境防线误判敌情，王国主力被引入陷阱。",
      locationName: "北境山口",
      npcName: "卡森",
      npcRole: "独臂巡夜人",
      factionName: "边境守军",
      tags: ["中古", "战争", "雪境"],
      endingTone: "tragic"
    }
  ],
  "ancient-china": [
    {
      title: "洛水无碑",
      pitch: "洛水边一夜出现无字石碑，朝廷和江湖都在找第一个读出碑文的人。",
      openingScene: "晨雾没散，渡口的船夫跪在河边，没人敢碰那块湿冷的石碑。",
      mainConflict: "无字碑牵出旧案、门派秘约和朝堂对地方势力的清洗。",
      winCondition: "揭开无字碑的真实来历，并保护或毁掉碑文秘密。",
      lossCondition: "碑文被权贵利用，引发门派和州府冲突。",
      locationName: "洛水渡",
      npcName: "沈照",
      npcRole: "落第书生",
      factionName: "青衡门",
      tags: ["古代中国", "江湖", "志怪"],
      endingTone: "bittersweet"
    },
    {
      title: "边城纸马",
      pitch: "边城每逢月缺就有人收到纸马，收到的人三日内都会出城失踪。",
      openingScene: "客栈门缝下塞进一匹白纸马，纸背写着你的名字。",
      mainConflict: "纸马传闻背后是边军旧案和商道鬼市的双重交易。",
      winCondition: "查清纸马来源，并决定是否揭开边军旧案。",
      lossCondition: "鬼市迁走，所有失踪者线索断绝。",
      locationName: "雁门外城",
      npcName: "柳娘",
      npcRole: "客栈掌柜",
      factionName: "北路商帮",
      tags: ["古代中国", "边塞", "悬疑"],
      endingTone: "ambiguous"
    },
    {
      title: "雨夜借剑",
      pitch: "一名陌生剑客在雨夜向你借剑，第二天县令死在同一把剑下。",
      openingScene: "雨水沿着屋檐落下，陌生人把剑还给你时，剑鞘仍是温的。",
      mainConflict: "县令之死牵出门派恩怨、粮仓亏空和一场借刀杀人的局。",
      winCondition: "证明剑案真相，并决定是否保住真正的复仇者。",
      lossCondition: "你被定为凶手，门派和官府共同追捕。",
      locationName: "平昌县",
      npcName: "谢微",
      npcRole: "捕快",
      factionName: "白鹭剑派",
      tags: ["古代中国", "剑案", "县城"],
      endingTone: "triumphant"
    }
  ],
  "sengoku-japan": [
    {
      title: "雾城三日",
      pitch: "一座山城被雾封住三日，城主却在第一夜消失。",
      openingScene: "雾从城壕升起时，守门武士发现城主的佩刀插在空座前。",
      mainConflict: "城主失踪让家臣团分裂，雾中妖怪传闻被忍者用来掩盖政变。",
      winCondition: "查明城主去向，并让山城在合战前保持完整。",
      lossCondition: "家臣互相残杀，敌军趁雾夺城。",
      locationName: "雾隐城",
      npcName: "千代",
      npcRole: "茶室女主人",
      factionName: "黑松家",
      tags: ["战国", "山城", "忍者"],
      endingTone: "bittersweet"
    },
    {
      title: "断刀使者",
      pitch: "你护送一把断刀去敌国议和，但所有人都说刀的另一半在死人手里。",
      openingScene: "雨打在轿帘上，断刀盒里传来像指节敲木的轻响。",
      mainConflict: "断刀是停战信物，也是指向旧主背叛的证据。",
      winCondition: "把断刀送到议和席，并决定是否公开背叛证据。",
      lossCondition: "议和破裂，两国在边境开战。",
      locationName: "雨坂道",
      npcName: "源七",
      npcRole: "浪人护卫",
      factionName: "白羽藩",
      tags: ["战国", "议和", "浪人"],
      endingTone: "ambiguous"
    },
    {
      title: "稻荷无面",
      pitch: "稻荷社的神使没有脸，所有看见它的人都会忘记一个亲人的名字。",
      openingScene: "祭典鼓声停下时，狐狸面具从神龛里自己滑了出来。",
      mainConflict: "村社怪谈牵出大名征粮、忍者潜伏和被抹去的继承血脉。",
      winCondition: "找回被夺走的名字，并阻止藩内继承权被篡改。",
      lossCondition: "所有证人失去关键记忆，篡位成为既成事实。",
      locationName: "白稻村",
      npcName: "阿铃",
      npcRole: "神社巫女",
      factionName: "鸣海众",
      tags: ["战国", "妖怪", "继承"],
      endingTone: "tragic"
    }
  ]
};

function buildStoryArc(title: string): StoryArc {
  return {
    acts: [
      {
        name: "act1",
        title: "开局钩子",
        goal: `进入《${title}》的核心场景并发现第一条线索。`,
        transitionHint: "玩家确认自己要追查的直接目标。"
      },
      {
        name: "act2",
        title: "探索和选择",
        goal: "调查关键地点，认识主要 NPC，并选择倾向的阵营或策略。",
        transitionHint: "玩家掌握足以改变局面的秘密。"
      },
      {
        name: "act3",
        title: "冲突升级",
        goal: "让主线矛盾公开化，迫使玩家承担选择代价。",
        transitionHint: "敌对势力或隐藏真相正面出现。"
      },
      {
        name: "act4",
        title: "终局抉择",
        goal: "围绕主线矛盾做出不可逆选择。",
        transitionHint: "玩家触发 win/loss condition 或进入结局分歧。"
      },
      {
        name: "ending",
        title: "结局",
        goal: "根据玩家选择、关系和失败代价生成结局摘要。",
        transitionHint: "玩家可以选择后日谈、续章或回到旧节点。"
      }
    ]
  };
}

function getWorldSeed(seedId: WorldSeedPreset["id"]): WorldSeedPreset {
  const seed = listWorldSeedPresets().find((preset) => preset.id === seedId);

  if (!seed) {
    throw new Error(`unknown world seed: ${seedId}`);
  }

  return seed;
}

export function generateMockAdventureCandidates(
  rawRequest: unknown
): readonly AdventureCandidate[] {
  const request = AdventureCandidateGenerationRequestSchema.parse(rawRequest);
  const seed = getWorldSeed(request.worldSeedId);
  const blueprints = blueprintsBySeed[request.worldSeedId].slice(0, request.candidateCount);
  const candidates = blueprints.map((blueprint, index): AdventureCandidate => {
    const candidateNumber = index + 1;

    return {
      id: `${seed.id}-candidate-${candidateNumber}`,
      requestId: `${seed.id}-request-local`,
      title: blueprint.title,
      pitch: blueprint.pitch,
      playerSetupOptions: [
        {
          id: `${seed.id}-wanderer-${candidateNumber}`,
          title: "外来者",
          description: "你刚抵达此地，没有固定阵营，容易被各方试探。",
          startingGoal: "弄清自己被卷入事件的原因"
        },
        {
          id: `${seed.id}-insider-${candidateNumber}`,
          title: "局内人",
          description: "你和当地某个势力有旧关系，也因此背负更多风险。",
          startingGoal: "保护旧关系，同时查清主线冲突"
        }
      ],
      openingScene: blueprint.openingScene,
      worldPremise: `${seed.description}${seed.generationPrompt}`,
      mainConflict: blueprint.mainConflict,
      storyArc: buildStoryArc(blueprint.title),
      winCondition: blueprint.winCondition,
      lossCondition: blueprint.lossCondition,
      endingSeeds: [
        {
          id: `${seed.id}-ending-primary-${candidateNumber}`,
          title: "代价中的胜利",
          description: "玩家解决主线矛盾，但必须承担关系或资源上的代价。",
          tone: blueprint.endingTone
        },
        {
          id: `${seed.id}-ending-failure-${candidateNumber}`,
          title: "失控的余波",
          description: "玩家没能阻止核心危机，故事转入失败、流亡或后日谈。",
          tone: "tragic"
        }
      ],
      endgameTriggers: [blueprint.winCondition, blueprint.lossCondition],
      factions: [
        {
          id: `${seed.id}-faction-${candidateNumber}`,
          name: blueprint.factionName,
          publicDescription: "该势力掌握关键资源，也隐藏了不愿公开的交易。"
        }
      ],
      locations: [
        {
          id: `${seed.id}-location-${candidateNumber}`,
          name: blueprint.locationName,
          description: "第一幕会抵达的关键地点，也是主线矛盾最早显影的地方。"
        }
      ],
      npcSeeds: [
        {
          id: `${seed.id}-npc-${candidateNumber}`,
          name: blueprint.npcName,
          role: blueprint.npcRole,
          publicDescription: "这个人愿意提供线索，但不会一次说出全部真相。",
          privateMotivation: "避免自己在主线冲突中失去最后的筹码。"
        }
      ],
      toneGuidelines: `保持${seed.defaultTone}气质，给玩家清晰选择，但不要直接替玩家决定结果。`,
      hiddenGmNotes: "这是本地 mock 数据。后续接入 LLM 后由 provider 生成更丰富的伏笔。",
      runtimePrompt: `围绕《${blueprint.title}》推进故事。玩家只能声明尝试，结果由 AI/GM 判断。`,
      tags: [...blueprint.tags, seed.name]
    };
  });

  return AdventureCandidateListSchema.parse(candidates);
}

export function generateMockAdventureCandidateConcepts(
  rawRequest: unknown
): readonly AdventureCandidateConcept[] {
  const request = AdventureCandidateGenerationRequestSchema.parse(rawRequest);

  return AdventureCandidateConceptSchema.array()
    .min(1)
    .max(3)
    .parse(generateMockAdventureCandidates(request).map(createAdventureCandidateConceptFromCandidate));
}

export async function generateAdventureCandidates(
  rawRequest: unknown,
  options: GenerateAdventureCandidateOptions = {}
): Promise<readonly AdventureCandidate[]> {
  const request = AdventureCandidateGenerationRequestSchema.parse(rawRequest);
  const providerName = process.env.GM_PROVIDER ?? "mock";

  switch (providerName) {
    case "mock":
      return generateMockAdventureCandidates(request);
    case "openai":
    case "openai-compatible":
      return generateOpenAiCompatibleAdventureCandidates(request, options);
    default:
      throw new Error(`Unsupported adventure candidate provider: ${providerName}`);
  }
}

export async function generateAdventureCandidateConcepts(
  rawRequest: unknown,
  options: GenerateAdventureCandidateOptions = {}
): Promise<readonly AdventureCandidateConcept[]> {
  const request = AdventureCandidateGenerationRequestSchema.parse(rawRequest);
  const providerName = process.env.GM_PROVIDER ?? "mock";

  switch (providerName) {
    case "mock":
      return generateMockAdventureCandidateConcepts(request);
    case "openai":
    case "openai-compatible":
      return generateOpenAiCompatibleAdventureCandidateConcepts(request, options);
    default:
      throw new Error(`Unsupported adventure candidate provider: ${providerName}`);
  }
}

export async function generateAdventureCandidatePreviews(
  rawRequest: unknown,
  options: GenerateAdventureCandidateOptions = {}
): Promise<readonly AdventureCandidatePreview[]> {
  const request = AdventureCandidateGenerationRequestSchema.parse(rawRequest);
  const providerName = process.env.GM_PROVIDER ?? "mock";
  const concepts = await generateAdventureCandidateConcepts(request, options);

  storeAdventureCandidateConcepts(request.worldSeedId, request, concepts, providerName);

  return AdventureCandidatePreviewListSchema.parse(concepts.map(createAdventureCandidatePreview));
}

export function storeAdventureCandidateConcepts(
  worldSeedId: WorldSeedId,
  request: AdventureCandidateGenerationRequest,
  concepts: readonly AdventureCandidateConcept[],
  providerName = process.env.GM_PROVIDER ?? "mock"
): void {
  concepts.forEach((concept) => {
    adventureCandidatesById.set(concept.id, {
      concept,
      providerName,
      request,
      worldSeedId
    });
  });
}

export function storeAdventureCandidates(
  worldSeedId: WorldSeedId,
  candidates: readonly AdventureCandidate[]
): void {
  candidates.forEach((candidate) => {
    adventureCandidatesById.set(candidate.id, {
      candidate,
      concept: createAdventureCandidateConceptFromCandidate(candidate),
      providerName: process.env.GM_PROVIDER ?? "mock",
      request: {
        candidateCount: candidates.length,
        worldSeedId
      },
      worldSeedId
    });
  });
}

export function getStoredAdventureCandidate(candidateId: string): StoredAdventureCandidate | undefined {
  return adventureCandidatesById.get(candidateId);
}

export async function materializeAdventureCandidate(
  candidateId: string,
  options: GenerateAdventureCandidateOptions = {}
): Promise<StoredAdventureCandidate | undefined> {
  const storedCandidate = getStoredAdventureCandidate(candidateId);

  if (!storedCandidate || storedCandidate.candidate) {
    return storedCandidate;
  }

  const candidate = await generateAdventureCandidateFromConcept(storedCandidate, options);
  const materializedCandidate = {
    ...storedCandidate,
    candidate
  };

  adventureCandidatesById.set(candidate.id, materializedCandidate);

  return materializedCandidate;
}

async function generateAdventureCandidateFromConcept(
  storedCandidate: StoredAdventureCandidate,
  options: GenerateAdventureCandidateOptions
): Promise<AdventureCandidate> {
  switch (storedCandidate.providerName) {
    case "mock": {
      const candidates = generateMockAdventureCandidates(storedCandidate.request);
      const candidate = candidates.find((item) => item.id === storedCandidate.concept.id);

      if (!candidate) {
        throw new Error(`mock adventure candidate not found: ${storedCandidate.concept.id}`);
      }

      return candidate;
    }
    case "openai":
    case "openai-compatible":
      return generateOpenAiCompatibleAdventureCandidateFromConcept(storedCandidate, options);
    default:
      throw new Error(`Unsupported adventure candidate provider: ${storedCandidate.providerName}`);
  }
}

export function createAdventureCandidatePreview(
  candidate: AdventureCandidate | AdventureCandidateConcept
): AdventureCandidatePreview {
  return AdventureCandidatePreviewSchema.parse({
    id: candidate.id,
    requestId: candidate.requestId,
    title: candidate.title,
    teaser: "teaser" in candidate ? candidate.teaser : buildSpoilerFreeCandidateTeaser(candidate),
    playerSetupOptions: candidate.playerSetupOptions.map((option) => ({
      id: option.id,
      title: option.title,
      description: option.description
    })),
    tags: candidate.tags
  });
}

export async function generateOpenAiCompatibleAdventureCandidates(
  request: AdventureCandidateGenerationRequest,
  options: GenerateAdventureCandidateOptions = {}
): Promise<readonly AdventureCandidate[]> {
  const seed = getWorldSeed(request.worldSeedId);
  const config = resolveOpenAiCompatibleProviderConfig();
  const logContext: LogContext = {
    ...options.logContext,
    operation: options.logContext?.operation ?? "adventure_candidate_generation",
    worldSeedId: options.logContext?.worldSeedId ?? request.worldSeedId
  };
  const content = await requestOpenAiCompatibleJsonObject({
    config,
    label: "OpenAI-compatible adventure candidate",
    logContext,
    messages: buildAdventureCandidatePromptMessages(seed, request),
    signal: options.signal
  });

  return parseAdventureCandidateDraftJson(seed, request, content, logContext);
}

export async function generateOpenAiCompatibleAdventureCandidateConcepts(
  request: AdventureCandidateGenerationRequest,
  options: GenerateAdventureCandidateOptions = {}
): Promise<readonly AdventureCandidateConcept[]> {
  const seed = getWorldSeed(request.worldSeedId);
  const config = resolveOpenAiCompatibleProviderConfig();
  const previewConfig = resolveAdventureCandidatePreviewRequestConfig();
  const generationInputs = Array.from({ length: request.candidateCount }, (_, index) =>
    createPreviewConceptGenerationInput({
      config,
      index,
      previewConfig,
      request,
      seed,
      logContext: {
        ...options.logContext,
        operation: options.logContext?.operation ?? "adventure_candidate_preview_generation",
        worldSeedId: options.logContext?.worldSeedId ?? request.worldSeedId
      },
      signal: options.signal
    })
  );
  const settledResults = await Promise.allSettled(
    generationInputs.map(async (input) => ({
      concept: await generateOpenAiCompatibleAdventureCandidateConcept(input),
      generationInput: input
    }))
  );
  const failedResults = settledResults.filter((result) => result.status === "rejected");
  const successfulResults = settledResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );

  if (failedResults.length > 0 && successfulResults.length > 0) {
    logEvent(
      "adventure_candidate_preview_generation_partial_failure",
      {
        candidateCount: request.candidateCount,
        failedCount: failedResults.length,
        provider: "openai-compatible",
        worldSeedId: request.worldSeedId
      },
      "warn"
    );
  }

  if (successfulResults.length === 0) {
    throw new Error("OpenAI-compatible adventure candidate preview generation failed");
  }

  return retryDuplicateAdventureCandidateConcepts({
    generationResults: successfulResults,
    request
  });
}

async function generateOpenAiCompatibleAdventureCandidateConcept(
  input: PreviewConceptGenerationInput
): Promise<AdventureCandidateConcept> {
  const content = await requestOpenAiCompatibleJsonObject({
    config: input.config,
    label: "OpenAI-compatible adventure candidate preview",
    logContext: input.logContext,
    messages: buildAdventureCandidateConceptPromptMessages(input.seed, input.request, {
      avoidTitles: input.avoidTitles,
      variantFocus: input.variantFocus,
      variantIndex: input.variantIndex,
      variantSeed: crypto.randomUUID()
    }),
    signal: input.signal,
    temperature: input.previewConfig.temperature,
    thinking: input.previewConfig.thinking
  });
  const [concept] = parseAdventureCandidateConceptDraftJson(
    input.seed,
    input.request,
    content,
    input.logContext
  );

  if (!concept) {
    throw new Error("OpenAI-compatible adventure candidate preview response is empty");
  }

  return concept;
}

async function retryDuplicateAdventureCandidateConcepts(input: {
  generationResults: readonly PreviewConceptGenerationResult[];
  request: AdventureCandidateGenerationRequest;
}): Promise<readonly AdventureCandidateConcept[]> {
  const uniqueConcepts: AdventureCandidateConcept[] = [];
  const duplicateInputs: PreviewConceptGenerationInput[] = [];
  const seenKeys = new Set<string>();

  input.generationResults.forEach((generationResult) => {
    const key = createAdventureCandidateConceptDedupeKey(generationResult.concept);

    if (seenKeys.has(key)) {
      duplicateInputs.push(generationResult.generationInput);
      return;
    }

    seenKeys.add(key);
    uniqueConcepts.push(generationResult.concept);
  });

  if (duplicateInputs.length === 0) {
    return uniqueConcepts;
  }

  const retryResults = await Promise.allSettled(
    duplicateInputs.map((generationInput) =>
      generateOpenAiCompatibleAdventureCandidateConcept({
        ...generationInput,
        avoidTitles: uniqueConcepts.map((concept) => concept.title)
      })
    )
  );

  retryResults.forEach((result) => {
    if (result.status !== "fulfilled") {
      return;
    }

    const key = createAdventureCandidateConceptDedupeKey(result.value);

    if (seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    uniqueConcepts.push(result.value);
  });

  if (retryResults.some((result) => result.status === "rejected")) {
    logEvent(
      "adventure_candidate_preview_duplicate_retry_failed",
      {
        failedCount: retryResults.filter((result) => result.status === "rejected").length,
        provider: "openai-compatible",
        worldSeedId: input.request.worldSeedId
      },
      "warn"
    );
  }

  return uniqueConcepts.slice(0, input.request.candidateCount);
}

function createPreviewConceptGenerationInput(input: {
  config: OpenAiCompatibleProviderConfig;
  index: number;
  previewConfig: AdventureCandidatePreviewRequestConfig;
  request: AdventureCandidateGenerationRequest;
  seed: WorldSeedPreset;
  logContext?: LogContext;
  signal?: AbortSignal;
}): PreviewConceptGenerationInput {
  return {
    avoidTitles: [],
    config: input.config,
    logContext: input.logContext,
    previewConfig: input.previewConfig,
    request: {
      ...input.request,
      candidateCount: 1
    },
    seed: input.seed,
    signal: input.signal,
    variantFocus:
      adventureCandidatePreviewVariantFocuses[
        input.index % adventureCandidatePreviewVariantFocuses.length
      ] ?? adventureCandidatePreviewVariantFocuses[0],
    variantIndex: input.index + 1
  };
}

function resolveAdventureCandidatePreviewRequestConfig(
  env: NodeJS.ProcessEnv = process.env
): AdventureCandidatePreviewRequestConfig {
  const result = AdventureCandidatePreviewRequestConfigSchema.safeParse({
    temperature:
      env.GM_OPENAI_PREVIEW_TEMPERATURE ?? env.OPENAI_PREVIEW_TEMPERATURE ?? undefined,
    thinking: env.GM_OPENAI_PREVIEW_THINKING ?? env.OPENAI_PREVIEW_THINKING ?? undefined
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid OpenAI-compatible adventure candidate preview config: ${issues}`);
  }

  return result.data;
}

function createAdventureCandidateConceptDedupeKey(concept: AdventureCandidateConcept): string {
  return `${normalizePreviewDedupeText(concept.title)}|${normalizePreviewDedupeText(
    concept.teaser
  )}`;
}

function normalizePreviewDedupeText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, "");
}

export async function generateOpenAiCompatibleAdventureCandidateFromConcept(
  storedCandidate: StoredAdventureCandidate,
  options: GenerateAdventureCandidateOptions = {}
): Promise<AdventureCandidate> {
  const seed = getWorldSeed(storedCandidate.worldSeedId);
  const config = resolveOpenAiCompatibleProviderConfig();
  const logContext: LogContext = {
    ...options.logContext,
    operation: options.logContext?.operation ?? "adventure_candidate_full_generation",
    worldSeedId: options.logContext?.worldSeedId ?? storedCandidate.worldSeedId
  };
  const content = await requestOpenAiCompatibleJsonObject({
    config,
    label: "OpenAI-compatible adventure candidate full",
    logContext,
    messages: buildAdventureCandidateDetailPromptMessages(seed, storedCandidate),
    signal: options.signal
  });

  return parseAdventureCandidateDetailDraftJson(
    seed,
    storedCandidate.concept,
    content,
    logContext
  );
}

export function parseAdventureCandidateConceptDraftJson(
  seed: WorldSeedPreset,
  request: AdventureCandidateGenerationRequest,
  content: string,
  logContext: LogContext = {}
): readonly AdventureCandidateConcept[] {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(content.trim());
  } catch (error) {
    const parseError = new Error(
      `OpenAI-compatible adventure candidate preview response is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    logAiStructuredOutputParseFailure({
      ...logContext,
      content,
      error: parseError,
      schemaName: "AdventureCandidateConceptDraftResponse",
      worldSeedId: logContext.worldSeedId ?? request.worldSeedId
    });
    throw parseError;
  }

  const parsedResponse = parseSchemaOrLog(
    AdventureCandidateConceptDraftResponseSchema,
    parsedJson,
    {
      content,
      logContext: {
        ...logContext,
        worldSeedId: logContext.worldSeedId ?? request.worldSeedId
      },
      schemaName: "AdventureCandidateConceptDraftResponse"
    }
  );
  const requestId = `${seed.id}-request-preview-${crypto.randomUUID()}`;
  const concepts = parsedResponse.candidates
    .slice(0, request.candidateCount)
    .map((draft, index) => buildAdventureCandidateConceptFromDraft(seed, requestId, draft, index));

  return parseSchemaOrLog(AdventureCandidateConceptSchema.array().min(1).max(3), concepts, {
    content,
    logContext: {
      ...logContext,
      worldSeedId: logContext.worldSeedId ?? request.worldSeedId
    },
    schemaName: "AdventureCandidateConceptList"
  });
}

export function parseAdventureCandidateDetailDraftJson(
  seed: WorldSeedPreset,
  concept: AdventureCandidateConcept,
  content: string,
  logContext: LogContext = {}
): AdventureCandidate {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(content.trim());
  } catch (error) {
    const parseError = new Error(
      `OpenAI-compatible adventure candidate full response is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    logAiStructuredOutputParseFailure({
      ...logContext,
      content,
      error: parseError,
      schemaName: "AdventureCandidateDetailDraftResponse",
      worldSeedId: logContext.worldSeedId ?? seed.id
    });
    throw parseError;
  }

  const parsedResponse = parseSchemaOrLog(
    AdventureCandidateDetailDraftResponseSchema,
    parsedJson,
    {
      content,
      logContext: {
        ...logContext,
        worldSeedId: logContext.worldSeedId ?? seed.id
      },
      schemaName: "AdventureCandidateDetailDraftResponse"
    }
  );

  return buildAdventureCandidateFromDetailDraft(seed, concept, parsedResponse.adventure);
}

export function parseAdventureCandidateDraftJson(
  seed: WorldSeedPreset,
  request: AdventureCandidateGenerationRequest,
  content: string,
  logContext: LogContext = {}
): readonly AdventureCandidate[] {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(content.trim());
  } catch (error) {
    const parseError = new Error(
      `OpenAI-compatible adventure candidate response is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    logAiStructuredOutputParseFailure({
      ...logContext,
      content,
      error: parseError,
      schemaName: "AdventureCandidateDraftResponse",
      worldSeedId: logContext.worldSeedId ?? request.worldSeedId
    });
    throw parseError;
  }

  const parsedResponse = parseSchemaOrLog(AdventureCandidateDraftResponseSchema, parsedJson, {
    content,
    logContext: {
      ...logContext,
      worldSeedId: logContext.worldSeedId ?? request.worldSeedId
    },
    schemaName: "AdventureCandidateDraftResponse"
  });
  const requestId = `${seed.id}-request-ai-${crypto.randomUUID()}`;
  const candidates = parsedResponse.candidates
    .slice(0, request.candidateCount)
    .map((draft, index) => buildAdventureCandidateFromDraft(seed, requestId, draft, index));

  return parseSchemaOrLog(AdventureCandidateListSchema, candidates, {
    content,
    logContext: {
      ...logContext,
      worldSeedId: logContext.worldSeedId ?? request.worldSeedId
    },
    schemaName: "AdventureCandidateList"
  });
}

function parseSchemaOrLog<T>(
  schema: z.ZodType<T>,
  value: unknown,
  input: {
    content: string;
    logContext: LogContext;
    schemaName: string;
  }
): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    logAiStructuredOutputParseFailure({
      ...input.logContext,
      content: input.content,
      error: result.error,
      parsedJson: value,
      schemaName: input.schemaName
    });
    throw result.error;
  }

  return result.data;
}

function buildAdventureCandidatePromptMessages(
  seed: WorldSeedPreset,
  request: AdventureCandidateGenerationRequest
) {
  return [
    {
      role: "system" as const,
      content: [
        "你是本地文字冒险游戏的冒险生成 GM。",
        "你只负责生成可玩的冒险候选，不要进入游玩回合。",
        "输出必须是单个 JSON 对象，不要 Markdown，不要解释，不要代码块。",
        "JSON 顶层必须是 {\"candidates\": [...]}。",
        `candidates 必须正好包含 ${request.candidateCount} 个候选。`,
        "每个候选必须有完整字段：title, pitch, playerSetupOptions, openingScene, worldPremise, mainConflict, storyArc, winCondition, lossCondition, endingSeeds, endgameTriggers, factions, locations, npcSeeds, toneGuidelines, hiddenGmNotes, runtimePrompt, tags。",
        "不要生成任何 id 字段，服务端会生成 id。",
        "storyArc.acts 必须包含 act1、act2、act3、act4、ending 五个阶段，每个阶段都有 title、goal、transitionHint。",
        "playerSetupOptions 至少 2 个，endingSeeds 至少 2 个，locations 至少 1 个，npcSeeds 至少 1 个。",
        "hiddenGmNotes 可以包含 GM 私有秘密，但 pitch、openingScene、worldPremise、runtimePrompt 不能直接泄露隐藏真相。",
        "每个冒险必须能在 1-3 小时内完成，有明确主线冲突和多个结局方向。"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        outputTemplate: {
          candidates: [
            {
              title: "断塔召唤",
              pitch: "一句话介绍，玩家可见，不泄露隐藏真相。",
              playerSetupOptions: [
                {
                  title: "外来者",
                  description: "玩家可见的身份说明。",
                  startingGoal: "第一阶段的玩家起点目标。"
                },
                {
                  title: "局内人",
                  description: "另一种玩家身份说明。",
                  startingGoal: "另一条起点目标。"
                }
              ],
              openingScene: "第一幕开场，直接给玩家可玩的局面。",
              worldPremise: "公开世界观前提。",
              mainConflict: "主线矛盾。",
              storyArc: {
                acts: StoryActNameSchema.options
                  .filter((name) => name !== "epilogue")
                  .map((name) => ({
                    name,
                    title: "阶段标题",
                    goal: "只给 GM 使用的阶段目标。",
                    transitionHint: "进入下一阶段的提示。"
                  }))
              },
              winCondition: "完成这段冒险的条件，只给 GM 使用。",
              lossCondition: "失败或坏结局条件，只给 GM 使用。",
              endingSeeds: [
                {
                  title: "代价中的胜利",
                  description: "一个可能结局方向。",
                  tone: "bittersweet"
                },
                {
                  title: "失控的余波",
                  description: "另一个可能结局方向。",
                  tone: "tragic"
                }
              ],
              endgameTriggers: ["进入终局的触发条件。"],
              factions: [
                {
                  name: "关键阵营",
                  publicDescription: "玩家可见的阵营说明。",
                  hiddenAgenda: "GM 私有动机，可选。"
                }
              ],
              locations: [
                {
                  name: "关键地点",
                  description: "玩家可见的地点说明。"
                }
              ],
              npcSeeds: [
                {
                  name: "关键 NPC",
                  role: "NPC 角色定位",
                  publicDescription: "玩家可见的人物说明。",
                  privateMotivation: "GM 私有动机，可选。"
                }
              ],
              toneGuidelines: "叙事风格规则。",
              hiddenGmNotes: "只给 GM 的秘密、伏笔和真相。",
              runtimePrompt: "后续游玩回合使用的稳定 GM 提示。",
              tags: ["类型标签"]
            }
          ]
        },
        request: {
          candidateCount: request.candidateCount,
          dangerLevel: request.dangerLevel ?? "medium",
          fantasyLevel: request.fantasyLevel ?? "medium",
          playerRoleHint: request.playerRoleHint ?? null,
          tone: request.tone ?? seed.defaultTone
        },
        allowedValues: {
          dangerLevel: AdventureIntensitySchema.options,
          endingTone: EndingSeedSchema.shape.tone.options,
          fantasyLevel: AdventureIntensitySchema.options,
          storyActName: StoryActNameSchema.options.filter((name) => name !== "epilogue"),
          tone: AdventureToneSchema.options
        },
        worldSeed: seed
      })
    }
  ];
}

function buildAdventureCandidateConceptPromptMessages(
  seed: WorldSeedPreset,
  request: AdventureCandidateGenerationRequest,
  variant: {
    avoidTitles: readonly string[];
    variantFocus: AdventureCandidatePreviewVariantFocus;
    variantIndex: number;
    variantSeed: string;
  }
) {
  return [
    {
      role: "system" as const,
      content: [
        "你是本地文字冒险游戏的冒险入口设计 GM。",
        "你只生成候选卡片需要的无剧透 preview，不生成完整冒险包。",
        "输出必须是单个 JSON 对象，不要 Markdown，不要解释，不要代码块。",
        "JSON 顶层必须是 {\"candidates\": [...]}。",
        `candidates 必须正好包含 ${request.candidateCount} 个候选。`,
        "每个候选只包含 title, teaser, playerSetupOptions, tags。",
        "playerSetupOptions 必须有 2-4 个，每个身份包含 title, description, startingGoal。",
        "teaser 只能描述公开氛围和入口，不泄露具体主线真相、胜败条件、结局或隐藏 GM 笔记。",
        "creativeVariant.variantSeed 只用于增加创意随机性，不要输出 seed。",
        "必须围绕 creativeVariant.variantFocus 做出明显差异化。",
        "avoidTitles 中的标题不要重复使用。",
        "不要生成任何 id 字段，服务端会生成 id。"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        outputTemplate: {
          candidates: [
            {
              title: "断塔召唤",
              teaser: "一座破碎高塔把陌生人卷入城邦警钟，召唤事故背后的危机仍藏在阴影里。",
              playerSetupOptions: [
                {
                  title: "外来者",
                  description: "你刚抵达此地，没有固定阵营，容易被各方试探。",
                  startingGoal: "弄清自己被卷入事件的原因"
                },
                {
                  title: "局内人",
                  description: "你和当地某个势力有旧关系，也因此背负更多风险。",
                  startingGoal: "保护旧关系，同时查清眼前事故"
                }
              ],
              tags: ["召唤", "城邦", "悬疑"]
            }
          ]
        },
        avoidTitles: variant.avoidTitles,
        creativeVariant: {
          variantFocus: variant.variantFocus,
          variantIndex: variant.variantIndex,
          variantSeed: variant.variantSeed
        },
        request: {
          candidateCount: request.candidateCount,
          dangerLevel: request.dangerLevel ?? "medium",
          fantasyLevel: request.fantasyLevel ?? "medium",
          playerRoleHint: request.playerRoleHint ?? null,
          tone: request.tone ?? seed.defaultTone
        },
        allowedValues: {
          dangerLevel: AdventureIntensitySchema.options,
          fantasyLevel: AdventureIntensitySchema.options,
          tone: AdventureToneSchema.options
        },
        worldSeed: seed
      })
    }
  ];
}

function buildAdventureCandidateDetailPromptMessages(
  seed: WorldSeedPreset,
  storedCandidate: StoredAdventureCandidate
) {
  const request = storedCandidate.request;
  const concept = storedCandidate.concept;

  return [
    {
      role: "system" as const,
      content: [
        "你是本地文字冒险游戏的冒险生成 GM。",
        "你现在只为一个已被玩家选中的候选入口补全完整冒险包。",
        "输出必须是单个 JSON 对象，不要 Markdown，不要解释，不要代码块。",
        "JSON 顶层必须是 {\"adventure\": {...}}。",
        "不要输出 title, playerSetupOptions, tags 或任何 id 字段；服务端会沿用已选候选的这些字段。",
        "adventure 必须包含完整字段：pitch, openingScene, worldPremise, mainConflict, storyArc, winCondition, lossCondition, endingSeeds, endgameTriggers, factions, locations, npcSeeds, toneGuidelines, hiddenGmNotes, runtimePrompt。",
        "storyArc.acts 必须包含 act1、act2、act3、act4、ending 五个阶段，每个阶段都有 title、goal、transitionHint。",
        "endingSeeds 至少 2 个，locations 至少 1 个，npcSeeds 至少 1 个。",
        "hiddenGmNotes 可以包含 GM 私有秘密，但 pitch、openingScene、worldPremise、runtimePrompt 不能直接泄露隐藏真相。",
        "完整冒险必须严格承接 selectedConcept 的标题、teaser、玩家身份和标签。"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        outputTemplate: {
          adventure: {
            pitch: "进入冒险后可展示的短介绍，不泄露隐藏真相。",
            openingScene: "第一幕开场，直接给玩家可玩的局面。",
            worldPremise: "公开世界观前提。",
            mainConflict: "主线矛盾，只给 GM 使用。",
            storyArc: {
              acts: StoryActNameSchema.options
                .filter((name) => name !== "epilogue")
                .map((name) => ({
                  name,
                  title: "阶段标题",
                  goal: "只给 GM 使用的阶段目标。",
                  transitionHint: "进入下一阶段的提示。"
                }))
            },
            winCondition: "完成这段冒险的条件，只给 GM 使用。",
            lossCondition: "失败或坏结局条件，只给 GM 使用。",
            endingSeeds: [
              {
                title: "代价中的胜利",
                description: "一个可能结局方向。",
                tone: "bittersweet"
              },
              {
                title: "失控的余波",
                description: "另一个可能结局方向。",
                tone: "tragic"
              }
            ],
            endgameTriggers: ["进入终局的触发条件。"],
            factions: [
              {
                name: "关键阵营",
                publicDescription: "玩家可见的阵营说明。",
                hiddenAgenda: "GM 私有动机，可选。"
              }
            ],
            locations: [
              {
                name: "关键地点",
                description: "玩家可见的地点说明。"
              }
            ],
            npcSeeds: [
              {
                name: "关键 NPC",
                role: "NPC 角色定位",
                publicDescription: "玩家可见的人物说明。",
                privateMotivation: "GM 私有动机，可选。"
              }
            ],
            toneGuidelines: "叙事风格规则。",
            hiddenGmNotes: "只给 GM 的秘密、伏笔和真相。",
            runtimePrompt: "后续游玩回合使用的稳定 GM 提示。"
          }
        },
        request: {
          dangerLevel: request.dangerLevel ?? "medium",
          fantasyLevel: request.fantasyLevel ?? "medium",
          playerRoleHint: request.playerRoleHint ?? null,
          tone: request.tone ?? seed.defaultTone
        },
        allowedValues: {
          endingTone: EndingSeedSchema.shape.tone.options,
          storyActName: StoryActNameSchema.options.filter((name) => name !== "epilogue")
        },
        selectedConcept: concept,
        worldSeed: seed
      })
    }
  ];
}

function createAdventureCandidateConceptFromCandidate(
  candidate: AdventureCandidate
): AdventureCandidateConcept {
  return AdventureCandidateConceptSchema.parse({
    id: candidate.id,
    requestId: candidate.requestId,
    title: candidate.title,
    teaser: buildSpoilerFreeCandidateTeaser(candidate),
    playerSetupOptions: candidate.playerSetupOptions,
    tags: candidate.tags
  });
}

function buildAdventureCandidateConceptFromDraft(
  seed: WorldSeedPreset,
  requestId: string,
  draft: AdventureCandidateConceptDraft,
  index: number
): AdventureCandidateConcept {
  const candidateNumber = index + 1;
  const candidatePrefix = `${seed.id}-preview-${candidateNumber}`;

  return AdventureCandidateConceptSchema.parse({
    ...draft,
    id: `${candidatePrefix}-${crypto.randomUUID()}`,
    requestId,
    playerSetupOptions: draft.playerSetupOptions.map((option, optionIndex) => ({
      ...option,
      id: `${candidatePrefix}-player-${optionIndex + 1}`
    })),
    tags: Array.from(new Set([...draft.tags, seed.name]))
  });
}

function buildAdventureCandidateFromDraft(
  seed: WorldSeedPreset,
  requestId: string,
  draft: AdventureCandidateDraft,
  index: number
): AdventureCandidate {
  const candidateNumber = index + 1;
  const candidatePrefix = `${seed.id}-ai-${candidateNumber}`;

  return AdventureCandidateSchema.parse({
    ...draft,
    id: `${candidatePrefix}-${crypto.randomUUID()}`,
    requestId,
    storyArc: {
      acts: draft.storyArc.acts.map((act) => ({
        ...act,
        transitionHint:
          act.transitionHint.trim() ||
          (act.name === "ending" ? "保存结局摘要，并允许玩家查看后日谈。" : "进入下一阶段。")
      }))
    },
    playerSetupOptions: draft.playerSetupOptions.map((option, optionIndex) => ({
      ...option,
      id: `${candidatePrefix}-player-${optionIndex + 1}`
    })),
    endingSeeds: draft.endingSeeds.map((ending, endingIndex) => ({
      ...ending,
      id: `${candidatePrefix}-ending-${endingIndex + 1}`
    })),
    factions: draft.factions.map((faction, factionIndex) => ({
      ...faction,
      id: `${candidatePrefix}-faction-${factionIndex + 1}`
    })),
    locations: draft.locations.map((location, locationIndex) => ({
      ...location,
      id: `${candidatePrefix}-location-${locationIndex + 1}`
    })),
    npcSeeds: draft.npcSeeds.map((npc, npcIndex) => ({
      ...npc,
      id: `${candidatePrefix}-npc-${npcIndex + 1}`
    })),
    tags: Array.from(new Set([...draft.tags, seed.name]))
  });
}

function buildAdventureCandidateFromDetailDraft(
  seed: WorldSeedPreset,
  concept: AdventureCandidateConcept,
  draft: AdventureCandidateDetailDraft
): AdventureCandidate {
  return AdventureCandidateSchema.parse({
    ...draft,
    id: concept.id,
    requestId: concept.requestId,
    title: concept.title,
    storyArc: {
      acts: draft.storyArc.acts.map((act) => ({
        ...act,
        transitionHint:
          act.transitionHint.trim() ||
          (act.name === "ending" ? "保存结局摘要，并允许玩家查看后日谈。" : "进入下一阶段。")
      }))
    },
    playerSetupOptions: concept.playerSetupOptions,
    endingSeeds: draft.endingSeeds.map((ending, endingIndex) => ({
      ...ending,
      id: `${concept.id}-ending-${endingIndex + 1}`
    })),
    factions: draft.factions.map((faction, factionIndex) => ({
      ...faction,
      id: `${concept.id}-faction-${factionIndex + 1}`
    })),
    locations: draft.locations.map((location, locationIndex) => ({
      ...location,
      id: `${concept.id}-location-${locationIndex + 1}`
    })),
    npcSeeds: draft.npcSeeds.map((npc, npcIndex) => ({
      ...npc,
      id: `${concept.id}-npc-${npcIndex + 1}`
    })),
    tags: Array.from(new Set([...concept.tags, seed.name]))
  });
}

function buildSpoilerFreeCandidateTeaser(candidate: AdventureCandidate): string {
  const premise = getFirstSentence(candidate.worldPremise);
  const tagText = candidate.tags.slice(0, 3).join("、");
  const toneText = tagText ? `偏${tagText}气质` : "有明确气质";

  return `${premise} 一段${toneText}的冒险；真正的危机、关键人物和结局会在游玩中揭开。`;
}

function getFirstSentence(value: string): string {
  const [firstSentence] = value.trim().split(/(?<=[。！？.!?])/u);

  return firstSentence?.trim() || value.trim();
}
