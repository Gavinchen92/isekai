# 本地 Web 版 ISEKAI ZERO 实现方案

日期：2026-04-27  
目标：做一个本地自玩、Web 界面的 AI 互动故事应用。第一版不要求用户自己创建故事，用户只选择故事大背景和少量偏好，AI 负责生成可玩的冒险。

竞品调研见：[competitive-research.md](./competitive-research.md)

## 1. 产品边界

第一版只解决一个问题：用户打开应用后，可以选一个世界种子，直接生成一条能玩的故事线，然后进入长期游玩。用户不需要手写 Storyline、Character、Persona，也不需要理解 prompt 怎么写。

世界种子是故事生成的起点，不是完整故事。它只定义大背景、类型约束和气质，比如：

- 异世界：召唤、转生、冒险者公会、魔法、魔王、技能系统。
- 中古世界：王国、骑士、教会、商会、边境战争、低魔或无魔。
- 古代中国：王朝、江湖、门派、朝堂、边塞、志怪。
- 日本战国：大名、武士、忍者、城池、合战、妖怪传说。

AI 根据世界种子生成完整冒险包，包括标题、开局、主线矛盾、重要 NPC、地点、阵营、玩家身份建议、初始目标、隐藏 GM 笔记和运行时 prompt。用户只负责选择、开始和继续玩。

每个冒险都必须有结局。第一版不做无限聊天，而是生成一段可以在 1-3 小时内完成的故事弧。结局由玩家选择、任务状态、NPC 关系和失败代价共同决定，不是单一路线读稿。

明确不做：

- 登录账号。
- 公开社区。
- 支付、货币、广告奖励。
- 审核后台。
- 创作者收益。
- 自动翻译。
- 多人同步。
- 手工 Storyline / Character / Persona 编辑器。
- 自动图片生成和自动语音生成。

本地版要把 ISEKAI ZERO 的平台复杂度砍掉，第一版也不做创作者工具。后续可以加高级编辑器，但不能挡在玩家开始游戏之前。

## 2. MVP 范围

MVP 的标准是能从一个世界种子生成冒险，并稳定玩下去：

- Web UI：首页、开始新冒险、继续冒险、故事运行页、设置页。
- 世界种子选择：内置异世界、中古世界、古代中国、日本战国。
- 生成偏好：故事风格、危险程度、奇幻浓度、玩家身份倾向，可全部用默认值。
- AI 冒险生成：一次生成 1-3 个候选冒险，用户选择一个开始。
- 冒险包保存：生成结果落库，后续运行时不重复随机改世界观。
- 本地存储：当前先用内存 repository 跑通闭环；目标是 SQLite + Node 后端，方便后续做导入导出和桌面封装。
- 模型接入：OpenAI-compatible endpoint，支持 `baseURL`、`apiKey`、`model`。
- Chat runtime：当前优先保证消息列表、自由输入框、AI 推荐后续动作、继续和局外提醒。regenerate、rewind、branch、save message 是后续运行时能力，不作为当前已实现能力。
- Prompt preview：仅作为开发调试能力，不出现在默认玩家界面。
- 内部日志和 GM 状态：系统内部维护已发生事件、任务推进、NPC、地点和阵营。玩家界面不直接暴露 `Log`、`Codex`、`Quest` 这类术语，也不直接展示章节、当前目标、胜利条件、失败条件这类 GM 控场信息；只显示故事内已经可知的旅途见闻。
- 旅途见闻：玩家可见的长期记忆层，记录身份、人物、地点、关系、线索和物件。NPC、地点、身份这类确定信息可以直接结构化保存；线索和关系由系统在回合后保守抽取，只记录已经在故事中明确出现的内容。
- 导入导出：JSON 文件。

MVP 不做 Dungeon Mind 和 Visual Novel。它们很重要，但应该建立在稳定的世界生成和聊天运行时之后。

## 3. 第一版用户流程

```txt
Home
  ├─ Continue Last Adventure
  └─ New Adventure

New Adventure
  ├─ Choose World Seed
  │   ├─ Isekai
  │   ├─ Medieval
  │   ├─ Ancient China
  │   └─ Sengoku Japan
  ├─ Auto-generate Candidates
  ├─ Pick
  └─ Start

Play
  ├─ Story Pane：阅读当前冒险和已发生剧情
  ├─ Next Action：AI 推荐行动、自由输入、继续、局外提醒
  ├─ Right Sidebar：旅途见闻、已知人物、已知地点
  └─ Settings
```

