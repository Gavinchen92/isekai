# 技术方案

日期：2026-04-27  
结论：第一版采用 `React + TypeScript + Vite + Fastify + Zod` 做一个前后端一体的本地 Web 应用。当前代码用 SQLite 保存已开始的冒险、会话、消息、推荐行动、旅途见闻和 GM 内部状态；未选中的候选入口仍是临时内存态。

## 1. 方案选择

我们不采用 Next.js / Remix 作为第一版基础框架。这个项目不需要 SSR、SEO、服务端组件或复杂路由数据加载，核心是本地 API、LLM 调用、存档和高交互 UI。SQLite 作为本地持久化层，默认文件为 `data/isekai.sqlite`，可用 `ISEKAI_DB_PATH` 覆盖。

推荐方案：

- 前端：React + TypeScript + Vite。
- 后端：Fastify 本地 API server。
- 存储：SQLite，本地文件存档。
- Schema：Zod。
- AI provider：OpenAI-compatible。
- 包管理器：pnpm。

开发时可以用一个命令启动前后端。生产或本地使用时，由 Fastify serve 前端 build 和 API。

## 2. 为什么选 Fastify

Fastify 比 Hono 更适合作为第一版本地 Node 后端：

- Node 后端生态更成熟。
- npm 下载量和生产使用规模更大。
- 插件、日志、schema、错误处理、测试实践更完整。
- 我们第一版只跑本地 Node，不需要 Hono 的多 runtime 优势。

Hono 仍然是轻量好方案，但这个项目更看重 Node 本地服务、SQLite 和长期维护的稳健性。

## 3. 应用形态

```txt
浏览器
  ↓
Vite React 前端
  ↓ HTTP / streaming
Fastify 本地 API
  ├─ in-memory repositories（当前）
  ├─ SQLite
  ├─ prompts
  ├─ OpenAI-compatible provider
  └─ 文件系统 data/
```

第一阶段只做本地浏览器访问，不做 Electron / Tauri。后续如果要桌面版，可以把同一个本地服务包进桌面壳。

## 4. 目录结构

```txt
src/
  app/          # React 页面、路由、前端入口
  components/   # 目标目录：可复用 UI 组件，当前组件量少时可以先留在 app 内
  domain/       # Adventure、Session、StoryArc、Log、Rule 等纯业务模型
  services/     # 生成冒险、推进剧情、生成建议动作、更新日志
  services/gm/  # 当前 GM provider、context builder、mock/openai provider
  storage/      # SQLite repositories、迁移、导入导出
  prompts/      # 目标目录：prompt 模板和版本
  server/       # Fastify server、routes、middlewares
  shared/       # 前后端共享 schema/type
data/
  isekai.sqlite
  assets/
```

## 5. GM 设计

MVP 不做独立 GM Agent。第一版只有一个 OpenAI-compatible provider，但会把 GM 职责拆成独立 service 和 schema，避免叙事、纠错、日志、建议动作混在一个大 prompt 里。

当前实现支持两个 provider：

- `GM_PROVIDER=mock`：开发、测试和无 key 演示使用，完全本地运行。
- `GM_PROVIDER=openai-compatible`：OpenAI-compatible HTTP provider，走 `/chat/completions`，要求模型返回 `GmTurnResult` JSON。`openai` 作为兼容别名保留。

真实游玩使用 `openai-compatible`。真实模型失败不能静默降级到 mock，应该向玩家展示失败状态并允许重试。常规测试不调用真实模型，真实链路只通过 smoke 命令验证。

mock 不直接写在回合服务里，而是走正式的 `GmProvider` 接口。`POST /api/turns` 的服务端链路固定为：

```txt
玩家输入
  -> input intent 识别
  -> GmProvider.generateTurn()
  -> 校验 GmTurnResult
  -> 写入玩家可见消息和推荐行动
  -> 抽取并保存玩家可见旅途见闻
  -> 记录 GM 内部状态 patch
```

`GmTurnResult` 分成四类信息：

- `narration`：玩家可见的新剧情。
- `suggestedMoves`：玩家可见的后续行动，只能描述尝试，不能声明成功结果。
- `journeyMemoryCandidates`：候选旅途见闻，只保存高置信、玩家已知的信息。
- `internalStatePatch`：GM 内部状态，允许包含隐藏线索、章节推进判断和私有备注，但不能进入玩家 API 响应。

真实 AI provider 通过环境变量配置：

```bash
GM_PROVIDER=openai-compatible
OPENAI_API_KEY=...
OPENAI_MODEL=...
OPENAI_BASE_URL=https://api.openai.com/v1 # 可选
```

