# 日志和排障

项目使用 Pino 作为统一日志系统。Fastify 请求日志和业务事件日志共用同一个 logger。

## 默认行为

- 开发环境：输出到终端，并写入 `data/logs/api.jsonl`。
- 测试环境：默认静默，避免污染测试输出。
- 日志为 JSONL，方便用 `rg`、`jq` 或后续日志平台分析。

## 配置

```bash
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_FILE=data/logs/api.jsonl
LOG_LLM_PAYLOADS=false
LOG_PAYLOAD_MAX_CHARS=1200
```

`LOG_LLM_PAYLOADS=false` 是默认值。只有排查 prompt 或模型输出问题时才打开；打开后也只记录截断后的内容。

## 关键事件

- `adventure_candidate_generation_started`
- `adventure_candidate_generation_completed`
- `adventure_candidate_generation_failed`
- `turn_generation_started`
- `turn_generation_completed`
- `turn_generation_failed`
- `llm_request_started`
- `llm_request_completed`
- `llm_request_failed`
- `llm_response_missing_content`

这些事件会带上 `durationMs`、`provider`、`model`、`worldSeedId`、`sessionId` 等字段，方便判断慢点在接口、LLM、schema 还是业务处理。

## 敏感信息

日志不会记录 API key。Pino redaction 会遮蔽常见的 `authorization`、`apiKey`、cookie 字段。
