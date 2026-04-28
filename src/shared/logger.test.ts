import { describe, expect, it } from "vitest";
import {
  buildAiStructuredOutputParseFailureFields,
  resolveLogConfig,
  truncateForLog
} from "./logger";

describe("resolveLogConfig", () => {
  it("uses silent logging by default in tests", () => {
    expect(
      resolveLogConfig({
        NODE_ENV: "test"
      }).level
    ).toBe("silent");
  });

  it("logs LLM payload previews by default in local development", () => {
    expect(resolveLogConfig({}).logLlmPayloads).toBe(true);
  });

  it("does not log LLM payload previews by default in production", () => {
    expect(
      resolveLogConfig({
        NODE_ENV: "production"
      }).logLlmPayloads
    ).toBe(false);
  });

  it("does not log LLM payload previews by default in tests", () => {
    expect(
      resolveLogConfig({
        NODE_ENV: "test"
      }).logLlmPayloads
    ).toBe(false);
  });

  it("allows LOG_LLM_PAYLOADS=false to override the local default", () => {
    expect(
      resolveLogConfig({
        LOG_LLM_PAYLOADS: "false"
      }).logLlmPayloads
    ).toBe(false);
  });

  it("parses local logging configuration", () => {
    expect(
      resolveLogConfig({
        LOG_FILE: "data/logs/custom.jsonl",
        LOG_LEVEL: "debug",
        LOG_LLM_PAYLOADS: "true",
        LOG_PAYLOAD_MAX_CHARS: "64",
        LOG_TO_FILE: "false"
      })
    ).toMatchObject({
      filePath: "data/logs/custom.jsonl",
      level: "debug",
      logLlmPayloads: true,
      payloadMaxChars: 64,
      toFile: false
    });
  });
});

describe("truncateForLog", () => {
  it("truncates long payloads", () => {
    expect(truncateForLog("abcdef", 3)).toBe("abc...[truncated 3 chars]");
  });
});

describe("buildAiStructuredOutputParseFailureFields", () => {
  it("extracts zod issue path and invalid value preview when payload logging is enabled", () => {
    const error = {
      issues: [
        {
          code: "invalid_value",
          message: "Invalid option",
          path: ["journeyMemoryCandidates", 0, "type"],
          values: ["identity", "npc"]
        }
      ]
    };
    const fields = buildAiStructuredOutputParseFailureFields(
      {
        content: "{\"journeyMemoryCandidates\":[{\"type\":\"lore\"}]}",
        error,
        operation: "turn_stream",
        parsedJson: {
          journeyMemoryCandidates: [
            {
              type: "lore"
            }
          ]
        },
        requestId: "req-1",
        schemaName: "GmTurnResult",
        sessionId: "session-1",
        worldSeedId: "isekai"
      },
      {
        filePath: "data/logs/api.jsonl",
        level: "info",
        logLlmPayloads: true,
        payloadMaxChars: 1200,
        toFile: true
      }
    );

    expect(fields).toMatchObject({
      failedPath: "journeyMemoryCandidates.0.type",
      invalidValuePreview: "\"lore\"",
      operation: "turn_stream",
      requestId: "req-1",
      responseChars: 45,
      responsePreview: "{\"journeyMemoryCandidates\":[{\"type\":\"lore\"}]}",
      schemaName: "GmTurnResult",
      sessionId: "session-1",
      worldSeedId: "isekai"
    });
    expect(fields.zodIssues).toEqual([
      {
        code: "invalid_value",
        message: "Invalid option",
        path: "journeyMemoryCandidates.0.type",
        values: ["identity", "npc"]
      }
    ]);
  });

  it("omits AI payload previews when payload logging is disabled", () => {
    const fields = buildAiStructuredOutputParseFailureFields(
      {
        content: "{\"bad\":true}",
        error: new Error("bad JSON"),
        schemaName: "GmTurnResult"
      },
      {
        filePath: "data/logs/api.jsonl",
        level: "info",
        logLlmPayloads: false,
        payloadMaxChars: 1200,
        toFile: true
      }
    );

    expect(fields).not.toHaveProperty("invalidValuePreview");
    expect(fields).not.toHaveProperty("responsePreview");
    expect(fields).toMatchObject({
      responseChars: 12,
      schemaName: "GmTurnResult",
      zodIssues: []
    });
  });
});
