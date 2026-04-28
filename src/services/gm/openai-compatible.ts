import { z } from "zod";
import type { GmPromptMessage } from "../../domain";
import { appLogConfig, createLogTimer, logEvent, truncateForLog } from "../../shared/logger";

const OpenAiCompatibleProviderConfigSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url().default("https://api.openai.com/v1"),
  model: z.string().min(1),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  timeoutMs: z.coerce.number().int().min(1_000).max(120_000).default(60_000)
});

const OpenAiCompatibleChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable()
        })
      })
    )
    .min(1)
});

export type OpenAiCompatibleProviderConfigInput = z.input<
  typeof OpenAiCompatibleProviderConfigSchema
>;
export type OpenAiCompatibleProviderConfig = z.infer<typeof OpenAiCompatibleProviderConfigSchema>;

export function resolveOpenAiCompatibleProviderConfig(
  configInput: Partial<OpenAiCompatibleProviderConfigInput> = {}
): OpenAiCompatibleProviderConfig {
  const result = OpenAiCompatibleProviderConfigSchema.safeParse({
    apiKey: configInput.apiKey ?? process.env.GM_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    baseUrl:
      configInput.baseUrl ??
      process.env.GM_OPENAI_BASE_URL ??
      process.env.OPENAI_BASE_URL ??
      undefined,
    model: configInput.model ?? process.env.GM_OPENAI_MODEL ?? process.env.OPENAI_MODEL,
    temperature:
      configInput.temperature ??
      process.env.GM_OPENAI_TEMPERATURE ??
      process.env.OPENAI_TEMPERATURE ??
      undefined,
    timeoutMs:
      configInput.timeoutMs ??
      process.env.GM_OPENAI_TIMEOUT_MS ??
      process.env.OPENAI_TIMEOUT_MS ??
      undefined
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid OpenAI-compatible provider config: ${issues}`);
  }

  return result.data;
}

export async function requestOpenAiCompatibleJsonObject(input: {
  config: OpenAiCompatibleProviderConfig;
  label: string;
  messages: readonly GmPromptMessage[];
}): Promise<string> {
  const getDurationMs = createLogTimer();
  const url = buildChatCompletionsUrl(input.config.baseUrl);
  const payload = {
    messages: input.messages,
    model: input.config.model,
    response_format: {
      type: "json_object"
    },
    temperature: input.config.temperature
  };
  const payloadFields = appLogConfig.logLlmPayloads
    ? {
        promptPreview: truncateForLog(JSON.stringify(input.messages))
      }
    : {};

  logEvent("llm_request_started", {
    baseUrl: input.config.baseUrl,
    label: input.label,
    model: input.config.model,
    provider: "openai-compatible",
    timeoutMs: input.config.timeoutMs,
    ...payloadFields
  });

  let response: Response;

  try {
    response = await fetchWithTimeout(url, {
      body: JSON.stringify(payload),
      headers: {
        authorization: `Bearer ${input.config.apiKey}`,
        "content-type": "application/json"
      },
      method: "POST",
      timeoutMs: input.config.timeoutMs
    });
  } catch (error: unknown) {
    logEvent(
      "llm_request_failed",
      {
        durationMs: getDurationMs(),
        err: error,
        label: input.label,
        model: input.config.model,
        provider: "openai-compatible"
      },
      "error"
    );
    throw error;
  }

  if (!response.ok) {
    const errorBody = trimErrorBody(await response.text());

    logEvent(
      "llm_request_failed",
      {
        durationMs: getDurationMs(),
        label: input.label,
        model: input.config.model,
        provider: "openai-compatible",
        statusCode: response.status
      },
      "error"
    );

    throw new Error(`${input.label} request failed with ${response.status}: ${errorBody}`);
  }

  const payloadJson = OpenAiCompatibleChatCompletionResponseSchema.parse(await response.json());
  const content = payloadJson.choices[0]?.message.content;

  if (!content) {
    logEvent(
      "llm_response_missing_content",
      {
        durationMs: getDurationMs(),
        label: input.label,
        model: input.config.model,
        provider: "openai-compatible"
      },
      "error"
    );
    throw new Error(`${input.label} response did not include message content`);
  }

  logEvent("llm_request_completed", {
    durationMs: getDurationMs(),
    label: input.label,
    model: input.config.model,
    provider: "openai-compatible",
    responseChars: content.length,
    ...(appLogConfig.logLlmPayloads ? { responsePreview: truncateForLog(content) } : {})
  });

  return content;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/chat/completions`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & {
    timeoutMs: number;
  }
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, init.timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function trimErrorBody(body: string): string {
  return body.trim().slice(0, 500);
}
