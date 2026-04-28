import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import pino, {
  type Logger,
  type LoggerOptions,
  type Level,
  type LevelWithSilent,
  type StreamEntry
} from "pino";

const logLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

export type AppLogConfig = {
  filePath: string;
  level: LevelWithSilent;
  logLlmPayloads: boolean;
  payloadMaxChars: number;
  toFile: boolean;
};

export type LogFields = Record<string, unknown>;
export type LogContext = {
  operation?: string;
  requestId?: string;
  sessionId?: string;
  worldSeedId?: string;
};

type ZodIssueLike = {
  code?: unknown;
  message?: unknown;
  path?: unknown;
  values?: unknown;
};

type AiStructuredOutputParseFailureInput = LogContext & {
  content: string;
  error: unknown;
  parsedJson?: unknown;
  schemaName: string;
};

export const appLogConfig = resolveLogConfig();
export const appLogger = createAppLogger(appLogConfig);

export function resolveLogConfig(env: NodeJS.ProcessEnv = process.env): AppLogConfig {
  const isTest = env.NODE_ENV === "test" || Boolean(env.VITEST);
  const isProduction = env.NODE_ENV === "production";
  const defaultLogLlmPayloads = !isTest && !isProduction;

  return {
    filePath: env.LOG_FILE ?? "data/logs/api.jsonl",
    level: parseLogLevel(env.LOG_LEVEL, isTest ? "silent" : "info"),
    logLlmPayloads: parseBooleanEnv(env.LOG_LLM_PAYLOADS, defaultLogLlmPayloads),
    payloadMaxChars: parsePositiveInteger(env.LOG_PAYLOAD_MAX_CHARS, 1_200),
    toFile: parseBooleanEnv(env.LOG_TO_FILE, !isTest)
  };
}

export function logEvent(
  event: string,
  fields: LogFields = {},
  level: Exclude<LevelWithSilent, "silent"> = "info"
): void {
  appLogger[level](
    {
      event,
      ...fields
    },
    event
  );
}

export function createLogTimer(): () => number {
  const startedAt = performance.now();

  return () => Math.round(performance.now() - startedAt);
}

export function truncateForLog(value: string, maxChars = appLogConfig.payloadMaxChars): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...[truncated ${value.length - maxChars} chars]`;
}

export function buildAiStructuredOutputParseFailureFields(
  input: AiStructuredOutputParseFailureInput,
  config: AppLogConfig = appLogConfig
): LogFields {
  const zodIssues = extractZodIssues(input.error);
  const firstIssuePath = zodIssues[0]?.path ?? [];
  const fields: LogFields = {
    err: input.error,
    operation: input.operation,
    requestId: input.requestId,
    responseChars: input.content.length,
    schemaName: input.schemaName,
    sessionId: input.sessionId,
    worldSeedId: input.worldSeedId,
    zodIssues: zodIssues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: formatIssuePath(issue.path),
      values: issue.values
    }))
  };

  const failedPath = formatIssuePath(firstIssuePath);

  if (failedPath) {
    fields.failedPath = failedPath;
  }

  if (config.logLlmPayloads) {
    fields.responsePreview = truncateForLog(input.content, config.payloadMaxChars);

    if (input.parsedJson !== undefined && firstIssuePath.length > 0) {
      fields.invalidValuePreview = truncateForLog(
        stringifyForLog(readValueAtPath(input.parsedJson, firstIssuePath)),
        config.payloadMaxChars
      );
    }
  }

  return fields;
}

export function logAiStructuredOutputParseFailure(
  input: AiStructuredOutputParseFailureInput
): void {
  logEvent(
    "ai_structured_output_parse_failed",
    buildAiStructuredOutputParseFailureFields(input),
    "error"
  );
}

function createAppLogger(config: AppLogConfig): Logger {
  const loggerOptions = createLoggerOptions(config);

  if (config.level === "silent") {
    return pino({
      ...loggerOptions,
      enabled: false
    });
  }

  const streamLevel = config.level as Level;
  const streams: StreamEntry[] = [
    {
      level: streamLevel,
      stream: pino.destination(1)
    }
  ];

  if (config.toFile) {
    const filePath = resolve(process.cwd(), config.filePath);

    mkdirSync(dirname(filePath), {
      recursive: true
    });
    streams.push({
      level: streamLevel,
      stream: pino.destination({
        dest: filePath,
        sync: false
      })
    });
  }

  return pino(loggerOptions, pino.multistream(streams));
}

function createLoggerOptions(config: AppLogConfig): LoggerOptions {
  return {
    base: {
      service: "isekai"
    },
    level: config.level,
    redact: {
      censor: "[redacted]",
      paths: [
        "apiKey",
        "authorization",
        "headers.authorization",
        "req.headers.authorization",
        "req.headers.cookie",
        "config.apiKey"
      ]
    },
    timestamp: pino.stdTimeFunctions.isoTime
  };
}

function parseLogLevel(value: string | undefined, fallback: LevelWithSilent): LevelWithSilent {
  if (value && logLevels.includes(value as LevelWithSilent)) {
    return value as LevelWithSilent;
  }

  return fallback;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function extractZodIssues(error: unknown): readonly {
  code?: string;
  message: string;
  path: readonly PropertyKey[];
  values?: unknown;
}[] {
  if (!error || typeof error !== "object" || !("issues" in error)) {
    return [];
  }

  const issues = (error as { issues?: unknown }).issues;

  if (!Array.isArray(issues)) {
    return [];
  }

  return issues.map((issue: ZodIssueLike) => ({
    code: typeof issue.code === "string" ? issue.code : undefined,
    message: typeof issue.message === "string" ? issue.message : String(issue.message),
    path: Array.isArray(issue.path)
      ? issue.path.filter((segment): segment is PropertyKey => isPropertyKey(segment))
      : [],
    values: issue.values
  }));
}

function isPropertyKey(value: unknown): value is PropertyKey {
  return ["number", "string", "symbol"].includes(typeof value);
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  return path
    .map((segment) =>
      typeof segment === "symbol" ? segment.description ?? "symbol" : String(segment)
    )
    .join(".");
}

function readValueAtPath(root: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || typeof segment === "symbol") {
      return undefined;
    }

    if (typeof current !== "object" && typeof current !== "function") {
      return undefined;
    }

    return (current as Record<PropertyKey, unknown>)[segment];
  }, root);
}

function stringifyForLog(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
