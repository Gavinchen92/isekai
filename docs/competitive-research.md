# ISEKAI ZERO 及相邻产品竞品调研

调研日期：2026-04-27  
用途：整理 ISEKAI ZERO 和同类 AI 互动故事产品的产品结构、核心玩法、能力边界和可借鉴点。  
后续本地版本方案见：[local-web-version-plan.md](./local-web-version-plan.md)

## 1. 核心观察

ISEKAI ZERO 的主体验不是普通 AI 聊天，而是把角色聊天、互动故事、创作者工具和轻量游戏规则拼成一个平台。用户侧看到的是可搜索、可游玩的 Storyline；创作者侧编辑的是角色、剧情、开局、素材、标签、AI prompt 和用户可见介绍；运行时再用记忆、规则代理和视觉模式维持长线体验。

它真正值得借鉴的地方有四个：

- 内容对象清晰：Storyline、Character、Player Persona、Opening Scenario、Tags、Assets、Prompt blocks 分得很细。
- 运行时可持续：自由文本推进故事，系统维护上下文、记忆、角色关系和当前场景。
- 规则层独立：Dungeon Mind 把骰子、属性、背包、技能、状态变更从叙事模型里拆出来。
- 视觉层可渐进：Visual Novel 模式把同一段故事投到背景、立绘、语音和 story-like 版式上。

平台化能力也很重，包括 Mana/Arcane 双货币、创作者收益、公开审核、自动翻译、Referral、SFW/NSFW 标签。它们对公开社区很重要，但不属于核心游玩闭环。

## 2. ISEKAI ZERO 拆解

### 2.1 产品定位

官方把 ISEKAI ZERO 定位成 interactive AI storytelling app，强调 AI 角色持久记忆、分支故事线、世界构建工具、创作者收益分成，并支持 iOS、Android 和 Web。App Store 分类是 Entertainment，副标题是 AI Simulation & Roleplay，年龄分级 18+。

从功能看，它更接近下面几类产品的组合：

- AI 角色扮演社区。
- 可发布的互动故事线市场。
- 带轻量规则代理的 AI TRPG/VN 平台。
- 带透明计费和创作者激励的 UGC 平台。

### 2.2 内容创建模型

Storyline 创建流程暴露了它的主要数据结构：

- Cover image：公开故事线强制，私有故事线可选。
- Foreground image：角色、NPC、怪物、关键物品，推荐透明 PNG。
- Background image：场景环境。
- Image caption：用场景或情绪描述匹配合适图片，比如“在王座厅”“战斗中”“日出时”。
- Language、Title、Characters。
- Plot summary：给用户看的短摘要。
- Full Plot / Prompt Plot：AI 读取的完整剧情和行为指令。
- Plot User：用户实际看到的介绍，可与 AI prompt 分离。
- Advanced Mode / Secret Mode：支持用户展示文案和 AI 内部提示不同。
- Prompt Guidelines、AI Reminder：Reminder 会在每次用户消息后追加，用来稳定关键规则。
- First Messages / Scenarios：一个故事线可以提供多个开局。
- Tags、Player Personas、Visibility：Private / Unlisted / Public。

这个模型的重点是把创作者想给玩家看的内容和想给 AI 看的内容拆开。长故事产品如果不做这个拆分，后期很容易在“可读介绍”和“模型控制指令”之间互相污染。

### 2.3 运行时体验

玩家通常先选择一个 Storyline，再以自由文本进入故事。系统需要持续维护：

- 当前剧情状态。
- 角色关系与对话历史。
- 玩家身份。
- 关键世界观事实。
- 视觉素材选择。
- 可选规则系统。

App Store 评论里比较集中的诉求是记忆、可编辑性和计费透明。用户认可它的故事质量和记忆能力，但也提到希望能私下编辑预设场景或角色描述，希望清楚知道每次 Mana/Arcane 消耗由输入、输出、上下文长度如何影响。也有用户认为付费、每日限额和广告奖励会破坏沉浸。

### 2.4 Dungeon Mind

Dungeon Mind 是 ISEKAI ZERO 和普通 AI 角色聊天最大的差异点。它把叙事 AI 和规则 AI 分开：

- Story AI 读场景，判断是否需要规则结算，最后写叙事。
- Dungeon Mind 处理行动合法性、骰子、属性、背包、技能和规则执行。
- DM 每次只读取核心规则、故事和角色上下文、最近 10 条消息、当前角色数据和规则提醒，不读完整聊天历史。
- 工具包括 `roll_d20`、`create_stats`、`set_stats`、`set_inventory`、`set_skills`、`submit_results`、`ask_player`、`reject_action`、`auto_create_character`。
- UI 把叙事文本、骰子结果条和角色 sheet 分开展示。

这个设计解决的是 AI 叙事产品的老问题：模型很会写故事，但不适合当唯一状态源。骰子和状态变更一旦完全交给模型，长线游玩很快会出现 HP、背包、技能和死亡状态前后不一致。

### 2.5 Visual Novel 模式

