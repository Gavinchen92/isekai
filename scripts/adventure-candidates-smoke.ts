import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateAdventureCandidatePreviews } from "../src/services/adventure-candidates";
import { createAdventure } from "../src/services/adventures";

const envPath = resolve(process.cwd(), ".env");

await loadEnvFile(envPath);

const providerName = process.env.GM_PROVIDER ?? "mock";

if (providerName === "mock") {
  throw new Error(
    "GM_PROVIDER is mock. Set GM_PROVIDER=openai-compatible before running candidate smoke."
  );
}

console.log("Adventure candidate smoke config:");
console.log(
  JSON.stringify(
    {
      provider: providerName,
      hasApiKey: Boolean(process.env.GM_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
      baseUrl: process.env.GM_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL,
      model: process.env.GM_OPENAI_MODEL ?? process.env.OPENAI_MODEL
    },
    null,
    2
  )
);

const previews = await generateAdventureCandidatePreviews({
  candidateCount: 3,
  worldSeedId: "isekai"
});
const [selectedPreview] = previews;

if (!selectedPreview) {
  throw new Error("candidate preview smoke did not return any previews");
}

const adventure = await createAdventure({
  candidateId: selectedPreview.id,
  worldSeedId: "isekai"
});

console.log("Adventure candidate smoke result:");
console.log(
  JSON.stringify(
    {
      materializedAdventure: {
        endings: adventure.endingSeeds.map((ending) => ending.title),
        openingScene: adventure.openingScene.slice(0, 120),
        pitch: adventure.pitch,
        tags: adventure.tags,
        title: adventure.title
      },
      previews
    },
    null,
    2
  )
);

console.log("Adventure candidate smoke passed.");

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