MVP 只暴露玩家需要的入口：开始新冒险、选背景、选冒险候选、开始、继续。选择世界种子后自动生成冒险候选，不再要求玩家额外点击一次生成按钮。生成偏好第一版先走默认值，后续如果加入，也不能挡在玩家开始游戏之前。Storyline、Character、Persona 仍然会作为内部数据存在，但不作为第一版的主要 UI。胜利条件、失败条件这类 GM 结构不直接展示给玩家，避免把故事目标变成任务说明书。

游玩页不是功能面板集合。第一版界面按“读故事 -> 决定下一步 -> 查看少量旅途见闻”组织：推荐行动属于下一步行动区；右侧只保留旅途见闻摘要，点击后进入详情层按身份、人物、地点、关系、线索、物件查看。章节、当前目标、胜败条件继续存在于故事线和 GM 状态层，但不作为玩家可见 UI。

## 4. 世界种子生成

生成分两步，避免每次聊天都重新发明世界观。

### 4.1 生成冒险包

用户选世界种子后，AI 一次性生成结构化冒险包：

- `title`：故事标题。
- `pitch`：进入冒险后可展示的短介绍，不用于候选卡片泄露具体主线。
- `worldPremise`：世界观设定。
- `playerSetupOptions`：2-4 个玩家身份建议。
- `openingScene`：第一幕开场。
- `mainConflict`：当前主线矛盾。
- `storyArc`：Act 1 到 Ending 的阶段结构。
- `winCondition`：什么算完成这段冒险。
- `lossCondition`：什么算失败或坏结局。
- `endingSeeds`：多个可能结局方向。
- `endgameTriggers`：进入终章的触发条件。
- `factions`：关键阵营。
- `locations`：关键地点。
- `npcSeeds`：关键 NPC 草案。
- `toneGuidelines`：叙事风格。
- `hiddenGmNotes`：只给 AI 看的秘密、伏笔和真相。
- `runtimePrompt`：后续游玩使用的稳定 prompt。

生成结果先作为完整候选保存在服务端。候选阶段只能把无剧透预览返回给前端；玩家开始后，运行时才把对应候选固化为 Adventure，不再让模型随意改背景。

### 4.2 生成候选

第一版建议一次生成 3 个候选，卡片展示：

- 标题。
- 无剧透氛围简介。
- 玩家身份标题。
- 风格标签。

候选卡片不展示开局场景、具体主线矛盾、章节结构、胜败条件、结局方向、隐藏 GM 笔记或关键 NPC 真相。前端只持有 `AdventureCandidatePreview`，开始冒险时提交 `candidateId`；完整 `AdventureCandidate` 留在服务端。后续可以加“重新生成候选”，但它只重生成候选，不影响已经开始的冒险。

## 5. 上下文组装

不要把所有内容拼成一个巨大的 system prompt。建议按固定顺序组装：

1. 系统规则：语言、输出风格、边界、禁止事项。
2. Adventure runtime prompt：生成阶段固化下来的世界观和叙事要求。
3. Hidden GM notes：伏笔、秘密和未公开真相，只给模型看。
4. Player setup：玩家最终选择或系统默认的身份。
5. Known NPCs：当前冒险里的关键 NPC。
6. 内部事件记录：系统确认已经发生的剧情事实。
7. 内部任务状态：当前任务、目标和进度，只给 GM 使用。
8. 内部百科：NPC、地点、阵营、物品等游戏内百科。
9. Session summary：系统自动或半自动生成的阶段摘要。
10. Recent messages：最近 N 轮消息。
11. Current input：当前用户输入。

MVP 不提供玩家手工 pin memory。记忆能力要包装成游戏内日志和 GM 状态管理，玩家看到的是“旅途见闻”，不是 prompt 维护工具，也不是内部任务面板。

## 6. 数据模型草案