也支持 `GM_OPENAI_API_KEY`、`GM_OPENAI_MODEL`、`GM_OPENAI_BASE_URL`、`GM_OPENAI_TEMPERATURE`、`GM_OPENAI_TIMEOUT_MS` 作为 GM 专用覆盖项。候选 preview 额外支持 `OPENAI_PREVIEW_TEMPERATURE` / `GM_OPENAI_PREVIEW_TEMPERATURE` 和 `OPENAI_PREVIEW_THINKING` / `GM_OPENAI_PREVIEW_THINKING`，默认 temperature 为 `1.0`、thinking 为 `disabled`，不影响完整冒险包和 GM 回合生成。

AI 接入前先固定 `GM Context Builder`：

- `playerKnownContext`：冒险标题、世界公开前提、开局场景、当前玩家已知的旅途见闻、最近消息、上一轮推荐行动。
- `gmPrivateContext`：`runtimePrompt`、`hiddenGmNotes`、章节结构、胜败条件、结局触发、GM 内部状态 patch。
- `currentPlayerInput`：本回合玩家输入、输入模式和意图分类。
- `outputContract`：模型只能返回 `GmTurnResult` JSON，并遵守不泄露私有信息、不声明玩家行动成功等规则。

真实 AI provider 只能读取完整 context，不能绕过 `GmTurnResult` schema 直接向玩家返回文本。模型名不在代码里写死，避免 provider 或模型升级时修改业务代码。

```txt
providers/openai-compatible
  ├─ adventure-generation.service
  ├─ input-intent.service
  ├─ narration.service
  ├─ suggested-moves.service
  ├─ game-log.service
  └─ gm-guard.service
```

`gm-guard` 在 MVP 里是普通 service，不是独立 Agent。它负责：

- 判断玩家输入是否越权。
- 把越权声明降级成尝试。
- 防止 suggested moves 直接写成功结果。
- 检查 AI 回复有没有改写 canon。
- 判断是否触发终章条件。

V2 做 Dungeon Mind 时，再把 GM / rules 能力升级成更独立的规则代理。那时它可以接管骰子、属性、背包、技能、状态变更和行动合法性。

用户输入意图识别也走 provider：

- mock 模式使用确定性规则，服务于开发和测试。
- openai-compatible 模式使用模型输出结构化分类。
- `/ooc` 这类明确局外入口可以用确定性规则提前识别。
- 分类结果只是意图，不是 canon；GM 回合仍然要继续防止玩家把结果声明写成事实。

## 6. 后端 API

当前已实现：

```txt
GET  /api/health
GET  /api/world-seeds
POST /api/adventure-candidates
POST /api/adventures
GET  /api/adventures/:id
POST /api/sessions
GET  /api/sessions/latest
GET  /api/sessions/:id
GET  /api/sessions/:id/journey-memory
POST /api/sessions/:id/journey-memory/extract
POST /api/turns
POST /api/turns/stream
```

`POST /api/adventure-candidates` 只生成并返回 `AdventureCandidatePreview[]`，用于玩家选择冒险入口；真实 provider 下会按候选数量并发生成单个 preview concept，服务端保存内部 concept。`POST /api/adventures` 只接收 `candidateId`、`worldSeedId` 和可选 `selectedPlayerSetupId`，服务端在这里把被选中的 concept 补全为完整 `AdventureCandidate` 并创建 Adventure。前端不能回传完整候选，避免把主线、结局、胜败条件或隐藏 GM notes 暴露给玩家端。

计划项：

```txt
GET  /api/adventures

POST /api/sessions/:id/messages
POST /api/sessions/:id/continue
POST /api/sessions/:id/regenerate
POST /api/sessions/:id/rewind

GET  /api/sessions/:id/suggested-moves
POST /api/sessions/:id/suggested-moves/regenerate

GET  /api/sessions/:id/logs
GET  /api/sessions/:id/quests
GET  /api/sessions/:id/codex

GET  /api/settings/provider
PUT  /api/settings/provider
```

`POST /api/turns/stream` 使用 Server-Sent Events 返回回合阶段事件；如果未来 provider 支持原生 token streaming，可以在保持事件契约不变的前提下增强。

## 7. 数据和 schema 原则

- 结构化 AI 输出必须用 Zod 校验。
- 校验失败不能入库。
- Adventure 生成、Suggested moves、日志更新都要有独立 schema。
- 数据库写入层不能接受裸 AI JSON。
- prompt 版本要保存到生成记录里，方便之后排查。

## 8. 测试策略

测试体系详见 [testing.md](./testing.md)。

优先覆盖：

- Adventure candidate schema。
- Adventure candidate preview 不生成也不泄露开局场景、主线矛盾、胜败条件、结局和隐藏 GM notes。
- Suggested moves 不能声明结果。
- 玩家越权输入降级。
- prompt / context builder。
- 旅途见闻只展示玩家已知信息，不泄露 GM 内部状态。
- API smoke：生成 preview 候选 -> 选中候选并生成完整 Adventure -> 创建 Session -> 发送消息。

## 9. 启动命令

当前已支持：

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
```

具体命令以 README 和 `package.json` 为准。