Visual Novel 模式把纯文本故事转成多媒体体验：

- 角色专属 voice narration。
- 动态背景图。
- 角色图片表达表情、姿势、外观变化。
- 类 Instagram Stories / VN 的竖向展示。
- 背景自动生成、背景编辑、角色自动生成、角色编辑、自动播放语音都可能额外消耗货币。

它的产品价值是提升分享和沉浸，工程代价是资产管理、caption 匹配、图片生成、语音生成、成本控制和等待时间。这个能力适合放在核心聊天体验之后，而不是作为第一版的入口。

### 2.6 平台与商业层

ISEKAI ZERO 有完整的平台化设计：

- Mana：免费获得，用于标准模型和基础功能，来源包括签到、广告、活动。
- Arcane：付费货币，用于高级模型和高级功能。
- 透明计费：官方说明 100 Arcane = 1 USD 基准价，支付渠道会叠加手续费。
- 创作者收益：付费 Arcane 消耗中的平台 markup 部分按比例分给创作者，Mana 不产生收益。
- Referral、公开审核、多语言自动翻译、SFW/NSFW 标签体系。

这套机制适合商业平台，不适合直接搬进本地自玩产品。它能提供的设计输入主要是成本可见性、内容安全开关和创作者内容质量标准。

## 3. 竞品对比

| 产品 | 核心定位 | 强项 | 弱项/风险 | 可借鉴点 |
| --- | --- | --- | --- | --- |
| ISEKAI ZERO | AI 互动故事 + 角色扮演 + 创作者平台 | Storyline/Character/Persona 结构清晰；DM 规则代理；VN 模式；透明计费 | 平台货币、广告、审核、收益分成很重 | 内容模型、运行时、规则代理、VN 表达 |
| AI Dungeon | AI-native RPG / text adventure | 开放文本冒险历史久；场景创建；多人；Story Cards；Memory System；可回退决策 | 长故事一致性仍依赖记忆质量；用户希望更可控 | 自由输入、Story Cards、自动摘要记忆 |
| Character.AI | AI 角色聊天社区 | 角色发现、角色创建、Pinned Memories、声音/通话、群聊 | 更偏角色陪伴，故事规则弱；开放聊天有安全压力 | 角色卡、Pinned Memories、群聊、Voice |
| NovelAI | AI 写作/VN/图像生成 | 创作编辑器成熟；Text Adventure 通过 `>` 行为输入；可直接编辑故事文本 | 更偏写作工具，不是强游戏系统 | 文本冒险输入格式、故事正文可编辑 |
| DreamGen | AI role-play and story generator | 支持预设 scenario 或 blank slate；故事编辑器拆 Plot/Characters/Model Settings；Instruction 引导下一段 | 规则系统和视觉层不突出 | Story editor + runtime sidebar |
| SillyTavern | 本地/自部署 LLM 角色聊天前端 | 本地优先；Character Cards；World Info/Lorebook；群聊；Persona；RAG；TTS/图像扩展 | 学习曲线高，偏 power user，不像完整游戏 | 本地 Web 技术路线、prompt/context 管理、插件生态 |
| Chub AI | AI character hub + Lorebook | 角色卡生态、Lorebook/Keyword 触发、跨 UI 使用 | 偏角色库，产品质量依赖社区内容；NSFW 风险高 | Lorebook 数据结构、关键词触发策略 |
| Kindroid | AI companion | 多层记忆、个性化角色、群聊、语音/图片 | 更偏长期陪伴，不是剧情冒险 | 长期记忆、群聊上下文隔离 |

## 4. 共性能力地图

### 4.1 内容对象

成熟产品都会把角色和故事世界拆成可编辑资产：

- 角色卡：名字、头像、描述、人格、问候语、示例对话、可选高级 prompt。
- 故事线：标题、摘要、用户可见介绍、AI 内部剧情、开局消息、标签。
- 玩家人格：玩家在故事中的身份、称呼、背景、偏好。
- 世界信息：按关键词触发的 Lorebook/Story Card。
- 记忆：固定记忆、自动摘要、最近消息。

### 4.2 运行时控制

高自由度 AI 故事产品一般都会提供下面这些控制能力：

- 重试/regenerate。
- 回退/rewind。
- 分支保存。
- OOC / correction。
- AI suggested moves。
- 模型选择。
- 温度、上下文长度、风格参数。
- 成本或 token 可视化。
- 私有 prompt 与用户可见文本分离。

这些能力决定用户能不能在模型跑偏时把故事拉回来。对本地游戏版来说，回退、分支和 OOC correction 比任意编辑更合适，既能纠错，也不会让玩家直接篡改剧情结果。

### 4.3 记忆

竞品里的记忆大致分三类：

- 手动固定：Character.AI Pinned Memories、AI Dungeon Story Cards、SillyTavern World Info。
- 自动摘要：AI Dungeon Memory System、SillyTavern Auto-Summary。
- 上下文窗口：最近聊天历史、模型 context length。

