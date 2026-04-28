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

export const appLogConfig = resolveLogConfig();
export const appLogger = createAppLogger(appLogConfig);

export function resolveLogConfig(env: NodeJS.ProcessEnv = process.env): AppLogConfig {
  const isTest = env.NODE_ENV === "test" || Boolean(env.VITEST);

  return {
    filePath: env.LOG_FILE ?? "data/logs/api.jsonl",
    level: parseLogLevel(env.LOG_LEVEL, isTest ? "silent" : "info"),
    logLlmPayloads: parseBooleanEnv(env.LOG_LLM_PAYLOADS, false),
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
