import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isResultClaim } from "../src/domain";
import { generateMockAdventureCandidates } from "../src/services/adventure-candidates";
import { createAdventureFromCandidate } from "../src/services/adventures";
import { resolveOpenAiGmProviderConfig } from "../src/services/gm/openai-provider";
import { listJourneyMemory } from "../src/services/journey-memory";
import { createSession } from "../src/services/sessions";
import { createTurn } from "../src/services/turns";

type SmokeCheck = {
  label: string;
  passed: boolean;
  detail?: string;
};

const envPath = resolve(process.cwd(), ".env");

await loadEnvFile(envPath);

const providerName = process.env.GM_PROVIDER ?? "mock";

if (providerName === "mock") {
  throw new Error("GM_PROVIDER is mock. Set GM_PROVIDER=openai-compatible before running smoke.");
}

const providerConfig = resolveOpenAiGmProviderConfig();

console.log("GM smoke config:");
console.log(
  JSON.stringify(
    {
      provider: providerName,
      hasApiKey: Boolean(process.env.GM_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
      baseUrl: providerConfig.baseUrl,
      model: providerConfig.model,
      temperature: providerConfig.temperature,
      timeoutMs: providerConfig.timeoutMs
    },
    null,
    2
  )
);

const [candidate] = generateMockAdventureCandidates({
  candidateCount: 1,
  worldSeedId: "isekai"
});

if (!candidate) {
  throw new Error("failed to create smoke adventure candidate");
}

const adventure = createAdventureFromCandidate({
  candidate,
  worldSeedId: "isekai"
});
const session = createSession({
  adventureId: adventure.id
});

console.log(`Running GM turn smoke for adventure: ${adventure.title}`);

const response = await createTurn({
  content: "我尝试观察断塔入口的符文，先判断有没有危险，再决定是否靠近。",
  inputKind: "free",
  sessionId: session.id
});
const assistantMessage = response.messages.find((message) => message.role === "assistant");

if (!assistantMessage) {
  throw new Error("GM turn did not return an assistant message");
}

const journeyMemory = listJourneyMemory(session.id);
const checks: SmokeCheck[] = [
  {
    label: "assistant narration exists",
    passed: assistantMessage.content.trim().length > 0
  },
  {
    label: "suggested moves count is 1-3",
    passed: response.suggestedMoves.length >= 1 && response.suggestedMoves.length <= 3,
    detail: `${response.suggestedMoves.length}`
  },
  {
    label: "suggested moves describe attempts, not results",
    passed: response.suggestedMoves.every(
      (move) => !isResultClaim(move.label) && !isResultClaim(move.intent)
    )
  },
  {
    label: "assistant did not leak obvious GM private markers",
    passed: !containsPrivateMarker(assistantMessage.content)
  }
];
const failedChecks = checks.filter((check) => !check.passed);

console.log("GM smoke result:");
console.log(
  JSON.stringify(
    {
      narrationPreview: assistantMessage.content.slice(0, 220),
      suggestedMoves: response.suggestedMoves.map((move) => ({
        label: move.label,
        riskLevel: move.riskLevel,
        tags: move.tags
      })),
      journeyMemoryCount: journeyMemory.length,
      checks
    },
    null,
    2
  )
);

if (failedChecks.length > 0) {
  throw new Error(
    `GM smoke failed: ${failedChecks
      .map((check) => `${check.label}${check.detail ? ` (${check.detail})` : ""}`)
      .join(", ")}`
  );
}

console.log("GM smoke passed.");

async function loadEnvFile(filePath: string): Promise<void> {
  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(normalizedLine);

    if (!match) {
      continue;
    }

    const [, key, value] = match;

    process.env[key] = parseEnvValue(value);
  }
}

function parseEnvValue(value: string): string {
  const trimmedValue = value.trim();
  const isQuoted =
    (trimmedValue.startsWith("\"") && trimmedValue.endsWith("\"")) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"));

  if (!isQuoted) {
    return trimmedValue;
  }

  return trimmedValue.slice(1, -1);
}

function containsPrivateMarker(content: string): boolean {
  return [/hiddenGmNotes/iu, /internalStatePatch/iu, /privateNotes/iu, /GM\s*内部/u, /本地 mock 数据/u].some(
    (pattern) => pattern.test(content)
  );
}