AI 故事产品不能只依赖完整聊天历史。越到后期，越需要把事实、关系、任务、地点和状态从历史文本里抽出来，变成可检索、可编辑、可预算的结构。

本地游戏版不把手动 pin memory 当成第一版玩家操作。记忆仍然需要存在，但应该表现为 Adventure Log、Quest Log、Codex 这类游戏内状态，让玩家感觉自己在看冒险记录，而不是在维护 AI 上下文。

### 4.4 规则

AI Dungeon 和 ISEKAI ZERO 都说明了一件事：开放文本冒险如果只靠模型续写，就会有强沉浸但弱约束的问题。Dungeon Mind 的方向更适合游戏化故事，因为它把规则结算从自然语言输出里拆出来。

可靠的规则层至少要保证：

- 骰子或随机结果由程序生成。
- 属性、背包、技能、状态由结构化数据保存。
- 叙事文本不能直接作为状态真相源。
- UI 能同时展示故事结果和机械结果。

### 4.5 视觉和语音

视觉层主要有两类路线：

- NovelAI、ISEKAI ZERO：图像生成和 VN 表达更强，适合沉浸和分享。
- SillyTavern、Kindroid、Character.AI：角色头像、语音、TTS、表情和背景更像聊天增强。

对互动故事来说，视觉层最好建立在稳定的文本运行时之上。否则图片、语音和动画会放大等待时间和成本问题，却不能解决故事本身是否可玩。

## 5. 可借鉴方向

后续本地版本可以吸收下面几类设计：

- 用 ISEKAI ZERO 的 Storyline/Character/Persona 拆法建立内容模型。
- 第一版不直接暴露创作者工具，把这些内容对象作为 AI 生成的 Adventure 结果保存下来。
- 用 ISEKAI ZERO 的 Choose Your Destiny 思路，让 AI 自动生成后续动作供玩家选择。
- 用 AI Dungeon 的自由输入、Story Cards、自动摘要和回退体验增强可玩性。
- 用 SillyTavern/Chub 的 Character Card、Lorebook 和本地优先思路管理 prompt/context。
- 用 Dungeon Mind 的思路拆出规则层，但骰子和状态变更应由程序执行。
- 用 Visual Novel 模式做后续表达层，第一版先以手动素材和 caption 匹配为主。

具体本地产品范围、架构和路线图放在 [local-web-version-plan.md](./local-web-version-plan.md)。

## 6. 参考资料

- ISEKAI ZERO 官网：https://www.isekaizero.ai/
- ISEKAI ZERO App Store：https://apps.apple.com/us/app/isekai-zero/id6748359707
- ISEKAI ZERO About 文档：https://docs.isekaizero.ai/books/about-isekai-zero/page/welcome-to-isekai-zero
- ISEKAI ZERO Storyline Creation Guide：https://docs.isekai.world/books/your-guide-to-isekai-zero/page/storyline-creation-guide
- ISEKAI ZERO Dungeon Mind：https://docs.isekai.world/books/creators-guides/page/dungeon-mind-dm
- ISEKAI ZERO Visual Novel Mode：https://docs.isekai.world/books/isekai-zero/page/2f557
- ISEKAI ZERO Mana / Arcane：https://docs.isekai.world/books/your-guide-to-isekai-zero/page/mana-credits-and-arcane-credits
- ISEKAI ZERO Transparent Pricing：https://docs.isekaizero.ai/books/transparency/page/transparent-pricing
- ISEKAI ZERO SFW Tag：https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/safe-for-work-sfw-only-tag
- AI Dungeon App Store：https://apps.apple.com/us/app/ai-dungeon-rpg-story-maker/id1491268416
- AI Dungeon Memory System：https://help.aidungeon.com/faq/the-memory-system
- AI Dungeon Story Cards：https://help.aidungeon.com/faq/story-cards
- Character.AI What is Character.AI：https://support.character.ai/hc/en-us/articles/14997389547931-What-is-Character-AI
- Character.AI Quick Creation：https://book.character.ai/character-book/how-to-quick-creation
- Character.AI Pinned Memories：https://support.character.ai/hc/en-us/articles/24327914463003-New-Feature-Pinned-Memories
- Character.AI Voice / Calls：https://support.character.ai/hc/en-us/articles/23957274129691-Character-Calls-Voice-FAQ
- Character.AI Group Chat：https://support.character.ai/hc/en-us/articles/23957256282523-Group-Chat-FAQ
- NovelAI Text Adventure：https://docs.novelai.net/en/text/textadventure/
- DreamGen：https://dreamgen.com/
- DreamGen Story Guide：https://dreamgen.com/docs/stories
- SillyTavern Docs：https://docs.sillytavern.app/
- SillyTavern World Info：https://docs.sillytavern.app/usage/core-concepts/worldinfo/
- SillyTavern Group Chats：https://docs.sillytavern.app/usage/core-concepts/groupchats/
- Chub AI Lorebooks：https://docs.chub.ai/docs/advanced-setups/lorebooks
- Kindroid Groupchats：https://docs.kindroid.ai/groupchats
