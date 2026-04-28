# 工程协作约定

日期：2026-04-27  
用途：约定长期协作时的需求、实现、验证和交付方式。

`AGENTS.md` 是 agent 的运行手册，只写每次执行必须遵守的规则。本文档是长期工程契约，说明需求如何进入实现、边界怎么判断、后续怎么演进。

## 1. 文档是需求源头

- `docs/local-web-version-plan.md` 是 MVP 产品边界。
- `docs/technical-plan.md` 是架构、API、GM 设计和数据原则。
- `docs/testing.md` 是测试分层和必测链路。
- `docs/competitive-research.md` 只放竞品分析和外部产品借鉴。
- 方向变化如果影响产品边界、架构、API、AI 输出契约或存档结构，需要在同一次改动里同步更新文档；小的明确修复不需要为了改文档而阻塞实现。
- 不把聊天里的临时结论当成长期需求，除非已经落到文档里。

## 2. 需求进入实现前要有验收口径

每个实现任务开始前，需要明确：

- 目标是什么。
- 不做什么。
- 用户路径是什么。
- 怎么判断完成。
- 哪些行为不能被破坏。

如果需求存在关键歧义，先讨论清楚再改代码。低风险细节按项目惯例和当前文档默认值处理。

## 3. MVP 严格控范围

- 玩家先玩，不先做创作后台。
- 不做登录、社区、付费、审核。
- 普通模式不暴露 prompt、memory、editor 这类工具感能力。
- 任意新增功能都要回答：它是否增强沉浸和可玩性。
- 不做显式 `Pin memory`，连续性由旅途见闻和 GM 内部状态承担。
- 不做任意编辑剧情，纠错走 OOC correction、regenerate、rewind / branch。

## 4. 游戏状态和 AI 输出边界

- 玩家输入只是意图，不是 canon。
- 用户输入意图识别是独立 provider。mock 模式只用于开发测试，真实游玩走模型分类。
- AI/GM 叙事结果、规则系统结果、系统确认后的内部事件记录、任务状态和百科才能写入游戏事实。
- 玩家可以尝试做事，不能直接声明成功结果。
- 越权输入不报错，降级成尝试，由 AI/GM 或规则系统给出后果。
- 结构化 AI 输出必须过 schema 校验。
- 校验失败时重试或降级，不让脏数据进入存档。
- 真实模型失败不静默降级到 mock，应该暴露失败并允许重试。

## 5. 建议架构分层

- `ui`：页面和交互。
- `domain`：Adventure、Session、StoryArc、Log、Rule 等纯业务模型。
- `services`：生成冒险、推进剧情、生成建议动作、更新日志。
- `providers`：目标层，负责 OpenAI-compatible，后续可接 Ollama / LM Studio。当前 provider 先放在 `src/services/gm`。
- `storage`：负责 SQLite 本地存档，后续继续扩展导入导出。未选中的候选入口仍保留为临时内存态。
- `prompts`：目标层，负责 prompt 模板和版本，不散落在组件里。

第一版技术栈定为 React + TypeScript + Vite + Fastify + Zod。SQLite 是当前本地存档方案，当前实现状态以 `docs/technical-plan.md` 和代码为准。

MVP 不做独立 GM Agent。GM 职责先拆成 `gm-guard`、`input-intent`、`narration`、`suggested-moves`、`game-log` 等 service，共用同一个 OpenAI-compatible provider。V2 做 Dungeon Mind 时，再升级为更独立的规则代理。

## 6. 测试优先级

测试命令和分层约定见 `docs/testing.md`。

优先覆盖核心链路：

- 世界种子生成 Adventure 的 schema 校验。
- prompt / context builder。
- 越权输入降级。
- Suggested moves 不能生成结果声明。
- 旅途见闻只展示玩家已知信息；GM 内部日志只写入确认事实。
- 端到端 smoke：选世界种子 -> 生成冒险 -> 开始 -> 输入行动 -> 生成回复。

## 7. 开发节奏

- 每个阶段只做一个可玩的闭环。
- 复杂改动先对齐验收口径，再进入实现。
- 交付时说明完成了什么、验证了什么、还有什么没验证。

## 8. README 和 AGENTS

- `README.md` 只放项目入口、MVP 边界、文档链接和启动方式。
- `AGENTS.md` 只放 agent 执行规则，不重复产品长文、架构细节和协作背景。
