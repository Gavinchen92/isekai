import { describe, expect, it } from "vitest";
import { resolveLogConfig, truncateForLog } from "./logger";

describe("resolveLogConfig", () => {
  it("uses silent logging by default in tests", () => {
    expect(
      resolveLogConfig({
        NODE_ENV: "test"
      }).level
    ).toBe("silent");
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