```ts
type WorldSeedPreset = {
  id: string;
  name: string;
  description: string;
  genreTags: string[];
  defaultTone: string;
  generationPrompt: string;
};

type AdventureGenerationRequest = {
  id: string;
  worldSeedId: string;
  tone?: "serious" | "light" | "dark" | "heroic" | "mystery";
  dangerLevel?: "low" | "medium" | "high";
  fantasyLevel?: "low" | "medium" | "high";
  playerRoleHint?: string;
  candidateCount: number;
  createdAt: string;
};

type AdventureCandidate = {
  id: string;
  requestId: string;
  title: string;
  pitch: string;
  playerSetupOptions: PlayerSetupOption[];
  openingScene: string;
  worldPremise: string;
  mainConflict: string;
  storyArc: StoryArc;
  winCondition: string;
  lossCondition: string;
  endingSeeds: EndingSeed[];
  endgameTriggers: string[];
  factions: FactionSeed[];
  locations: LocationSeed[];
  npcSeeds: NpcSeed[];
  toneGuidelines: string;
  hiddenGmNotes: string;
  runtimePrompt: string;
  tags: string[];
};

type AdventureCandidatePreview = {
  id: string;
  requestId: string;
  title: string;
  teaser: string;
  playerSetupOptions: Pick<PlayerSetupOption, "id" | "title" | "description">[];
  tags: string[];
};

type Adventure = {
  id: string;
  sourceCandidateId: string;
  worldSeedId: string;
  title: string;
  pitch: string;
  worldPremise: string;
  mainConflict: string;
  storyArc: StoryArc;
  currentAct: StoryActName;
  winCondition: string;
  lossCondition: string;
  endingSeeds: EndingSeed[];
  endgameTriggers: string[];
  selectedPlayerSetupId?: string;
  runtimePrompt: string;
  hiddenGmNotes: string;
  endingSummary?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type StoryActName = "act1" | "act2" | "act3" | "act4" | "ending" | "epilogue";

type StoryArc = {
  acts: StoryAct[];
};

type StoryAct = {
  name: StoryActName;
  title: string;
  goal: string;
  transitionHint: string;
};

type EndingSeed = {
  id: string;
  title: string;
  description: string;
  tone: "triumphant" | "bittersweet" | "tragic" | "ambiguous";
};

type PlayerSetupOption = {
  id: string;
  title: string;
  description: string;
  startingGoal: string;
};

type NpcSeed = {
  id: string;
  name: string;
  role: string;
  publicDescription: string;
  privateMotivation?: string;
};

type FactionSeed = {
  id: string;
  name: string;
  publicDescription: string;
  hiddenAgenda?: string;
};

type LocationSeed = {
  id: string;
  name: string;
  description: string;
};

type Session = {
  id: string;
  adventureId: string;
  mode: "chat" | "visual-novel";
  dmEnabled: boolean;
  branchParentId?: string;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  inputKind?: "free" | "suggested-move" | "continue" | "ooc";
  inferredIntent?: PlayerInputIntent;
  content: string;
  parentMessageId?: string;
  createdAt: string;
};

type PlayerInputIntent =
  | "character_action"
  | "character_speech"
  | "player_strategy"
  | "ooc_instruction"
  | "world_override_attempt";

type SuggestedMove = {
  id: string;
  sessionId: string;
  sourceMessageId: string;
  label: string;
  intent: string;
  riskLevel?: "low" | "medium" | "high";
  tags: string[];
  createdAt: string;
};

type GmTurnResult = {
  narration: string;
  suggestedMoves: Array<{
    label: string;
    intent: string;
    riskLevel?: "low" | "medium" | "high";
    tags: string[];
  }>;
  journeyMemoryCandidates: Array<{
    key: string;
    type: "identity" | "npc" | "location" | "relationship" | "clue" | "item";
    title: string;
    summary: string;
    details: string[];
    visibility: "known" | "uncertain";
    confidence: "low" | "medium" | "high";
    relatedNpcIds: string[];
    relatedLocationIds: string[];
  }>;
  internalStatePatch: {
    currentAct?: StoryActName;
    flags: string[];
    privateNotes: string[];
  };
};
```

`GmTurnResult` 是 provider 输出契约，不是玩家 API。`POST /api/turns` 只返回玩家消息和推荐行动；旅途见闻通过单独接口读取；`internalStatePatch` 只留在服务端 GM 层。

第一版 provider 策略：

- `GM_PROVIDER=mock` 只用于开发、测试和无 key 演示，保证无外部依赖也能跑本地闭环。
- `GM_PROVIDER=openai-compatible` 时使用 OpenAI-compatible `/chat/completions`，发送 `GM Context Builder` 生成的 system/user messages。`openai` 作为兼容别名保留。
- OpenAI-compatible provider 必须通过 `GmTurnResult` schema 校验后才能写入回合结果。
- 模型名和 base URL 只来自环境变量，不在代码里绑定具体供应商或具体模型。
- 真实游玩使用 `openai-compatible`。真实模型失败不静默降级到 mock，应该让玩家看到失败并允许重试。

