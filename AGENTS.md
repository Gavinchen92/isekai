# AGENTS.md

这个文件只写代理每次工作必须遵守的项目级规则。产品、架构、测试和长期协作细节落在 `docs/`，不要在这里重复维护一份长文。

## 1. 先看文档

- 项目入口和启动方式看 `README.md`。
- 产品边界和用户流程看 `docs/local-web-version-plan.md`。
- 架构、API、GM 设计和数据原则看 `docs/technical-plan.md`。
- 测试分层和必测链路看 `docs/testing.md`。
- 长期协作方式看 `docs/engineering-agreement.md`。
- `docs/competitive-research.md` 只作为竞品参考，不直接等同于本地版需求。

聊天里的临时结论不自动成为长期需求。涉及产品边界、架构、API、AI 输出契约或存档结构的方向变化，按 `docs/engineering-agreement.md` 同步更新文档；小的明确修复不需要为了改文档而阻塞实现。

阅读 `docs/` 时要区分“当前实现”和“计划项”。如果文档没有明确标注已实现，先以当前代码为准，不要把计划清单当成现有契约。

## 2. 协作规则

- 先读现有文档和代码，再判断怎么改。
- 需求明确就直接做，不为了流程额外提问。
- 存在关键歧义时最多问 1 个问题，尤其是会影响玩家可见行为、数据模型、接口契约、AI 输出边界或存档结构的改动。
- 改代码前简短说明准备改哪些文件和原因。
- 未经明确要求，不创建 git commit，不 push。

## 3. 工程底线

- 业务规则优先放在 `domain` / `services`，不要塞进 React 组件。
- 外部输入、API 请求和 AI 结构化输出必须经过 schema 校验。
- 裸 AI JSON 不能直接进入存档或游戏事实。
- 改动保持聚焦，不做无关重构，不覆盖用户未要求修改的文件。

## 4. 验证规则

- 代码改动优先跑 `pnpm test`、`pnpm lint`、`pnpm build`。
- API 测试使用 Fastify `server.inject()`，不要为了测试启动真实端口。
- UI 改动尽量用本地浏览器验证关键路径和 console 错误。
- 如果没有运行验证命令，最终回复要说明原因。
