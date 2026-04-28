# 测试体系

日期：2026-04-27  
目标：用一套轻量但可扩展的测试体系覆盖 MVP 的关键风险。

## 1. 测试分层

第一版使用 Vitest 作为统一测试 runner。

- 单元测试：纯函数、schema、context builder、输入意图分类。
- API 测试：Fastify route 使用 `server.inject()`，不启动真实端口。
- UI 组件测试：React Testing Library + jsdom，只测用户能看到和操作的行为。
- 类型检查：`tsc --noEmit`，通过 `pnpm lint` 执行。
- 构建验证：`pnpm build`，确保前端产物能生成。

暂不引入 Playwright。等有“选择世界种子 -> 生成冒险 -> 开始游玩”的真实流程后，再加端到端测试。

## 2. 命名约定

- 测试文件和实现文件放在一起。
- 文件名使用 `*.test.ts` 或 `*.test.tsx`。
- UI 测试文件顶部加 `// @vitest-environment jsdom`。
- API 测试只通过 Fastify `inject()` 调 route。

## 3. 必测链路

优先覆盖：

- Adventure candidate schema。
- Adventure candidate preview 只生成和返回无剧透字段；API 不把完整候选、主线、结局、胜败条件、隐藏 GM notes 返回给前端。
- 真实 provider 的 preview 生成要按候选数量并发 fan-out，覆盖 partial failure、全部失败、重复重试和 preview-only temperature/thinking override。
- 创建 Adventure 时才 materialize 完整候选，并且保留 preview 的 candidate id 和玩家身份 id。
- Suggested moves 不能声明结果。
- 玩家越权输入降级。
- prompt / context builder。
- 旅途见闻只展示玩家已知信息，不泄露隐藏 GM notes、章节、目标、胜败条件。
- GM provider 的输出要先过 `GmTurnResult` schema；`internalStatePatch` 不能进入玩家可见的 turn response。
- 推荐行动无论来自 mock 还是未来 AI，都只能表达尝试，不能表达已经成功的结果。
- OpenAI-compatible provider 的测试只 mock HTTP，不调用真实外部服务；必须覆盖请求体、JSON 解析、错误上抛、abort/timeout 和 API key 不泄露。
- 用户意图识别 provider 的常规测试只 mock HTTP；真实模型分类只走 smoke。
- API smoke：生成 preview 候选 -> 选中候选并生成完整 Adventure -> 创建 Session -> 发送消息。

## 4. 命令

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm lint
pnpm build
```

## 5. 当前基线

当前已有：

- `src/shared/health.test.ts`：schema 单元测试。
- `src/domain/*.test.ts`：冒险、GM 输出、运行时和旅途见闻 schema / 规则测试。
- `src/services/*.test.ts`：世界种子、候选生成、冒险创建、会话、回合推进和旅途见闻服务测试。
- `src/services/gm/*.test.ts`：context builder、mock provider、OpenAI-compatible provider 测试。
- `src/server/app.test.ts`：Fastify API route 测试。
- `src/app/App.test.tsx`：新冒险入口、候选选择、游玩页和旅途见闻 UI 测试。