用户输入意图识别是独立 provider，不放在回合服务里：

- mock 模式可以用规则做可重复测试。
- openai-compatible 模式交给模型判断行动、台词、策略、局外提醒和越权尝试。
- `/ooc` 这类明确入口可以先用确定性规则识别。
- 分类结果只是意图；玩家输入本身仍然不是 canon。

```ts
type AdventureLogEntry = {
  id: string;
  sessionId: string;
  type: "event" | "decision" | "discovery" | "relationship";
  title: string;
  content: string;
  sourceMessageId?: string;
  confirmed: boolean;
  createdAt: string;
  updatedAt: string;
};

type QuestLogEntry = {
  id: string;
  sessionId: string;
  title: string;
  status: "active" | "completed" | "failed" | "unknown";
  description: string;
  objective?: string;
  relatedNpcIds: string[];
  relatedLocationIds: string[];
  updatedAt: string;
};

type CodexEntry = {
  id: string;
  sessionId: string;
  type: "npc" | "location" | "faction" | "item" | "concept";
  name: string;
  publicDescription: string;
  knownFacts: string[];
  sourceMessageIds: string[];
  updatedAt: string;
};
```

玩家界面读取 `JourneyMemoryEntry`，它是从内部日志和冒险包中投影出来的玩家可见记忆，不等同于 GM 的完整 Codex：

```ts
type JourneyMemoryEntry = {
  id: string;
  sessionId: string;
  type: "identity" | "npc" | "location" | "relationship" | "clue" | "item";
  title: string;
  summary: string;
  details: string[];
  visibility: "known" | "uncertain";
  relatedNpcIds: string[];
  relatedLocationIds: string[];
  sourceMessageIds: string[];
  updatedAt: string;
};
```

V1 再加 `LoreEntry`：

```ts
type LoreEntry = {
  id: string;
  scope: "global" | "world-seed" | "adventure" | "session";
  scopeId?: string;
  title: string;
  keywords: string[];
  content: string;
  priority: number;
  enabled: boolean;
};
```

## 7. 运行时交互

当前优先做这些动作：

- Free input：用户自由输入角色行动、台词或意图，不需要选择 `Do / Say / Story`。
- Suggested moves：AI 根据当前场景生成 3-5 个合理后续动作，用户可以直接选择。
- Continue：用户不输入，让 AI 沿当前场景继续推进一小段。
- OOC correction：用局外指令指出 AI 理解错误或设定冲突，让 AI 在规则内修正。
- 查看旅途见闻：查看玩家已经知道的身份、人物、地点、关系、线索和物件。

后续再补这些运行时能力：

- Regenerate moves：换一批后续动作建议。
- Regenerate：重生成最后一条 AI 消息。
- Rewind：回到某条消息继续，后续内容形成新分支。
- Save message：保存重要消息，只作为玩家书签，不直接进入 AI 上下文。
- Export session：导出当前会话 JSON。
- Export adventure：导出生成的冒险包 JSON。

第一版不提供任意编辑用户消息或 AI 消息。玩家当前可以用 OOC 指出问题；后续可以补重试、回退和分支，但不能直接改写已经发生的剧情。
第一版也不提供玩家手工 pin memory。系统会自动维护游戏日志，玩家需要纠错时走 OOC correction。

输入设计只保留一个主输入框，不做 `Do / Say / Story` tab。玩家可以自然输入：

- “我推开门，观察酒馆里的人。”
- “老板，我在找一个披红斗篷的女人。”
- “我想先避开正面冲突，看看有没有后门。”

系统内部可以识别这是行动、台词还是策略意图，但不要让玩家手工打标签。OOC 是单独按钮或命令，只用于局外沟通。

Suggested moves 只能表达玩家尝试做什么，不能直接写结果。比如“试图说服守卫放我进城”是合理选项，“成功说服守卫放我进城”不是合理选项。结果仍由 AI/GM 决定。

## 8. 防越权与沉浸边界

自由输入不等于玩家可以直接改世界。第一版要守住这条边界：玩家能声明意图，不能声明结果。

允许的输入：

