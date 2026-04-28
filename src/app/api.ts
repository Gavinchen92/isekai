import {
  AdventureSchema,
  AdventureCandidatePreviewListSchema,
  JourneyMemoryEntryListSchema,
  SessionSnapshotListSchema,
  SessionSnapshotSchema,
  SessionSchema,
  TurnStreamEventSchema,
  TurnResponseSchema,
  type Adventure,
  type AdventureCandidatePreview,
  type CreateAdventureRequest,
  type JourneyMemoryEntry,
  type MessageInputKind,
  type Session,
  type SessionSnapshot,
  type TurnResponse,
  type TurnStreamEvent,
  WorldSeedPresetListSchema,
  type WorldSeedId,
  type WorldSeedPreset
} from "../domain";

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export async function fetchWorldSeeds(): Promise<readonly WorldSeedPreset[]> {
  const response = await fetch("/api/world-seeds");

  if (!response.ok) {
    throwApiRequestError("fetch world seeds", response.status);
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
    throwApiRequestError("generate adventure candidates", response.status);
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
    throwApiRequestError("create adventure", response.status);
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
    throwApiRequestError("create session", response.status);
  }

  return SessionSchema.parse(await response.json());
}

export async function fetchLatestSessionSnapshot(): Promise<SessionSnapshot | undefined> {
  const response = await fetch("/api/sessions/latest");

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throwApiRequestError("fetch latest session", response.status);
  }

  return SessionSnapshotSchema.parse(await response.json());
}

export async function fetchSessionSnapshots(): Promise<readonly SessionSnapshot[]> {
  const response = await fetch("/api/sessions");

  if (!response.ok) {
    throwApiRequestError("fetch sessions", response.status);
  }

  return SessionSnapshotListSchema.parse(await response.json());
}

export async function fetchSessionSnapshot(sessionId: string): Promise<SessionSnapshot> {
  const response = await fetch(`/api/sessions/${sessionId}`);

  if (!response.ok) {
    throwApiRequestError(`fetch session ${sessionId}`, response.status);
  }

  return SessionSnapshotSchema.parse(await response.json());
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`/api/sessions/${sessionId}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throwApiRequestError(`delete session ${sessionId}`, response.status);
  }
}

export async function fetchJourneyMemory(sessionId: string): Promise<readonly JourneyMemoryEntry[]> {
  const response = await fetch(`/api/sessions/${sessionId}/journey-memory`);

  if (!response.ok) {
    throwApiRequestError("fetch journey memory", response.status);
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
    throwApiRequestError("submit turn", response.status);
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
    throwApiRequestError("submit turn stream", response.status);
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

function throwApiRequestError(operation: string, status: number): never {
  throw new ApiRequestError(`${operation} failed: ${status}`, status);
}
