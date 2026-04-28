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

const OpenAiCompatibleThinkingModeSchema = z.enum(["enabled", "disabled"]);

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
export type OpenAiCompatibleThinkingMode = z.infer<typeof OpenAiCompatibleThinkingModeSchema>;

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
  signal?: AbortSignal;
  temperature?: number;
  thinking?: OpenAiCompatibleThinkingMode;
}): Promise<string> {
  const getDurationMs = createLogTimer();
  const url = buildChatCompletionsUrl(input.config.baseUrl);
  const temperature = input.temperature ?? input.config.temperature;
  const payload: {
    messages: readonly GmPromptMessage[];
    model: string;
    response_format: { type: "json_object" };
    temperature: number;
    thinking?: { type: OpenAiCompatibleThinkingMode };
  } = {
    messages: input.messages,
    model: input.config.model,
    response_format: {
      type: "json_object"
    },
    temperature
  };

  if (input.thinking) {
    payload.thinking = {
      type: input.thinking
    };
  }
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
    temperature,
    thinking: input.thinking,
    timeoutMs: input.config.timeoutMs,
    ...payloadFields
  });

  let response: Response;
  let responseText: string;

  try {
    const result = await fetchTextWithTimeout(url, {
      body: JSON.stringify(payload),
      headers: {
        authorization: `Bearer ${input.config.apiKey}`,
        "content-type": "application/json"
      },
      method: "POST",
      signal: input.signal,
      timeoutMs: input.config.timeoutMs
    });

    response = result.response;
    responseText = result.text;
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
    const errorBody = trimErrorBody(responseText);

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

  const payloadJson = OpenAiCompatibleChatCompletionResponseSchema.parse(JSON.parse(responseText));
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

export async function* requestOpenAiCompatibleJsonObjectStream(input: {
  config: OpenAiCompatibleProviderConfig;
  label: string;
  messages: readonly GmPromptMessage[];
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  // 过渡阶段：如果 provider 尚未启用原生流式，这里退化为单块输出。
  // 上层仍可按阶段事件向前端推送，后续可替换为真实 token 流式解析。
  yield await requestOpenAiCompatibleJsonObject(input);
}

function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/chat/completions`;
}

async function fetchTextWithTimeout(
  url: string,
  init: RequestInit & {
    signal?: AbortSignal;
    timeoutMs: number;
  }
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("OpenAI-compatible request timed out", "AbortError"));
  }, init.timeoutMs);
  const abortFromParent = () => {
    controller.abort(init.signal?.reason);
  };

  if (init.signal?.aborted) {
    controller.abort(init.signal.reason);
  } else {
    init.signal?.addEventListener("abort", abortFromParent, {
      once: true
    });
  }

  try {
    const { signal: _signal, timeoutMs: _timeoutMs, ...fetchInit } = init;
    const response = await fetch(url, {
      ...fetchInit,
      signal: controller.signal
    });
    const text = await response.text();

    return { response, text };
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromParent);
  }
}

function trimErrorBody(body: string): string {
  return body.trim().slice(0, 500);
}