- “我试图潜入城主府。”
- “我拔剑冲向黑骑士。”
- “我告诉老板我认识王室的人。”

不直接执行的输入：

- “我成功潜入城主府。”
- “我一刀杀死黑骑士。”
- “老板相信了我，并把钥匙给我。”
- “我突然获得无限金币。”
- “其实刚才那个人没死。”

系统处理方式不是报错，而是把越权声明降级成尝试，再由 AI/GM 给出合理后果。比如玩家输入“我一刀杀死魔王”，系统可以按“我全力攻击魔王”处理，最后由 AI/GM 决定是否命中、是否造成伤害、世界如何回应。

Canon 事实只从三类来源写入：

- AI/GM 的叙事结果。
- Dungeon Mind 或规则系统的结构化结果。
- 系统确认后的内部事件记录、任务状态和百科。

玩家输入不是 canon。玩家可以撒谎、夸张、试探和冒险，但不能直接授予自己资源、改写已确认事实、跳过挑战结果或改变世界规则。

## 9. 结局和续章

每个 Adventure 都要有主线目标和终局条件。第一版不做真正无限长篇，先做能完成的一段冒险。

建议结构：

```txt
Adventure
  ├─ Act 1：开局和钩子
  ├─ Act 2：探索和选择
  ├─ Act 3：冲突升级
  ├─ Act 4：终局抉择
  └─ Ending：结局
```

进入结局不按固定轮数，而按剧情状态触发：

- 玩家解决主线矛盾。
- 玩家彻底失败或死亡。
- 关键 NPC 或阵营关系改变到不可逆。
- 玩家放弃原本方向，故事转成流亡、隐退或后日谈。
- 玩家主动选择结束当前冒险。

结局生成后要保存 `endingSummary`，并允许玩家选择：

- 查看后日谈。
- 基于当前结局生成续章。
- 回到旧节点开新分支。
- 开始新的世界种子冒险。

续章可以继承存活 NPC、阵营关系、玩家状态和关键后果，但要生成新的 `mainConflict`、`storyArc` 和 `endingSeeds`。

## 10. 内置世界种子

第一版先做四个稳定 preset，每个 preset 都有自己的生成约束。

### 10.1 异世界

- 常见元素：召唤、转生、冒险者公会、魔法、职业、技能、迷宫、魔王。
- 生成重点：玩家身份要有明确成长线，开局目标要具体。
- 避免：一上来塞太多系统面板，故事被数值淹没。

### 10.2 中古世界

- 常见元素：王国、骑士、教会、商会、边境战争、贵族阴谋。
- 生成重点：政治关系、社会阶层、旅途和资源压力。
- 避免：默认写成高魔异世界。魔法浓度应该受 `fantasyLevel` 控制。

### 10.3 古代中国

- 常见元素：王朝、江湖、门派、朝堂、边塞、志怪、商旅。
- 生成重点：身份、礼法、势力、人情和地方秩序。
- 避免：直接套现代网文模板，或把不同朝代元素无意义堆在一起。第一版可以架空，不做严肃史实模拟。

### 10.4 日本战国

- 常见元素：大名、武士、忍者、城池、合战、茶人、商人、妖怪传说。
- 生成重点：阵营选择、战争压力、忠诚和背叛。
- 避免：把真实历史人物写成不可控主角。第一版建议用架空藩国和虚构人物。

## 11. V1：游戏日志、Lorebook 和高级生成

V1 重点解决长线一致性和可重玩性：

- 每 6-10 轮生成 chapter summary，作为内部摘要进入上下文。
- 自动更新内部事件记录、任务状态和百科，并投影成玩家可见的旅途见闻。
- 日志更新需要能追溯到来源消息，避免 AI 凭空写入世界事实。
- 支持手动创建 Story Cards / Lorebook。
- Lorebook 先用关键词触发，不急着上 embedding。
- Prompt Preview 展示本轮进入上下文的日志、摘要和 lore entries。
- 增加 token 预算提示，避免上下文越堆越大。
- Session 支持复制、存档、导出 Markdown。
- 分支管理放到存档页面，先做归档或隐藏，不在游玩主流程里提供删除分支。
- 世界种子支持自定义，但仍然通过“种子模板”生成冒险，不开放完整手工 Storyline 编辑器。
- 支持生成前选择主角身份，比如穿越者、失忆旅人、落魄贵族、门派弟子、浪人。

