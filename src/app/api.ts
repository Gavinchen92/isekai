import {
  AdventureSchema,
  AdventureCandidatePreviewListSchema,
  JourneyMemoryEntryListSchema,
  SessionSchema,
  TurnStreamEventSchema,
  TurnResponseSchema,
  type Adventure,
  type AdventureCandidatePreview,
  type CreateAdventureRequest,
  type JourneyMemoryEntry,
  type MessageInputKind,
  type Session,
  type TurnResponse,
  type TurnStreamEvent,
  WorldSeedPresetListSchema,
  type WorldSeedId,
  type WorldSeedPreset
} from "../domain";

export async function fetchWorldSeeds(): Promise<readonly WorldSeedPreset[]> {
  const response = await fetch("/api/world-seeds");

  if (!response.ok) {
    throw new Error(`fetch world seeds failed: ${response.status}`);
  }

  return WorldSeedPresetListSchema.parse(await response.json());
}

export async function generateAdventureCandidates(
  worldSeedId: WorldSeedId,
  signal?: AbortSignal
): Promise<readonly AdventureCandidatePreview[]> {
  const response = await fetch("/api/adventure-candidates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ worldSeedId }),
    signal
  });

  if (!response.ok) {
    throw new Error(`generate adventure candidates failed: ${response.status}`);
  }

  return AdventureCandidatePreviewListSchema.parse(await response.json());
}

export async function createAdventure(
  worldSeedId: WorldSeedId,
  candidateId: string,
  selectedPlayerSetupId?: string,
  signal?: AbortSignal
): Promise<Adventure> {
  const requestBody: CreateAdventureRequest = selectedPlayerSetupId
    ? {
        candidateId,
        selectedPlayerSetupId,
        worldSeedId
      }
    : {
        candidateId,
        worldSeedId
      };
  const response = await fetch("/api/adventures", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody),
    signal
  });

  if (!response.ok) {
    throw new Error(`create adventure failed: ${response.status}`);
  }

  return AdventureSchema.parse(await response.json());
}

export async function createSession(adventureId: string): Promise<Session> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ adventureId })
  });

  if (!response.ok) {
    throw new Error(`create session failed: ${response.status}`);
  }

  return SessionSchema.parse(await response.json());
}

export async function fetchJourneyMemory(sessionId: string): Promise<readonly JourneyMemoryEntry[]> {
  const response = await fetch(`/api/sessions/${sessionId}/journey-memory`);

  if (!response.ok) {
    throw new Error(`fetch journey memory failed: ${response.status}`);
  }

  return JourneyMemoryEntryListSchema.parse(await response.json());
}

export async function submitTurn(
  sessionId: string,
  content: string,
  inputKind: MessageInputKind = "free"
): Promise<TurnResponse> {
  const response = await fetch("/api/turns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sessionId, content, inputKind })
  });

  if (!response.ok) {
    throw new Error(`submit turn failed: ${response.status}`);
  }

  return TurnResponseSchema.parse(await response.json());
}

export async function submitTurnStream(
  sessionId: string,
  content: string,
  inputKind: MessageInputKind,
  onEvent: (event: TurnStreamEvent) => void
): Promise<void> {
  const response = await fetch("/api/turns/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sessionId, content, inputKind })
  });

  if (!response.ok) {
    throw new Error(`submit turn stream failed: ${response.status}`);
  }

  if (!response.body) {
    throw new Error("submit turn stream failed: response body is empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pendingEventType = "";
  let bufferedText = "";

  const handleFrame = (frame: string) => {
    const lines = frame
      .split("\n")
      .map((line) => line.replace(/\r$/u, ""));
    let payload = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        pendingEventType = line.slice("event:".length).trim();
      }

      if (line.startsWith("data:")) {
        payload += `${line.slice("data:".length).trim()}\n`;
      }
    }

    if (!payload.trim()) {
      return;
    }

    const parsedPayload = JSON.parse(payload.trim()) as { type?: string; message?: string };
    const eventType = parsedPayload.type ?? pendingEventType;

    if (eventType === "turn_error") {
      throw new Error(parsedPayload.message ?? "turn stream failed");
    }

    onEvent(TurnStreamEventSchema.parse(parsedPayload));
  };

  const flushBufferedFrames = (flushRemainder = false) => {
    const separator = "\n\n";
    let separatorIndex = bufferedText.indexOf(separator);

    while (separatorIndex !== -1) {
      const frame = bufferedText.slice(0, separatorIndex).trim();
      bufferedText = bufferedText.slice(separatorIndex + separator.length);

      if (frame.length > 0) {
        handleFrame(frame);
      }

      separatorIndex = bufferedText.indexOf(separator);
    }

    if (flushRemainder) {
      const remainder = bufferedText.trim();
      bufferedText = "";

      if (remainder.length > 0) {
        handleFrame(remainder);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    bufferedText += decoder.decode(value, { stream: true });
    flushBufferedFrames(false);
  }

  bufferedText += decoder.decode();
  flushBufferedFrames(true);
}
