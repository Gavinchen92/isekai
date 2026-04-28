# Isekai

本地自玩的 AI 互动故事 Web 应用。

第一版目标：用户选择世界种子，AI 生成一段有起点、有阶段、有结局的冒险。玩家通过自由输入、AI 推荐后续动作、继续和局外提醒与故事互动。

## MVP 边界

- 不做登录、社区、付费、审核。
- 不做手工 Storyline / Character / Persona 编辑器。
- 不提供任意编辑剧情、pin memory。
- 不把 `Do / Say / Story` 做成显式输入模式。
- 保留自由输入、AI 推荐后续动作、继续、局外提醒。
- 内部用事件记录、任务状态和百科维护连续性；玩家界面用“旅途见闻”记住身份、人物、地点、关系、线索和物件，但不显示章节、目标、胜败条件和 GM 判断依据。
- 每个 Adventure 必须有主线目标、阶段结构和结局。

## 文档

- [竞品调研](./docs/competitive-research.md)
- [本地 Web 版实现方案](./docs/local-web-version-plan.md)
- [工程协作约定](./docs/engineering-agreement.md)
- [技术方案](./docs/technical-plan.md)
- [测试体系](./docs/testing.md)
- [日志和排障](./docs/logging.md)

## 开发

当前实现：React + TypeScript + Vite + Fastify + Zod，本地存档使用 SQLite，临时冒险候选仍保留在内存中。

默认数据库路径为 `data/isekai.sqlite`，可以通过 `ISEKAI_DB_PATH` 覆盖。

```bash
pnpm install
pnpm dev
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm smoke:candidates
pnpm smoke:gm
pnpm build
pnpm lint
```

本地开发地址：

- Web：http://127.0.0.1:5173
- API：http://127.0.0.1:8787/api/health

## GM Provider

没有模型 key 时可以使用本地 mock 做开发和测试：

```bash
pnpm dev
```

如需切到 OpenAI-compatible provider：

```bash
GM_PROVIDER=openai-compatible \
OPENAI_API_KEY=... \
OPENAI_MODEL=... \
pnpm dev
```

可选配置：

- `OPENAI_BASE_URL`：默认 `https://api.openai.com/v1`，兼容其他 OpenAI-compatible 服务。
- `OPENAI_TEMPERATURE`：默认 `0.7`。
- `OPENAI_TIMEOUT_MS`：默认 `60000`。
- `OPENAI_PREVIEW_TEMPERATURE`：默认 `1.0`，只用于候选 preview。
- `OPENAI_PREVIEW_THINKING`：默认 `disabled`，只用于候选 preview。

也可以用 `GM_OPENAI_*` 前缀覆盖同名配置，例如 `GM_OPENAI_MODEL`。

`mock` 只用于开发、测试和无 key 演示。真实游玩建议使用 `openai-compatible`；真实模型失败时不会静默降级到 mock，应该让用户看到失败并重试。

真实模型链路可以用下面命令做本地 smoke。它会读取 `.env`，真实调用当前 `GM_PROVIDER`，不纳入常规测试：

```bash
pnpm smoke:candidates
pnpm smoke:gm
```

`smoke:candidates` 会先生成轻量候选 preview，再选中第一个候选生成完整 Adventure，用来验证两段式冒险生成链路。