关键词触发比 embedding 更粗糙，但更可控，适合本地自玩第一阶段。

## 12. V2：Dungeon Mind

Dungeon Mind 不应该一开始就让 LLM 全权执行规则。建议拆成三段：

1. 叙事模型判断是否需要规则结算，并输出结构化意图。
2. 程序执行骰子、DC、属性、背包、技能和状态变更。
3. 叙事模型根据机械结果写故事文本。

第一套规则可以很小：

- 属性：Alive、HP、MP、STR、DEX、CON、INT、WIS、CHA、Level、XP、Gold、Condition。
- 检定：`d20 + stat bonus vs DC`。
- 战斗：attack roll vs defense，伤害写入目标 HP。
- 状态：Condition 支持回合数，比如 `Poisoned (3t)`。
- 背包：物品名、数量、描述、是否装备。
- 技能：名称、描述、消耗。

实现原则：

- 骰子必须由程序生成，不由 LLM 生成。
- 任何状态变更必须走结构化 action。
- 叙事文本不能作为状态真相源。
- UI 里把机械结果和故事文本分开。

## 13. V2：Visual Novel

VN 模式先做手动素材，不做自动生成：

- 用户上传背景和角色立绘。
- 每个素材配置 caption、角色名、情绪、场景关键词。
- 运行时根据当前消息、场景摘要和关键词匹配素材。
- 同一 session 可以在聊天模式和 VN 模式之间切换。
- 角色 emotion 枚举先固定为 `neutral`、`happy`、`sad`、`angry`、`hurt`、`surprised`。

自动图片生成、角色姿势变化和 TTS 后续做成 adapter，不放进核心链路。

## 14. V3：创作和扩展能力

- 手工 Storyline / Character / Persona 编辑器。
- 多角色群聊。
- 本地 RAG/embedding 检索。
- Ollama、llama.cpp server、LM Studio。
- image/TTS adapter。
- SillyTavern/Chub character card 导入。
- 桌面封装。

手工编辑器放到 V3，是因为第一版的目标是玩起来，不是先做一套创作后台。

## 15. 技术路线建议

前端：

- React + TypeScript。
- 路由和状态管理先用轻量方案，避免过早引入复杂框架。
- UI 以“开始冒险”和“故事运行台”为主，不做营销式 landing page。

后端：

- Node.js 本地服务。
- 当前阶段先用内存 repository。SQLite 接入后，用来存储世界种子、冒险包、会话、冒险日志、任务状态和百科。
- OpenAI-compatible provider 抽象，后续接 Ollama/LM Studio。

存储：

- 数据库存结构化内容。
- 素材文件放本地 `data/assets/`。
- 导入导出走 JSON。

## 16. 关键风险

- AI 生成的世界不稳定：生成结果必须固化成 Adventure，后续游玩引用同一份设定。
- 生成候选太空泛：完整候选必须包含明确玩家身份、开局场景和第一目标，但候选卡片只展示无剧透预览。
- 故事变成无限聊天：每个 Adventure 必须有主线目标、终局条件和结局摘要。
- 玩家越权改写剧情：自由输入要先做意图识别，越权声明降级成尝试，结果由 AI/GM 或规则系统确认。
- 过早平台化：登录、社区、审核、收益都不是本地自玩需求，会拖慢核心体验。
- LLM 状态幻觉：必须区分叙事文本和真实状态，规则状态由程序维护。
- 记忆显式化会破坏沉浸：第一版不做 pin memory，把连续性维护包装成玩家可见的旅途见闻和 GM 内部状态。
- 游戏日志污染：自动日志必须有来源消息和确认状态，不能让 AI 随便把推测写成事实。
- Prompt 越写越大：从一开始就要做 prompt preview 和 context budget。
- 视觉生成成本高：先手动素材，后接插件。
- 安全边界：即使本地使用，也应支持 SFW 开关、未成年角色保护和内容边界提示。

## 17. 下一步

1. 补 SQLite repository，把当前内存数据迁到持久化层。
2. 完善冒险候选的真实 AI 生成质量和错误恢复。
3. 补齐最小 Chat runtime 的真实回合推进体验。
4. 继续打磨旅途见闻，保证它只展示玩家已知信息。
5. 再做内部日志、prompt preview、导出和分支管理。
6. 最后进入 Lorebook、Dungeon Mind、VN 模式和高级编辑器。
